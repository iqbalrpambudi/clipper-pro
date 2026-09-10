import asyncio
import uuid
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from arq import create_pool
from app.core.db import get_db
from app.core.redis import get_redis_settings
from app.core.storage import storage
from app.core.config import get_settings
from app.models.project import Project, SourceVideo
from app.schemas.project import SourceVideoResponse
from app.schemas.media import (
    YTInfoResponse,
    YTDownloadRequest,
    YTUpdateResponse,
)
from app.services.ytdlp import (
    get_video_info,
    get_ytdlp_version,
    update_ytdlp,
)
from app.services.scene_detector import get_video_metadata
from app.workers.tasks import detect_scenes_job, download_youtube_job

router = APIRouter(prefix="/projects/{project_id}/media", tags=["media"])


async def enqueue_task(job_name: str, *args, **kwargs):
    """Enqueue job into arq redis queue or run via asyncio background task."""
    try:
        pool = await create_pool(get_redis_settings())
        await pool.enqueue_job(job_name, *args, **kwargs)
        await pool.close()
    except Exception:
        # Fallback to local asyncio task
        if job_name == "detect_scenes_job":
            asyncio.create_task(detect_scenes_job({}, *args))
        elif job_name == "download_youtube_job":
            asyncio.create_task(download_youtube_job({}, *args))


@router.get("", response_model=List[SourceVideoResponse])
async def list_media(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SourceVideo).where(SourceVideo.project_id == project_id))
    videos = res.scalars().all()
    return [
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
        for v in videos
    ]


@router.post("/upload", response_model=List[SourceVideoResponse])
async def upload_media_files(
    project_id: str,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    videos_dir = storage.get_videos_dir(project_id)
    created_videos = []

    for file in files:
        file_ext = Path(file.filename or "").suffix.lower()
        if file_ext not in (".mp4", ".mov", ".mkv", ".webm"):
            continue

        unique_name = f"{uuid.uuid4()}{file_ext}"
        dest_path = videos_dir / unique_name

        # Stream save file
        with open(dest_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                f.write(chunk)

        try:
            meta = await get_video_metadata(str(dest_path))
            duration = meta["duration"]
            width = meta["width"]
            height = meta["height"]
            fps = meta["fps"]
        except Exception:
            duration, width, height, fps = 0.0, 0, 0, 0.0

        video = SourceVideo(
            project_id=project_id,
            origin="upload",
            file_path=str(dest_path),
            filename=file.filename or unique_name,
            duration=duration,
            width=width,
            height=height,
            fps=fps,
            status="ready",
            progress=100,
        )
        db.add(video)
        created_videos.append(video)

    await db.commit()

    # Trigger scene detection for newly uploaded videos
    for v in created_videos:
        await db.refresh(v)
        await enqueue_task("detect_scenes_job", v.id)

    return [
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
        for v in created_videos
    ]


@router.post("/yt-info", response_model=YTInfoResponse)
async def fetch_youtube_info(
    project_id: str,
    payload: YTDownloadRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    try:
        info = await get_video_info(payload.url)
        # Validation duration check
        settings = get_settings()
        max_sec = settings.MAX_SOURCE_DURATION_MINS * 60
        if info.duration > max_sec:
            raise HTTPException(
                status_code=400,
                detail=f"Durasi video ({info.duration_str}) melebihi batas maksimal {settings.MAX_SOURCE_DURATION_MINS} menit",
            )
        return info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/yt-download", response_model=SourceVideoResponse)
async def trigger_youtube_download(
    project_id: str,
    payload: YTDownloadRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    video = SourceVideo(
        project_id=project_id,
        origin="ytdlp",
        filename="Mendownload dari YouTube...",
        youtube_url=payload.url,
        selected_resolution=payload.format_id,
        status="pending",
        progress=0,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    await enqueue_task("download_youtube_job", video.id)

    return SourceVideoResponse(
        id=video.id,
        project_id=video.project_id,
        origin=video.origin,
        file_url=None,
        filename=video.filename,
        youtube_url=video.youtube_url,
        selected_resolution=video.selected_resolution,
        duration=0.0,
        width=0,
        height=0,
        fps=0.0,
        status=video.status,
        progress=video.progress,
        error_message=None,
        created_at=video.created_at,
    )


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source_video(
    project_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(SourceVideo, video_id)
    if not video or video.project_id != project_id:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")

    if video.file_path and Path(video.file_path).exists():
        try:
            Path(video.file_path).unlink(missing_ok=True)
        except Exception:
            pass

    await db.delete(video)
    await db.commit()
