import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from sqlalchemy import select
from app.core.db import SessionLocal
from app.core.storage import storage
from app.models.project import Project, SourceVideo, Scene, RenderJob
from app.models.narration import Narration, AudioTrack
from app.models.timeline import Timeline, SubtitleStyle
from app.services.ytdlp import download_video
from app.services.scene_detector import detect_scenes, get_video_metadata
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.vision_tagger import analyze_scene
from app.services.tts import generate_speech_audio, estimate_tts_cost
from app.services.alignment import align_audio_with_text
from app.services.matching import match_scenes_to_segments
from app.services.subtitle_ass import generate_ass_subtitles
from app.services.renderer import render_timeline_video

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

        out_dir = storage.get_videos_dir(video.project_id)
        out_file = out_dir / f"yt_{video.id}.mp4"

        async def _progress(pct: int):
            async with SessionLocal() as inner_db:
                v = await inner_db.get(SourceVideo, video_id)
                if v:
                    v.progress = max(5, min(pct, 95))
                    await inner_db.commit()

        try:
            downloaded_path = await download_video(
                url=video.youtube_url,
                output_path=str(out_file),
                format_id=video.selected_resolution,
                progress_callback=_progress,
            )
            meta = await get_video_metadata(downloaded_path)

            video.file_path = downloaded_path
            video.duration = meta["duration"]
            video.width = meta["width"]
            video.height = meta["height"]
            video.fps = meta["fps"]
            video.status = "ready"
            video.progress = 100
            await db.commit()

            # Auto trigger scene detection for downloaded video
            await detect_scenes_job(ctx, video_id)

        except Exception as e:
            log.exception("YouTube download failed for %s", video_id)
            video.status = "failed"
            video.error_message = str(e)
            await db.commit()


async def detect_scenes_job(ctx: Dict[str, Any], video_id: str) -> None:
    """Async background task to run PySceneDetect on a source video."""
    async with SessionLocal() as db:
        video = await db.get(SourceVideo, video_id)
        if not video or not video.file_path:
            return

        video.status = "processing"
        await db.commit()

        scene_out_dir = storage.get_scenes_dir(video.project_id)

        try:
            scenes_data = await detect_scenes(video.file_path, str(scene_out_dir))

            adapter = await get_active_llm_adapter(db)

            for item in scenes_data:
                # Analyze keyframes
                description, tags, embedding = await analyze_scene(
                    adapter, item.get("keyframe_paths", [item["thumbnail_path"]])
                )

                sc = Scene(
                    project_id=video.project_id,
                    source_video_id=video.id,
                    scene_index=item["scene_index"],
                    start_time=item["start_time"],
                    end_time=item["end_time"],
                    duration=item["duration"],
                    thumbnail_path=item["thumbnail_path"],
                    description=description,
                    tags=tags,
                    embedding=embedding,
                    status="ready",
                )
                db.add(sc)

            video.status = "ready"
            video.progress = 100
            await db.commit()

        except Exception as e:
            log.exception("Scene detection failed for video %s", video_id)
            video.status = "failed"
            video.error_message = str(e)
            await db.commit()


async def generate_tts_and_align_job(
    ctx: Dict[str, Any],
    project_id: str,
    narration_id: str,
    voice: str,
    provider: str = "gemini",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> None:
    """Async task to generate TTS audio and run forced word alignment."""
    async with SessionLocal() as db:
        narration = await db.get(Narration, narration_id)
        if not narration or not narration.raw_text:
            return

        narration.status = "tts_generating"
        await db.commit()

        audio_dir = storage.get_audio_dir(project_id)
        audio_file = audio_dir / f"tts_{narration.id}.mp3"

        try:
            # Step 1: TTS generation
            duration = await generate_speech_audio(
                text=narration.raw_text,
                output_path=str(audio_file),
                provider=provider,
                voice=voice,
                rate=rate,
                pitch=pitch,
            )

            # Step 2: Alignment
            aligned_segments = await align_audio_with_text(
                audio_path=str(audio_file),
                segments=narration.segments,
                total_audio_duration_sec=duration,
            )

            narration.segments = aligned_segments
            narration.status = "aligned"

            # Cost estimation
            cost_est = estimate_tts_cost(narration.raw_text, provider)

            track = AudioTrack(
                project_id=project_id,
                narration_id=narration.id,
                provider=provider,
                voice=voice,
                rate=rate,
                pitch=pitch,
                file_path=str(audio_file),
                duration=duration,
                estimated_cost=cost_est.estimated_cost_usd,
                status="ready",
            )
            db.add(track)
            await db.commit()

            # Auto create / update initial timeline matching
            adapter = await get_active_llm_adapter(db)
            scenes_res = await db.execute(select(Scene).where(Scene.project_id == project_id))
            all_scenes = [
                {
                    "id": s.id,
                    "source_video_id": s.source_video_id,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "duration": s.duration,
                    "thumbnail_url": storage.to_relative_url(s.thumbnail_path),
                    "description": s.description,
                    "embedding": s.embedding,
                }
                for s in scenes_res.scalars().all()
            ]

            if all_scenes:
                clips = await match_scenes_to_segments(adapter, aligned_segments, all_scenes)
                t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
                timeline = t_res.scalar_one_or_none()
                if not timeline:
                    timeline = Timeline(project_id=project_id, clips=clips, total_duration=duration)
                    db.add(timeline)
                else:
                    timeline.clips = clips
                    timeline.total_duration = duration
                await db.commit()

        except Exception as e:
            log.exception("TTS/Alignment failed for narration %s", narration_id)
            narration.status = "failed"
            await db.commit()


async def render_video_job(ctx: Dict[str, Any], render_job_id: str) -> None:
    """Async background task to run FFmpeg rendering."""
    async with SessionLocal() as db:
        job = await db.get(RenderJob, render_job_id)
        if not job:
            return

        project = await db.get(Project, job.project_id)
        if not project:
            return

        job.status = "rendering"
        job.progress = 5
        job.log_output = "Memulai proses rendering..."
        await db.commit()

        renders_dir = storage.get_renders_dir(project.id)
        out_ext = "mp4"
        out_file = renders_dir / f"render_{job.render_type}_{job.id}.{out_ext}"

        # Fetch timeline
        t_res = await db.execute(select(Timeline).where(Timeline.project_id == project.id))
        timeline = t_res.scalar_one_or_none()
        if not timeline or not timeline.clips:
            job.status = "failed"
            job.error_message = "Timeline klip kosong. Harap lakukan pencocokan scene terlebih dahulu."
            await db.commit()
            return

        # Fetch source videos map
        v_res = await db.execute(select(SourceVideo).where(SourceVideo.project_id == project.id))
        source_videos_map = {v.id: v.file_path for v in v_res.scalars().all() if v.file_path}

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
            "font_family": style.font_family if style else "Montserrat",
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
            "display_mode": style.display_mode if style else "per_word",
            "burst_word_count": style.burst_word_count if style else 2,
            "highlight_animation": style.highlight_animation if style else "scale",
            "emoji_enabled": style.emoji_enabled if style else True,
        }

        ass_file_path = None
        if narration and narration.segments:
            ass_content = generate_ass_subtitles(narration.segments, style_dict)
            ass_file = renders_dir / f"subtitles_{job.id}.ass"
            with open(ass_file, "w", encoding="utf-8") as f:
                f.write(ass_content)
            ass_file_path = str(ass_file)

        async def _progress(pct: int, msg: str):
            async with SessionLocal() as inner_db:
                j = await inner_db.get(RenderJob, render_job_id)
                if j:
                    j.progress = pct
                    j.log_output = msg
                    await inner_db.commit()

        try:
            final_mp4 = await render_timeline_video(
                clips=timeline.clips,
                source_videos_map=source_videos_map,
                audio_path=audio_path,
                ass_subtitle_path=ass_file_path,
                output_path=str(out_file),
                aspect_ratio=project.aspect_ratio,
                resolution=project.resolution,
                background_fill=project.background_fill,
                is_preview=(job.render_type == "preview"),
                progress_callback=_progress,
            )

            job.status = "completed"
            job.progress = 100
            job.output_file_path = final_mp4
            job.completed_at = datetime.utcnow()
            job.log_output = "Video berhasil dirender."
            await db.commit()

        except Exception as e:
            log.exception("Render job %s failed", render_job_id)
            job.status = "failed"
            job.error_message = str(e)
            job.log_output = f"Error saat rendering: {e}"
            await db.commit()
