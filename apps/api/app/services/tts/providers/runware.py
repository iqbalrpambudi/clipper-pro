import asyncio
import base64
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

from app.core.config import get_settings
from app.services.tts.audio_utils import _build_audio_filter, get_audio_duration


async def generate_runware_tts(
    text: str,
    output_path: str,
    api_key: Optional[str] = None,
    model: str = "fishaudio:s2.1@pro",
    voice: Optional[str] = None,
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> float:
    """Generate audio via Runware API (taskType: audioInference)."""
    settings = get_settings()
    key = (api_key or "").strip() or (settings.IMAGE_API_KEY or "").strip()
    if not key:
        raise RuntimeError("Runware API Key belum dikonfigurasi. Silakan simpan Runware API Key pada menu Pengaturan.")

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    url = "https://api.runware.ai/v1"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    actual_model = model or "fishaudio:s2.1@pro"
    if actual_model in ("xai:tts", "xai"):
        actual_model = "xai:tts@0"
    elif actual_model in ("minimax:speech", "minimax:speech-2.8"):
        actual_model = "minimax:speech@2.8"

    task_payload: Dict[str, Any] = {
        "taskType": "audioInference",
        "taskUUID": str(uuid.uuid4()),
        "model": actual_model,
        "text": text,
        "positivePrompt": text,
        "outputType": "base64Data",
        "outputFormat": "MP3",
    }
    if voice and voice != actual_model and not voice.startswith(("http", "/")):
        task_payload["voice"] = voice

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=[task_payload], headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Runware TTS HTTP {resp.status_code}: {resp.text}")

        res_json = resp.json()
        data_items = res_json.get("data", [])
        if not data_items:
            errors = res_json.get("errors", [])
            err_msg = errors[0].get("message") if errors else resp.text
            raise RuntimeError(f"Runware TTS Error: {err_msg}")

        first = data_items[0]
        raw_bytes = None
        if first.get("base64Data"):
            raw_bytes = base64.b64decode(first["base64Data"])
        elif first.get("audioURL"):
            dl_resp = await client.get(first["audioURL"])
            if dl_resp.status_code == 200:
                raw_bytes = dl_resp.content

        if not raw_bytes:
            raise RuntimeError("Runware TTS tidak mengembalikan audio data.")

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
