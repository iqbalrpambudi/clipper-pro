import asyncio
import difflib
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


def _norm_token(w: str) -> str:
    """Normalize word token by stripping punctuation and lowercasing."""
    return re.sub(r"[^\w]", "", w.lower().strip())


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
            "id": seg.get("id", f"seg-{len(aligned)+1}"),
            "text": seg["text"],
            "start_ms": cur_ms,
            "end_ms": seg_end_ms,
            "words": word_items,
        })
        cur_ms = seg_end_ms

    return aligned


def sequence_anchored_forced_alignment(
    target_segments: List[Dict[str, Any]],
    whisper_words: List[Dict[str, Any]],
    total_audio_duration_sec: float,
) -> List[Dict[str, Any]]:
    """
    Perform sequence-anchored forced alignment between script segments and Whisper audio timestamps.
    Audio timestamps from Whisper act as the true anchor.
    Compound words or split tokens (e.g. 'biasamu' <-> ['biasa', 'amu']) are merged,
    and pause/omission gaps never cause word drift for subsequent sentences.
    """
    flat_targets = []
    for s_idx, seg in enumerate(target_segments):
        words = seg["text"].split()
        for w_idx, w in enumerate(words):
            flat_targets.append({
                "seg_idx": s_idx,
                "word_idx": w_idx,
                "word": w,
                "norm": _norm_token(w),
                "start_ms": 0,
                "end_ms": 0,
            })

    if not flat_targets:
        return target_segments
    if not whisper_words:
        return _align_fallback(target_segments, total_audio_duration_sec)

    t_norms = [t["norm"] for t in flat_targets]
    w_norms = [_norm_token(w["word"]) for w in whisper_words]

    sm = difflib.SequenceMatcher(None, t_norms, w_norms)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            # Direct matches: exact word timestamp assignment
            for k in range(i2 - i1):
                flat_targets[i1 + k]["start_ms"] = whisper_words[j1 + k]["start_ms"]
                flat_targets[i1 + k]["end_ms"] = whisper_words[j1 + k]["end_ms"]
        elif tag == "replace":
            # Compound words or slight spelling discrepancies
            chunk_start = whisper_words[j1]["start_ms"]
            chunk_end = whisper_words[j2 - 1]["end_ms"]
            n_targets = i2 - i1
            if n_targets == 1:
                flat_targets[i1]["start_ms"] = chunk_start
                flat_targets[i1]["end_ms"] = chunk_end
            else:
                total_chars = sum(len(flat_targets[i]["word"]) for i in range(i1, i2)) or 1
                cur_t = chunk_start
                span = max(chunk_end - chunk_start, 100 * n_targets)
                for i in range(i1, i2):
                    w_dur = int((len(flat_targets[i]["word"]) / total_chars) * span)
                    flat_targets[i]["start_ms"] = cur_t
                    flat_targets[i]["end_ms"] = cur_t + w_dur
                    cur_t += w_dur
        elif tag == "delete":
            # Target words omitted in audio: smooth local interpolation
            prev_end = flat_targets[i1 - 1]["end_ms"] if i1 > 0 else 0
            cur_t = prev_end
            for i in range(i1, i2):
                flat_targets[i]["start_ms"] = cur_t
                flat_targets[i]["end_ms"] = cur_t + 250
                cur_t += 250

    # Ensure monotonic, strictly positive timestamps
    last_end = 0
    for t in flat_targets:
        if t["start_ms"] < last_end:
            t["start_ms"] = last_end
        if t["end_ms"] <= t["start_ms"]:
            t["end_ms"] = t["start_ms"] + 150
        last_end = t["end_ms"]

    # Reconstruct segments with aligned words
    result_segments = []
    for s_idx, seg in enumerate(target_segments):
        s_words = [t for t in flat_targets if t["seg_idx"] == s_idx]
        word_items = [
            {"word": w["word"], "start_ms": w["start_ms"], "end_ms": w["end_ms"]}
            for w in s_words
        ]
        s_start = word_items[0]["start_ms"] if word_items else 0
        s_end = word_items[-1]["end_ms"] if word_items else 0

        result_segments.append({
            "id": seg.get("id", f"seg-{s_idx+1}"),
            "text": seg["text"],
            "start_ms": s_start,
            "end_ms": s_end,
            "words": word_items,
        })

    return result_segments


async def align_audio_with_text(
    audio_path: str,
    segments: List[Dict[str, Any]],
    total_audio_duration_sec: float,
) -> List[Dict[str, Any]]:
    """Perform audio-anchored word-level forced alignment against the narration segments."""
    loop = asyncio.get_running_loop()

    # Build prompt from script to guide Whisper transcription
    script_prompt = " ".join(seg.get("text", "") for seg in segments)[:400]

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
                initial_prompt=script_prompt if script_prompt else None,
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

    return sequence_anchored_forced_alignment(segments, words_with_timestamps, total_audio_duration_sec)
