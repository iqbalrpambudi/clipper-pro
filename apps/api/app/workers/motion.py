import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import publish_project_event
from app.models.motion import MotionScene
from app.models.project import Project
from app.services.cancellation import (
    TaskCancelledException,
    clear_cancellation,
    is_cancelled,
)
from app.services.motion_director import generate_single_motion_scene_code

log = logging.getLogger(__name__)


async def generate_motion_scenes_job(
    ctx: Dict[str, Any],
    project_id: str,
    only_pending: bool = False,
    theme_id: Optional[str] = None,
    style_instructions: Optional[str] = None,
) -> None:
    """Background worker to synthesize bespoke React/Remotion TSX code for MotionScenes."""
    await clear_cancellation(project_id=project_id)

    async with SessionLocal() as db:
        proj = await db.get(Project, project_id)
        if not proj:
            return

        if theme_id:
            world_cfg = dict(proj.world_setting or {})
            world_cfg["motion_theme"] = theme_id
            proj.world_setting = world_cfg
            await db.commit()

        res = await db.execute(
            select(MotionScene)
            .where(MotionScene.project_id == project_id)
            .order_by(MotionScene.order_index.asc())
        )
        all_scenes = list(res.scalars().all())
        if not all_scenes:
            await publish_project_event(
                project_id,
                task_type="motion_generate",
                status="error",
                progress=0,
                stage="empty",
                message="Belum ada adegan motion untuk digenerate.",
                error="Scene kosong",
            )
            return

        targets = [
            s
            for s in all_scenes
            if not only_pending or s.status in ("pending", "failed") or not s.component_code
        ]
        if not targets:
            await publish_project_event(
                project_id,
                task_type="motion_generate",
                status="success",
                progress=100,
                stage="completed",
                message="Semua kode animasi React/Remotion sudah siap!",
            )
            return

        for s in targets:
            s.status = "generating"
            s.error_message = None
        await db.commit()

        total_targets = len(targets)
        total_all = len(all_scenes)
        archetype_by_idx = {s.order_index: s.archetype for s in all_scenes}

        await publish_project_event(
            project_id,
            task_type="motion_generate",
            status="progress",
            progress=6,
            stage="synthesizing_tsx",
            message=f"Memulai sintesis kode React/Remotion untuk {total_targets} adegan...",
        )

    sem = asyncio.Semaphore(2)
    completed = 0
    failed = 0
    last_error: Optional[str] = None

    async def _process_one(scene_id: str, order_idx: int, prev_arch: Optional[str]):
        nonlocal completed, failed, last_error
        async with sem:
            if await is_cancelled(project_id):
                raise TaskCancelledException("Sintesis animasi dibatalkan oleh pengguna.")

            async with SessionLocal() as task_db:
                p = await task_db.get(Project, project_id)
                sc = await task_db.get(MotionScene, scene_id)
                if not p or not sc:
                    return

                try:
                    tsx_code = await generate_single_motion_scene_code(
                        db=task_db,
                        project=p,
                        scene=sc,
                        total_scenes=total_all,
                        prev_archetype=prev_arch,
                        theme_id=theme_id,
                        style_instructions=style_instructions,
                    )
                    sc.component_code = tsx_code
                    sc.status = "ready"
                    sc.error_message = None
                    sc.updated_at = datetime.utcnow()
                    await task_db.commit()
                    completed += 1
                except Exception as exc:
                    log.exception("Failed generating motion TSX for scene %s: %s", scene_id, exc)
                    last_error = str(exc)
                    sc.status = "failed"
                    sc.error_message = str(exc)
                    sc.updated_at = datetime.utcnow()
                    await task_db.commit()
                    failed += 1

                done_so_far = completed + failed
                pct = min(96, 8 + int((done_so_far / total_targets) * 88))
                await publish_project_event(
                    project_id,
                    task_type="motion_generate",
                    status="progress",
                    progress=pct,
                    stage="synthesizing_tsx",
                    message=f"Selesai merancang kode animasi adegan {done_so_far}/{total_targets} ({sc.title or f'Scene {order_idx + 1}'})...",
                    data={"scene_id": scene_id, "completed": completed, "total": total_targets},
                )

    try:
        await asyncio.gather(
            *[
                _process_one(
                    s.id,
                    s.order_index,
                    archetype_by_idx.get(s.order_index - 1),
                )
                for s in targets
            ]
        )

        if failed > 0 and completed == 0:
            err_msg = last_error or "Gagal men-generate kode animasi."
            if any(k in err_msg.lower() for k in ["api key", "unauthorized", "401", "quota", "forbidden"]):
                user_friendly_err = "Periksa konfigurasi API Key LLM Anda di menu Pengaturan."
            else:
                user_friendly_err = f"Gagal menghasilkan adegan: {err_msg}"

            await publish_project_event(
                project_id,
                task_type="motion_generate",
                status="error",
                progress=0,
                stage="failed",
                message=f"Gagal men-generate kode animasi ({failed} gagal).",
                error=user_friendly_err,
            )
        else:
            msg = (
                f"Berhasil menyusun {completed} komponen animasi React/Remotion!"
                if failed == 0
                else f"Selesai: {completed} animasi siap, {failed} gagal."
            )
            await publish_project_event(
                project_id,
                task_type="motion_generate",
                status="success",
                progress=100,
                stage="completed",
                message=msg,
                data={"completed": completed, "failed": failed},
            )

    except (TaskCancelledException, asyncio.CancelledError):
        async with SessionLocal() as cancel_db:
            res_c = await cancel_db.execute(
                select(MotionScene).where(
                    MotionScene.project_id == project_id,
                    MotionScene.status == "generating",
                )
            )
            for sc in res_c.scalars().all():
                sc.status = "ready" if sc.component_code else "pending"
            await cancel_db.commit()

        await publish_project_event(
            project_id,
            task_type="motion_generate",
            status="error",
            progress=0,
            stage="cancelled",
            message="Sintesis kode animasi dibatalkan oleh pengguna.",
            error="Dibatalkan",
        )

