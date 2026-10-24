import asyncio
import uuid
from pathlib import Path
from typing import List

from arq import create_pool
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.events import publish_project_event
from app.core.redis import get_redis_settings
from app.core.storage import storage
from app.models.project import Project, SourceVideo
from app.schemas.media import (
    YTDownloadRequest,
    YTInfoResponse,
)
from app.schemas.project import SourceVideoResponse
from app.services.scene_detector import get_video_metadata
from app.services.ytdlp import (
    get_video_info,
)
from app.workers.tasks import detect_scenes_job, download_youtube_job

router = APIRouter(prefix="/projects/{project_id}/media", tags=["media"])

_background_tasks: set = set()

async def enqueue_task(job_name: str, *args, **kwargs):
    """Enqueue job into arq redis queue or run via asyncio background task."""
    try:
        pool = await create_pool(get_redis_settings())
        await pool.enqueue_job(job_name, *args, **kwargs)
        await pool.close()
    except Exception:
        # Fallback to local asyncio task (keep a strong ref so it is not GC'd mid-run)
        task = None
        if job_name == "detect_scenes_job":
            task = asyncio.create_task(detect_scenes_job({}, *args))
        elif job_name == "download_youtube_job":
            task = asyncio.create_task(download_youtube_job({}, *args))
        if task is not None:
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)


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
            heatmap_data=v.heatmap_data,
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

    settings = get_settings()
    max_upload = settings.MAX_UPLOAD_SIZE
    max_duration_sec = settings.MAX_SOURCE_DURATION_MINS * 60

    videos_dir = storage.get_videos_dir(project_id)
    created_videos = []

    for file in files:
        file_ext = Path(file.filename or "").suffix.lower()
        if file_ext not in (".mp4", ".mov", ".mkv", ".webm"):
            continue

        unique_name = f"{uuid.uuid4()}{file_ext}"
        dest_path = videos_dir / unique_name

        # Stream save file with a hard size cap to prevent disk exhaustion
        written = 0
        too_large = False
        with open(dest_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                written += len(chunk)
                if written > max_upload:
                    too_large = True
                    break
                f.write(chunk)

        if too_large:
            dest_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=413,
                detail=f"Ukuran file '{file.filename}' melebihi batas {max_upload // (1024 * 1024)} MB",
            )

        try:
            meta = await get_video_metadata(str(dest_path))
            duration = meta["duration"]
            width = meta["width"]
            height = meta["height"]
            fps = meta["fps"]
        except Exception:
            duration, width, height, fps = 0.0, 0, 0, 0.0

        if duration and duration > max_duration_sec:
            dest_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Durasi video '{file.filename}' ({int(duration)}s) melebihi batas {settings.MAX_SOURCE_DURATION_MINS} menit",
            )

        video = SourceVideo(
            project_id=project_id,
            origin="upload",
            file_path=str(dest_path),
            filename=file.filename or unique_name,
            duration=duration,
            width=width,
            height=height,
            fps=fps,
            status="processing",
            progress=5,
        )
        db.add(video)
        created_videos.append(video)

    await db.commit()

    # Trigger scene detection for newly uploaded videos & emit real-time event
    for v in created_videos:
        await db.refresh(v)
        await publish_project_event(
            project_id,
            task_type="scene_detect",
            status="progress",
            progress=5,
            stage="queued",
            message=f"Video '{v.filename}' diunggah. Memulai deteksi scene...",
            data={"video_id": v.id, "filename": v.filename},
        )
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
            heatmap_data=v.heatmap_data,
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

    initial_title = (payload.title or "").strip()
    if initial_title:
        initial_filename = initial_title if any(initial_title.lower().endswith(ext) for ext in [".mp4", ".mov", ".mkv", ".webm"]) else f"{initial_title}.mp4"
    else:
        initial_filename = "Mendownload dari YouTube..."

    video = SourceVideo(
        project_id=project_id,
        origin="ytdlp",
        filename=initial_filename,
        youtube_url=payload.url,
        selected_resolution=payload.format_id,
        status="downloading",
        progress=5,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    await publish_project_event(
        project_id,
        task_type="youtube_download",
        status="progress",
        progress=5,
        stage="downloading",
        message=f"Memulai download video '{video.filename}'...",
        data={"video_id": video.id, "filename": video.filename},
    )

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
        heatmap_data=None,
        created_at=video.created_at,
    )


@router.post("/{video_id}/cancel")
async def cancel_video_processing(
    project_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Cancel and interrupt an in-flight video download or scene detection task."""
    video = await db.get(SourceVideo, video_id)
    if not video or video.project_id != project_id:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")

    from app.services.cancellation import request_cancellation
    await request_cancellation(project_id, video_id=video_id)

    video.status = "failed"
    video.error_message = "Proses dibatalkan oleh pengguna"
    await db.commit()

    await publish_project_event(
        project_id,
        task_type="youtube_download" if video.origin == "ytdlp" else "scene_detect",
        status="error",
        progress=0,
        stage="cancelled",
        message=f"Proses untuk video '{video.filename}' berhasil dibatalkan.",
        error="Dibatalkan",
        data={"video_id": video_id},
    )

    return {"status": "cancelled", "message": f"Proses video '{video.filename}' berhasil dibatalkan."}


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source_video(
    project_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    video = await db.get(SourceVideo, video_id)
    if not video or video.project_id != project_id:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")

    # Cancel any active worker process (yt-dlp or scene detection) immediately before deleting
    from app.services.cancellation import request_cancellation
    await request_cancellation(project_id, video_id=video_id)

    if video.file_path and Path(video.file_path).exists():
        try:
            Path(video.file_path).unlink(missing_ok=True)
        except Exception:
            pass

    # Clean up scene thumbnail files from disk
    from app.models.project import Scene
    from app.models.timeline import Timeline
    res = await db.execute(select(Scene).where(Scene.source_video_id == video_id))
    deleted_scenes = res.scalars().all()
    for sc in deleted_scenes:
        if sc.thumbnail_path:
            tp = Path(sc.thumbnail_path)
            if not tp.exists():
                tp = storage.to_absolute_path(sc.thumbnail_path)
            if tp and tp.exists():
                try:
                    tp.unlink(missing_ok=True)
                except Exception:
                    pass

    # Clear cached task in Redis if it belongs to this video
    try:
        import json

        from app.core.redis import get_redis_client
        redis_client = get_redis_client()
        cache_key = f"project:{project_id}:active_task"
        cached = await redis_client.get(cache_key)
        if cached:
            task_dict = json.loads(cached)
            if task_dict.get("data", {}).get("video_id") == video_id:
                await redis_client.delete(cache_key)
    except Exception:
        pass

    await db.execute(delete(Scene).where(Scene.source_video_id == video_id))
    await db.delete(video)

    # Remove timeline clips that reference scenes of the deleted video (avoid dangling refs)
    timeline_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    timeline = timeline_res.scalar_one_or_none()
    if timeline and timeline.clips:
        deleted_scene_ids = {sc.id for sc in deleted_scenes}
        remaining = [
            c for c in timeline.clips if c.get("scene_id") not in deleted_scene_ids
        ]
        if len(remaining) != len(timeline.clips):
            timeline.clips = remaining
            timeline.total_duration = max(
                (float(c.get("timeline_end", 0.0)) for c in remaining), default=0.0
            )

    await db.commit()
