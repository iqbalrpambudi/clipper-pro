import asyncio
import logging
import re
from pathlib import Path
from typing import List, Dict, Any, Tuple

log = logging.getLogger(__name__)

# Lazy loaded faster-whisper model instance
_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            # Run on CPU with int8 compute for lightweight fast alignment
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        except Exception as e:
            log.warning("Could not initialize faster-whisper model: %s", e)
            _whisper_model = False
    return _whisper_model


def _align_fallback(
    segments: List[Dict[str, Any]],
    total_audio_duration_sec: float,
) -> List[Dict[str, Any]]:
    """Proportional time allocation fallback if Whisper model is unavailable."""
    total_chars = sum(len(seg["text"]) for seg in segments)
    if total_chars == 0:
        return segments

    cur_ms = 0
    total_ms = int(total_audio_duration_sec * 1000)

    aligned = []
    for seg in segments:
        seg_chars = len(seg["text"])
        seg_duration_ms = int((seg_chars / total_chars) * total_ms)
        seg_end_ms = cur_ms + seg_duration_ms

        words_raw = seg["text"].split()
        words_count = max(len(words_raw), 1)
        word_dur_ms = seg_duration_ms // words_count

        word_items = []
        w_cur = cur_ms
        for w in words_raw:
            w_end = w_cur + word_dur_ms
            word_items.append({
                "word": w,
                "start_ms": w_cur,
                "end_ms": w_end,
            })
            w_cur = w_end

        aligned.append({
            "id": seg["id"],
            "text": seg["text"],
            "start_ms": cur_ms,
            "end_ms": seg_end_ms,
            "words": word_items,
        })
        cur_ms = seg_end_ms

    return aligned


async def align_audio_with_text(
    audio_path: str,
    segments: List[Dict[str, Any]],
    total_audio_duration_sec: float,
) -> List[Dict[str, Any]]:
    """Perform word-level forced alignment against the narration segments."""
    loop = asyncio.get_running_loop()

    def _run_whisper() -> List[Dict[str, Any]]:
        model = _get_whisper_model()
        if not model:
            return []

        try:
            whisper_segments, _ = model.transcribe(
                audio_path,
                language="id",
                word_timestamps=True,
                vad_filter=True,
            )
            extracted_words = []
            for seg in whisper_segments:
                if seg.words:
                    for w in seg.words:
                        clean_w = w.word.strip()
                        if clean_w:
                            extracted_words.append({
                                "word": clean_w,
                                "start_ms": int(w.start * 1000),
                                "end_ms": int(w.end * 1000),
                            })
            return extracted_words
        except Exception as e:
            log.warning("Whisper alignment failed: %s", e)
            return []

    words_with_timestamps = await loop.run_in_executor(None, _run_whisper)

    if not words_with_timestamps:
        log.info("Whisper returned empty words; applying proportional fallback alignment")
        return _align_fallback(segments, total_audio_duration_sec)

    # Map whisper aligned words into sentence segments sequentially
    result_segments = []
    word_idx = 0
    total_whisper_words = len(words_with_timestamps)

    for seg in segments:
        seg_words = seg["text"].split()
        matched_words = []

        for target_w in seg_words:
            if word_idx < total_whisper_words:
                item = words_with_timestamps[word_idx]
                matched_words.append({
                    "word": target_w,
                    "start_ms": item["start_ms"],
                    "end_ms": item["end_ms"],
                })
                word_idx += 1
            else:
                # If whisper finished early, extrapolate from last word
                last_end = matched_words[-1]["end_ms"] if matched_words else 0
                matched_words.append({
                    "word": target_w,
                    "start_ms": last_end,
                    "end_ms": last_end + 300,
                })

        seg_start = matched_words[0]["start_ms"] if matched_words else 0
        seg_end = matched_words[-1]["end_ms"] if matched_words else 0

        result_segments.append({
            "id": seg["id"],
            "text": seg["text"],
            "start_ms": seg_start,
            "end_ms": seg_end,
            "words": matched_words,
        })

    return result_segments
