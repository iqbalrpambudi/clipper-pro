import logging
from pathlib import Path
from typing import Any, Dict

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.events import publish_project_event
from app.core.storage import storage
from app.models.project import SourceVideo
from app.services.cancellation import (
    TaskCancelledException,
    is_cancelled,
)
from app.services.scene_detector import get_video_metadata
from app.services.ytdlp import download_video, get_video_info
from app.workers.scenes import detect_scenes_job

log = logging.getLogger(__name__)


async def download_youtube_job(ctx: Dict[str, Any], video_id: str) -> None:
    """Async background task to download YouTube video via yt-dlp."""
    async with SessionLocal() as db:
        res = await db.execute(select(SourceVideo).where(SourceVideo.id == video_id))
        video = res.scalar_one_or_none()
        if not video or not video.youtube_url:
            return

        video.status = "downloading"
        video.progress = 5
        await db.commit()

        await publish_project_event(
            video.project_id,
            task_type="youtube_download",
            status="progress",
            progress=5,
            stage="starting",
            message="Menghubungkan ke YouTube via yt-dlp...",
            data={"video_id": video_id, "filename": video.filename},
        )

        out_dir = storage.get_videos_dir(video.project_id)
        out_file = out_dir / f"yt_{video.id}.mp4"

        async def _progress(pct: int):
            if await is_cancelled(video.project_id, video_id=video_id):
                raise TaskCancelledException("Download video YouTube dibatalkan oleh pengguna.")
            bounded_pct = max(5, min(pct, 95))
            async with SessionLocal() as inner_db:
                v = await inner_db.get(SourceVideo, video_id)
                if v:
                    v.progress = bounded_pct
                    await inner_db.commit()
            await publish_project_event(
                video.project_id,
                task_type="youtube_download",
                status="progress",
                progress=bounded_pct,
                stage="downloading",
                message=f"Mendownload video YouTube ({bounded_pct}%)...",
                data={"video_id": video_id, "filename": video.filename},
            )

        try:
            downloaded_path = await download_video(
                url=video.youtube_url,
                output_path=str(out_file),
                format_id=video.selected_resolution,
                progress_callback=_progress,
                project_id=video.project_id,
                video_id=video.id,
            )

            if await is_cancelled(video.project_id, video_id=video_id):
                Path(downloaded_path).unlink(missing_ok=True)
                raise TaskCancelledException("Download video YouTube dibatalkan oleh pengguna.")

            meta = await get_video_metadata(downloaded_path)

            # Enforce duration cap for downloads too (not just /yt-info)
            _settings = get_settings()
            max_sec = _settings.MAX_SOURCE_DURATION_MINS * 60
            if meta["duration"] and meta["duration"] > max_sec:
                Path(downloaded_path).unlink(missing_ok=True)
                raise RuntimeError(
                    f"Durasi video ({int(meta['duration'])}s) melebihi batas {_settings.MAX_SOURCE_DURATION_MINS} menit"
                )

            video.file_path = downloaded_path
            video.duration = meta["duration"]
            video.width = meta["width"]
            video.height = meta["height"]
            video.fps = meta["fps"]

            # If filename was default placeholder, update with actual YouTube title
            if not video.filename or video.filename.startswith("Mendownload"):
                try:
                    yt_meta = await get_video_info(video.youtube_url)
                    if yt_meta.title:
                        clean_t = yt_meta.title.strip()
                        video.filename = clean_t if clean_t.lower().endswith(".mp4") else f"{clean_t}.mp4"
                except Exception as ex:
                    log.debug("Could not resolve video title from yt-dlp metadata: %s", ex)

            if await is_cancelled(video.project_id, video_id=video_id):
                raise TaskCancelledException("Download video YouTube dibatalkan oleh pengguna.")

            # Smooth direct transition to scene detection (do NOT set ready here)
            video.status = "processing"
            video.progress = 10
            await db.commit()

            # Explicitly close the youtube_download task so the frontend UI transitions cleanly
            await publish_project_event(
                video.project_id,
                task_type="youtube_download",
                status="success",
                progress=100,
                stage="completed",
                message=f"Video '{video.filename}' berhasil didownload! Melanjutkan ke analisis scene...",
                data={"video_id": video_id, "duration": meta["duration"], "filename": video.filename},
            )

            await publish_project_event(
                video.project_id,
                task_type="scene_detect",
                status="progress",
                progress=10,
                stage="detecting_cuts",
                message=f"Memulai analisis scene untuk '{video.filename}'...",
                data={"video_id": video_id, "duration": meta["duration"], "filename": video.filename},
            )

            # Auto trigger scene detection for downloaded video
            await detect_scenes_job(ctx, video_id)

        except TaskCancelledException as ce:
            log.info("YouTube download was cancelled for %s: %s", video_id, ce)
            video.status = "failed"
            video.error_message = "Download dibatalkan oleh pengguna"
            await db.commit()

            await publish_project_event(
                video.project_id,
                task_type="youtube_download",
                status="error",
                progress=0,
                stage="cancelled",
                message="Download video dibatalkan oleh pengguna.",
                error="Dibatalkan",
                data={"video_id": video_id},
            )
            return

        except Exception as e:
            log.exception("YouTube download failed for %s", video_id)
            video.status = "failed"
            video.error_message = str(e)
            await db.commit()

            await publish_project_event(
                video.project_id,
                task_type="youtube_download",
                status="error",
                progress=0,
                stage="failed",
                message=f"Gagal mendownload video dari YouTube: {str(e)}",
                error=str(e),
                data={"video_id": video_id},
            )
