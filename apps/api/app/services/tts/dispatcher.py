import asyncio
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.tts.audio_utils import _concat_mp3s, _split_text_for_tts
from app.services.tts.exceptions import ElevenLabsCharacterLimitError
from app.services.tts.providers.edge import generate_edge_tts
from app.services.tts.providers.elevenlabs import generate_elevenlabs_tts
from app.services.tts.providers.gemini import generate_gemini_tts
from app.services.tts.providers.runware import generate_runware_tts

log = logging.getLogger(__name__)


async def generate_speech_audio(
    text: str,
    output_path: str,
    provider: str = "gemini",
    voice: str = "Puck",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    api_key: Optional[str] = None,
    model: str = "gemini-2.5-flash-preview-tts",
    segments: Optional[List[Dict[str, Any]]] = None,
    language: Optional[str] = "id",
) -> float:
    """Entrypoint for TTS audio generation.

    Supports Gemini, ElevenLabs, Runware, and Edge-TTS.
    - ElevenLabs: Industry benchmark for zero tone drift. Handles single-pass generation up to 40,000 chars.
    - Runware TTS: Ultra-fast & cost-effective (Fish Audio / Qwen3 TTS). Single-pass up to 1,200 chars.
    - Gemini TTS: High-fidelity multimodal audio. Single-pass extended up to 2,200 chars (~2.5 mins) to prevent intonation drift.
    - Edge-TTS: Free neural speech provider.

    Provider errors propagate to the caller so the user sees the failure; there is
    no automatic fallback to another provider.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("Teks narasi tidak boleh kosong.")

    from app.services.storyboard import clean_narration_for_tts
    clean_text = clean_narration_for_tts(clean_text)
    prov = provider.lower().strip()
    target_lang = (language or "id").strip().lower()

    # 1. ELEVENLABS TTS
    if prov == "elevenlabs":
        try:
            m_id = (model or "eleven_multilingual_v2").lower().strip()
            if ("flash_v2_5" in m_id or "turbo_v2_5" in m_id or "flash" in m_id) and "v4" not in m_id:
                eleven_max_chars = 40000
                chunk_size = 38000
            else:
                eleven_max_chars = 10000
                chunk_size = 9500

            if len(clean_text) <= eleven_max_chars:
                return await generate_elevenlabs_tts(
                    clean_text,
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    model=model or "eleven_multilingual_v2",
                    rate=rate,
                    pitch=pitch,
                    language=target_lang,
                )

            # For extraordinarily long texts exceeding model capacity (>10,000 or >40,000 chars)
            chunks = _split_text_for_tts(clean_text, max_chars=chunk_size)
            if len(chunks) == 1:
                return await generate_elevenlabs_tts(
                    chunks[0],
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    model=model or "eleven_multilingual_v2",
                    rate=rate,
                    pitch=pitch,
                    language=target_lang,
                )

            out_p = Path(output_path)
            parts: List[str] = []
            try:
                for i, chunk in enumerate(chunks):
                    part_path = str(out_p.with_name(f"{out_p.stem}.part{i:03d}.mp3"))
                    try:
                        await generate_elevenlabs_tts(
                            chunk,
                            part_path,
                            api_key=api_key,
                            voice=voice,
                            model=model or "eleven_multilingual_v2",
                            rate=rate,
                            pitch=pitch,
                            language=target_lang,
                        )
                        parts.append(part_path)
                    except Exception as chunk_err:
                        if parts:
                            try:
                                await _concat_mp3s(parts, output_path)
                            except Exception:
                                pass
                        raise RuntimeError(
                            f"Sintesis ElevenLabs terhenti pada bagian {i+1}/{len(chunks)}: {chunk_err}"
                        ) from chunk_err
                    if i < len(chunks) - 1:
                        await asyncio.sleep(0.3)

                return await _concat_mp3s(parts, output_path)
            finally:
                for p in parts:
                    Path(p).unlink(missing_ok=True)
        except Exception as e:
            err_str = str(e).lower()
            is_char_limit = (
                isinstance(e, ElevenLabsCharacterLimitError)
                or any(k in err_str for k in [
                    "character limit", "too_large", "request_too_large",
                    "max_characters", "maximum text length", "quota_exceeded",
                    "exceeds the maximum", "characters allowed"
                ])
            )
            if is_char_limit:
                log.error("ElevenLabs TTS melebihi batas karakter: %s", e)
                raise RuntimeError(
                    f"ElevenLabs Character Limit Exceeded: {e}"
                ) from e

            log.error("ElevenLabs TTS failed: %s", e)
            raise

    # 2. RUNWARE TTS
    elif prov == "runware":
        try:
            if len(clean_text) <= 1200:
                return await generate_runware_tts(
                    clean_text,
                    output_path,
                    api_key=api_key,
                    model=model or "fishaudio:s2.1@pro",
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    language=target_lang,
                )

            # For scripts > 1200 chars, split into ~900-char blocks
            chunks = _split_text_for_tts(clean_text, max_chars=900)
            if len(chunks) == 1:
                return await generate_runware_tts(
                    chunks[0],
                    output_path,
                    api_key=api_key,
                    model=model or "fishaudio:s2.1@pro",
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    language=target_lang,
                )

            out_p = Path(output_path)
            parts: List[str] = []
            try:
                for i, chunk in enumerate(chunks):
                    part_path = str(out_p.with_name(f"{out_p.stem}.part{i:03d}.mp3"))
                    try:
                        await generate_runware_tts(
                            chunk,
                            part_path,
                            api_key=api_key,
                            model=model or "fishaudio:s2.1@pro",
                            voice=voice,
                            rate=rate,
                            pitch=pitch,
                            language=target_lang,
                        )
                        parts.append(part_path)
                    except Exception as chunk_err:
                        if parts:
                            try:
                                await _concat_mp3s(parts, output_path)
                            except Exception:
                                pass
                        raise RuntimeError(
                            f"Sintesis Runware TTS terhenti pada bagian {i+1}/{len(chunks)}: {chunk_err}"
                        ) from chunk_err
                    if i < len(chunks) - 1:
                        await asyncio.sleep(0.3)

                return await _concat_mp3s(parts, output_path)
            finally:
                for p in parts:
                    Path(p).unlink(missing_ok=True)
        except Exception as e:
            log.error("Runware TTS failed: %s", e)
            raise

    # 3. GEMINI TTS
    elif prov == "gemini":
        try:
            if len(clean_text) <= 2200:
                return await generate_gemini_tts(
                    clean_text,
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    model=model,
                    language=target_lang,
                )

            # Long-form narrations (> 2200 chars): split into balanced ~750-char blocks
            chunks = _split_text_for_tts(clean_text, max_chars=750)
            if len(chunks) == 1:
                return await generate_gemini_tts(
                    chunks[0],
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    model=model,
                    language=target_lang,
                )

            out_p = Path(output_path)
            parts: List[str] = []
            try:
                for i, chunk in enumerate(chunks):
                    part_path = str(out_p.with_name(f"{out_p.stem}.part{i:03d}.mp3"))
                    try:
                        await generate_gemini_tts(
                            chunk,
                            part_path,
                            api_key=api_key,
                            voice=voice,
                            rate=rate,
                            pitch=pitch,
                            model=model,
                            language=target_lang,
                        )
                        parts.append(part_path)
                    except Exception as chunk_err:
                        if parts:
                            try:
                                await _concat_mp3s(parts, output_path)
                            except Exception as concat_err:
                                log.warning("Failed to concat partial audio chunks: %s", concat_err)
                        raise RuntimeError(
                            f"Sintesis suara {provider.upper()} terhenti pada bagian {i+1}/{len(chunks)}: {chunk_err}"
                        ) from chunk_err

                    if i < len(chunks) - 1:
                        await asyncio.sleep(0.5)

                return await _concat_mp3s(parts, output_path)
            finally:
                for p in parts:
                    Path(p).unlink(missing_ok=True)
        except Exception as e:
            log.error("Gemini TTS failed: %s", e)
            raise

    # 4. EDGE-TTS
    else:
        try:
            edge_v = voice
            if target_lang == "en" and (edge_v in ("id-ID-GadisNeural", "id-ID-ArdiNeural", "default") or not edge_v.startswith("en-")):
                edge_v = "en-US-JennyNeural"
            elif target_lang != "en" and edge_v.startswith("en-") and edge_v in ("en-US-JennyNeural", "default"):
                edge_v = "id-ID-GadisNeural"
            return await generate_edge_tts(
                clean_text,
                output_path,
                voice=edge_v,
                rate=rate,
                pitch=pitch,
            )
        except Exception as e:
            log.error("Edge-TTS synthesis failed: %s", e)
            raise
