import asyncio
import logging
from typing import List

from arq import create_pool
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.events import publish_project_event
from app.core.redis import get_redis_settings
from app.models.project import Project, SourceVideo
from app.models.timeline import SubtitleStyle, Timeline
from app.schemas.discovery import (
    PresetCategory,
    VideoImportRequest,
    VideoImportResponse,
    VideoSearchRequest,
    VideoSearchResponse,
)
from app.services.discovery import get_preset_categories, search_candidates
from app.workers.tasks import download_youtube_job

log = logging.getLogger(__name__)

router = APIRouter(prefix="/discovery", tags=["discovery"])

_background_tasks: set = set()


async def _enqueue_download(video_id: str):
    """Enqueue download_youtube_job ke Redis pool atau fallback ke asyncio task."""
    try:
        pool = await create_pool(get_redis_settings())
        await pool.enqueue_job("download_youtube_job", video_id)
        await pool.close()
    except Exception as e:
        log.warning("Gagal enqueue via Redis, fallback ke asyncio task: %s", e)
        task = asyncio.create_task(download_youtube_job({}, video_id))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)


@router.get("/presets", response_model=List[PresetCategory])
async def list_presets():
    """Mengembalikan daftar preset kategori video sumber yang relevan."""
    return get_preset_categories()


@router.post("/search", response_model=VideoSearchResponse)
async def search_video_sources(
    payload: VideoSearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Cari kandidat video YouTube berdasarkan preset atau kustom query dengan pengecualian video AI."""
    try:
        return await search_candidates(payload, db)
    except Exception as e:
        log.error("Gagal mencari kandidat video: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Gagal mencari video YouTube: {str(e)}")


@router.post("/import", response_model=VideoImportResponse, status_code=status.HTTP_201_CREATED)
async def import_discovered_video(
    payload: VideoImportRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Otomatis buat project baru dari video YouTube terpilih dan
    langsung jalankan antrean download serta deteksi scene AI.
    """
    video_url = payload.url.strip()
    if not video_url:
        raise HTTPException(status_code=400, detail="URL video tidak boleh kosong")

    project_name = (payload.project_name or payload.title or "Project Video Baru").strip()

    # 1. Buat Project Baru
    proj = Project(
        name=project_name[:250],
        description=f"Sumber YouTube: {video_url}",
        project_type="short_video",
        aspect_ratio=payload.aspect_ratio or "9:16",
        resolution=payload.resolution or "1080p",
        language=payload.language or "id",
        background_fill={
            "mode": "blur",
            "color": "#000000",
            "anti_copyright": True,
            "dynamic_zoom": True,
        },
    )
    db.add(proj)
    await db.flush()

    # 2. Tambahkan default Subtitle Style
    sub_style = SubtitleStyle(
        project_id=proj.id,
        preset_name="viral_tiktok",
        font_family="Poppins",
        font_size=56,
        font_weight="Bold",
        primary_color="#FFFFFF",
        highlight_color="#FFE600",
        outline_color="#000000",
        outline_width=4,
        position="bottom",
        display_mode="per_word",
        burst_word_count=2,
        highlight_animation="color",
        scale_factor=1.0,
        emoji_enabled=True,
    )
    db.add(sub_style)

    # 3. Tambahkan default Timeline kosong
    timeline = Timeline(project_id=proj.id, clips=[], total_duration=0.0)
    db.add(timeline)

    # 4. Tentukan resolusi download (720p default agar cepat, atau sesuai pilihan pengguna)
    res_key = (payload.download_resolution or "720p").lower().strip()
    if "720" in res_key:
        format_spec = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
    elif "1080" in res_key:
        format_spec = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
    elif "480" in res_key:
        format_spec = "bestvideo[height<=480]+bestaudio/best[height<=480]/best"
    elif res_key in ("best", "max", "auto"):
        format_spec = "bestvideo+bestaudio/best"
    else:
        format_spec = payload.download_resolution or "bestvideo[height<=720]+bestaudio/best[height<=720]/best"

    clean_title = (payload.title or "Mendownload dari YouTube").strip()
    if not clean_title.lower().endswith(".mp4"):
        filename = f"{clean_title}.mp4"
    else:
        filename = clean_title

    video = SourceVideo(

        project_id=proj.id,
        origin="ytdlp",
        filename=filename,
        youtube_url=video_url,
        selected_resolution=format_spec,
        status="downloading",
        progress=5,
    )
    db.add(video)

    await db.commit()
    await db.refresh(proj)
    await db.refresh(video)

    # 5. Emit real-time WebSocket event
    await publish_project_event(
        proj.id,
        task_type="youtube_download",
        status="progress",
        progress=5,
        stage="downloading",
        message=f"Memulai download video '{video.filename}'...",
        data={"video_id": video.id, "filename": video.filename},
    )

    # 6. Jalankan background job download (otomatis memicu scene detection setelah selesai)
    await _enqueue_download(video.id)

    return VideoImportResponse(
        project_id=proj.id,
        project_name=proj.name,
        video_id=video.id,
        status="downloading",
    )
