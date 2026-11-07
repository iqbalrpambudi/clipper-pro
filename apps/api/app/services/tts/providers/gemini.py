import asyncio
import base64
import logging
from pathlib import Path
from typing import Optional

import httpx

from app.core.config import get_settings
from app.services.cancellation import (
    TaskCancelledException,
    is_cancelled,
    register_process,
    unregister_process,
)
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
    language: Optional[str] = None,
    project_id: Optional[str] = None,
) -> float:
    """Generate audio via Gemini API multimodal endpoint (:generateContent) with rate & pitch tuning.

    Fails immediately on error or cancellation without fallback to other models or providers.
    """
    if project_id and await is_cancelled(project_id):
        raise TaskCancelledException("Pembuatan suara narasi dibatalkan oleh pengguna.")

    settings = get_settings()
    key = (api_key or "").strip() or (settings.GEMINI_API_KEY or "").strip() or (settings.AI_API_KEY or "").strip()

    if not key:
        raise ValueError("Gemini API Key belum dikonfigurasi. Silakan simpan GEMINI_API_KEY pada menu Pengaturan.")

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

    clean_text = " ".join(line.strip() for line in text.splitlines() if line.strip())
    if not clean_text:
        raise ValueError("Teks untuk Gemini TTS tidak boleh kosong.")

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

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={key}"

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, json=payload)
    except httpx.TimeoutException as te:
        log.error("Gemini TTS request timeout (25s): %s", te)
        raise RuntimeError(
            f"Koneksi ke Gemini TTS ({clean_model}) timeout (25 detik). Server Gemini tidak merespons tepat waktu."
        ) from te
    except httpx.RequestError as re:
        log.error("Gemini TTS network request error: %s", re)
        raise RuntimeError(f"Gagal menghubungi Gemini API: {re}") from re

    if project_id and await is_cancelled(project_id):
        raise TaskCancelledException("Pembuatan suara narasi dibatalkan oleh pengguna.")

    if resp.status_code != 200:
        err_msg = ""
        try:
            raw_err = resp.json()
            err_json = await raw_err if asyncio.iscoroutine(raw_err) else raw_err
            err_msg = err_json.get("error", {}).get("message") or resp.text
        except Exception:
            err_msg = resp.text[:300]

        log.error("Gemini TTS API error HTTP %s (%s): %s", resp.status_code, clean_model, err_msg)

        if resp.status_code in (401, 403):
            raise RuntimeError(
                f"Akses Gemini API ditolak (HTTP {resp.status_code}: {err_msg}). Periksa kembali Gemini API Key Anda di menu Pengaturan."
            )
        elif resp.status_code == 400:
            raise RuntimeError(
                f"Permintaan Gemini TTS ditolak (HTTP 400: {err_msg}). Model '{clean_model}' atau suara '{actual_voice}' mungkin tidak didukung."
            )
        elif resp.status_code == 404:
            raise RuntimeError(
                f"Model Gemini TTS '{clean_model}' tidak ditemukan (HTTP 404). Silakan periksa nama model di pengaturan TTS."
            )
        elif resp.status_code == 429:
            raise RuntimeError(
                f"Batas kuota Gemini API terlampaui (HTTP 429: Rate limit/Quota exceeded). Silakan coba beberapa saat lagi."
            )
        else:
            raise RuntimeError(
                f"Gemini TTS gagal dengan HTTP {resp.status_code}: {err_msg or resp.text[:200]}"
            )

    try:
        raw_data = resp.json()
        data = await raw_data if asyncio.iscoroutine(raw_data) else raw_data
    except Exception as je:
        raise RuntimeError(f"Respons Gemini TTS bukan JSON valid: {je}") from je

    candidates = data.get("candidates") or []
    if not candidates:
        prompt_feedback = data.get("promptFeedback") or {}
        block_reason = prompt_feedback.get("blockReason") or "Tidak ada kandidat respons dari Gemini API"
        raise RuntimeError(f"Gemini TTS diblokir atau gagal menghasilkan audio: {block_reason}")

    parts = candidates[0].get("content", {}).get("parts", [])
    inline_data = None
    for part in parts:
        if "inlineData" in part:
            inline_data = part["inlineData"]
            break

    if not inline_data or "data" not in inline_data:
        finish_reason = candidates[0].get("finishReason") or "Tidak ada inline audio data"
        raise RuntimeError(f"Gemini TTS tidak mengembalikan data audio (finishReason: {finish_reason})")

    try:
        raw_bytes = base64.b64decode(inline_data["data"])
    except Exception as de:
        raise RuntimeError(f"Gagal decode base64 audio Gemini TTS: {de}") from de

    mime_type = inline_data.get("mimeType", "")
    audio_filter = _build_audio_filter(rate=rate, pitch=pitch, base_sample_rate=24000)
    af_args = ["-af", audio_filter] if audio_filter else []

    is_wav = raw_bytes.startswith(b"RIFF") or "wav" in mime_type.lower()
    if is_wav:
        cmd = ["ffmpeg", "-y", "-i", "-", *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]
    elif "pcm" in mime_type.lower() or "l16" in mime_type.lower() or (
        not raw_bytes.startswith(b"ID3")
        and not raw_bytes.startswith(b"\xff\xfb")
    ):
        cmd = [
            "ffmpeg", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "-",
            *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p),
        ]
    else:
        cmd = ["ffmpeg", "-y", "-i", "-", *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]

    proc_key = f"tts:{project_id}" if project_id else f"tts:{out_p.name}"
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    register_process(proc_key, proc)
    try:
        _, stderr = await proc.communicate(input=raw_bytes)
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg audio transcode gagal: {stderr.decode()[:300]}")
    finally:
        unregister_process(proc_key)

    dur = await get_audio_duration(str(out_p))
    if dur <= 0.1:
        raise RuntimeError(f"Audio yang dihasilkan Gemini TTS terlalu pendek ({dur:.2f} detik) atau kosong.")

    return dur
