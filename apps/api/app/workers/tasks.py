import asyncio
import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from sqlalchemy import select, delete
from app.core.db import SessionLocal
from app.core.storage import storage
from app.core.config import get_settings
from app.models.project import Project, SourceVideo, Scene, RenderJob
from app.models.narration import Narration, AudioTrack
from app.models.timeline import Timeline, SubtitleStyle
from app.models.config import ModelConfig
from app.core.security import decrypt_secret
from app.core.events import publish_project_event
from app.services.ytdlp import download_video, get_video_info
from app.services.scene_detector import detect_scenes, get_video_metadata
from app.services.ai_adapters.factory import get_active_llm_adapter, get_active_vision_adapter
from app.services.vision_tagger import analyze_scenes_batch
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
            )
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



async def detect_scenes_job(ctx: Dict[str, Any], video_id: str) -> None:
    """Async background task to run PySceneDetect on a source video."""
    async with SessionLocal() as db:
        video = await db.get(SourceVideo, video_id)
        if not video or not video.file_path:
            return

        video.status = "processing"
        video.progress = 10
        await db.commit()

        await publish_project_event(
            video.project_id,
            task_type="scene_detect",
            status="progress",
            progress=10,
            stage="detecting_cuts",
            message=f"Mendeteksi transisi & pergantian scene visual pada '{video.filename}'...",
            data={"video_id": video_id},
        )

        scene_out_dir = storage.get_scenes_dir(video.project_id)

        try:
            # Capture old scene rows so their thumbnails can be cleaned from disk
            old_res = await db.execute(
                select(Scene.thumbnail_path).where(Scene.source_video_id == video_id)
            )
            old_thumbnails = [tp for (tp,) in old_res.all() if tp]

            # Bersihkan scene lama untuk video ini jika re-detect
            await db.execute(delete(Scene).where(Scene.source_video_id == video_id))
            await db.commit()

            scenes_data = await detect_scenes(video.file_path, str(scene_out_dir))
            total_scenes = len(scenes_data)

            # Old thumbnails no longer referenced -> delete from disk
            for tp in old_thumbnails:
                p = Path(tp)
                if not p.exists():
                    p = storage.to_absolute_path(tp)
                if p and p.exists():
                    try:
                        p.unlink(missing_ok=True)
                    except Exception:
                        pass

            adapter = await get_active_vision_adapter(db)
            vision_name = getattr(adapter, "vision_model", "AI Vision")

            await publish_project_event(
                video.project_id,
                task_type="scene_detect",
                status="progress",
                progress=25,
                stage="vision_analysis",
                message=f"{total_scenes} scene terdeteksi. Memulai tagging visual dengan {vision_name}...",
                data={"video_id": video_id, "total_scenes": total_scenes},
            )

            # Batch besar (24) untuk panggilan batch-API Gemini (1 panggilan per batch),
            # BATCH_CONCURRENCY batch berjalan paralel -> total throughput naik ~Nx
            BATCH_SIZE = 24
            BATCH_CONCURRENCY = 4
            processed_count = 0
            batches = [scenes_data[i : i + BATCH_SIZE] for i in range(0, total_scenes, BATCH_SIZE)]

            for bi in range(0, len(batches), BATCH_CONCURRENCY):
                wave = batches[bi : bi + BATCH_CONCURRENCY]

                # Analisis beberapa batch secara paralel
                wave_results = await asyncio.gather(
                    *[analyze_scenes_batch(adapter, batch_slice) for batch_slice in wave]
                )

                for batch_slice, batch_analysis in zip(wave, wave_results):
                    for item, (description, tags, embedding, analysis) in zip(batch_slice, batch_analysis):
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
                            analysis=analysis,
                            embedding=embedding,
                            status="ready",
                        )
                        db.add(sc)

                await db.flush()
                processed_count += sum(len(b) for b in wave)

                # Report incremental progress for vision analysis
                pct = 25 + int((processed_count / max(1, total_scenes)) * 70)
                await publish_project_event(
                    video.project_id,
                    task_type="scene_detect",
                    status="progress",
                    progress=pct,
                    stage="vision_tagging",
                    message=f"Menganalisis visual AI scene {min(processed_count, total_scenes)} dari {total_scenes}...",
                    data={"video_id": video_id, "current": min(processed_count, total_scenes), "total": total_scenes},
                )

            video.status = "ready"
            video.progress = 100
            await db.commit()

            await publish_project_event(
                video.project_id,
                task_type="scene_detect",
                status="success",
                progress=100,
                stage="completed",
                message=(
                    f"Deteksi scene selesai! {total_scenes} scene visual siap digunakan di Media Pool."
                    + (" \u26a0\ufe0f Embedding fallback hash \u2014 kualitas matching scene turun." if getattr(adapter, "_embedding_degraded", False) else "")
                ),
                data={
                    "video_id": video_id,
                    "total_scenes": total_scenes,
                    "embedding_degraded": bool(getattr(adapter, "_embedding_degraded", False)),
                },
            )

        except Exception as e:
            log.exception("Scene detection failed for video %s", video_id)
            video.status = "failed"
            video.error_message = str(e)
            await db.commit()

            await publish_project_event(
                video.project_id,
                task_type="scene_detect",
                status="error",
                progress=0,
                stage="failed",
                message=f"Gagal mendeteksi/menganalisis scene: {str(e)}",
                error=str(e),
                data={"video_id": video_id},
            )



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

        await publish_project_event(
            project_id,
            task_type="tts_align",
            status="progress",
            progress=15,
            stage="tts_synthesizing",
            message=f"Mensintesis audio narasi AI dengan {provider.upper()} ({voice})...",
            data={"narration_id": narration_id, "provider": provider, "voice": voice},
        )

        audio_dir = storage.get_audio_dir(project_id)
        audio_file = audio_dir / f"tts_{narration.id}.mp3"

        try:
            # Retrieve active ModelConfig for decrypted API key & model
            res_cfg = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
            cfg = res_cfg.scalar_one_or_none()
            api_key = None
            tts_model = "gemini-2.5-flash"
            if cfg:
                if cfg.tts_api_key_encrypted:
                    api_key = decrypt_secret(cfg.tts_api_key_encrypted)
                elif cfg.api_key_encrypted:
                    api_key = decrypt_secret(cfg.api_key_encrypted)
                if cfg.tts_provider and cfg.tts_provider != "gemini" and cfg.tts_provider != "edge":
                    tts_model = cfg.tts_provider

            # Step 1: TTS generation
            duration = await generate_speech_audio(
                text=narration.raw_text,
                output_path=str(audio_file),
                provider=provider,
                voice=voice,
                rate=rate,
                pitch=pitch,
                api_key=api_key,
                model=tts_model,
            )

            await publish_project_event(
                project_id,
                task_type="tts_align",
                status="progress",
                progress=50,
                stage="forced_alignment",
                message="Audio selesai. Menjalankan forced word-level alignment & timestamping...",
                data={"narration_id": narration_id, "duration": duration},
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

            # Find existing generating AudioTrack or create new
            track_res = await db.execute(
                select(AudioTrack)
                .where(AudioTrack.project_id == project_id, AudioTrack.narration_id == narration.id)
                .order_by(AudioTrack.created_at.desc())
            )
            track = track_res.scalars().first()
            if not track:
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
            else:
                track.provider = provider
                track.voice = voice
                track.rate = rate
                track.pitch = pitch
                track.file_path = str(audio_file)
                track.duration = duration
                track.estimated_cost = cost_est.estimated_cost_usd
                track.status = "ready"

            await db.commit()

            await publish_project_event(
                project_id,
                task_type="tts_align",
                status="progress",
                progress=75,
                stage="matching_scenes",
                message="Mencocokkan segmen naskah audio dengan klip scene visual...",
                data={"narration_id": narration_id, "duration": duration},
            )

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

            clips_count = 0
            if all_scenes:
                clips = await match_scenes_to_segments(
                    adapter,
                    aligned_segments,
                    all_scenes,
                    total_audio_duration_sec=duration,
                )
                clips_count = len(clips)
                t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
                timeline = t_res.scalar_one_or_none()
                if not timeline:
                    timeline = Timeline(project_id=project_id, clips=clips, total_duration=duration)
                    db.add(timeline)
                else:
                    timeline.clips = clips
                    timeline.total_duration = duration
                await db.commit()

            await publish_project_event(
                project_id,
                task_type="tts_align",
                status="success",
                progress=100,
                stage="completed",
                message=(
                    "Suara, transkrip karaoke kata, dan susunan klip timeline siap!"
                    + (" \u26a0\ufe0f Embedding fallback hash \u2014 pencocokan scene ke narasi kurang akurat." if getattr(adapter, "_embedding_degraded", False) else "")
                ),
                data={
                    "narration_id": narration_id,
                    "duration": duration,
                    "clips_count": clips_count,
                    "embedding_degraded": bool(getattr(adapter, "_embedding_degraded", False)),
                },
            )

        except Exception as e:
            log.exception("TTS/Alignment failed for narration %s", narration_id)
            narration.status = "failed"
            # Update any existing audio track to failed status
            t_res = await db.execute(
                select(AudioTrack)
                .where(AudioTrack.project_id == project_id, AudioTrack.narration_id == narration.id)
                .order_by(AudioTrack.created_at.desc())
            )
            failed_track = t_res.scalars().first()
            if failed_track:
                failed_track.status = "failed"
            await db.commit()

            await publish_project_event(
                project_id,
                task_type="tts_align",
                status="error",
                progress=0,
                stage="failed",
                message=f"Gagal memproses suara/alignment: {str(e)}",
                error=str(e),
                data={"narration_id": narration_id},
            )



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

        # Fetch timeline
        t_res = await db.execute(select(Timeline).where(Timeline.project_id == project.id))
        timeline = t_res.scalar_one_or_none()
        if not timeline or not timeline.clips:
            job.status = "failed"
            job.error_message = "Timeline klip kosong. Harap lakukan pencocokan scene terlebih dahulu."
            await db.commit()
            await publish_project_event(
                project.id,
                task_type="render",
                status="error",
                progress=0,
                stage="failed",
                message="Timeline klip kosong. Lakukan pencocokan scene terlebih dahulu.",
                error="Timeline klip kosong",
                data={"job_id": render_job_id},
            )
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
            "highlight_animation": style.highlight_animation if style else "scale",
            "scale_factor": style.scale_factor if (style and style.scale_factor is not None) else 1.5,
            "emoji_enabled": style.emoji_enabled if style else True,
        }

        ass_file_path = None
        if narration and narration.segments:
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

        async def _progress(pct: int, msg: str):
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
                },
            )

        except Exception as e:
            log.exception("Render job %s failed", render_job_id)
            job.status = "failed"
            job.error_message = str(e)
            job.log_output = f"Error saat rendering: {e}"
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


async def transcribe_scenes_job(
    ctx: Dict[str, Any],
    project_id: str,
    video_id: Optional[str] = None,
    language: Optional[str] = None,
) -> None:
    """Async background task to transcribe speech in project scenes using faster-whisper."""
    from app.services.transcriber import transcribe_video_scenes

    async with SessionLocal() as db:
        query = select(SourceVideo).where(SourceVideo.project_id == project_id)
        if video_id:
            query = query.where(SourceVideo.id == video_id)
        res = await db.execute(query)
        videos = res.scalars().all()

        if not videos:
            return

        total_vids = len(videos)
        await publish_project_event(
            project_id,
            task_type="scene_transcribe",
            status="progress",
            progress=10,
            stage="starting",
            message="Memulai ekstraksi audio & transkripsi dialog scene...",
            data={"total_videos": total_vids},
        )

        total_updated = 0
        for v_idx, video in enumerate(videos):
            if not video.file_path or not os.path.exists(video.file_path):
                continue

            # Fetch scenes for this video
            s_res = await db.execute(
                select(Scene).where(Scene.source_video_id == video.id).order_by(Scene.scene_index.asc())
            )
            scenes = s_res.scalars().all()
            if not scenes:
                continue

            scenes_dict = [
                {
                    "id": s.id,
                    "scene_index": s.scene_index,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                }
                for s in scenes
            ]

            pct = 15 + int((v_idx / max(1, total_vids)) * 75)
            await publish_project_event(
                project_id,
                task_type="scene_transcribe",
                status="progress",
                progress=pct,
                stage="transcribing",
                message=f"Mentranskripsikan dialog audio pada '{video.filename}'...",
                data={"video_id": video.id, "current": v_idx + 1, "total": total_vids},
            )

            try:
                transcript_map = await transcribe_video_scenes(
                    video.file_path,
                    scenes_dict,
                    language=language,
                )

                updated = [s for s in scenes if s.id in transcript_map]
                for s in updated:
                    s.transcript = transcript_map[s.id]
                total_updated += len(updated)

                # Re-embed scene yang dapat transcript agar embedding memuat dialog.
                # (Vision analysis berjalan SEBELUM transcribe → embedding lama tanpa dialog.)
                if updated:
                    from app.services.vision_tagger import build_scene_embedding_text

                    adapter = await get_active_vision_adapter(db)
                    embed_texts = [
                        build_scene_embedding_text(s.description, s.tags, s.transcript)
                        for s in updated
                    ]
                    embeddings = await asyncio.gather(
                        *[adapter.generate_embedding(t) for t in embed_texts],
                        return_exceptions=True,
                    )
                    re_embedded = 0
                    for s, emb in zip(updated, embeddings):
                        if isinstance(emb, Exception) or not emb:
                            continue
                        s.embedding = emb
                        re_embedded += 1
                    if re_embedded:
                        log.info(
                            "Re-embedded %d scenes with dialog transcript for video %s",
                            re_embedded, video.id,
                        )

                await db.commit()
            except Exception as e:
                log.exception("Error transcribing scenes for video %s: %s", video.id, e)

        await publish_project_event(
            project_id,
            task_type="scene_transcribe",
            status="success",
            progress=100,
            stage="completed",
            message=f"Transkripsi dialog selesai! {total_updated} scene berhasil diberi label percakapan.",
            data={"total_updated": total_updated},
        )

