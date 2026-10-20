import asyncio
import difflib
import logging
import os
import re
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

# Cache faster-whisper models by model size (e.g. 'base', 'small', 'medium')
_whisper_models: Dict[str, Any] = {}


def get_whisper_model(model_size: str = "base", force_reload: bool = False):
    """Lazy load and cache the faster-whisper model instance per model_size."""
    global _whisper_models
    if force_reload or model_size not in _whisper_models or _whisper_models[model_size] is None:
        try:
            from faster_whisper import WhisperModel
            threads = min(4, max(1, os.cpu_count() or 2))
            _whisper_models[model_size] = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
                cpu_threads=threads,
                num_workers=1,
            )
            log.info("Initialized faster-whisper model '%s' (cpu_threads=%d)", model_size, threads)
        except Exception as e:
            log.exception("Could not initialize faster-whisper model '%s': %s", model_size, e)
            _whisper_models[model_size] = None
    return _whisper_models.get(model_size)


def _norm_token(w: str) -> str:
    """Normalize word token by stripping punctuation and lowercasing."""
    return re.sub(r"[^\w]", "", w.lower().strip())


def _align_fallback(
    segments: List[Dict[str, Any]],
    total_audio_duration_sec: float,
    offset_ms: int = 0,
) -> List[Dict[str, Any]]:
    """Proportional time allocation fallback if Whisper model is unavailable."""
    if not segments:
        return []
    total_chars = sum(len(seg.get("text", "")) for seg in segments)
    if total_chars == 0:
        return segments

    cur_ms = max(0, offset_ms)
    total_ms = max(int(total_audio_duration_sec * 1000), 1000)

    aligned = []
    for s_idx, seg in enumerate(segments):
        seg_text = seg.get("text", "")
        seg_chars = len(seg_text)
        seg_duration_ms = int((seg_chars / total_chars) * total_ms)
        seg_end_ms = cur_ms + seg_duration_ms

        words_raw = seg_text.split()
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

        res_seg = dict(seg)
        res_seg.update({
            "id": seg.get("id", f"seg-{s_idx+1}"),
            "text": seg_text,
            "start_ms": cur_ms,
            "end_ms": seg_end_ms,
            "words": word_items,
        })
        aligned.append(res_seg)
        cur_ms = seg_end_ms

    return aligned


def sequence_anchored_forced_alignment(
    target_segments: List[Dict[str, Any]],
    whisper_words: List[Dict[str, Any]],
    total_audio_duration_sec: float,
    offset_ms: int = 0,
) -> List[Dict[str, Any]]:
    """
    Perform sequence-anchored forced alignment between script segments and Whisper audio timestamps.
    Audio timestamps from Whisper act as the true anchor.
    Compound words or split tokens (e.g. 'biasamu' <-> ['biasa', 'amu']) are merged,
    and pause/omission gaps never cause word drift for subsequent sentences.
    """
    if not target_segments:
        return []
    flat_targets = []
    for s_idx, seg in enumerate(target_segments):
        seg_text = seg.get("text", "")
        words = seg_text.split()
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
        return _align_fallback(target_segments, total_audio_duration_sec, offset_ms=offset_ms)

    t_norms = [t["norm"] for t in flat_targets]
    w_norms = [_norm_token(w["word"]) for w in whisper_words]

    sm = difflib.SequenceMatcher(None, t_norms, w_norms)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            # Direct matches: exact word timestamp assignment from audio
            for k in range(i2 - i1):
                flat_targets[i1 + k]["start_ms"] = whisper_words[j1 + k]["start_ms"]
                flat_targets[i1 + k]["end_ms"] = whisper_words[j1 + k]["end_ms"]
        elif tag == "replace":
            # Compound words, pronunciation or slight spelling discrepancies
            chunk_start = whisper_words[j1]["start_ms"]
            chunk_end = whisper_words[j2 - 1]["end_ms"]
            n_targets = i2 - i1
            if n_targets == 1:
                flat_targets[i1]["start_ms"] = chunk_start
                flat_targets[i1]["end_ms"] = max(chunk_start + 80, chunk_end)
            else:
                total_chars = sum(len(flat_targets[i]["word"]) for i in range(i1, i2)) or 1
                cur_t = chunk_start
                span = max(chunk_end - chunk_start, 100 * n_targets)
                for i in range(i1, i2):
                    w_dur = int((len(flat_targets[i]["word"]) / total_chars) * span)
                    flat_targets[i]["start_ms"] = cur_t
                    flat_targets[i]["end_ms"] = cur_t + max(w_dur, 60)
                    cur_t += w_dur
        elif tag == "delete":
            # Target words omitted in audio: smooth local interpolation between prev anchor and next anchor
            prev_end = 0
            for p in range(i1 - 1, -1, -1):
                if flat_targets[p]["end_ms"] > 0:
                    prev_end = flat_targets[p]["end_ms"]
                    break

            n_targets = i2 - i1
            next_start = prev_end + 250 * n_targets
            for n in range(j1, len(whisper_words)):
                if whisper_words[n]["start_ms"] > prev_end:
                    next_start = whisper_words[n]["start_ms"]
                    break

            if next_start > prev_end:
                step = (next_start - prev_end) // n_targets
            else:
                step = 200

            cur_t = prev_end
            for i in range(i1, i2):
                flat_targets[i]["start_ms"] = cur_t
                flat_targets[i]["end_ms"] = cur_t + max(step, 80)
                cur_t += step

    # Apply global offset shift if requested
    if offset_ms != 0:
        for t in flat_targets:
            t["start_ms"] = max(0, t["start_ms"] + offset_ms)
            t["end_ms"] = max(t["start_ms"] + 80, t["end_ms"] + offset_ms)

    # Ensure monotonic, strictly positive timestamps without zero-width collapses
    last_end = 0
    for t in flat_targets:
        if t["start_ms"] < last_end:
            t["start_ms"] = last_end
        if t["end_ms"] <= t["start_ms"]:
            t["end_ms"] = t["start_ms"] + 120
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

        # Anchor first segment smoothly: if speech starts within the first 600ms,
        # anchor segment display at 0ms so subtitle is visible immediately when playback starts
        if s_idx == 0 and s_start < 600 and offset_ms == 0:
            s_start = 0

        res_seg = dict(seg)
        res_seg.update({
            "id": seg.get("id", f"seg-{s_idx+1}"),
            "text": seg.get("text", ""),
            "start_ms": s_start,
            "end_ms": s_end,
            "words": word_items,
        })
        result_segments.append(res_seg)

    return result_segments


async def align_audio_with_text(
    audio_path: str,
    segments: List[Dict[str, Any]],
    total_audio_duration_sec: float,
    language: Optional[str] = "id",
    model_size: str = "base",
    offset_ms: int = 0,
    force_realignment: bool = False,
) -> List[Dict[str, Any]]:
    """
    Perform audio-anchored word-level forced alignment against the narration segments.
    If force_realignment is True, Whisper MUST succeed and process the audio;
    it will not silently mask failures with proportional fallback.
    """
    if not segments:
        return []

    loop = asyncio.get_running_loop()

    def _run_whisper() -> List[Dict[str, Any]]:
        model = get_whisper_model(model_size, force_reload=force_realignment)
        if not model:
            if force_realignment:
                raise RuntimeError(
                    f"Model Whisper AI ({model_size}) gagal diinisialisasi pada server."
                )
            return []

        try:
            # IMPORTANT: Never pass the script text itself as initial_prompt.
            # In Whisper, initial_prompt acts as the transcription prefix from the preceding window.
            generic_prompt = (
                "Transkripsi audio narasi bahasa Indonesia."
                if (language or "id").startswith("id")
                else None
            )

            lang_arg = None if language in (None, "auto", "") else language

            # For synthesized TTS audio, vad_filter is disabled to avoid Silero VAD cutting soft consonants
            # or adding false onset latency at 0.0s. Deterministic temperature=0.0 and beam_size=5 for precision.
            whisper_segments, _ = model.transcribe(
                audio_path,
                language=lang_arg,
                initial_prompt=generic_prompt,
                word_timestamps=True,
                vad_filter=False,
                temperature=0.0,
                beam_size=5,
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
            log.exception("Whisper alignment failed for %s: %s", audio_path, e)
            if force_realignment:
                raise RuntimeError(f"Whisper AI gagal mentranskripsi audio: {str(e)}")
            return []

    words_with_timestamps = await loop.run_in_executor(None, _run_whisper)

    if not words_with_timestamps:
        if force_realignment:
            raise RuntimeError(
                "Whisper AI tidak mendeteksi kata-kata dari audio narasi. Pastikan audio tidak hening."
            )
        log.info("Whisper returned empty words; applying proportional fallback alignment")
        return _align_fallback(segments, total_audio_duration_sec, offset_ms=offset_ms)

    return sequence_anchored_forced_alignment(
        segments,
        words_with_timestamps,
        total_audio_duration_sec,
        offset_ms=offset_ms,
    )
