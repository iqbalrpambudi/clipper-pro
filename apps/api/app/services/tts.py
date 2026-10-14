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
        id="Orus",
        name="Orus (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Simak analisa mendalam berikut untuk memahami apa yang sebenarnya terjadi.",
        sample_audio_url=None,
        description="Percaya diri, elegan, sangat cocok untuk dokumenter dan narasi ulasan.",
    ),
    VoiceInfo(
        id="Enceladus",
        name="Enceladus (Gemini)",
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

    # Supported multimodal audio TTS model candidates
    models_to_try = [clean_model]
    for m in [
        "gemini-3.8-flash-tts",
        "gemini-3.8-flash-lite-tts",
        "gemini-3.1-flash-tts-preview",
        "gemini-2.5-flash-preview-tts",
    ]:
        if m not in models_to_try:
            models_to_try.append(m)

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": text
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
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
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code in (429, 500, 503, 504):
                    err_json = {}
                    try:
                        err_json = resp.json()
                    except Exception:
                        pass
                    last_error_detail = err_json.get("error", {}).get("message") or resp.text
                    log.warning("Gemini TTS model %s returned HTTP %s (%s), trying next candidate...", attempt_model, resp.status_code, last_error_detail[:100])
                    continue

                if resp.status_code != 200:
                    err_detail = resp.text
                    try:
                        err_json = resp.json()
                        err_detail = err_json.get("error", {}).get("message") or resp.text
                    except Exception:
                        pass
                    last_error_detail = f"HTTP {resp.status_code}: {err_detail}"
                    log.error("Gemini TTS API error HTTP %s (%s): %s", resp.status_code, attempt_model, err_detail[:300])
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

                # Gemini 3.8 TTS returns WAV (RIFF) by default; 2.5 returns raw PCM — always
                # transcode to MP3 so downstream (concat, browser playback) stays consistent.
                is_wav = raw_bytes.startswith(b"RIFF") or "wav" in mime_type.lower()
                if is_wav:
                    cmd = ["ffmpeg", "-y", "-i", "-"]
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
                        raise RuntimeError(f"FFmpeg WAV transcode failed: {stderr.decode()}")
                elif "pcm" in mime_type.lower() or "l16" in mime_type.lower() or (
                    not raw_bytes.startswith(b"ID3")
                    and not raw_bytes.startswith(b"\xff\xfb")
                ):
                    # Raw PCM (24kHz 16-bit mono): feed with explicit format flags
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
        except Exception as e:
            log.warning("Gemini TTS synthesis attempt failed for %s: %s", attempt_model, e)
            last_error_detail = str(e)

    raise RuntimeError(f"Gemini TTS gagal ({clean_model}): {last_error_detail}")


async def get_or_generate_voice_sample(
    provider: str = "gemini",
    voice: str = "Puck",
    model: str = "gemini-2.5-flash-preview-tts",
    api_key: Optional[str] = None,
    force_refresh: bool = False,
) -> Path:
    """Generate or return cached 2-3s sample audio for the specified voice."""
    settings = get_settings()
    storage_base = Path(settings.STORAGE_PATH)
    cache_dir = storage_base / "cache" / "voice_samples"
    cache_dir.mkdir(parents=True, exist_ok=True)

    clean_prov = re.sub(r"[^\w\-]", "", provider.lower())
    clean_voice = re.sub(r"[^\w\-]", "", voice)
    clean_model = re.sub(r"[^\w\-]", "", model.lower()) if clean_prov == "gemini" else ""
    suffix = f"_{clean_model}" if clean_model else ""
    sample_path = cache_dir / f"sample_{clean_prov}{suffix}_{clean_voice}.mp3"

    if not force_refresh and sample_path.exists() and sample_path.stat().st_size > 1000:
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


def _split_text_for_tts(text: str, max_chars: int = 2400) -> List[str]:
    """Split long script into TTS-safe chunks at paragraph/sentence boundaries (~<=max_chars each).

    Uses a higher chunk budget (2400 chars ~ 2.5-3 mins audio) to minimize chunk boundary
    intonation shifts, and guarantees each intermediate chunk ends with clean terminal
    punctuation (. ! ?) so Gemini TTS does not produce hanging pitch artifacts.
    """
    text = text.strip()
    if not text or len(text) <= max_chars:
        return [text] if text else []

    paragraphs = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    raw_units: List[str] = []

    for p in paragraphs:
        if len(p) <= max_chars:
            raw_units.append(p)
        else:
            sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", p) if s.strip()]
            for s in sentences:
                while len(s) > max_chars:
                    clauses = [c.strip() for c in re.split(r"(?<=[,;:])\s+", s) if c.strip()]
                    if len(clauses) > 1 and len(clauses[0]) <= max_chars:
                        raw_units.append(clauses[0])
                        s = s[len(clauses[0]):].strip()
                    else:
                        raw_units.append(s[:max_chars])
                        s = s[max_chars:].strip()
                if s:
                    raw_units.append(s)

    chunks: List[str] = []
    cur = ""
    for unit in raw_units:
        if not unit:
            continue
        separator = " " if cur else ""
        if cur and len(cur) + len(separator) + len(unit) > max_chars:
            chunks.append(cur)
            cur = unit
        else:
            cur = f"{cur}{separator}{unit}".strip()

    if cur:
        chunks.append(cur)

    # Ensure non-final chunks end with clean terminal punctuation (. ! ?)
    # to avoid awkward rising or truncated pitch at chunk boundaries
    cleaned_chunks: List[str] = []
    for i, chk in enumerate(chunks):
        c = chk.strip()
        if i < len(chunks) - 1 and not c.endswith((".", "!", "?", "…")):
            c = f"{c}."
        cleaned_chunks.append(c)

    return cleaned_chunks

async def _concat_mp3s(part_paths: List[str], output_path: str) -> float:
    """Concatenate mp3 parts via ffmpeg concat demuxer; returns total duration."""
    list_file = Path(output_path).with_suffix(".concat.txt")
    list_file.write_text("".join(f"file '{p}'\n" for p in part_paths), encoding="utf-8")
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-c:a", "libmp3lame", "-b:a", "192k", output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg concat failed: {stderr.decode()[:300]}")
    finally:
        list_file.unlink(missing_ok=True)
    return await get_audio_duration(output_path)

async def generate_speech_audio(
    text: str,
    output_path: str,
    provider: str = "gemini",
    voice: str = "Puck",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    api_key: Optional[str] = None,
    model: str = "gemini-2.5-flash-preview-tts",
) -> float:
    """Entrypoint for TTS audio generation.

    Gemini TTS: long scripts are chunked at sentence/paragraph boundaries (~2400 chars),
    synthesized per chunk, then concatenated. 2400 chars ≈ 2.5-3 mins audio.
    """
    if provider.lower() == "gemini":
        chunks = _split_text_for_tts(text, max_chars=2400)
        if len(chunks) == 1:
            return await generate_gemini_tts(
                chunks[0],
                output_path,
                api_key=api_key,
                voice=voice,
                rate=rate,
                pitch=pitch,
                model=model,
            )
        out_p = Path(output_path)
        parts: List[str] = []
        try:
            for i, chunk in enumerate(chunks):
                part_path = str(out_p.with_name(f"{out_p.stem}.part{i:03d}.mp3"))
                await generate_gemini_tts(
                    chunk,
                    part_path,
                    api_key=api_key,
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    model=model,
                )
                parts.append(part_path)
            return await _concat_mp3s(parts, output_path)
        finally:
            for p in parts:
                Path(p).unlink(missing_ok=True)
    else:
        return await generate_edge_tts(
            text,
            output_path,
            voice=voice,
            rate=rate,
            pitch=pitch,
        )
