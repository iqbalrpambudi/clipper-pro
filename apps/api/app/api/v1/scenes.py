from pydantic import BaseModel
import asyncio
import logging
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.core.storage import storage
from app.models.project import Scene, SourceVideo
from app.models.timeline import Timeline
from app.schemas.project import SceneResponse
from app.services.ai_adapters.factory import get_active_vision_adapter
from app.services.vision_tagger import analyze_scene
from app.workers.tasks import detect_scenes_job
from app.core.events import publish_project_event

router = APIRouter(prefix="/projects/{project_id}/scenes", tags=["scenes"])



@router.get("", response_model=List[SceneResponse])
async def list_project_scenes(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Scene)
        .where(Scene.project_id == project_id)
        .order_by(Scene.start_time.asc())
    )
    scenes = res.scalars().all()
    v_res = await db.execute(
        select(SourceVideo).where(SourceVideo.project_id == project_id)
    )
    video_url_map = {v.id: storage.to_relative_url(v.file_path) for v in v_res.scalars().all()}

    return [
        SceneResponse(
            id=s.id,
            project_id=s.project_id,
            source_video_id=s.source_video_id,
            scene_index=s.scene_index,
            start_time=s.start_time,
            end_time=s.end_time,
            duration=s.duration,
            thumbnail_url=storage.to_relative_url(s.thumbnail_path),
            video_url=video_url_map.get(s.source_video_id),
            description=s.description,
            tags=s.tags or [],
            status=s.status,
            created_at=s.created_at,
        )
        for s in scenes
    ]


@router.post("/re-detect/{video_id}")
async def redetect_scenes(
    project_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(SourceVideo, video_id)
    if not video or video.project_id != project_id:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")

    asyncio.create_task(detect_scenes_job({}, video.id))
    return {"message": "Scene detection dijadwalkan ulang"}


class RetagRequest(BaseModel):
    mode: str = "quick"  # "quick" (incremental) or "force" (all)
    batch_size: int = 5


@router.post("/retag")
async def retag_project_scenes(
    project_id: str,
    payload: RetagRequest = RetagRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Re-analyze scenes in the project with the active Vision Model in batch mode.
    - quick: only analyzes untagged / fallback scenes (fast & saves quota).
    - force: re-analyzes all scenes from scratch.
    """
    res = await db.execute(
        select(Scene)
        .where(Scene.project_id == project_id)
        .order_by(Scene.start_time.asc())
    )
    all_scenes = res.scalars().all()
    if not all_scenes:
        raise HTTPException(status_code=400, detail="Belum ada scene di project ini untuk di-tagging ulang")

    adapter = await get_active_vision_adapter(db)
    vision_model_name = getattr(adapter, "vision_model", "AI Vision")

    if payload.mode == "quick":
        scenes_to_process = [
            s for s in all_scenes
            if not s.description
            or s.description == "Cuplikan video aksi/aktivitas"
            or s.tags == ["video", "scene", "aktivitas"]
        ]
        if not scenes_to_process:
            return {
                "message": "Semua scene sudah ter-tagging dengan AI Vision! Gunakan opsi Force Tagging jika ingin menganalisis ulang semuanya.",
                "count": 0,
                "total": len(all_scenes),
                "model": vision_model_name,
                "mode": "quick",
            }
    else:
        scenes_to_process = all_scenes

    batch_size = max(2, min(payload.batch_size, 8))
    processed_count = 0

    # Process in batches of 5-8 thumbnails per request
    for i in range(0, len(scenes_to_process), batch_size):
        batch = scenes_to_process[i:i + batch_size]
        batch_items = []
        for s in batch:
            p = Path(s.thumbnail_path) if s.thumbnail_path else None
            if not p or not p.exists():
                p = storage.to_absolute_path(s.thumbnail_path)
            if p and p.exists():
                batch_items.append((s.id, str(p)))

        if not batch_items:
            continue

        if hasattr(adapter, "analyze_vision_batch"):
            batch_results = await adapter.analyze_vision_batch(batch_items)
            results_by_id = {r["scene_id"]: r for r in batch_results}
            for s in batch:
                res_item = results_by_id.get(s.id)
                if res_item:
                    s.description = res_item["description"]
                    s.tags = res_item["tags"]
                    text_emb = f"{s.description}. Kata kunci: {", ".join(s.tags)}"
                    s.embedding = await adapter.generate_embedding(text_emb)
                    processed_count += 1
        else:
            for s_id, p_str in batch_items:
                s = next((sc for sc in batch if sc.id == s_id), None)
                if s:
                    desc, tags, emb = await analyze_scene(adapter, [p_str])
                    s.description = desc
                    s.tags = tags
                    s.embedding = emb
                    processed_count += 1

        await db.commit()

        # Publish incremental batch progress
        pct = min(98, int(((i + len(batch)) / max(1, len(scenes_to_process))) * 100))
        await publish_project_event(
            project_id,
            task_type="scene_retag",
            status="progress",
            progress=pct,
            stage="batch_tagging",
            message=f"Menganalisis batch scene {i + 1}-{min(i + batch_size, len(scenes_to_process))} dari {len(scenes_to_process)} dengan {vision_model_name}...",
            data={"processed": processed_count, "total": len(scenes_to_process)},
        )

        # Pacing between batches to comfortably comply with rate limits
        if i + batch_size < len(scenes_to_process):
            await asyncio.sleep(1.8)

    # Synchronize timeline clips text
    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if timeline and timeline.clips:
        scenes_desc_map = {s.id: s.description for s in all_scenes}
        updated_clips = []
        for c in timeline.clips:
            c_copy = dict(c)
            sc_desc = scenes_desc_map.get(c_copy.get("scene_id"))
            if sc_desc and (not c_copy.get("text") or "Cuplikan video" in c_copy.get("text", "")):
                c_copy["text"] = sc_desc
            updated_clips.append(c_copy)
        timeline.clips = updated_clips
        await db.commit()

    await publish_project_event(
        project_id,
        task_type="scene_retag",
        status="success",
        progress=100,
        stage="completed",
        message=f"Berhasil tagging {processed_count} scene dengan model {vision_model_name}!",
        data={"count": processed_count, "total": len(all_scenes)},
    )

    return {
        "message": f"Berhasil menganalisis dan tagging {processed_count} scene ({payload.mode} mode) dengan model {vision_model_name}",
        "count": processed_count,
        "total": len(all_scenes),
        "model": vision_model_name,
        "mode": payload.mode,
    }

