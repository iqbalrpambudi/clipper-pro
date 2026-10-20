import asyncio
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.events import publish_project_event
from app.core.security import decrypt_secret
from app.models.config import ModelConfig
from app.models.project import Project
from app.models.storyboard import StoryboardItem
from app.services.cancellation import (
    TaskCancelledException,
    is_cancelled,
)
from app.services.image_gen import generate_single_image
from app.services.image_studio import get_active_image_preset
from app.services.storyboard import resolve_prompt_variables

log = logging.getLogger(__name__)


async def generate_storyboard_images_job(
    ctx: Dict[str, Any],
    project_id: str,
    item_ids: Optional[List[str]] = None,
) -> None:
    """Async background task to generate storyboard illustrations via AI image provider."""
    async with SessionLocal() as db:
        proj = await db.get(Project, project_id)
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()

        base_url = cfg.image_base_url if cfg else None
        api_key = decrypt_secret(cfg.image_api_key_encrypted) if (cfg and cfg.image_api_key_encrypted) else None
        model = cfg.image_model if cfg else "dall-e-3"
        active_preset = await get_active_image_preset(db)
        style_prompt = active_preset.master_prompt if active_preset else (cfg.image_system_prompt if cfg else None)

        stmt = select(StoryboardItem).where(StoryboardItem.project_id == project_id)
        if item_ids:
            stmt = stmt.where(StoryboardItem.id.in_(item_ids))
        else:
            stmt = stmt.where((StoryboardItem.status != "ready") | (StoryboardItem.file_path.is_(None)))

        stmt = stmt.order_by(StoryboardItem.order_index.asc())
        items_res = await db.execute(stmt)
        items = list(items_res.scalars().all())
        total_items = len(items)

        if total_items == 0:
            await publish_project_event(
                project_id,
                task_type="storyboard_images",
                status="success",
                progress=100,
                stage="completed",
                message="Semua gambar ilustrasi sudah siap.",
                data={"total_generated": 0},
            )
            return

        await publish_project_event(
            project_id,
            task_type="storyboard_images",
            status="progress",
            progress=5,
            stage="starting",
            message=f"Memulai pembuatan {total_items} ilustrasi hand-drawn...",
            data={"total_items": total_items},
        )

        success_count = 0
        completed_count = 0
        raw_concurrency = 2
        if cfg and getattr(cfg, "image_concurrency", None):
            raw_concurrency = cfg.image_concurrency
        concurrency = max(1, min(4, int(raw_concurrency)))
        log.info("Storyboard job worker starting with concurrency=%d for project=%s (%d items)", concurrency, project_id, total_items)
        sem = asyncio.Semaphore(concurrency)
        db_lock = asyncio.Lock()

        async def _process_item(it: StoryboardItem) -> None:
            nonlocal success_count, completed_count
            if await is_cancelled(project_id):
                return

            async with db_lock:
                it.status = "generating"
                await db.commit()

            try:
                resolved_prompt = resolve_prompt_variables(
                    it.image_prompt,
                    characters=getattr(proj, "characters", None) if proj else None,
                    locations=getattr(proj, "locations", None) if proj else None,
                    world_setting=getattr(proj, "world_setting", None) if proj else None,
                    preset_master_prompt=style_prompt,
                )
                async with sem:
                    if await is_cancelled(project_id):
                        return
                    f_path, rel_url = await generate_single_image(
                        prompt=resolved_prompt,
                        project_id=project_id,
                        item_id=it.id,
                        base_url=base_url,
                        api_key=api_key,
                        model=model,
                        style_prompt=style_prompt,
                        size="1792x1024",
                    )

                async with db_lock:
                    it.file_path = f_path
                    it.status = "ready"
                    it.error_message = None
                    success_count += 1
                    completed_count += 1
                    await db.commit()
                    progress_pct = int(5 + ((completed_count / total_items) * 90))
                    await publish_project_event(
                        project_id,
                        task_type="storyboard_images",
                        status="progress",
                        progress=progress_pct,
                        stage="generating",
                        message=f"Menghasilkan ilustrasi ({completed_count}/{total_items})...",
                        data={"item_id": it.id, "current": completed_count, "total": total_items},
                    )
            except Exception as e:
                log.warning("Image gen failed for storyboard item %s: %s", it.id, e)
                async with db_lock:
                    it.status = "failed"
                    it.error_message = str(e)
                    completed_count += 1
                    await db.commit()
                    progress_pct = int(5 + ((completed_count / total_items) * 90))
                    await publish_project_event(
                        project_id,
                        task_type="storyboard_images",
                        status="progress",
                        progress=progress_pct,
                        stage="generating",
                        message=f"Menghasilkan ilustrasi ({completed_count}/{total_items})...",
                        data={"item_id": it.id, "current": completed_count, "total": total_items},
                    )

        await asyncio.gather(*[_process_item(it) for it in items], return_exceptions=True)

        if await is_cancelled(project_id):
            raise TaskCancelledException("Pembuatan gambar ilustrasi dibatalkan oleh pengguna.")

        await publish_project_event(
            project_id,
            task_type="storyboard_images",
            status="success",
            progress=100,
            stage="completed",
            message=f"Selesai! {success_count} dari {total_items} ilustrasi berhasil di-generate.",
            data={"total_items": total_items, "success_count": success_count},
        )
