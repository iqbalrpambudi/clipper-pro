import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import publish_project_event
from app.core.storage import storage
from app.models.narration import AudioTrack, Narration
from app.models.project import Project, RenderJob, SourceVideo
from app.models.storyboard import StoryboardItem
from app.models.timeline import SubtitleStyle, Timeline
from app.services.cancellation import (
    TaskCancelledException,
    clear_cancellation,
    is_cancelled,
    kill_all_matching_processes,
)
from app.services.renderer import render_timeline_video
from app.services.storyboard_renderer import render_storyboard_video
from app.services.subtitle_ass import generate_ass_subtitles

log = logging.getLogger(__name__)


async def render_video_job(ctx: Dict[str, Any], render_job_id: str) -> None:
    """Async background task to run FFmpeg rendering."""
    async with SessionLocal() as db:
        job = await db.get(RenderJob, render_job_id)
        if not job:
            return

        project = await db.get(Project, job.project_id)
        if not project:
            return

        # Clear any prior cancellation flags for this job and project so new render is clean
        await clear_cancellation(project_id=project.id, job_id=render_job_id)

        job.status = "rendering"
        job.progress = 5
        job.log_output = "Memulai proses rendering FFmpeg..."
        await db.commit()

        await publish_project_event(
            project.id,
            task_type="render",
            status="progress",
            progress=5,
            stage="starting",
            message=f"Memulai proses rendering video ({job.render_type})...",
            data={"job_id": render_job_id, "render_type": job.render_type},
        )

        renders_dir = storage.get_renders_dir(project.id)
        out_ext = "mp4"
        out_file = renders_dir / f"render_{job.render_type}_{job.id}.{out_ext}"

        # Fetch latest audio track
        a_res = await db.execute(
            select(AudioTrack)
            .where(AudioTrack.project_id == project.id)
            .order_by(AudioTrack.created_at.desc())
        )
        audio_track = a_res.scalars().first()
        audio_path = audio_track.file_path if audio_track else None

        # Fetch narration segments for subtitle
        n_res = await db.execute(
            select(Narration)
            .where(Narration.project_id == project.id)
            .order_by(Narration.created_at.desc())
        )
        narration = n_res.scalars().first()

        # Fetch subtitle style
        sub_res = await db.execute(select(SubtitleStyle).where(SubtitleStyle.project_id == project.id))
        style = sub_res.scalar_one_or_none()
        style_dict = {
            "preset_name": style.preset_name if style else "viral_tiktok",
            "font_family": style.font_family if style else "Poppins",
            "font_size": style.font_size if style else 56,
            "font_weight": style.font_weight if style else "Bold",
            "primary_color": style.primary_color if style else "#FFFFFF",
            "highlight_color": style.highlight_color if style else "#FFE600",
            "outline_color": style.outline_color if style else "#000000",
            "outline_width": style.outline_width if style else 4,
            "box_color": style.box_color if style else "#000000",
            "box_opacity": style.box_opacity if style else 0.0,
            "position": style.position if style else "bottom",
            "offset_y": style.offset_y if style else 0,
            "offset_x": style.offset_x if style else 0,
            "display_mode": style.display_mode if style else "per_word",
            "burst_word_count": style.burst_word_count if style else 2,
            "highlight_animation": style.highlight_animation if style else "color",
            "scale_factor": style.scale_factor if (style and style.scale_factor is not None) else 1.0,
            "emoji_enabled": style.emoji_enabled if style else True,
            "enabled": style.enabled if (style and hasattr(style, "enabled")) else True,
        }

        subtitles_enabled = style_dict.get("enabled", True)
        if project.project_type != "long_storyboard":
            t_check = await db.execute(select(Timeline).where(Timeline.project_id == project.id))
            tl = t_check.scalar_one_or_none()
            if tl and tl.has_subtitles is False:
                subtitles_enabled = False

        ass_file_path = None
        if subtitles_enabled and narration and narration.segments:
            play_res_x, play_res_y = 1080, 1920
            if project.aspect_ratio == "16:9":
                play_res_x, play_res_y = 1920, 1080
            elif project.aspect_ratio == "1:1":
                play_res_x, play_res_y = 1080, 1080

            ass_content = generate_ass_subtitles(
                narration.segments,
                style_dict,
                play_res_x=play_res_x,
                play_res_y=play_res_y,
            )
            ass_file = renders_dir / f"subtitles_{job.id}.ass"
            with open(ass_file, "w", encoding="utf-8") as f:
                f.write(ass_content)
            ass_file_path = str(ass_file)

        loop = asyncio.get_event_loop()
        last_progress_time = loop.time()
        start_time = loop.time()
        audio_dur = float(getattr(audio_track, "duration", 0) or 0)
        INACTIVITY_TIMEOUT = 600.0  # 10 minutes without any progress update (was 180s)
        OVERALL_TIMEOUT = max(2400.0, float(audio_dur * 8) if audio_dur else 2400.0)  # 40+ minutes for long 1080p videos

        async def _progress(pct: int, msg: str):
            nonlocal last_progress_time
            last_progress_time = loop.time()
            async with SessionLocal() as inner_db:
                j = await inner_db.get(RenderJob, render_job_id)
                if j:
                    j.progress = pct
                    j.log_output = msg
                    await inner_db.commit()
            await publish_project_event(
                project.id,
                task_type="render",
                status="progress",
                progress=pct,
                stage="rendering_frames",
                message=msg or f"Memproses render video ({pct}%)...",
                data={"job_id": render_job_id, "render_type": job.render_type},
            )

        async def _heartbeat():
            nonlocal last_progress_time
            last_progress_time = loop.time()

        async def _watchdog():
            while True:
                await asyncio.sleep(3.0)
                now = loop.time()
                # 1. Check if user or system cancelled
                if await is_cancelled(project.id, job_id=render_job_id):
                    kill_all_matching_processes(project.id, job_id=render_job_id)
                    raise TaskCancelledException("Rendering video dibatalkan oleh pengguna.")

                # 2. Check overall job timeout
                if now - start_time > OVERALL_TIMEOUT:
                    kill_all_matching_processes(project.id, job_id=render_job_id)
                    raise TimeoutError(
                        f"Rendering melebihi batas waktu total ({int(OVERALL_TIMEOUT / 60)} menit). Proses dihentikan otomatis."
                    )

                # 3. Check progress inactivity timeout (stuck render)
                if now - last_progress_time > INACTIVITY_TIMEOUT:
                    kill_all_matching_processes(project.id, job_id=render_job_id)
                    raise TimeoutError(
                        f"Rendering macet: tidak ada progres selama {int(INACTIVITY_TIMEOUT)} detik. Proses dihentikan otomatis."
                    )

        async def _do_render() -> str:
            if project.project_type == "long_storyboard":
                # Fetch storyboard items
                sb_res = await db.execute(
                    select(StoryboardItem)
                    .where(StoryboardItem.project_id == project.id)
                    .order_by(StoryboardItem.order_index.asc())
                )
                sb_items = sb_res.scalars().all()
                valid_items = []
                for it in sb_items:
                    if not it.file_path:
                        continue
                    p = Path(it.file_path)
                    if not p.exists():
                        p = storage.to_absolute_path(it.file_path)
                    if p and p.exists():
                        valid_items.append((it, str(p)))

                if not valid_items:
                    raise RuntimeError("Belum ada gambar adegan storyboard yang siap dirender. Silakan generate gambar terlebih dahulu.")

                items_data = [
                    {
                        "id": it.id,
                        "file_path": resolved_path,
                        "start_time": it.start_time,
                        "end_time": it.end_time,
                        "duration": it.duration or 4.0,
                        "motion_effect": it.motion_effect or "zoom_in",
                        "script_text": it.script_text,
                    }
                    for it, resolved_path in valid_items
                ]

                if await is_cancelled(project.id, job_id=render_job_id):
                    raise TaskCancelledException("Rendering video dibatalkan oleh pengguna.")

                return await render_storyboard_video(
                    items=items_data,
                    audio_path=audio_path,
                    ass_subtitle_path=ass_file_path,
                    output_path=str(out_file),
                    aspect_ratio=project.aspect_ratio or "16:9",
                    resolution=project.resolution or "1080p",
                    watermark=project.watermark,
                    is_preview=(job.render_type == "preview"),
                    progress_callback=_progress,
                    heartbeat_callback=_heartbeat,
                    project_id=project.id,
                    job_id=render_job_id,
                )
            else:
                # Short video mode: Fetch timeline and source videos
                t_res = await db.execute(select(Timeline).where(Timeline.project_id == project.id))
                timeline = t_res.scalar_one_or_none()
                if not timeline or not timeline.clips:
                    raise RuntimeError("Timeline klip kosong. Harap lakukan pencocokan scene terlebih dahulu.")

                # Fetch source videos map
                v_res = await db.execute(select(SourceVideo).where(SourceVideo.project_id == project.id))
                source_videos_map = {v.id: v.file_path for v in v_res.scalars().all() if v.file_path}

                if await is_cancelled(project.id, job_id=render_job_id):
                    raise TaskCancelledException("Rendering video dibatalkan oleh pengguna.")

                return await render_timeline_video(
                    clips=timeline.clips,
                    source_videos_map=source_videos_map,
                    audio_path=audio_path,
                    ass_subtitle_path=ass_file_path,
                    output_path=str(out_file),
                    aspect_ratio=project.aspect_ratio,
                    resolution=project.resolution,
                    background_fill=project.background_fill,
                    watermark=project.watermark,
                    is_preview=(job.render_type == "preview"),
                    progress_callback=_progress,
                    heartbeat_callback=_heartbeat,
                    project_id=project.id,
                    job_id=render_job_id,
                )

        try:
            render_task = asyncio.create_task(_do_render())
            watchdog_task = asyncio.create_task(_watchdog())

            try:
                done, pending = await asyncio.wait(
                    [render_task, watchdog_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for t in pending:
                    t.cancel()
                    try:
                        await t
                    except (asyncio.CancelledError, Exception):
                        pass

                if watchdog_task in done and not watchdog_task.cancelled():
                    exc = watchdog_task.exception()
                    if exc:
                        raise exc

                final_mp4 = render_task.result()
            finally:
                if not watchdog_task.done():
                    watchdog_task.cancel()

            if await is_cancelled(project.id, job_id=render_job_id):
                Path(final_mp4).unlink(missing_ok=True)
                raise TaskCancelledException("Rendering video dibatalkan oleh pengguna.")

            # Generate poster thumbnail snapshot from the rendered video
            thumb_file = renders_dir / f"render_{job.render_type}_{job.id}_thumb.jpg"
            thumb_path_str: Optional[str] = None
            try:
                thumb_cmd = [
                    "ffmpeg", "-y",
                    "-ss", "00:00:00.500",
                    "-i", final_mp4,
                    "-vframes", "1",
                    "-q:v", "2",
                    str(thumb_file),
                ]
                proc = await asyncio.create_subprocess_exec(
                    *thumb_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await asyncio.wait_for(proc.communicate(), timeout=30.0)
                if not thumb_file.exists() or thumb_file.stat().st_size == 0:
                    fallback_cmd = [
                        "ffmpeg", "-y",
                        "-ss", "00:00:00.000",
                        "-i", final_mp4,
                        "-vframes", "1",
                        "-q:v", "2",
                        str(thumb_file),
                    ]
                    proc_fb = await asyncio.create_subprocess_exec(
                        *fallback_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    await asyncio.wait_for(proc_fb.communicate(), timeout=30.0)

                if thumb_file.exists() and thumb_file.stat().st_size > 0:
                    thumb_path_str = str(thumb_file)
            except Exception as te:
                log.warning("Could not generate render thumbnail for job %s: %s", job.id, te)

            job.status = "completed"
            job.progress = 100
            job.output_file_path = final_mp4
            job.thumbnail_path = thumb_path_str
            job.completed_at = datetime.utcnow()
            job.log_output = "Video berhasil dirender."
            await db.commit()

            await publish_project_event(
                project.id,
                task_type="render",
                status="success",
                progress=100,
                stage="completed",
                message=f"Video ({job.render_type}) berhasil dirender dan siap diputar!",
                data={
                    "job_id": render_job_id,
                    "render_type": job.render_type,
                    "output_url": storage.to_relative_url(final_mp4),
                    "thumbnail_url": storage.to_relative_url(thumb_path_str),
                },
            )

        except (TaskCancelledException, asyncio.CancelledError) as ce:
            log.info("Render job %s was cancelled or interrupted: %s", render_job_id, ce)
            job.status = "failed"
            job.error_message = "Rendering dibatalkan atau diinterupsi oleh sistem/pengguna"
            job.log_output = "Rendering video diinterupsi atau dibatalkan."
            job.completed_at = datetime.utcnow()
            await db.commit()

            await publish_project_event(
                project.id,
                task_type="render",
                status="error",
                progress=0,
                stage="cancelled",
                message="Rendering video dibatalkan atau diinterupsi.",
                error="Dibatalkan",
                data={"job_id": render_job_id},
            )
            return

        except TimeoutError as te:
            log.warning("Render job %s timed out / stuck: %s", render_job_id, te)
            job.status = "failed"
            job.error_message = str(te)
            job.log_output = f"Render timeout: {te}"
            job.completed_at = datetime.utcnow()
            await db.commit()

            await publish_project_event(
                project.id,
                task_type="render",
                status="error",
                progress=0,
                stage="timeout",
                message=f"Rendering video terhenti (Timeout): {str(te)}",
                error=str(te),
                data={"job_id": render_job_id},
            )
            return

        except BaseException as e:
            log.exception("Render job %s failed: %s", render_job_id, e)
            job.status = "failed"
            job.error_message = str(e)
            job.log_output = f"Error saat rendering: {e}"
            job.completed_at = datetime.utcnow()
            await db.commit()

            await publish_project_event(
                project.id,
                task_type="render",
                status="error",
                progress=0,
                stage="failed",
                message=f"Gagal saat rendering: {str(e)}",
                error=str(e),
                data={"job_id": render_job_id},
            )
            if not isinstance(e, Exception):
                raise


async def cleanup_stuck_render_jobs() -> None:
    """Mark any orphaned queued/rendering jobs from a previous crash/restart as failed."""
    try:
        async with SessionLocal() as db:
            res = await db.execute(
                select(RenderJob).where(RenderJob.status.in_(["rendering", "queued"]))
            )
            stuck_jobs = res.scalars().all()
            for job in stuck_jobs:
                job.status = "failed"
                job.error_message = "Proses rendering sebelumnya terputus akibat restart sistem. Silakan klik render ulang."
                job.log_output = "Rendering video terhenti karena sistem/worker dimulai ulang."
            if stuck_jobs:
                await db.commit()
                log.info("Cleaned up %d stuck render job(s) from previous run.", len(stuck_jobs))
    except Exception as e:
        log.warning("Could not cleanup stuck render jobs on startup: %s", e)
