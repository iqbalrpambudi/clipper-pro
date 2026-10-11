from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.core.storage import storage
from app.models.project import Project, Scene, SourceVideo
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

    # Fetch active audio track duration if available
    a_res = await db.execute(
        select(AudioTrack)
        .where(AudioTrack.project_id == project_id)
        .order_by(AudioTrack.created_at.desc())
    )
    audio_track = a_res.scalars().first()
    audio_dur = audio_track.duration if audio_track else None

    adapter = await get_active_llm_adapter(db)
    clips = await match_scenes_to_segments(
        adapter,
        narration.segments,
        scenes_data,
        total_audio_duration_sec=audio_dur,
    )

    # Calculate total duration
    total_dur = max([c["timeline_end"] for c in clips], default=0.0)

    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if not timeline:
        timeline = Timeline(
            project_id=project_id,
            clips=clips,
            total_duration=total_dur,
            has_audio=True,
            has_subtitles=True,
        )
        db.add(timeline)
    else:
        timeline.clips = clips
        timeline.total_duration = total_dur
        timeline.has_audio = True
        timeline.has_subtitles = True

    await db.commit()
    await db.refresh(timeline)

    # Attach thumbnails and video_url to response
    v_res = await db.execute(select(SourceVideo).where(SourceVideo.project_id == project_id))
    video_url_map = {v.id: storage.to_relative_url(v.file_path) for v in v_res.scalars().all()}
    scenes_map = {s.id: storage.to_relative_url(s.thumbnail_path) for s in scenes}
    scenes_video_map = {s.id: video_url_map.get(s.source_video_id) for s in scenes}
    res_clips = []
    for c in timeline.clips:
        c_copy = dict(c)
        c_copy["thumbnail_url"] = scenes_map.get(c.get("scene_id"))
        c_copy["video_url"] = scenes_video_map.get(c.get("scene_id")) or video_url_map.get(c.get("source_video_id"))
        res_clips.append(c_copy)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=res_clips,
        total_duration=timeline.total_duration,
        has_audio=getattr(timeline, "has_audio", True),
        has_subtitles=getattr(timeline, "has_subtitles", True),
    )


@router.get("", response_model=TimelineResponse)
async def get_timeline(project_id: str, db: AsyncSession = Depends(get_db)):
    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline belum dibuat")

    v_res = await db.execute(select(SourceVideo).where(SourceVideo.project_id == project_id))
    video_url_map = {v.id: storage.to_relative_url(v.file_path) for v in v_res.scalars().all()}
    s_res = await db.execute(select(Scene).where(Scene.project_id == project_id))
    all_scenes = s_res.scalars().all()
    scenes_map = {s.id: storage.to_relative_url(s.thumbnail_path) for s in all_scenes}
    scenes_video_map = {s.id: video_url_map.get(s.source_video_id) for s in all_scenes}

    res_clips = []
    for c in timeline.clips or []:
        c_copy = dict(c)
        c_copy["thumbnail_url"] = scenes_map.get(c.get("scene_id"))
        c_copy["video_url"] = scenes_video_map.get(c.get("scene_id")) or video_url_map.get(c.get("source_video_id"))
        res_clips.append(c_copy)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=res_clips,
        total_duration=timeline.total_duration,
        has_audio=getattr(timeline, "has_audio", True),
        has_subtitles=getattr(timeline, "has_subtitles", True),
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

    if payload.has_audio is not None:
        timeline.has_audio = payload.has_audio
    if payload.has_subtitles is not None:
        timeline.has_subtitles = payload.has_subtitles

    await db.commit()
    await db.refresh(timeline)

    v_res = await db.execute(select(SourceVideo).where(SourceVideo.project_id == project_id))
    video_url_map = {v.id: storage.to_relative_url(v.file_path) for v in v_res.scalars().all()}
    s_res = await db.execute(select(Scene).where(Scene.project_id == project_id))
    all_scenes = s_res.scalars().all()
    scenes_map = {s.id: storage.to_relative_url(s.thumbnail_path) for s in all_scenes}
    scenes_video_map = {s.id: video_url_map.get(s.source_video_id) for s in all_scenes}

    res_clips = []
    for c in timeline.clips or []:
        c_copy = dict(c)
        if not c_copy.get("thumbnail_url"):
            c_copy["thumbnail_url"] = scenes_map.get(c.get("scene_id"))
        if not c_copy.get("video_url"):
            c_copy["video_url"] = scenes_video_map.get(c.get("scene_id")) or video_url_map.get(c.get("source_video_id"))
        res_clips.append(c_copy)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=res_clips,
        total_duration=timeline.total_duration,
        has_audio=getattr(timeline, "has_audio", True),
        has_subtitles=getattr(timeline, "has_subtitles", True),
    )


@router.delete("", response_model=TimelineResponse)
async def clear_timeline(
    project_id: str,
    clear_audio: bool = True,
    clear_subtitles: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Clear/Reset the timeline tracks for a project."""
    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if not timeline:
        timeline = Timeline(project_id=project_id)
        db.add(timeline)

    timeline.clips = []
    timeline.total_duration = 0.0
    if clear_audio:
        timeline.has_audio = False
    if clear_subtitles:
        timeline.has_subtitles = False

    await db.commit()
    await db.refresh(timeline)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=[],
        total_duration=0.0,
        has_audio=timeline.has_audio,
        has_subtitles=timeline.has_subtitles,
    )


@router.post("/readd-narration", response_model=TimelineResponse)
async def readd_narration_to_timeline(
    project_id: str,
    readd_audio: bool = True,
    readd_subtitles: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Re-attach narration audio and/or subtitles back to the timeline."""
    t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = t_res.scalar_one_or_none()
    if not timeline:
        timeline = Timeline(project_id=project_id)
        db.add(timeline)

    if readd_audio:
        timeline.has_audio = True
    if readd_subtitles:
        timeline.has_subtitles = True

    # Recalculate duration
    clips_end = max([c.get("timeline_end", 0.0) for c in (timeline.clips or [])], default=0.0)
    audio_dur = 0.0
    if timeline.has_audio:
        a_res = await db.execute(
            select(AudioTrack)
            .where(AudioTrack.project_id == project_id)
            .order_by(AudioTrack.created_at.desc())
        )
        audio = a_res.scalars().first()
        if audio:
            audio_dur = audio.duration or 0.0

    timeline.total_duration = max(clips_end, audio_dur, 0.0)

    await db.commit()
    await db.refresh(timeline)

    # Build scenes lookup
    s_res = await db.execute(select(Scene).where(Scene.project_id == project_id))
    all_scenes = s_res.scalars().all()
    v_res = await db.execute(select(SourceVideo).where(SourceVideo.project_id == project_id))
    video_url_map = {v.id: storage.to_relative_url(v.file_path) for v in v_res.scalars().all()}
    scenes_map = {s.id: storage.to_relative_url(s.thumbnail_path) for s in all_scenes}
    scenes_video_map = {s.id: video_url_map.get(s.source_video_id) for s in all_scenes}

    res_clips = []
    for c in timeline.clips or []:
        c_copy = dict(c)
        c_copy["thumbnail_url"] = scenes_map.get(c.get("scene_id"))
        c_copy["video_url"] = scenes_video_map.get(c.get("scene_id")) or video_url_map.get(c.get("source_video_id"))
        res_clips.append(c_copy)

    return TimelineResponse(
        id=timeline.id,
        project_id=timeline.project_id,
        clips=res_clips,
        total_duration=timeline.total_duration,
        has_audio=timeline.has_audio,
        has_subtitles=timeline.has_subtitles,
    )
