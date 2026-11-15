import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.core.frame_math import snap_to_frame
from app.services.ai_adapters.base import BaseLLMAdapter

STOPWORDS = {
    "dan", "di", "ke", "dari", "yang", "ini", "itu", "untuk", "pada", "adalah",
    "cuma", "bisa", "lewat", "saat", "lalu", "akan", "jadi", "juga", "dengan",
    "the", "and", "in", "to", "of", "a", "is", "for", "on", "at", "by", "with",
}


def _calc_lexical_overlap(text1: str, text2: str) -> float:
    """Calculate token Jaccard-like overlap between narration window and scene metadata."""
    t1 = set(re.findall(r"\w+", text1.lower())) - STOPWORDS
    t2 = set(re.findall(r"\w+", text2.lower())) - STOPWORDS
    if not t1 or not t2:
        return 0.0
    common = t1 & t2
    return len(common) / max(len(t1), 1)


def cosine_similarity(v1: Any, v2: Any) -> float:
    if v1 is None or v2 is None:
        return 0.0
    try:
        a = np.asarray(v1, dtype=np.float32)
        b = np.asarray(v2, dtype=np.float32)
        if a.size == 0 or b.size == 0:
            return 0.0
        norm_a = float(np.linalg.norm(a))
        norm_b = float(np.linalg.norm(b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))
    except Exception:
        return 0.0


def build_visual_shot_windows(
    segments: List[Dict[str, Any]],
    min_dur: float = 2.0,
    max_dur: float = 4.5,
    total_audio_duration_sec: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Cluster or split narration sentence segments into continuous, balanced visual shot windows.

    Guarantees:
    - 100% Continuous: Every window connects seamlessly to the next window (zero gap, zero audio-video drift).
    - Cuts on Pauses: Cuts between sentences happen at the pause midpoint between sentences.
    - Anti-Flash: No window is shorter than min_dur (unless total project duration is smaller).
    - Anti-Copyright: Long contiguous blocks are broken into balanced shots (<= max_dur).
    """
    if not segments:
        return []

    # Step 1: Compute continuous sentence timeline spans bridging the silence pauses at their midpoints
    n_segs = len(segments)
    seg_spans = []

    for i in range(n_segs):
        seg = segments[i]
        raw_start = seg.get("start_ms", 0) / 1000.0
        raw_end = seg.get("end_ms", 0) / 1000.0

        if i == 0:
            span_start = 0.0
        else:
            prev_raw_end = segments[i - 1].get("end_ms", 0) / 1000.0
            if raw_start > prev_raw_end:
                span_start = snap_to_frame((prev_raw_end + raw_start) / 2.0)
            else:
                span_start = snap_to_frame(raw_start)

        if i == n_segs - 1:
            span_end = snap_to_frame(max(raw_end, total_audio_duration_sec or raw_end))
        else:
            next_raw_start = segments[i + 1].get("start_ms", 0) / 1000.0
            if next_raw_start > raw_end:
                span_end = snap_to_frame((raw_end + next_raw_start) / 2.0)
            else:
                span_end = snap_to_frame(raw_end)

        seg_spans.append({
            "seg_id": seg.get("id", f"seg-{i+1}"),
            "scene_id": seg.get("scene_id"),
            "text": seg.get("text", ""),
            "start_sec": span_start,
            "end_sec": span_end,
            "duration": round(span_end - span_start, 4),
        })

    # Step 2: Group spans shorter than min_dur, and split spans longer than max_dur
    windows: List[Dict[str, Any]] = []
    curr_spans: List[Dict[str, Any]] = []
    w_start = 0.0

    for span in seg_spans:
        dur = span["duration"]

        # If single sentence span is very long (> max_dur), flush current and split;
        # only when every chunk can stay >= min_dur, else heal merges the chunks back
        # and the tagged shot is lost under a slowed-down neighbour.
        if dur > max_dur and dur >= 2 * min_dur:
            if curr_spans:
                flush_end = snap_to_frame(curr_spans[-1]["end_sec"])
                windows.append({
                    "start_sec": snap_to_frame(w_start),
                    "end_sec": flush_end,
                    "duration": round(flush_end - snap_to_frame(w_start), 4),
                    "text": " ".join(s["text"] for s in curr_spans),
                    "primary_segment_id": curr_spans[0]["seg_id"],
                    "scene_id": curr_spans[0].get("scene_id"),
                })
                w_start = flush_end
                curr_spans = []

            # Divide long span into balanced chunks between min_dur and max_dur
            num_chunks = min(int(dur // min_dur), max(2, int(round(dur / ((min_dur + max_dur) / 2)))))
            chunk_len = dur / num_chunks
            c_start = span["start_sec"]
            for c_idx in range(num_chunks):
                c_end = span["end_sec"] if c_idx == num_chunks - 1 else snap_to_frame(c_start + chunk_len)
                windows.append({
                    "start_sec": snap_to_frame(c_start),
                    "end_sec": snap_to_frame(c_end),
                    "duration": round(c_end - c_start, 4),
                    "text": span["text"],
                    "primary_segment_id": span["seg_id"],
                    "scene_id": span.get("scene_id") if c_idx == 0 else None,
                })
                c_start = c_end
            w_start = span["end_sec"]
            continue

        # New tag: give it its own shot, but only if the open window already clears the 3 s
        # clip floor; shorter ones merge forward (keep first tag) instead of flashing.
        if (
            curr_spans
            and span.get("scene_id")
            and span["scene_id"] != curr_spans[0].get("scene_id")
            and curr_spans[-1]["end_sec"] - w_start >= min(3.0, min_dur)
        ):
            flush_end = snap_to_frame(curr_spans[-1]["end_sec"])
            windows.append({
                "start_sec": snap_to_frame(w_start),
                "end_sec": flush_end,
                "duration": round(flush_end - snap_to_frame(w_start), 4),
                "text": " ".join(s["text"] for s in curr_spans),
                "primary_segment_id": curr_spans[0]["seg_id"],
                "scene_id": curr_spans[0].get("scene_id"),
            })
            w_start = flush_end
            curr_spans = []

        curr_spans.append(span)
        accum_dur = round(span["end_sec"] - w_start, 4)

        if accum_dur >= min_dur:
            windows.append({
                "start_sec": snap_to_frame(w_start),
                "end_sec": snap_to_frame(span["end_sec"]),
                "duration": round(span["end_sec"] - w_start, 4),
                "text": " ".join(s["text"] for s in curr_spans),
                "primary_segment_id": curr_spans[0]["seg_id"],
                "scene_id": curr_spans[0].get("scene_id"),
            })
            w_start = span["end_sec"]
            curr_spans = []

    # Handle trailing spans
    if curr_spans:
        trailing_end = snap_to_frame(curr_spans[-1]["end_sec"])
        if windows and (trailing_end - w_start) < min_dur:
            windows[-1]["end_sec"] = trailing_end
            windows[-1]["duration"] = round(trailing_end - windows[-1]["start_sec"], 4)
            windows[-1]["text"] += " " + " ".join(s["text"] for s in curr_spans)
        else:
            windows.append({
                "start_sec": snap_to_frame(w_start),
                "end_sec": trailing_end,
                "duration": round(trailing_end - w_start, 4),
                "text": " ".join(s["text"] for s in curr_spans),
                "primary_segment_id": curr_spans[0]["seg_id"],
                "scene_id": curr_spans[0].get("scene_id"),
            })

    # Guarantee strict mathematical continuity between all adjacent windows
    if windows:
        windows[0]["start_sec"] = 0.0
        for k in range(len(windows) - 1):
            windows[k + 1]["start_sec"] = windows[k]["end_sec"]
            windows[k + 1]["duration"] = round(windows[k + 1]["end_sec"] - windows[k + 1]["start_sec"], 4)

    return windows


def _get_scene_usable_range(
    scene: Dict[str, Any],
    target_duration: float = 2.0,
) -> Tuple[float, float, float, bool]:
    """Extract single contiguous safe shot window from scene metadata.

    Guarantees:
    - Never slices across internal cuts within a merged scene.
    - Preserves head and tail safety margins away from cut boundaries.
    - Returns (safe_start, safe_end, safe_dur, is_montage).
    """
    shot_info = scene.get("shot_info") or {}
    ranges = shot_info.get("usable_ranges")
    is_montage = bool(shot_info.get("montage", False))

    if ranges:
        valid_ranges = [r for r in ranges if len(r) == 2 and r[1] > r[0]]
        if valid_ranges:
            # Prefer contiguous shot ranges that are long enough for target_duration
            fit_ranges = [r for r in valid_ranges if (r[1] - r[0]) >= target_duration]
            if fit_ranges:
                # Pick the fit range closest to target_duration
                best_r = min(fit_ranges, key=lambda r: (r[1] - r[0]) - target_duration)
            else:
                # Pick the longest available contiguous shot
                best_r = max(valid_ranges, key=lambda r: r[1] - r[0])
            s_start, s_end = round(float(best_r[0]), 3), round(float(best_r[1]), 3)
            return s_start, s_end, round(max(0.1, s_end - s_start), 3), is_montage

    # Fallback for legacy scenes without shot_info
    scene_start = float(scene.get("start_time", 0.0))
    scene_end = float(scene.get("end_time", scene_start + float(scene.get("duration", 4.0))))
    head_margin = 0.120 if scene_start > 0.15 else 0.033
    tail_margin = 0.150
    s_start = round(scene_start + head_margin, 3)
    s_end = round(max(s_start + 0.4, scene_end - tail_margin), 3)
    s_dur = round(max(0.3, s_end - s_start), 3)
    return s_start, s_end, s_dur, is_montage


def _run_end(
    scene: Dict[str, Any],
    scenes: List[Dict[str, Any]],
    safe_start: float,
    need: float,
) -> float:
    """Latest source time a clip starting at safe_start may run to, playing through
    the following contiguous non-montage scenes of the same source until `need` is covered."""
    _, end, _, _ = _get_scene_usable_range(scene, need)
    following = sorted(
        (
            sc for sc in scenes
            if sc.get("source_video_id") == scene.get("source_video_id")
            and float(sc.get("start_time", 0.0)) >= float(scene.get("end_time", 0.0)) - 0.05
        ),
        key=lambda sc: float(sc.get("start_time", 0.0)),
    )
    prev_end = float(scene.get("end_time", end))
    for sc in following:
        if end - safe_start >= need:
            break
        if float(sc.get("start_time", 0.0)) - prev_end > 0.2 or (sc.get("shot_info") or {}).get("montage"):
            break
        prev_end = float(sc.get("end_time", prev_end))
        end = round(prev_end - 0.15, 3)
    return end


def _absorb(prev: Dict[str, Any], c: Dict[str, Any], scenes: Optional[List[Dict[str, Any]]] = None) -> None:
    prev["timeline_end"] = snap_to_frame(c.get("timeline_end", prev["timeline_end"]))
    if c.get("text") and c["text"] not in prev.get("text", ""):
        prev["text"] = f"{prev.get('text', '')} {c['text']}".strip()
    # Extend the source slice (up to its safe end) instead of slowing the clip down.
    new_target = round(prev["timeline_end"] - prev["timeline_start"], 3)
    safe_end = float(prev.get("_safe_end") or prev.get("clip_end", 0.0))
    want_end = float(prev["clip_start"]) + new_target * float(prev.get("speed") or 1.0)
    scene = next((sc for sc in scenes or [] if sc["id"] == prev.get("scene_id")), None)
    if want_end > safe_end and scene is not None:
        # Own shot too short for the grown slot: play on into the following shots, not slow-mo.
        safe_end = max(safe_end, _run_end(scene, scenes, float(prev["clip_start"]), want_end - float(prev["clip_start"])))
        prev["_safe_end"] = safe_end
    prev["clip_end"] = snap_to_frame(min(safe_end, want_end))
    src_dur = round(float(prev.get("clip_end", 0.0)) - float(prev.get("clip_start", 0.0)), 3)
    if src_dur > 0 and new_target > 0:
        # Real ratio: renderer stretches source to the slot anyway.
        prev["speed"] = min(1.12, round(src_dur / new_target, 3))


def verify_and_heal_timeline_clips(
    clips: List[Dict[str, Any]],
    min_clip_dur: float = 3.0,
    scenes: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Safety guard (Layer 3): Guarantees timeline never has flash cuts (< min_clip_dur).

    If any clip on timeline is shorter than min_clip_dur, it is safely merged
    into its neighbor, and strict timestamp continuity is preserved.
    """
    if not clips:
        return []

    if len(clips) == 1:
        c = clips[0]
        c["timeline_start"] = 0.0
        c["timeline_end"] = snap_to_frame(c["timeline_end"])
        c.pop("_safe_end", None)
        return [c]

    # Pass 1: Merge any micro-clips shorter than min_clip_dur into the preceding clip
    merged: List[Dict[str, Any]] = []
    for c in clips:
        c_dur = round(float(c.get("timeline_end", 0.0)) - float(c.get("timeline_start", 0.0)), 3)
        if c_dur < min_clip_dur and merged:
            _absorb(merged[-1], c, scenes)
        else:
            merged.append(dict(c))

    # First clip still short: it keeps its scene (the hook) and absorbs the second
    if len(merged) > 1:
        first_dur = round(float(merged[0]["timeline_end"]) - float(merged[0]["timeline_start"]), 3)
        if first_dur < min_clip_dur:
            _absorb(merged[0], merged.pop(1), scenes)

    # Pass 2: Ensure strict mathematical continuity across timeline
    if merged:
        merged[0]["timeline_start"] = 0.0
        for k in range(len(merged) - 1):
            boundary = snap_to_frame(merged[k]["timeline_end"])
            merged[k]["timeline_end"] = boundary
            merged[k + 1]["timeline_start"] = boundary

    for c in merged:
        c.pop("_safe_end", None)
    return merged


SATISFYING_ACTION_KEYWORDS = {
    "percikan", "laser", "potong", "memotong", "leleh", "meleleh", "cair", "presisi",
    "mesin", "api", "tekan", "menekan", "hancur", "poles", "memoles", "kilau", "berkilau",
    "transformasi", "rakit", "merakit", "bor", "mengebor", "tempa", "menempa", "karat",
    "sparks", "molten", "press", "cutting", "forging", "cnc", "grinding", "polishing",
    "satisfying", "hydraulic", "welding", "las", "mengelas", "ukir", "mengukir",
}

STATIC_BORING_KEYWORDS = {
    "kamera statis", "layar kosong", "layar hitam", "berbicara", "wawancara", "duduk diam",
    "talking head", "static shot", "blank screen",
}


def _calc_heatmap_boost(scene: Dict[str, Any]) -> float:
    """Compute YouTube 'Most Replayed' heatmap multiplier [1.0 -> 1.35] for a scene's time range."""
    heatmap = scene.get("heatmap_data")
    if not heatmap or not isinstance(heatmap, list):
        return 1.0

    sc_start = float(scene.get("start_time", 0.0))
    sc_end = float(scene.get("end_time", sc_start + float(scene.get("duration", 3.0))))
    overlapping_vals: List[float] = []

    for bucket in heatmap:
        if not isinstance(bucket, dict):
            continue
        b_start = float(bucket.get("start_time", 0.0) or 0.0)
        b_end = float(bucket.get("end_time", b_start) or b_start)
        b_val = float(bucket.get("value", 0.0) or 0.0)
        if b_end > sc_start and b_start < sc_end:
            overlapping_vals.append(max(0.0, min(1.0, b_val)))

    if not overlapping_vals:
        return 1.0

    peak_val = max(overlapping_vals)
    avg_val = sum(overlapping_vals) / len(overlapping_vals)
    combined = 0.65 * peak_val + 0.35 * avg_val
    return round(1.0 + 0.35 * combined, 4)


def _calc_visual_satisfaction_boost(scene: Dict[str, Any]) -> float:
    """Evaluate visual dopamine & kinetic satisfaction score [0.55 -> 1.30] from Vision AI + action tags."""
    analysis = scene.get("analysis") if isinstance(scene.get("analysis"), dict) else {}
    raw_vs = analysis.get("visual_satisfaction")
    base_vs = 0.65
    if raw_vs is not None:
        try:
            base_vs = max(0.0, min(1.0, float(raw_vs)))
        except (TypeError, ValueError):
            base_vs = 0.65

    desc_and_tags = (
        f"{scene.get('description', '')} {' '.join(scene.get('tags') or [])} "
        f"{analysis.get('action', '')} {' '.join(analysis.get('objects') or [])}"
    ).lower()

    if any(bad in desc_and_tags for bad in STATIC_BORING_KEYWORDS):
        base_vs = max(0.15, base_vs - 0.30)

    tokens = set(re.findall(r"\w+", desc_and_tags))
    sat_hits = len(tokens & SATISFYING_ACTION_KEYWORDS)
    if sat_hits > 0:
        base_vs = min(1.0, base_vs + min(0.25, sat_hits * 0.08))

    # Map [0.0, 1.0] -> [0.55, 1.30]
    return round(0.55 + 0.75 * base_vs, 4)


async def match_scenes_to_segments(
    adapter: BaseLLMAdapter,
    segments: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    default_bg_fill: Optional[Dict[str, Any]] = None,
    total_audio_duration_sec: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Match narration segments to scenes with strict chronological progression,
    YouTube Heatmap + Vision Satisfaction scoring, and snappy anti-slow-mo pacing.
    """
    if not scenes or not segments:
        return []

    # 1. Shot windows of 2-3.5 s: a ~4.5 s spoken line gets its tagged shot plus one follow-up cut,
    #    the pace of process shorts (reference channel cuts every ~2-3 s).
    windows = build_visual_shot_windows(
        segments,
        min_dur=2.0,
        max_dur=3.5,
        total_audio_duration_sec=total_audio_duration_sec,
    )
    if not windows:
        return []

    # 2. Pre-generate embeddings for each visual shot window
    window_embeddings = []
    for win in windows:
        emb = await adapter.generate_embedding(win["text"])
        window_embeddings.append(emb)

    clips: List[Dict[str, Any]] = []
    recent_scene_ids: List[str] = []
    global_used_ids = set()
    scene_by_id = {sc["id"]: sc for sc in scenes}
    reserved_ids = {w["scene_id"] for w in windows if w.get("scene_id")}

    total_video_dur = max((sc.get("end_time", 0.0) for sc in scenes), default=1.0)
    total_audio_dur = total_audio_duration_sec or (windows[-1]["end_sec"] if windows else 1.0)
    last_selected_progress = 0.0
    enforce_strict_chrono = len(scenes) > 4

    for i, win in enumerate(windows):
        win_emb = window_embeddings[i]
        start_sec = win["start_sec"]
        end_sec = win["end_sec"]
        target_duration = max(round(end_sec - start_sec, 2), 2.0)
        p_win = (start_sec + end_sec) / (2.0 * max(total_audio_dur, 1.0))

        # 2b. Script already named the scene for this sentence: trust it when the shot is long enough.
        tagged = scene_by_id.get(win.get("scene_id") or "")
        if tagged is not None:
            _, _, tagged_dur, tagged_montage = _get_scene_usable_range(tagged, target_duration)
            if tagged_montage or tagged_dur < 2.0:
                tagged = None

        # 3. Score all candidate scenes with Hybrid Search + Heatmap + Vision Satisfaction + Strict Chrono Flow
        # Follow-up cuts never take a shot the script wrote another line for; with no free
        # scene left the previous clip simply plays on.
        candidates = scenes if tagged is not None else [sc for sc in scenes if sc["id"] not in reserved_ids]
        if not candidates and clips:
            _absorb(clips[-1], {"timeline_end": end_sec, "text": win["text"]}, scenes)
            continue
        scored_scenes = []
        for sc in candidates or scenes:
            sc_emb = sc.get("embedding")
            sim = 0.5
            if sc_emb is not None and win_emb is not None:
                sim = cosine_similarity(win_emb, sc_emb)

            # Lexical keyword match boost (hybrid search)
            sc_text = f"{sc.get('description', '')} {' '.join(sc.get('tags') or [])} {sc.get('transcript', '')}"
            lex = _calc_lexical_overlap(win["text"], sc_text)
            relevance = 0.65 * sim + 0.35 * min(1.0, lex * 2.0)

            # Recency penalty: never reuse a scene when the media pool has plenty of scenes
            if recent_scene_ids and sc["id"] == recent_scene_ids[-1]:
                recency_penalty = 0.01  # Never duplicate immediately consecutive scene
            elif sc["id"] in global_used_ids:
                recency_penalty = 0.03 if len(scenes) >= len(windows) * 2 else 0.35
            elif len(recent_scene_ids) >= 2 and sc["id"] == recent_scene_ids[-2]:
                recency_penalty = 0.25
            else:
                recency_penalty = 1.0

            # Anti-Flash & Anti-Micro-Cut Duration Fit (Layer 2)
            _, _, usable_dur, is_montage = _get_scene_usable_range(sc, target_duration)
            ratio = usable_dur / target_duration

            if is_montage or usable_dur < 2.0:
                dur_fit = 0.05  # Severe penalty: montage / micro-cuts almost never selected
            elif usable_dur >= target_duration * 1.08:
                dur_fit = 1.18  # Ideal headroom for crisp 1.06x micro speed-up
            elif usable_dur >= target_duration:
                dur_fit = 1.08  # Perfect 1.0x fit
            elif ratio >= 0.88:
                dur_fit = 0.90  # Minimal stretch (>= 0.92x)
            else:
                dur_fit = 0.35  # Too short unless split with a second shot

            # Strict Forward-Only Chronological Corridor (0% -> 100% physical process progression)
            p_sc = sc.get("start_time", 0.0) / max(total_video_dur, 1.0)
            dist = abs(p_win - p_sc)
            min_p = last_selected_progress
            max_p = min(1.0, max(min_p + 0.14, p_win + 0.15))

            if enforce_strict_chrono and p_sc < (min_p - 0.005):
                # Hard deterrent against jumping backward in the physical restoration/manufacturing process
                chrono_bonus = 0.04
            elif enforce_strict_chrono and p_sc > max_p:
                # Hard deterrent against jumping prematurely to mid/late stages (e.g. laser engraving at 0:03)
                chrono_bonus = 0.06
            else:
                # Reward scenes tightly aligned with current chronological phase [p_win]
                corridor_bonus = max(0.0, 1.0 - dist * 2.5)
                if p_win < 0.15 and 0.03 <= p_sc <= 0.20:
                    chrono_bonus = 1.25 + 0.20 * corridor_bonus
                elif p_win > 0.82 and p_sc >= 0.78:
                    chrono_bonus = 1.30 + 0.20 * corridor_bonus  # Big Reveal alignment
                else:
                    chrono_bonus = 1.05 + 0.30 * corridor_bonus

            # YouTube Most Replayed Heatmap + Vision AI Satisfaction Score
            heatmap_boost = _calc_heatmap_boost(sc)
            satisfaction_boost = _calc_visual_satisfaction_boost(sc)

            score = (
                relevance
                * recency_penalty
                * dur_fit
                * chrono_bonus
                * heatmap_boost
                * satisfaction_boost
            )
            scored_scenes.append((score, sc))

        scored_scenes.sort(key=lambda x: x[0], reverse=True)
        if tagged is not None:
            scored_scenes = [(10.0, tagged)] + [p for p in scored_scenes if p[1]["id"] != tagged["id"]]
        best_scene = scored_scenes[0][1]
        recent_scene_ids.append(best_scene["id"])
        global_used_ids.add(best_scene["id"])
        best_p_sc = best_scene.get("start_time", 0.0) / max(total_video_dur, 1.0)
        if best_p_sc > last_selected_progress:
            # Advance monotonic progress (capped gently to p_win + 0.18 so one outlier doesn't skip the whole video)
            last_selected_progress = min(best_p_sc, p_win + 0.18)

        # Usable range within best_scene that is guaranteed to have NO internal cuts
        safe_scene_start, safe_scene_end, safe_available_dur, _ = _get_scene_usable_range(
            best_scene, target_duration
        )

        # Metode A: Center-Weighted Slice Extraction + Crisp Micro Speed-Up (1.06x when headroom allows)
        if safe_available_dur >= target_duration:
            snappy_speed = 1.06 if safe_available_dur >= round(target_duration * 1.06, 3) else 1.0
            source_slice_dur = min(safe_available_dur, round(target_duration * snappy_speed, 3))
            slack = max(0.0, safe_available_dur - source_slice_dur)
            center_offset = round(slack / 2.0, 3)
            clip_start = round(safe_scene_start + center_offset, 3)
            clip_end = min(round(clip_start + source_slice_dur, 3), safe_scene_end)
            clips.append({
                "id": str(uuid.uuid4()),
                "segment_id": win["primary_segment_id"],
                "scene_id": best_scene["id"],
                "source_video_id": best_scene["source_video_id"],
                "timeline_start": snap_to_frame(start_sec),
                "timeline_end": snap_to_frame(end_sec),
                "clip_start": snap_to_frame(clip_start),
                "clip_end": snap_to_frame(clip_end),
                "speed": snappy_speed,
                "text": win["text"],
                "thumbnail_url": best_scene.get("thumbnail_url"),
                "_safe_end": safe_scene_end,
            })
        else:
            # Scene shorter than the slot: keep playing the source into the next scene(s)
            # instead of stretching a short slice into slow-mo.
            run_end = _run_end(best_scene, scenes, safe_scene_start, target_duration)
            clip_end = min(round(safe_scene_start + target_duration, 3), run_end)
            clips.append({
                "id": str(uuid.uuid4()),
                "segment_id": win["primary_segment_id"],
                "scene_id": best_scene["id"],
                "source_video_id": best_scene["source_video_id"],
                "timeline_start": snap_to_frame(start_sec),
                "timeline_end": snap_to_frame(end_sec),
                "clip_start": snap_to_frame(safe_scene_start),
                "clip_end": snap_to_frame(clip_end),
                "speed": min(1.0, round((clip_end - safe_scene_start) / target_duration, 3)),
                "text": win["text"],
                "thumbnail_url": best_scene.get("thumbnail_url"),
                "_safe_end": run_end,
            })

    # Layer 3: Post-match verification guard ensuring no timeline clip < 2.0s
    healed_clips = verify_and_heal_timeline_clips(clips, min_clip_dur=2.0, scenes=scenes)
    return healed_clips
