import uuid
import numpy as np
from typing import List, Dict, Any, Optional
from app.services.ai_adapters.base import BaseLLMAdapter


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


async def match_scenes_to_segments(
    adapter: BaseLLMAdapter,
    segments: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    default_bg_fill: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Match each narration sentence segment to the most semantically relevant scene."""
    if not scenes or not segments:
        return []

    # Pre-generate embeddings for segments
    segment_embeddings = []
    for seg in segments:
        emb = await adapter.generate_embedding(seg["text"])
        segment_embeddings.append(emb)

    clips: List[Dict[str, Any]] = []
    used_scene_ids = set()

    for i, seg in enumerate(segments):
        seg_emb = segment_embeddings[i]
        start_sec = seg["start_ms"] / 1000.0
        end_sec = seg["end_ms"] / 1000.0
        target_duration = max(round(end_sec - start_sec, 2), 1.0)

        # Score all scenes by cosine similarity
        scored_scenes = []
        for sc in scenes:
            sc_emb = sc.get("embedding")
            sim = 0.0
            if sc_emb is not None and seg_emb is not None:
                sim = cosine_similarity(seg_emb, sc_emb)

            # Slight bonus for unused scenes to maintain visual variety
            penalty = 0.85 if sc["id"] in used_scene_ids else 1.0
            score = sim * penalty
            scored_scenes.append((score, sc))

        scored_scenes.sort(key=lambda x: x[0], reverse=True)
        best_scene = scored_scenes[0][1]
        used_scene_ids.add(best_scene["id"])

        scene_dur = best_scene.get("duration", 4.0)
        scene_start = best_scene.get("start_time", 0.0)
        scene_end = best_scene.get("end_time", scene_start + scene_dur)

        # Metode A: Center-Weighted Slice Extraction (Pusatkan potongan untuk hindari bleed awal & akhir)
        if scene_dur >= target_duration:
            slack = max(0.0, scene_dur - target_duration)
            center_offset = round(slack / 2.0, 3)
            clip_start = round(scene_start + center_offset, 3)
            clip_end = min(round(clip_start + target_duration, 3), round(scene_end, 3))
            clips.append({
                "id": str(uuid.uuid4()),
                "segment_id": seg["id"],
                "scene_id": best_scene["id"],
                "source_video_id": best_scene["source_video_id"],
                "timeline_start": round(start_sec, 2),
                "timeline_end": round(end_sec, 2),
                "clip_start": round(clip_start, 3),
                "clip_end": round(clip_end, 3),
                "speed": 1.0,
                "text": seg["text"],
                "thumbnail_url": best_scene.get("thumbnail_url"),
                "background_fill_override": None,
            })
        else:
            # Scene lebih pendek dari kebutuhan segmen narasi:
            time_remaining = round(target_duration - scene_dur, 2)

            # Jika selisih kecil (<= 0.8s), terapkan smart speed stretch (0.85x - 0.98x)
            # agar TIDAK membuat potongan mikro 0.3s yang mengganggu mata penonton!
            if time_remaining <= 0.8:
                speed_factor = round(scene_dur / target_duration, 2)
                clips.append({
                    "id": str(uuid.uuid4()),
                    "segment_id": seg["id"],
                    "scene_id": best_scene["id"],
                    "source_video_id": best_scene["source_video_id"],
                    "timeline_start": round(start_sec, 2),
                    "timeline_end": round(end_sec, 2),
                    "clip_start": round(scene_start, 3),
                    "clip_end": round(scene_end, 3),
                    "speed": max(0.8, min(1.0, speed_factor)),
                    "text": seg["text"],
                    "thumbnail_url": best_scene.get("thumbnail_url"),
                    "background_fill_override": None,
                })
            else:
                # Jika selisih besar (> 0.8s), tambahkan scene utama lalu isi sisa dengan scene ke-2 (juga center-weighted)
                cur_time_cursor = start_sec
                clips.append({
                    "id": str(uuid.uuid4()),
                    "segment_id": seg["id"],
                    "scene_id": best_scene["id"],
                    "source_video_id": best_scene["source_video_id"],
                    "timeline_start": round(cur_time_cursor, 2),
                    "timeline_end": round(cur_time_cursor + scene_dur, 2),
                    "clip_start": round(scene_start, 3),
                    "clip_end": round(scene_end, 3),
                    "speed": 1.0,
                    "text": seg["text"],
                    "thumbnail_url": best_scene.get("thumbnail_url"),
                    "background_fill_override": None,
                })
                cur_time_cursor += scene_dur

                if len(scored_scenes) > 1:
                    second_scene = scored_scenes[1][1]
                    s2_dur = second_scene.get("duration", 4.0)
                    s2_start = second_scene.get("start_time", 0.0)
                    s2_end = second_scene.get("end_time", s2_start + s2_dur)
                    s2_slack = max(0.0, s2_dur - time_remaining)
                    s2_offset = round(s2_slack / 2.0, 3)
                    c2_start = round(s2_start + s2_offset, 3)
                    c2_end = min(round(c2_start + time_remaining, 3), round(s2_end, 3))
                    clips.append({
                        "id": str(uuid.uuid4()),
                        "segment_id": seg["id"],
                        "scene_id": second_scene["id"],
                        "source_video_id": second_scene["source_video_id"],
                        "timeline_start": round(cur_time_cursor, 2),
                        "timeline_end": round(end_sec, 2),
                        "clip_start": round(c2_start, 3),
                        "clip_end": round(c2_end, 3),
                        "speed": 1.0,
                        "text": seg["text"],
                        "thumbnail_url": second_scene.get("thumbnail_url"),
                        "background_fill_override": None,
                    })

    return clips
