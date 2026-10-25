import asyncio
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

from app.core.config import get_settings
from app.services.tts.audio_utils import _build_audio_filter, get_audio_duration
from app.services.tts.constants import ELEVENLABS_VOICE_MAP
from app.services.tts.exceptions import ElevenLabsCharacterLimitError


async def generate_elevenlabs_tts(
    text: str,
    output_path: str,
    api_key: Optional[str] = None,
    voice: str = "Adam",
    model: str = "eleven_multilingual_v2",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    language: Optional[str] = None,
) -> float:
    """Generate audio via ElevenLabs API with high stability (0.75) for 100% consistent persona & intonation."""
    settings = get_settings()
    key = (api_key or "").strip() or (settings.ELEVENLABS_API_KEY or "").strip()
    if not key:
        raise RuntimeError("ElevenLabs API Key belum dikonfigurasi. Silakan simpan ElevenLabs API Key pada menu Pengaturan.")

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    voice_id = ELEVENLABS_VOICE_MAP.get(voice.lower().strip(), voice.strip())
    # If voice is short and not mapped, fallback to Adam
    if len(voice_id) < 10:
        voice_id = ELEVENLABS_VOICE_MAP.get("adam", "pNInz6obpgDQGcFmaJgB")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    model_id = (model or "eleven_multilingual_v2").strip()
    is_turbo_or_flash = "turbo" in model_id.lower() or "flash" in model_id.lower()
    voice_settings: Dict[str, Any] = {
        "stability": 0.85 if is_turbo_or_flash else 0.75,
        "similarity_boost": 0.85,
    }
    # ElevenLabs v4 architecture strictly accepts stability and similarity_boost.
    # style and use_speaker_boost are legacy parameters for v1/v2 models.
    if "v4" not in model_id.lower():
        voice_settings["style"] = 0.0
        voice_settings["use_speaker_boost"] = True

    # Note: Do not prepend meta-prompts or instruction strings to text;
    # TTS engines speak the text verbatim.
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": voice_settings,
    }

    # Extended timeout for long single-pass generations (up to 10k or 40k chars)
    timeout_sec = 240.0 if len(text) > 5000 else 90.0
    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            err_msg = resp.text
            detail_status = ""
            try:
                err_json = resp.json()
                detail = err_json.get("detail", {})
                if isinstance(detail, dict):
                    err_msg = detail.get("message") or err_json.get("error") or resp.text
                    detail_status = str(detail.get("status") or "")
                else:
                    err_msg = str(detail) or err_json.get("error") or resp.text
            except Exception:
                pass

            # Deteksi khusus jika response adalah error limit karakter / request size
            combined_err = f"{err_msg} {detail_status}".lower()
            char_limit_keywords = [
                "character limit", "too_large", "request_too_large",
                "max_characters", "maximum text length", "quota_exceeded",
                "exceeds the maximum", "characters allowed"
            ]
            if resp.status_code in (400, 413, 422) and any(k in combined_err for k in char_limit_keywords):
                raise ElevenLabsCharacterLimitError(
                    f"ElevenLabs Character Limit Terlampaui ({resp.status_code}): {err_msg}. "
                    f"Teks naskah melebihi kapasitas karakter per request model {model_id}."
                )

            raise RuntimeError(f"ElevenLabs TTS HTTP {resp.status_code}: {err_msg}")

        raw_bytes = resp.content
        if not raw_bytes or len(raw_bytes) < 100:
            raise RuntimeError("ElevenLabs TTS mengembalikan audio kosong.")

        audio_filter = _build_audio_filter(rate=rate, pitch=pitch, base_sample_rate=44100)
        if audio_filter:
            cmd = ["ffmpeg", "-y", "-i", "-", "-af", audio_filter, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, _ = await proc.communicate(input=raw_bytes)
            if proc.returncode != 0:
                out_p.write_bytes(raw_bytes)
        else:
            out_p.write_bytes(raw_bytes)

        return await get_audio_duration(str(out_p))
