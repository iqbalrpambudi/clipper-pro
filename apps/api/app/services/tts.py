import asyncio
import base64
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import edge_tts
import httpx
from app.core.config import get_settings
from app.schemas.tts import VoiceInfo, CostEstimateResponse
from app.services.scene_detector import get_video_metadata

log = logging.getLogger(__name__)

AVAILABLE_VOICES: List[VoiceInfo] = [
    VoiceInfo(
        id="Puck",
        name="Puck (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Tahukah kamu, fakta mengejutkan ini bakal bikin kamu tercengang!",
        sample_audio_url=None,
        description="Energetik, bersahabat, sangat cocok untuk konten viral & fakta unik.",
    ),
    VoiceInfo(
        id="Charon",
        name="Charon (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Semua bermula ketika rahasia besar ini akhirnya terungkap ke publik.",
        sample_audio_url=None,
        description="Suara berat, karismatik, ideal untuk storytelling dramatis dan misteri.",
    ),
    VoiceInfo(
        id="Kore",
        name="Kore (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Tiga rahasia penting ini akan mengubah cara pandangmu selamanya.",
        sample_audio_url=None,
        description="Hangat, ramah, artikulatif untuk konten tips dan edukasi.",
    ),
    VoiceInfo(
        id="Fenrir",
        name="Fenrir (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Jangan pernah lakukan kesalahan fatal ini kalau kamu mau berhasil!",
        sample_audio_url=None,
        description="Tegas, berwibawa, sangat pas untuk konten motivasi & punchy hooks.",
    ),
    VoiceInfo(
        id="Aoede",
        name="Aoede (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Pernahkah kamu membayangkan hal luar biasa ini bisa terjadi di dunia nyata?",
        sample_audio_url=None,
        description="Ekspresif, santai, memikat untuk cerita visual dan lifestyle.",
    ),
    VoiceInfo(
        id="id-ID-GadisNeural",
        name="Gadis (Edge Natural)",
        provider="edge",
        gender="Female",
        sample_text="Simak fakta menarik berikut ini yang jarang diketahui banyak orang!",
        sample_audio_url=None,
        description="Pelafalan Bahasa Indonesia sangat natural, jernih, dan akrab.",
    ),
    VoiceInfo(
        id="id-ID-ArdiNeural",
        name="Ardi (Edge Natural)",
        provider="edge",
        gender="Male",
        sample_text="Berikut tiga hal penting yang wajib kamu ketahui sebelum terlambat.",
        sample_audio_url=None,
        description="Suara pria Indonesia yang jelas, profesional, dan meyakinkan.",
    ),
]


def estimate_tts_cost(text: str, provider: str = "gemini") -> CostEstimateResponse:
    char_count = len(text)
    word_count = len(text.split())
    # Speech rate average ~ 14 chars/sec in Indonesian
    est_duration_sec = round(char_count / 14.5, 1)

    # Gemini 2.5 Flash TTS pricing ~ $0.000004 per char (or ~$0.004 per 1k chars)
    # Edge-TTS is free ($0.0)
    rate_per_char = 0.000004 if provider.lower() == "gemini" else 0.0
    est_cost = round(char_count * rate_per_char, 4)

    return CostEstimateResponse(
        char_count=char_count,
        word_count=word_count,
        estimated_duration_sec=est_duration_sec,
        estimated_cost_usd=est_cost,
        currency="USD",
        provider=provider,
    )


async def generate_edge_tts(
    text: str,
    output_path: str,
    voice: str = "id-ID-GadisNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> float:
    """Generate audio via Edge-TTS."""
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch)
    await communicate.save(str(out_p))

    # Read audio duration via ffprobe
    meta = await get_video_metadata(str(out_p))
    return meta["duration"]


async def generate_gemini_tts(
    text: str,
    output_path: str,
    api_key: Optional[str] = None,
    voice: str = "Puck",
    model: str = "gemini-2.5-flash-preview-tts",
) -> float:
    """Generate audio via Gemini API."""
    settings = get_settings()
    key = api_key or settings.GEMINI_API_KEY or settings.AI_API_KEY

    if not key:
        log.warning("No Gemini API key provided for TTS, falling back to Edge-TTS")
        return await generate_edge_tts(text, output_path, voice="id-ID-GadisNeural")

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateAudio?key={key}"
    payload = {
        "text": text,
        "voiceConfig": {
            "prebuiltVoiceConfig": {
                "voiceName": voice,
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                audio_b64 = data.get("audioContent") or data.get("audio", {}).get("data")
                if audio_b64:
                    with open(out_p, "wb") as f:
                        f.write(base64.b64decode(audio_b64))
                    meta = await get_video_metadata(str(out_p))
                    return meta["duration"]

            log.warning("Gemini TTS endpoint returned status %s: %s, falling back to Edge-TTS", resp.status_code, resp.text[:200])
    except Exception as e:
        log.warning("Gemini TTS request exception: %s, falling back to Edge-TTS", e)

    # Clean fallback to Edge-TTS
    edge_voice = "id-ID-ArdiNeural" if voice in ("Puck", "Charon", "Fenrir") else "id-ID-GadisNeural"
    return await generate_edge_tts(text, output_path, voice=edge_voice)


async def generate_speech_audio(
    text: str,
    output_path: str,
    provider: str = "gemini",
    voice: str = "Puck",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    api_key: Optional[str] = None,
) -> float:
    """Entrypoint for TTS audio generation."""
    if provider.lower() == "gemini":
        return await generate_gemini_tts(text, output_path, api_key=api_key, voice=voice)
    else:
        return await generate_edge_tts(text, output_path, voice=voice, rate=rate, pitch=pitch)
