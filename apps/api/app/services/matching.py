import uuid
import numpy as np
from typing import List, Dict, Any, Optional
from app.services.ai_adapters.base import BaseLLMAdapter


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    a = np.array(v1, dtype=np.float32)
    b = np.array(v2, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


async def match_scenes_to_segments(
    adapter: BaseLLMAdapter,
    segments: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    default_bg_fill: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Match each narration sentence segment to the most semantically relevant scene."""
    if not scenes:
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
            sim = cosine_similarity(seg_emb, sc_emb) if sc_emb else 0.0

            # Slight bonus for unused scenes to maintain visual variety
            penalty = 0.85 if sc["id"] in used_scene_ids else 1.0
            score = sim * penalty
            scored_scenes.append((score, sc))

        scored_scenes.sort(key=lambda x: x[0], reverse=True)
        best_scene = scored_scenes[0][1]
        used_scene_ids.add(best_scene["id"])

        scene_dur = best_scene.get("duration", 4.0)
        scene_start = best_scene.get("start_time", 0.0)

        # If scene is long enough, trim clip to match segment duration
        if scene_dur >= target_duration:
            clip_start = scene_start
            clip_end = scene_start + target_duration
            clips.append({
                "id": str(uuid.uuid4()),
                "segment_id": seg["id"],
                "scene_id": best_scene["id"],
                "source_video_id": best_scene["source_video_id"],
                "timeline_start": round(start_sec, 2),
                "timeline_end": round(end_sec, 2),
                "clip_start": round(clip_start, 2),
                "clip_end": round(clip_end, 2),
                "speed": 1.0,
                "text": seg["text"],
                "thumbnail_url": best_scene.get("thumbnail_url"),
                "background_fill_override": None,
            })
        else:
            # Scene is shorter than segment duration:
            # Chain next best scene if available
            time_remaining = target_duration
            cur_time_cursor = start_sec

            # Add primary clip
            clips.append({
                "id": str(uuid.uuid4()),
                "segment_id": seg["id"],
                "scene_id": best_scene["id"],
                "source_video_id": best_scene["source_video_id"],
                "timeline_start": round(cur_time_cursor, 2),
                "timeline_end": round(cur_time_cursor + scene_dur, 2),
                "clip_start": round(scene_start, 2),
                "clip_end": round(best_scene.get("end_time", scene_start + scene_dur), 2),
                "speed": 1.0,
                "text": seg["text"],
                "thumbnail_url": best_scene.get("thumbnail_url"),
                "background_fill_override": None,
            })
            time_remaining -= scene_dur
            cur_time_cursor += scene_dur

            # Fill remainder with 2nd best scene
            if len(scored_scenes) > 1 and time_remaining > 0.5:
                second_scene = scored_scenes[1][1]
                s2_start = second_scene.get("start_time", 0.0)
                clips.append({
                    "id": str(uuid.uuid4()),
                    "segment_id": seg["id"],
                    "scene_id": second_scene["id"],
                    "source_video_id": second_scene["source_video_id"],
                    "timeline_start": round(cur_time_cursor, 2),
                    "timeline_end": round(end_sec, 2),
                    "clip_start": round(s2_start, 2),
                    "clip_end": round(s2_start + time_remaining, 2),
                    "speed": 1.0,
                    "text": seg["text"],
                    "thumbnail_url": second_scene.get("thumbnail_url"),
                    "background_fill_override": None,
                })

    return clips
