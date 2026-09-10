import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.core.storage import storage
from app.models.project import Scene, SourceVideo
from app.schemas.project import SceneResponse
from app.workers.tasks import detect_scenes_job

router = APIRouter(prefix="/projects/{project_id}/scenes", tags=["scenes"])


@router.get("", response_model=List[SceneResponse])
async def list_project_scenes(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Scene)
        .where(Scene.project_id == project_id)
        .order_by(Scene.start_time.asc())
    )
    scenes = res.scalars().all()
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
