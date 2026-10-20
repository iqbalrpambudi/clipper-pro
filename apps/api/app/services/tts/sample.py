import re
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.services.tts.constants import AVAILABLE_VOICES
from app.services.tts.providers.edge import generate_edge_tts
from app.services.tts.providers.elevenlabs import generate_elevenlabs_tts
from app.services.tts.providers.gemini import generate_gemini_tts
from app.services.tts.providers.runware import generate_runware_tts


async def get_or_generate_voice_sample(
    provider: str = "gemini",
    voice: str = "Puck",
    model: str = "gemini-2.5-flash-preview-tts",
    api_key: Optional[str] = None,
    force_refresh: bool = False,
    language: Optional[str] = None,
) -> Path:
    """Generate or return cached 2-3s sample audio for the specified voice."""
    settings = get_settings()
    storage_base = Path(settings.STORAGE_PATH)
    cache_dir = storage_base / "cache" / "voice_samples"
    cache_dir.mkdir(parents=True, exist_ok=True)

    clean_prov = re.sub(r"[^\w\-]", "", provider.lower())
    clean_voice = re.sub(r"[^\w\-]", "", voice)
    clean_model = re.sub(r"[^\w\-]", "", model.lower()) if clean_prov in ("gemini", "elevenlabs", "runware") else ""
    target_lang = (language or ("en" if voice.startswith("en-") else "id")).strip().lower()
    suffix = f"_{clean_model}" if clean_model else ""
    sample_path = cache_dir / f"sample_{clean_prov}{suffix}_{clean_voice}_{target_lang}.mp3"

    if not force_refresh and sample_path.exists() and sample_path.stat().st_size > 1000:
        return sample_path

    # Find matching sample text
    if target_lang == "en":
        sample_text = "Welcome! This incredible story will completely change the way you see the world."
    else:
        sample_text = "Tahukah kamu, fakta mengejutkan ini bakal bikin kamu tercengang!"

    for v in AVAILABLE_VOICES:
        if v.id == voice or (v.provider == clean_prov and v.name.lower().startswith(voice.lower())):
            if target_lang == "en" and v.id.startswith("en-"):
                sample_text = v.sample_text
            elif target_lang != "en" and not v.id.startswith("en-"):
                sample_text = v.sample_text
            elif v.id.startswith("ja-"):
                sample_text = v.sample_text
            break

    if clean_prov == "elevenlabs":
        await generate_elevenlabs_tts(
            sample_text,
            str(sample_path),
            api_key=api_key,
            voice=voice,
            model=model or "eleven_multilingual_v2",
        )
    elif clean_prov == "runware":
        await generate_runware_tts(
            sample_text,
            str(sample_path),
            api_key=api_key,
            voice=voice,
            model=model or "fishaudio:s2.1@pro",
        )
    elif clean_prov == "gemini":
        await generate_gemini_tts(
            sample_text,
            str(sample_path),
            api_key=api_key,
            voice=voice,
            rate="+0%",
            pitch="+0Hz",
            model=model,
        )
    else:
        await generate_edge_tts(
            sample_text,
            str(sample_path),
            voice=voice,
        )

    return sample_path
