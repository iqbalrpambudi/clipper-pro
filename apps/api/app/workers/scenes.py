import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy import delete, select

from app.core.db import SessionLocal
from app.core.events import publish_project_event
from app.core.storage import storage
from app.models.project import Scene, SourceVideo
from app.services.ai_adapters.factory import get_active_vision_adapter
from app.services.cancellation import (
    TaskCancelledException,
    is_cancelled,
)
from app.services.scene_detector import detect_scenes
from app.services.vision_tagger import analyze_scenes_batch

log = logging.getLogger(__name__)


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
            if await is_cancelled(video.project_id, video_id=video_id):
                raise TaskCancelledException("Deteksi scene dibatalkan oleh pengguna.")

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

            if await is_cancelled(video.project_id, video_id=video_id):
                raise TaskCancelledException("Deteksi scene dibatalkan oleh pengguna.")

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
                if await is_cancelled(video.project_id, video_id=video_id):
                    raise TaskCancelledException("Analisis visual scene dibatalkan oleh pengguna.")

                wave = batches[bi : bi + BATCH_CONCURRENCY]

                # Analisis beberapa batch secara paralel
                wave_results = await asyncio.gather(
                    *[analyze_scenes_batch(adapter, batch_slice) for batch_slice in wave]
                )

                for batch_slice, batch_analysis in zip(wave, wave_results, strict=False):
                    for item, (description, tags, embedding, analysis) in zip(batch_slice, batch_analysis, strict=False):
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

            if await is_cancelled(video.project_id, video_id=video_id):
                raise TaskCancelledException("Deteksi visual scene dibatalkan oleh pengguna.")

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
                    + (" ⚠️ Embedding fallback hash — kualitas matching scene turun." if getattr(adapter, "_embedding_degraded", False) else "")
                ),
                data={
                    "video_id": video_id,
                    "total_scenes": total_scenes,
                    "embedding_degraded": bool(getattr(adapter, "_embedding_degraded", False)),
                },
            )

        except TaskCancelledException as ce:
            log.info("Scene detection cancelled for %s: %s", video_id, ce)
            video.status = "failed"
            video.error_message = "Analisis scene dibatalkan oleh pengguna"
            await db.commit()

            await publish_project_event(
                video.project_id,
                task_type="scene_detect",
                status="error",
                progress=0,
                stage="cancelled",
                message="Analisis visual scene dibatalkan oleh pengguna.",
                error="Dibatalkan",
                data={"video_id": video_id},
            )
            return

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
                    for s, emb in zip(updated, embeddings, strict=False):
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
