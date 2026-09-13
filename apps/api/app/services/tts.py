import asyncio
import base64
import json
import logging
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import edge_tts
import httpx
from app.core.config import get_settings
from app.schemas.tts import VoiceInfo, CostEstimateResponse
from app.services.scene_detector import get_video_metadata

async def get_audio_duration(file_path: str) -> float:
    """Accurately probe audio duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        return round(float(stdout.decode().strip()), 3)
    except Exception:
        return 0.0

log = logging.getLogger(__name__)

AVAILABLE_VOICES: List[VoiceInfo] = [
    VoiceInfo(
        id="Puck",
        name="Puck (Gemini)",
        provider="gemini",
        gender="Neutral",
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
        id="Leda",
        name="Leda (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Halo semuanya! Hari ini kita bakal bahas hal super seru yang wajib kamu tonton.",
        sample_audio_url=None,
        description="Ceria, bersemangat, sangat cocok untuk video santai dan edukasi modern.",
    ),
    VoiceInfo(
        id="Orpheus",
        name="Orpheus (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Simak analisa mendalam berikut untuk memahami apa yang sebenarnya terjadi.",
        sample_audio_url=None,
        description="Percaya diri, elegan, sangat cocok untuk dokumenter dan narasi ulasan.",
    ),
    VoiceInfo(
        id="Zephyr",
        name="Zephyr (Gemini)",
        provider="gemini",
        gender="Neutral",
        sample_text="Tarik nafas perlahan, dan nikmati momen berharga dalam perjalanan ini.",
        sample_audio_url=None,
        description="Lembut, menenangkan, ideal untuk vlog perjalanan & relaksasi.",
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

    # Gemini 2.5 Flash TTS pricing ~ $0.000004 per char
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

    return await get_audio_duration(str(out_p))


def _build_audio_filter(rate: str = "+0%", pitch: str = "+0Hz", base_sample_rate: int = 24000) -> str:
    """Build FFmpeg audio filter string for rate (speed/tempo) and pitch adjustments."""
    def parse_rate(s: Optional[str]) -> float:
        if not s:
            return 1.0
        c = s.strip().rstrip("%")
        try:
            if c.startswith(("+", "-")):
                return round(1.0 + (float(c) / 100.0), 3)
            val = float(c)
            if val > 5.0:
                return round(val / 100.0, 3)
            return val
        except Exception:
            return 1.0

    def parse_pitch(s: Optional[str]) -> float:
        if not s:
            return 1.0
        c = s.strip().lower()
        if "hz" in c:
            try:
                # 5Hz on fundamental pitch is ~5% pitch shift
                return round(1.0 + (float(c.replace("hz", "")) * 0.01), 4)
            except Exception:
                return 1.0
        elif "%" in c:
            try:
                return round(1.0 + (float(c.replace("%", "")) / 100.0), 4)
            except Exception:
                return 1.0
        elif "st" in c:
            try:
                st = float(c.replace("st", ""))
                return round(2.0 ** (st / 12.0), 4)
            except Exception:
                return 1.0
        return 1.0

    rate_factor = parse_rate(rate)
    pitch_factor = parse_pitch(pitch)

    filters = []
    if abs(pitch_factor - 1.0) > 0.001:
        new_sr = int(base_sample_rate * pitch_factor)
        filters.append(f"asetrate={new_sr}")
        comp_tempo = rate_factor / pitch_factor
    else:
        comp_tempo = rate_factor

    if abs(comp_tempo - 1.0) > 0.001:
        if 0.5 <= comp_tempo <= 2.0:
            filters.append(f"atempo={round(comp_tempo, 4)}")
        elif comp_tempo > 2.0:
            filters.append("atempo=2.0")
            filters.append(f"atempo={round(comp_tempo / 2.0, 4)}")
        elif comp_tempo < 0.5:
            filters.append("atempo=0.5")
            filters.append(f"atempo={round(comp_tempo / 0.5, 4)}")

    if abs(pitch_factor - 1.0) > 0.001:
        filters.append(f"aresample={base_sample_rate}")

    return ",".join(filters)


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
        log.warning("No Gemini API key configured for TTS, falling back to Edge-TTS")
        edge_voice = "id-ID-ArdiNeural" if voice in ("Puck", "Charon", "Fenrir", "Orpheus") else "id-ID-GadisNeural"
        return await generate_edge_tts(text, output_path, voice=edge_voice, rate=rate, pitch=pitch)

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    clean_model = model.strip().removeprefix("models/")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Please read aloud the following text exactly as written with natural pacing, "
                            "clarity, and expressive storytelling tone, with no additional commentary:\n\n"
                            f"{text}"
                        )
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice,
                    }
                }
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates") or []
                inline_data = None
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    for part in parts:
                        if "inlineData" in part:
                            inline_data = part["inlineData"]
                            break

                if inline_data and "data" in inline_data:
                    raw_bytes = base64.b64decode(inline_data["data"])
                    mime_type = inline_data.get("mimeType", "")
                    audio_filter = _build_audio_filter(rate=rate, pitch=pitch, base_sample_rate=24000)

                    # If PCM audio (24kHz 16-bit mono), transcode to MP3 with rate/pitch filter using ffmpeg
                    if "pcm" in mime_type or (
                        not raw_bytes.startswith(b"RIFF")
                        and not raw_bytes.startswith(b"ID3")
                        and not raw_bytes.startswith(b"\xff\xfb")
                    ):
                        cmd = [
                            "ffmpeg", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "-",
                        ]
                        if audio_filter:
                            cmd.extend(["-af", audio_filter])
                        cmd.extend(["-c:a", "libmp3lame", "-b:a", "192k", str(out_p)])

                        proc = await asyncio.create_subprocess_exec(
                            *cmd,
                            stdin=asyncio.subprocess.PIPE,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        _, stderr = await proc.communicate(input=raw_bytes)
                        if proc.returncode != 0:
                            raise RuntimeError(f"FFmpeg PCM transcode failed: {stderr.decode()}")
                    else:
                        if audio_filter:
                            proc = await asyncio.create_subprocess_exec(
                                "ffmpeg", "-y", "-i", "-", "-af", audio_filter,
                                "-c:a", "libmp3lame", "-b:a", "192k", str(out_p),
                                stdin=asyncio.subprocess.PIPE,
                                stdout=asyncio.subprocess.PIPE,
                                stderr=asyncio.subprocess.PIPE,
                            )
                            _, stderr = await proc.communicate(input=raw_bytes)
                            if proc.returncode != 0:
                                raise RuntimeError(f"FFmpeg audio filter failed: {stderr.decode()}")
                        else:
                            out_p.write_bytes(raw_bytes)

                    return await get_audio_duration(str(out_p))
                else:
                    log.error("Gemini response did not contain audio inlineData: %s", str(data)[:300])
            else:
                log.error("Gemini TTS API error HTTP %s: %s", resp.status_code, resp.text[:300])
    except Exception as e:
        log.exception("Gemini TTS request exception: %s", e)

    # Fallback to Edge-TTS if Gemini request fails
    log.warning("Gemini TTS synthesis failed. Falling back to Edge-TTS for voice %s", voice)
    edge_voice = "id-ID-ArdiNeural" if voice in ("Puck", "Charon", "Fenrir", "Orpheus") else "id-ID-GadisNeural"
    return await generate_edge_tts(text, output_path, voice=edge_voice, rate=rate, pitch=pitch)


async def get_or_generate_voice_sample(
    provider: str = "gemini",
    voice: str = "Puck",
    model: str = "gemini-2.5-flash-preview-tts",
    api_key: Optional[str] = None,
) -> Path:
    """Generate or return cached 2-3s sample audio for the specified voice."""
    settings = get_settings()
    storage_base = Path(settings.STORAGE_PATH)
    cache_dir = storage_base / "cache" / "voice_samples"
    cache_dir.mkdir(parents=True, exist_ok=True)

    clean_prov = re.sub(r"[^\w\-]", "", provider.lower())
    clean_voice = re.sub(r"[^\w\-]", "", voice)
    sample_path = cache_dir / f"sample_{clean_prov}_{clean_voice}.mp3"

    if sample_path.exists() and sample_path.stat().st_size > 1000:
        return sample_path

    # Find matching sample text
    sample_text = "Tahukah kamu, fakta mengejutkan ini bakal bikin kamu tercengang!"
    for v in AVAILABLE_VOICES:
        if v.id == voice:
            sample_text = v.sample_text
            break

    if clean_prov == "gemini":
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
        return await generate_gemini_tts(
            text,
            output_path,
            api_key=api_key,
            voice=voice,
            rate=rate,
            pitch=pitch,
        )
    else:
        return await generate_edge_tts(
            text,
            output_path,
            voice=voice,
            rate=rate,
            pitch=pitch,
        )
