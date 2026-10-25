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

        # If single sentence span is very long (> max_dur), flush current and split
        if dur > max_dur:
            if curr_spans:
                flush_end = snap_to_frame(curr_spans[-1]["end_sec"])
                windows.append({
                    "start_sec": snap_to_frame(w_start),
                    "end_sec": flush_end,
                    "duration": round(flush_end - snap_to_frame(w_start), 4),
                    "text": " ".join(s["text"] for s in curr_spans),
                    "primary_segment_id": curr_spans[0]["seg_id"],
                })
                w_start = flush_end
                curr_spans = []

            # Divide long span into balanced chunks between min_dur and max_dur
            num_chunks = max(2, int(round(dur / 3.2)))
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
                })
                c_start = c_end
            w_start = span["end_sec"]
            continue

        curr_spans.append(span)
        accum_dur = round(span["end_sec"] - w_start, 4)

        if accum_dur >= min_dur:
            windows.append({
                "start_sec": snap_to_frame(w_start),
                "end_sec": snap_to_frame(span["end_sec"]),
                "duration": round(span["end_sec"] - w_start, 4),
                "text": " ".join(s["text"] for s in curr_spans),
                "primary_segment_id": curr_spans[0]["seg_id"],
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


def verify_and_heal_timeline_clips(
    clips: List[Dict[str, Any]],
    min_clip_dur: float = 1.8,
) -> List[Dict[str, Any]]:
    """Safety guard (Layer 3): Guarantees timeline never has flash cuts (< 1.8s).

    If any clip on timeline is shorter than min_clip_dur, it is safely merged
    into its neighbor, and strict timestamp continuity is preserved.
    """
    if not clips:
        return []

    if len(clips) == 1:
        c = clips[0]
        c["timeline_start"] = 0.0
        c["timeline_end"] = snap_to_frame(c["timeline_end"])
        return [c]

    # Pass 1: Merge any micro-clips shorter than min_clip_dur into neighbor
    merged: List[Dict[str, Any]] = []
    for c in clips:
        c_dur = round(float(c.get("timeline_end", 0.0)) - float(c.get("timeline_start", 0.0)), 3)
        if c_dur < min_clip_dur and merged:
            # Merge into preceding clip
            prev = merged[-1]
            prev["timeline_end"] = snap_to_frame(c.get("timeline_end", prev["timeline_end"]))
            if c.get("text") and c["text"] not in prev.get("text", ""):
                prev["text"] = f"{prev.get('text', '')} {c['text']}".strip()
            # If preceding clip was using speed stretch, adjust slightly
            new_target = round(prev["timeline_end"] - prev["timeline_start"], 3)
            src_dur = round(float(prev.get("clip_end", 0.0)) - float(prev.get("clip_start", 0.0)), 3)
            if src_dur > 0 and new_target > 0:
                prev["speed"] = max(0.68, min(1.0, round(src_dur / new_target, 3)))
        else:
            merged.append(dict(c))

    # If first clip ended up < min_clip_dur and there's a second clip, merge with second
    if len(merged) > 1:
        first_dur = round(float(merged[0]["timeline_end"]) - float(merged[0]["timeline_start"]), 3)
        if first_dur < min_clip_dur:
            second = merged[1]
            second["timeline_start"] = merged[0]["timeline_start"]
            if merged[0].get("text") and merged[0]["text"] not in second.get("text", ""):
                second["text"] = f"{merged[0]['text']} {second.get('text', '')}".strip()
            merged.pop(0)

    # Pass 2: Ensure strict mathematical continuity across timeline
    if merged:
        merged[0]["timeline_start"] = 0.0
        for k in range(len(merged) - 1):
            boundary = snap_to_frame(merged[k]["timeline_end"])
            merged[k]["timeline_end"] = boundary
            merged[k + 1]["timeline_start"] = boundary

    return merged


async def match_scenes_to_segments(
    adapter: BaseLLMAdapter,
    segments: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    default_bg_fill: Optional[Dict[str, Any]] = None,
    total_audio_duration_sec: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Match narration segments to scenes with anti-flash visual pacing and anti-copyright limits."""
    if not scenes or not segments:
        return []

    # 1. Build continuous, balanced visual shot windows (Anti-Flash Scene & Pacing Smoothing)
    windows = build_visual_shot_windows(
        segments,
        min_dur=2.0,
        max_dur=4.5,
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

    total_video_dur = max((sc.get("end_time", 0.0) for sc in scenes), default=1.0)
    total_audio_dur = total_audio_duration_sec or (windows[-1]["end_sec"] if windows else 1.0)

    for i, win in enumerate(windows):
        win_emb = window_embeddings[i]
        start_sec = win["start_sec"]
        end_sec = win["end_sec"]
        target_duration = max(round(end_sec - start_sec, 2), 1.8)
        p_win = (start_sec + end_sec) / (2.0 * max(total_audio_dur, 1.0))

        # 3. Score all candidate scenes with Hybrid Search + Recency + Chrono Flow + Duration Fit
        scored_scenes = []
        for sc in scenes:
            sc_emb = sc.get("embedding")
            sim = 0.5
            if sc_emb is not None and win_emb is not None:
                sim = cosine_similarity(win_emb, sc_emb)

            # Lexical keyword match boost (hybrid search)
            sc_text = f"{sc.get('description', '')} {' '.join(sc.get('tags') or [])} {sc.get('transcript', '')}"
            lex = _calc_lexical_overlap(win["text"], sc_text)
            relevance = 0.65 * sim + 0.35 * min(1.0, lex * 2.0)

            # Recency penalty: strong deterrent against repeating the same shot back-to-back
            if recent_scene_ids and sc["id"] == recent_scene_ids[-1]:
                recency_penalty = 0.12  # Strict: never duplicate immediately consecutive scene
            elif len(recent_scene_ids) >= 2 and sc["id"] == recent_scene_ids[-2]:
                recency_penalty = 0.45
            elif len(recent_scene_ids) >= 3 and sc["id"] == recent_scene_ids[-3]:
                recency_penalty = 0.75
            elif sc["id"] in global_used_ids:
                recency_penalty = 0.90  # Mild penalty to prefer fresh unshown footage
            else:
                recency_penalty = 1.0

            # Anti-Flash & Anti-Micro-Cut Duration Fit (Layer 2)
            # Evaluate against single contiguous usable shot duration (NOT whole merged scene)
            _, _, usable_dur, is_montage = _get_scene_usable_range(sc, target_duration)
            ratio = usable_dur / target_duration

            if is_montage or usable_dur < 1.5:
                dur_fit = 0.05  # Severe penalty: montage / micro-cuts almost never selected
            elif usable_dur < 1.8:
                dur_fit = 0.20  # Strong penalty for marginal length
            elif usable_dur >= target_duration + 0.5:
                dur_fit = 1.15  # Generous headroom: centers smoothly without touching boundaries
            elif usable_dur >= target_duration:
                dur_fit = 1.05  # Perfect fit
            elif ratio >= 0.75:
                dur_fit = 0.92  # Gentle smooth stretch (speed 0.75x - 0.95x)
            elif ratio >= 0.60:
                dur_fit = 0.60  # Moderate stretch
            else:
                dur_fit = 0.25  # Severe stretch required

            # Narrative Chronological Arc Affinity: gentle alignment with story progress
            p_sc = sc.get("start_time", 0.0) / max(total_video_dur, 1.0)
            dist = abs(p_win - p_sc)
            if p_win < 0.15 and p_sc < 0.20:
                chrono_bonus = 1.15  # Hook / Opening alignment
            elif p_win > 0.85 and p_sc > 0.80:
                chrono_bonus = 1.15  # Climax / Ending alignment
            else:
                chrono_bonus = 1.0 + 0.10 * max(0.0, 1.0 - dist * 1.5)

            score = relevance * recency_penalty * dur_fit * chrono_bonus
            scored_scenes.append((score, sc))

        scored_scenes.sort(key=lambda x: x[0], reverse=True)
        best_scene = scored_scenes[0][1]
        recent_scene_ids.append(best_scene["id"])
        global_used_ids.add(best_scene["id"])

        # Usable range within best_scene that is guaranteed to have NO internal cuts
        safe_scene_start, safe_scene_end, safe_available_dur, _ = _get_scene_usable_range(
            best_scene, target_duration
        )

        # Metode A: Center-Weighted Slice Extraction (Safe shot cukup panjang untuk window narasi)
        if safe_available_dur >= target_duration:
            slack = max(0.0, safe_available_dur - target_duration)
            center_offset = round(slack / 2.0, 3)
            clip_start = round(safe_scene_start + center_offset, 3)
            clip_end = min(round(clip_start + target_duration, 3), safe_scene_end)
            clips.append({
                "id": str(uuid.uuid4()),
                "segment_id": win["primary_segment_id"],
                "scene_id": best_scene["id"],
                "source_video_id": best_scene["source_video_id"],
                "timeline_start": snap_to_frame(start_sec),
                "timeline_end": snap_to_frame(end_sec),
                "clip_start": snap_to_frame(clip_start),
                "clip_end": snap_to_frame(clip_end),
                "speed": 1.0,
                "text": win["text"],
                "thumbnail_url": best_scene.get("thumbnail_url"),
                "background_fill_override": None,
            })
        else:
            # Safe shot lebih pendek dari window narasi:
            # Hanya bagi menjadi 2 scene jika window narasi panjang (>= 4.4s) DAN kedua potongan >= 2.0s.
            should_split = (
                target_duration >= 4.4
                and len(scored_scenes) >= 2
                and safe_available_dur >= 2.0
            )

            if should_split:
                half_time = round(target_duration / 2.0, 2)
                second_scene = scored_scenes[1][1]
                s2_safe_start, s2_safe_end, s2_safe_dur, _ = _get_scene_usable_range(
                    second_scene, half_time
                )

                if s2_safe_dur >= 2.0:
                    # Clip 1 (strictly inside best_scene's safe shot)
                    s1_slack = max(0.0, safe_available_dur - half_time)
                    s1_offset = round(s1_slack / 2.0, 3)
                    c1_start = round(safe_scene_start + s1_offset, 3)
                    c1_end = min(round(c1_start + half_time, 3), safe_scene_end)
                    mid_timeline = snap_to_frame(start_sec + half_time)

                    clips.append({
                        "id": str(uuid.uuid4()),
                        "segment_id": win["primary_segment_id"],
                        "scene_id": best_scene["id"],
                        "source_video_id": best_scene["source_video_id"],
                        "timeline_start": snap_to_frame(start_sec),
                        "timeline_end": mid_timeline,
                        "clip_start": snap_to_frame(c1_start),
                        "clip_end": snap_to_frame(c1_end),
                        "speed": 1.0,
                        "text": win["text"],
                        "thumbnail_url": best_scene.get("thumbnail_url"),
                        "background_fill_override": None,
                    })

                    # Clip 2 (strictly inside second_scene's safe shot)
                    s2_dur_needed = round(end_sec - mid_timeline, 2)
                    s2_slack = max(0.0, s2_safe_dur - s2_dur_needed)
                    s2_offset = round(s2_slack / 2.0, 3)
                    c2_start = round(s2_safe_start + s2_offset, 3)
                    c2_end = min(round(c2_start + s2_dur_needed, 3), s2_safe_end)

                    clips.append({
                        "id": str(uuid.uuid4()),
                        "segment_id": win["primary_segment_id"],
                        "scene_id": second_scene["id"],
                        "source_video_id": second_scene["source_video_id"],
                        "timeline_start": mid_timeline,
                        "timeline_end": snap_to_frame(end_sec),
                        "clip_start": snap_to_frame(c2_start),
                        "clip_end": snap_to_frame(c2_end),
                        "speed": 1.0,
                        "text": win["text"],
                        "thumbnail_url": second_scene.get("thumbnail_url"),
                        "background_fill_override": None,
                    })
                    used_scene_ids = global_used_ids
                    used_scene_ids.add(second_scene["id"])
                    continue

            # Default: Single continuous shot dengan Smart Speed Stretch
            # Strictly stays within [safe_scene_start, safe_scene_end] - NEVER crosses internal cut!
            exact_speed = round(safe_available_dur / target_duration, 3)
            clips.append({
                "id": str(uuid.uuid4()),
                "segment_id": win["primary_segment_id"],
                "scene_id": best_scene["id"],
                "source_video_id": best_scene["source_video_id"],
                "timeline_start": snap_to_frame(start_sec),
                "timeline_end": snap_to_frame(end_sec),
                "clip_start": snap_to_frame(safe_scene_start),
                "clip_end": snap_to_frame(safe_scene_end),
                "speed": max(0.68, min(0.98, exact_speed)),
                "text": win["text"],
                "thumbnail_url": best_scene.get("thumbnail_url"),
                "background_fill_override": None,
            })

    # Layer 3: Post-match verification guard ensuring no timeline clip < 1.8s
    healed_clips = verify_and_heal_timeline_clips(clips, min_clip_dur=1.8)
    return healed_clips
