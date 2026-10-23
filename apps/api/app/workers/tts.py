import logging
from typing import Any, Dict, Optional

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import publish_project_event
from app.core.security import decrypt_secret
from app.core.storage import storage
from app.models.config import ModelConfig
from app.models.narration import AudioTrack, Narration
from app.models.project import Scene
from app.models.timeline import Timeline
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.alignment import align_audio_with_text
from app.services.cancellation import (
    TaskCancelledException,
    is_cancelled,
)
from app.services.matching import match_scenes_to_segments
from app.services.storyboard import sync_storyboard_timing_from_alignment
from app.services.tts import estimate_tts_cost, generate_speech_audio, get_audio_duration

log = logging.getLogger(__name__)


async def generate_tts_and_align_job(
    ctx: Dict[str, Any],
    project_id: str,
    narration_id: str,
    voice: str,
    provider: str = "gemini",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    model: Optional[str] = None,
    language: Optional[str] = None,
) -> None:
    """Async task to generate TTS audio and run forced word alignment."""
    async with SessionLocal() as db:
        narration = await db.get(Narration, narration_id)
        if not narration or not narration.raw_text:
            return

        narration_lang = (language or getattr(narration, "language", None) or "id").strip().lower()
        narration.status = "tts_generating"
        await db.commit()

        clean_prov = provider.lower().strip()
        display_target = f"{model or voice}" if clean_prov in ("gemini", "elevenlabs", "runware") else voice
        await publish_project_event(
            project_id,
            task_type="tts_align",
            status="progress",
            progress=15,
            stage="tts_synthesizing",
            message=f"Mensintesis audio narasi AI dengan {provider.upper()} ({display_target})...",
            data={"narration_id": narration_id, "provider": provider, "voice": voice, "model": model},
        )

        audio_dir = storage.get_audio_dir(project_id)
        audio_file = audio_dir / f"tts_{narration.id}.mp3"

        try:
            if await is_cancelled(project_id):
                raise TaskCancelledException("Pembuatan suara narasi dibatalkan oleh pengguna.")

            # Retrieve active ModelConfig for decrypted API key & model
            res_cfg = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
            cfg = res_cfg.scalar_one_or_none()
            api_key = None
            if clean_prov == "elevenlabs":
                tts_model = model or (getattr(cfg, "elevenlabs_model", "eleven_multilingual_v2") if cfg else "eleven_multilingual_v2")
                if cfg and cfg.elevenlabs_api_key_encrypted:
                    api_key = decrypt_secret(cfg.elevenlabs_api_key_encrypted)
            elif clean_prov == "runware":
                tts_model = model or (getattr(cfg, "runware_tts_model", "fishaudio:s2.1@pro") if cfg else "fishaudio:s2.1@pro")
                if cfg:
                    if getattr(cfg, "runware_api_key_encrypted", None):
                        api_key = decrypt_secret(cfg.runware_api_key_encrypted)
                    elif cfg.image_api_key_encrypted:
                        api_key = decrypt_secret(cfg.image_api_key_encrypted)
            elif clean_prov == "gemini":
                tts_model = model or "gemini-2.5-flash-preview-tts"
                if cfg:
                    if cfg.tts_api_key_encrypted:
                        api_key = decrypt_secret(cfg.tts_api_key_encrypted)
                    elif cfg.api_key_encrypted:
                        api_key = decrypt_secret(cfg.api_key_encrypted)
                    if not model and cfg.tts_provider and cfg.tts_provider.startswith("gemini-"):
                        tts_model = cfg.tts_provider
            else:
                tts_model = model or "edge"

            # Step 1: TTS generation with per-segment chunking to prevent silent segment 2
            duration = await generate_speech_audio(
                text=narration.raw_text,
                output_path=str(audio_file),
                provider=provider,
                voice=voice,
                rate=rate,
                pitch=pitch,
                api_key=api_key,
                model=tts_model,
                segments=narration.segments,
                language=narration_lang,
            )

            actual_provider = provider
            actual_voice = voice

            if await is_cancelled(project_id):
                raise TaskCancelledException("Pembuatan suara narasi dibatalkan oleh pengguna.")

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
            target_segments = narration.segments
            if not target_segments:
                from app.services.narrative import split_into_sentence_segments
                target_segments = split_into_sentence_segments(narration.raw_text or "")

            aligned_segments = await align_audio_with_text(
                audio_path=str(audio_file),
                segments=target_segments,
                total_audio_duration_sec=duration,
                language=narration_lang,
            )

            narration.segments = aligned_segments
            narration.status = "aligned"

            # Cost estimation
            cost_est = estimate_tts_cost(narration.raw_text, actual_provider)

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
                    provider=actual_provider,
                    voice=actual_voice,
                    rate=rate,
                    pitch=pitch,
                    file_path=str(audio_file),
                    duration=duration,
                    estimated_cost=cost_est.estimated_cost_usd,
                    status="ready",
                )
                db.add(track)
            else:
                track.provider = actual_provider
                track.voice = actual_voice
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
                try:
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
                except Exception as scene_err:
                    log.warning("Scene matching after TTS failed (non-fatal): %s", scene_err)

            # Auto-sync storyboard item timing if this project has storyboard items
            try:
                await sync_storyboard_timing_from_alignment(db, project_id, aligned_segments)
            except Exception as sb_err:
                log.warning("Auto sync storyboard timing after TTS failed (non-fatal): %s", sb_err)

            await publish_project_event(
                project_id,
                task_type="tts_align",
                status="success",
                progress=100,
                stage="completed",
                message=(
                    "Suara, transkrip karaoke kata, dan susunan klip timeline siap!"
                    + (" ⚠️ Embedding fallback hash — pencocokan scene ke narasi kurang akurat." if getattr(adapter, "_embedding_degraded", False) else "")
                ),
                data={
                    "narration_id": narration_id,
                    "duration": duration,
                    "clips_count": clips_count,
                    "embedding_degraded": bool(getattr(adapter, "_embedding_degraded", False)),
                },
            )

        except TaskCancelledException as ce:
            log.info("TTS/Alignment was cancelled for narration %s: %s", narration_id, ce)
            narration.status = "failed"
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
                stage="cancelled",
                message="Pembuatan suara dan alignment dibatalkan oleh pengguna.",
                error="Dibatalkan",
                data={"narration_id": narration_id},
            )
            return

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
            partial_dur = 0.0
            if failed_track:
                failed_track.status = "failed"
                # If partial audio was written and preserved, record its file_path and partial duration
                if audio_file.exists() and audio_file.stat().st_size > 1000:
                    try:
                        partial_dur = await get_audio_duration(str(audio_file))
                        failed_track.duration = partial_dur
                        failed_track.file_path = str(audio_file)
                    except Exception:
                        pass
            await db.commit()

            err_msg = str(e)
            if partial_dur > 0:
                err_msg += f" (Audio terpotong: {partial_dur:.1f} detik tersimpan)"

            await publish_project_event(
                project_id,
                task_type="tts_align",
                status="error",
                progress=0,
                stage="failed",
                message=f"Gagal memproses suara: {err_msg}",
                error=err_msg,
                data={"narration_id": narration_id, "partial_duration": partial_dur},
            )
