from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.storage import storage
from app.models.project import Project, Scene, SourceVideo
from app.models.timeline import SubtitleStyle, Timeline
from app.schemas.project import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectResponse,
    ProjectUpdate,
    RenderJobResponse,
    SceneResponse,
    SourceVideoResponse,
)
from app.services.project_defaults import (
    build_project_config_snapshot,
    export_project_defaults_json,
    load_project_defaults,
)
from app.services.subtitle_ass import style_to_dict

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(
            Project,
            func.count(func.distinct(SourceVideo.id)).label("video_count"),
            func.count(func.distinct(Scene.id)).label("scene_count"),
        )
        .outerjoin(SourceVideo, Project.id == SourceVideo.project_id)
        .outerjoin(Scene, Project.id == Scene.project_id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    output = []
    for proj, v_count, s_count in rows:
        resp = ProjectResponse.model_validate(proj)
        resp.source_video_count = v_count
        resp.scene_count = s_count
        output.append(resp)
    return output


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)):
    defaults, _, _ = load_project_defaults()
    aspect = payload.aspect_ratio
    world_cfg = payload.world_setting or {}
    watermark_data = (
        payload.watermark.model_dump()
        if payload.watermark is not None
        else defaults.watermark.model_dump()
    )
    tts_data = (
        payload.tts_config.model_dump()
        if payload.tts_config is not None
        else defaults.tts.model_dump()
    )
    qc_data = (
        payload.qc_config.model_dump()
        if payload.qc_config is not None
        else defaults.qc.model_dump()
    )
    proj = Project(
        name=payload.name,
        description=payload.description,
        project_type=payload.project_type,
        aspect_ratio=aspect,
        resolution=payload.resolution,
        language=payload.language or "id",
        background_fill=payload.background_fill.model_dump(),
        watermark=watermark_data,
        tts_config=tts_data,
        qc_config=qc_data,
        world_setting=world_cfg,
    )
    db.add(proj)
    await db.flush()

    # Create subtitle style from config.json defaults
    sub_style = SubtitleStyle(project_id=proj.id, **defaults.subtitle.model_dump())
    db.add(sub_style)

    # Create empty timeline
    timeline = Timeline(project_id=proj.id, clips=[], total_duration=0.0)
    db.add(timeline)

    await db.commit()
    await db.refresh(proj)
    return ProjectResponse.model_validate(proj)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.source_videos),
            selectinload(Project.scenes),
            selectinload(Project.narrations),
            selectinload(Project.audio_tracks),
            selectinload(Project.timeline),
            selectinload(Project.subtitle_style),
            selectinload(Project.render_jobs),
        )
    )
    res = await db.execute(stmt)
    proj = res.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    bg_fill = proj.background_fill if isinstance(proj.background_fill, dict) else {"mode": "blur", "color": "#000000"}
    watermark_dict = proj.watermark if isinstance(proj.watermark, dict) else None
    tts_dict = proj.tts_config if isinstance(proj.tts_config, dict) else None
    qc_dict = proj.qc_config if isinstance(proj.qc_config, dict) else None
    resp = ProjectDetailResponse(
        id=proj.id,
        name=proj.name,
        description=proj.description,
        project_type=proj.project_type,
        status=proj.status,
        aspect_ratio=proj.aspect_ratio,
        resolution=proj.resolution,
        language=proj.language or "id",
        background_fill=bg_fill,
        watermark=watermark_dict,
        tts_config=tts_dict,
        qc_config=qc_dict,
        created_at=proj.created_at,
        updated_at=proj.updated_at,
        source_video_count=len(proj.source_videos),
        scene_count=len(proj.scenes),
        youtube_metadata=proj.youtube_metadata or {},
        characters=proj.characters or [],
        locations=proj.locations or [],
        world_setting=proj.world_setting or {},
    )

    # Map file urls
    resp.source_videos = [
        SourceVideoResponse(
            id=v.id,
            project_id=v.project_id,
            origin=v.origin,
            file_url=storage.to_relative_url(v.file_path),
            filename=v.filename,
            youtube_url=v.youtube_url,
            selected_resolution=v.selected_resolution,
            duration=v.duration,
            width=v.width,
            height=v.height,
            fps=v.fps,
            status=v.status,
            progress=v.progress,
            error_message=v.error_message,
            created_at=v.created_at,
        )
        for v in proj.source_videos
    ]

    video_url_map = {v.id: storage.to_relative_url(v.file_path) for v in proj.source_videos}
    video_order_map = {
        v.id: idx
        for idx, v in enumerate(sorted(proj.source_videos, key=lambda x: x.created_at))
    }

    sorted_scenes = sorted(
        proj.scenes,
        key=lambda s: (
            video_order_map.get(s.source_video_id, 0),
            s.scene_index,
            s.start_time,
        ),
    )

    resp.scenes = [
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
            transcript=s.transcript,
            shot_info=s.shot_info,
            status=s.status,
            created_at=s.created_at,
        )
        for s in sorted_scenes
    ]

    # Latest narration
    if proj.narrations:
        latest_n = sorted(proj.narrations, key=lambda x: x.created_at, reverse=True)[0]
        resp.narration = {
            "id": latest_n.id,
            "template_id": latest_n.template_id,
            "topic": latest_n.topic,
            "tone": latest_n.tone,
            "target_duration": latest_n.target_duration,
            "raw_text": latest_n.raw_text,
            "segments": latest_n.segments,
            "status": latest_n.status,
        }

    # Latest audio
    if proj.audio_tracks:
        latest_a = sorted(proj.audio_tracks, key=lambda x: x.created_at, reverse=True)[0]
        raw_audio_url = storage.to_relative_url(latest_a.file_path)
        audio_url_with_ts = None
        if raw_audio_url:
            ts = int(latest_a.created_at.timestamp()) if latest_a.created_at else 0
            audio_url_with_ts = f"{raw_audio_url}?v={ts}"

        resp.audio = {
            "id": latest_a.id,
            "provider": latest_a.provider,
            "voice": latest_a.voice,
            "rate": latest_a.rate,
            "pitch": latest_a.pitch,
            "audio_url": audio_url_with_ts,
            "duration": latest_a.duration,
            "estimated_cost": latest_a.estimated_cost,
            "status": latest_a.status,
        }

    # Timeline with scene thumbnails and video_urls populated
    if proj.timeline:
        scenes_map = {s.id: storage.to_relative_url(s.thumbnail_path) for s in proj.scenes}
        scenes_video_map = {s.id: video_url_map.get(s.source_video_id) for s in proj.scenes}
        clips = []
        for c in proj.timeline.clips or []:
            c_copy = dict(c)
            if not c_copy.get("thumbnail_url"):
                c_copy["thumbnail_url"] = scenes_map.get(c.get("scene_id"))
            if not c_copy.get("video_url"):
                c_copy["video_url"] = scenes_video_map.get(c.get("scene_id")) or video_url_map.get(c.get("source_video_id"))
            clips.append(c_copy)

        resp.timeline = {
            "id": proj.timeline.id,
            "clips": clips,
            "total_duration": proj.timeline.total_duration,
            "has_audio": proj.timeline.has_audio is not False,
            "has_subtitles": proj.timeline.has_subtitles is not False,
        }

    if proj.subtitle_style:
        resp.subtitle_style = {"id": proj.subtitle_style.id, **style_to_dict(proj.subtitle_style)}

    resp.render_jobs = [
        RenderJobResponse(
            id=j.id,
            project_id=j.project_id,
            render_type=j.render_type,
            status=j.status,
            progress=j.progress,
            output_url=storage.to_relative_url(j.output_file_path),
            thumbnail_url=storage.resolve_render_job_thumbnail_url(j.thumbnail_path, j.output_file_path),
            file_size_bytes=storage.get_file_size(j.output_file_path),
            log_output=j.log_output,
            error_message=j.error_message,
            created_at=j.created_at,
            completed_at=j.completed_at,
        )
        for j in proj.render_jobs
    ]

    return resp


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, payload: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    if payload.name is not None:
        proj.name = payload.name
    if payload.description is not None:
        proj.description = payload.description
    if payload.project_type is not None:
        proj.project_type = payload.project_type
    if payload.aspect_ratio is not None:
        proj.aspect_ratio = payload.aspect_ratio
    if payload.resolution is not None:
        proj.resolution = payload.resolution
    if payload.language is not None:
        proj.language = payload.language
    if payload.background_fill is not None:
        proj.background_fill = payload.background_fill.model_dump()
    if payload.watermark is not None:
        proj.watermark = payload.watermark.model_dump()
    if payload.tts_config is not None:
        proj.tts_config = payload.tts_config.model_dump()
    if payload.qc_config is not None:
        proj.qc_config = payload.qc_config.model_dump()
    if payload.status is not None:
        proj.status = payload.status
    if payload.characters is not None:
        proj.characters = payload.characters
    if payload.locations is not None:
        proj.locations = payload.locations
    if payload.world_setting is not None:
        proj.world_setting = payload.world_setting

    await db.commit()
    await db.refresh(proj)
    return ProjectResponse.model_validate(proj)

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    storage.delete_project_files(project_id)
    await db.delete(proj)
    await db.commit()


@router.get("/{project_id}/config/export")
async def export_project_config(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.subtitle_style),
            selectinload(Project.audio_tracks),
        )
    )
    res = await db.execute(stmt)
    proj = res.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    latest_audio = (
        sorted(proj.audio_tracks, key=lambda x: x.created_at, reverse=True)[0]
        if proj.audio_tracks
        else None
    )
    snapshot = build_project_config_snapshot(proj, latest_audio, proj.subtitle_style)
    return Response(
        content=export_project_defaults_json(snapshot),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="config.json"'},
    )
