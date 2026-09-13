import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import List, Dict, Any, Optional

log = logging.getLogger(__name__)

_whisper_model = None


def get_transcribe_model(model_size: str = "base"):
    """Lazy load faster-whisper model for speech transcription."""
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            # Load on CPU with int8 quantization for fast lightweight inference
            _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
            log.info("Loaded faster-whisper model '%s' on CPU", model_size)
        except Exception as e:
            log.warning("Could not initialize faster-whisper model: %s", e)
            _whisper_model = False
    return _whisper_model


async def extract_audio_track(video_path: str, output_wav_path: str) -> bool:
    """Extract 16kHz mono WAV audio track from video using ffmpeg."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        output_wav_path,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            log.warning("ffmpeg audio extraction warning: %s", stderr.decode("utf-8", errors="ignore")[:300])
            return False
        return os.path.exists(output_wav_path) and os.path.getsize(output_wav_path) > 0
    except Exception as e:
        log.warning("Failed to extract audio from %s: %s", video_path, e)
        return False


def _transcribe_audio_file(
    audio_path: str,
    language: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Synchronous worker function to transcribe audio using faster-whisper."""
    model = get_transcribe_model("base")
    if not model:
        log.warning("faster-whisper is not available. Skipping transcription.")
        return []

    try:
        segments, info = model.transcribe(
            audio_path,
            language=language if language and language != "auto" else None,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        results = []
        for seg in segments:
            text = seg.text.strip()
            if text:
                results.append({
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "text": text,
                })
        return results
    except Exception as e:
        log.error("Transcription error on %s: %s", audio_path, e)
        return []


async def transcribe_video_scenes(
    video_path: str,
    scenes: List[Dict[str, Any]],
    language: Optional[str] = None,
) -> Dict[str, str]:
    """
    Transcribe speech in video and map dialogue to individual scenes based on time overlap.
    Returns a mapping of scene_id -> dialogue string.
    """
    if not os.path.exists(video_path) or not scenes:
        return {}

    with tempfile.TemporaryDirectory() as tmp_dir:
        wav_path = os.path.join(tmp_dir, "audio.wav")
        has_audio = await extract_audio_track(video_path, wav_path)
        if not has_audio:
            log.info("No audio track found or extracted for %s", video_path)
            return {}

        # Run transcription in thread pool to avoid blocking async event loop
        loop = asyncio.get_running_loop()
        whisper_segments = await loop.run_in_executor(
            None,
            _transcribe_audio_file,
            wav_path,
            language,
        )

    if not whisper_segments:
        return {}

    log.info("Transcribed %d speech segments from %s", len(whisper_segments), video_path)

    # Map segments to scenes based on time interval overlap
    scene_transcripts: Dict[str, str] = {}
    for sc in scenes:
        sc_id = str(sc.get("id", sc.get("scene_index", "")))
        sc_start = float(sc.get("start_time", 0.0))
        sc_end = float(sc.get("end_time", 0.0))

        matched_texts = []
        for seg in whisper_segments:
            # Overlap check: segment overlaps with [sc_start, sc_end]
            if seg["end"] > sc_start + 0.1 and seg["start"] < sc_end - 0.1:
                if seg["text"] and seg["text"] not in matched_texts:
                    matched_texts.append(seg["text"])

        if matched_texts:
            scene_transcripts[sc_id] = " ".join(matched_texts)

    return scene_transcripts
