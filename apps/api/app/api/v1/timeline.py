from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.core.storage import storage
from app.models.project import Project, Scene
from app.models.narration import Narration, AudioTrack
from app.models.timeline import Timeline
from app.schemas.timeline import TimelineUpdateRequest, TimelineResponse
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.matching import match_scenes_to_segments

router = APIRouter(prefix="/projects/{project_id}/timeline", tags=["timeline"])


@router.post("/auto-match", response_model=TimelineResponse)
async def auto_match_timeline(project_id: str, db: AsyncSession = Depends(get_db)):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # Fetch narration
    n_res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = n_res.scalars().first()
    if not narration or not narration.segments:
        raise HTTPException(status_code=400, detail="Belum ada segmen narasi yang dibuat")

    # Fetch all candidate scenes from project media pool
    s_res = await db.execute(
        select(Scene)
        .where(Scene.project_id == project_id)
        .order_by(Scene.start_time.asc())
    )
    scenes = s_res.scalars().all()
    if not scenes:
        raise HTTPException(status_code=400, detail="Belum ada scene terdeteksi di Media Pool")

    scenes_data = [
        {
            "id": s.id,
            "source_video_id": s.source_video_id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "duration": s.duration,
            "thumbnail_url": storage.to_relative_url(s.thumbnail_path),
            "description": s.description,
            "tags": s.tags,
            "embedding": s.embedding,
        }
        for s in scenes
    ]

    adapter = await get_active_llm_adapter(db)
    clips = await match_scenes_to_segments(adapter, narration.segments, scenes_data)

    # Calculate total duration
    total_dur = max([c["timeline_end"] for c in clips], default=0.0)

    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if not timeline:
        timeline = Timeline(project_id=project_id, clips=clips, total_duration=total_dur)
        db.add(timeline)
    else:
        timeline.clips = clips
        timeline.total_duration = total_dur

    await db.commit()
    await db.refresh(timeline)

    # Attach thumbnails to response
    scenes_map = {s.id: storage.to_relative_url(s.thumbnail_path) for s in scenes}
    res_clips = []
    for c in timeline.clips:
        c_copy = dict(c)
        c_copy["thumbnail_url"] = scenes_map.get(c.get("scene_id"))
        res_clips.append(c_copy)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=res_clips,
        total_duration=timeline.total_duration,
    )


@router.get("", response_model=TimelineResponse)
async def get_timeline(project_id: str, db: AsyncSession = Depends(get_db)):
    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline belum dibuat")

    s_res = await db.execute(select(Scene).where(Scene.project_id == project_id))
    scenes_map = {s.id: storage.to_relative_url(s.thumbnail_path) for s in s_res.scalars().all()}

    res_clips = []
    for c in timeline.clips or []:
        c_copy = dict(c)
        c_copy["thumbnail_url"] = scenes_map.get(c.get("scene_id"))
        res_clips.append(c_copy)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=res_clips,
        total_duration=timeline.total_duration,
    )


@router.put("", response_model=TimelineResponse)
async def update_timeline(
    project_id: str,
    payload: TimelineUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if not timeline:
        timeline = Timeline(project_id=project_id)
        db.add(timeline)

    raw_clips = [c.model_dump() for c in payload.clips]
    timeline.clips = raw_clips
    timeline.total_duration = payload.total_duration or max([c["timeline_end"] for c in raw_clips], default=0.0)

    await db.commit()
    await db.refresh(timeline)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=timeline.clips,
        total_duration=timeline.total_duration,
    )
