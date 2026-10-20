import asyncio
import base64
import logging
from pathlib import Path
from typing import Optional

import httpx

from app.core.config import get_settings
from app.services.tts.audio_utils import _build_audio_filter, get_audio_duration

log = logging.getLogger(__name__)


async def generate_gemini_tts(
    text: str,
    output_path: str,
    api_key: Optional[str] = None,
    voice: str = "Puck",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    model: str = "gemini-2.5-flash-preview-tts",
) -> float:
    """Generate audio via Gemini API multimodal audio endpoint (:generateContent) with rate & pitch tuning."""
    settings = get_settings()
    key = (api_key or "").strip() or (settings.GEMINI_API_KEY or "").strip() or (settings.AI_API_KEY or "").strip()

    if not key:
        raise RuntimeError("Gemini API Key belum dikonfigurasi. Silakan simpan Gemini API Key pada menu Pengaturan.")

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    clean_model = (model or "gemini-2.5-flash-preview-tts").strip().removeprefix("models/")

    # Normalize voice name to Gemini prebuilt voice catalog
    voice_lookup = {
        "orpheus": "Orus",
        "orus": "Orus",
        "zephyr": "Enceladus",
        "zephyrus": "Enceladus",
        "enceladus": "Enceladus",
    }
    actual_voice = voice_lookup.get(voice.lower().strip(), voice.strip())

    # Supported multimodal audio TTS model candidates in priority order
    models_to_try = [clean_model]
    for m in [
        "gemini-2.5-flash-preview-tts",
        "gemini-3.8-flash-lite-tts",
        "gemini-3.8-flash-tts",
        "gemini-3.1-flash-tts-preview",
    ]:
        if m not in models_to_try:
            models_to_try.append(m)

    clean_text = " ".join(line.strip() for line in text.splitlines() if line.strip())

    # CRITICAL: Gemini TTS models read whatever text is in the parts directly.
    # Never add meta-prompt instructions or systemInstruction.
    # Do NOT pass temperature or maxOutputTokens: passing temperature causes Google API to hang or timeout,
    # while omitting them allows the audio decoder to stop naturally with finishReason: STOP.
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": clean_text
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": actual_voice,
                    }
                }
            },
        },
    }

    last_error_detail = ""
    for attempt_model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{attempt_model}:generateContent?key={key}"
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(url, json=payload)
                # If model rejects systemInstruction with HTTP 400, retry without it
                if resp.status_code == 400 and "systemInstruction" in payload:
                    fallback_payload = dict(payload)
                    fallback_payload.pop("systemInstruction", None)
                    resp = await client.post(url, json=fallback_payload)

                if resp.status_code in (429, 500, 503, 504):
                    err_json = {}
                    try:
                        err_json = resp.json()
                    except Exception:
                        pass
                    last_error_detail = err_json.get("error", {}).get("message") or resp.text
                    log.warning(
                        "Gemini TTS model %s returned HTTP %s (%s), trying next candidate...",
                        attempt_model,
                        resp.status_code,
                        last_error_detail[:100],
                    )
                    await asyncio.sleep(1.0)
                    continue

                if resp.status_code != 200:
                    err_detail = resp.text
                    try:
                        err_json = resp.json()
                        err_detail = err_json.get("error", {}).get("message") or resp.text
                    except Exception:
                        pass
                    last_error_detail = f"HTTP {resp.status_code}: {err_detail}"
                    log.error(
                        "Gemini TTS API error HTTP %s (%s): %s",
                        resp.status_code,
                        attempt_model,
                        err_detail[:300],
                    )
                    continue

                data = resp.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    prompt_feedback = data.get("promptFeedback") or {}
                    block_reason = prompt_feedback.get("blockReason") or "Tidak ada respons dari Gemini API"
                    last_error_detail = block_reason
                    continue

                parts = candidates[0].get("content", {}).get("parts", [])
                inline_data = None
                for part in parts:
                    if "inlineData" in part:
                        inline_data = part["inlineData"]
                        break

                if not inline_data or "data" not in inline_data:
                    finish_reason = candidates[0].get("finishReason") or "Tidak ada inline audio data"
                    last_error_detail = finish_reason
                    continue

                raw_bytes = base64.b64decode(inline_data["data"])
                mime_type = inline_data.get("mimeType", "")
                audio_filter = _build_audio_filter(rate=rate, pitch=pitch, base_sample_rate=24000)
                af_args = ["-af", audio_filter] if audio_filter else []

                # Gemini 3.8 TTS returns WAV (RIFF); 2.5/3.1 returns PCM.
                # Cleanly transcode to MP3 without destructive reverse silence trimming
                # so that every word and natural ending pause is preserved at full fidelity.
                is_wav = raw_bytes.startswith(b"RIFF") or "wav" in mime_type.lower()
                if is_wav:
                    cmd = ["ffmpeg", "-y", "-i", "-", *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]
                elif "pcm" in mime_type.lower() or "l16" in mime_type.lower() or (
                    not raw_bytes.startswith(b"ID3")
                    and not raw_bytes.startswith(b"\xff\xfb")
                ):
                    # Raw PCM (24kHz 16-bit mono): feed with explicit format flags
                    cmd = [
                        "ffmpeg", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "-",
                        *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p),
                    ]
                else:
                    cmd = ["ffmpeg", "-y", "-i", "-", *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]

                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await proc.communicate(input=raw_bytes)
                if proc.returncode != 0:
                    raise RuntimeError(f"FFmpeg transcode failed: {stderr.decode()[:300]}")

                dur = await get_audio_duration(str(out_p))
                if dur <= 0.1:
                    log.warning(
                        "Generated audio duration too short (%.2fs) for %s, trying next candidate...",
                        dur,
                        attempt_model,
                    )
                    continue
                return dur
        except Exception as e:
            log.warning("Gemini TTS synthesis attempt failed for %s: %s", attempt_model, e)
            last_error_detail = str(e)

    raise RuntimeError(f"Gemini TTS gagal ({clean_model}): {last_error_detail}")
