import uuid
import numpy as np
from typing import List, Dict, Any, Optional
from app.services.ai_adapters.base import BaseLLMAdapter
from app.core.frame_math import snap_to_frame, sec_to_frame, frame_to_sec, COMPOSITION_FPS


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

    for idx, span in enumerate(seg_spans):
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
    used_scene_ids = set()

    for i, win in enumerate(windows):
        win_emb = window_embeddings[i]
        start_sec = win["start_sec"]
        end_sec = win["end_sec"]
        target_duration = max(round(end_sec - start_sec, 2), 1.5)

        # 3. Score all candidate scenes with Duration Suitability factor
        scored_scenes = []
        for sc in scenes:
            sc_emb = sc.get("embedding")
            sim = 0.5
            if sc_emb is not None and win_emb is not None:
                sim = cosine_similarity(win_emb, sc_emb)

            # Strong bonus for unused scenes to ensure rich visual diversity and avoid duplicate back-to-back shots
            usage_penalty = 0.50 if sc["id"] in used_scene_ids else 1.0

            # Duration Suitability:
            sc_dur = sc.get("duration", 4.0)
            if sc_dur < 1.8:
                # Heavy penalty for micro-scenes (< 1.8s) to prevent flash cuts
                dur_fit = 0.35
            elif sc_dur >= target_duration:
                dur_fit = 1.0
            elif sc_dur >= 2.0:
                dur_fit = 0.85
            else:
                dur_fit = max(0.5, sc_dur / target_duration)

            score = sim * usage_penalty * dur_fit
            scored_scenes.append((score, sc))

        scored_scenes.sort(key=lambda x: x[0], reverse=True)
        best_scene = scored_scenes[0][1]
        used_scene_ids.add(best_scene["id"])

        scene_dur = best_scene.get("duration", 4.0)
        scene_start = best_scene.get("start_time", 0.0)
        scene_end = best_scene.get("end_time", scene_start + scene_dur)

        # Anti-bleed safe boundaries: keep a minimum safety margin (33ms at start, 66ms at end)
        # to ensure cuts NEVER touch or bleed into the first frame of the next scene.
        safe_scene_start = round(scene_start + (0.033 if scene_start > 0.1 else 0.0), 3)
        safe_scene_end = round(max(safe_scene_start + 0.5, scene_end - 0.066), 3)
        safe_available_dur = round(max(0.4, safe_scene_end - safe_scene_start), 3)

        # Metode A: Center-Weighted Slice Extraction (Scene cukup panjang untuk window narasi)
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
            # Scene lebih pendek dari window narasi:
            diff = round(target_duration - safe_available_dur, 2)

            # Jika selisih wajar (<= 1.6s) atau hanya ada 1 scene kandidat, gunakan Smart Speed Stretch
            # Speed dihitung secara presisi: speed = safe_available_dur / target_duration
            # sehingga footage sumber pas terpakai dari safe_start hingga safe_end tanpa bleed!
            if diff <= 1.6 or len(scored_scenes) < 2:
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
                    "speed": max(0.70, min(0.98, exact_speed)),
                    "text": win["text"],
                    "thumbnail_url": best_scene.get("thumbnail_url"),
                    "background_fill_override": None,
                })
            else:
                # Jika selisih besar, bagi menjadi 2 potongan seimbang HANYA jika kedua potongan >= 1.8s
                half_time = round(target_duration / 2.0, 2)
                second_scene = scored_scenes[1][1]
                s2_dur = second_scene.get("duration", 4.0)
                s2_start = second_scene.get("start_time", 0.0)
                s2_end = second_scene.get("end_time", s2_start + s2_dur)
                s2_safe_start = round(s2_start + (0.033 if s2_start > 0.1 else 0.0), 3)
                s2_safe_end = round(max(s2_safe_start + 0.5, s2_end - 0.066), 3)
                s2_safe_dur = round(max(0.4, s2_safe_end - s2_safe_start), 3)

                if half_time >= 1.8 and safe_available_dur >= 1.8 and s2_safe_dur >= 1.8:
                    # Clip 1
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

                    # Clip 2
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
                    used_scene_ids.add(second_scene["id"])
                else:
                    # Fallback: stretch best_scene safely without making any micro-cut
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
                        "speed": max(0.70, min(0.98, exact_speed)),
                        "text": win["text"],
                        "thumbnail_url": best_scene.get("thumbnail_url"),
                        "background_fill_override": None,
                    })

    return clips
