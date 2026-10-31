import asyncio
import logging
import zlib
from pathlib import Path
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
from app.services.image_gen import generate_single_image, resolve_image_credentials
from app.services.image_studio import get_active_image_preset
from app.services.storyboard import resolve_prompt_variables

log = logging.getLogger(__name__)


def compute_scene_group_seed(project_id: str, group_id: Optional[str]) -> Optional[int]:
    """Compute a deterministic positive 31-bit seed per (project_id, scene_group_id)."""
    if not group_id:
        return None
    val = zlib.crc32(f"{project_id}:{group_id}".encode("utf-8")) & 0x7FFFFFFF
    return val if val > 0 else 42


async def generate_storyboard_images_job(
    ctx: Dict[str, Any],
    project_id: str,
    item_ids: Optional[List[str]] = None,
) -> None:
    """Async background task to generate storyboard illustrations via AI image provider with scene-group continuity."""
    async with SessionLocal() as db:
        proj = await db.get(Project, project_id)
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()

        base_url, api_key, model = resolve_image_credentials(cfg)
        cfg_steps = getattr(cfg, "image_steps", None)
        cfg_scale = getattr(cfg, "image_cfg_scale", None)
        active_preset = await get_active_image_preset(db)
        target_size = "1366x768" if (proj and getattr(proj, "aspect_ratio", "16:9") in ("16:9", "landscape")) else "1024x1024"
        style_prompt = active_preset.master_prompt if active_preset else (cfg.image_system_prompt if cfg else None)
        negative_prompt = getattr(active_preset, "negative_prompt", None) if active_preset else None

        # Pre-index existing ready images across the project so follow-up shots can reference already-generated anchors
        all_stmt = (
            select(StoryboardItem)
            .where(StoryboardItem.project_id == project_id)
            .order_by(StoryboardItem.order_index.asc())
        )
        all_items_res = await db.execute(all_stmt)
        all_project_items = list(all_items_res.scalars().all())

        ready_by_item_id: Dict[str, str] = {}
        group_anchor_map: Dict[str, tuple[str, str]] = {}
        for existing in all_project_items:
            if existing.status == "ready" and existing.file_path and Path(existing.file_path).is_file():
                ready_by_item_id[existing.id] = existing.file_path
                grp = (existing.shot_metadata or {}).get("scene_group_id")
                if grp and grp not in group_anchor_map:
                    group_anchor_map[grp] = (existing.id, existing.file_path)

        if item_ids:
            id_set = set(item_ids)
            items = [it for it in all_project_items if it.id in id_set]
        else:
            items = [
                it
                for it in all_project_items
                if it.status != "ready" or not it.file_path or not Path(it.file_path).is_file()
            ]

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
            message=f"Memulai pembuatan {total_items} ilustrasi dengan kontinuitas latar & karakter...",
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
                shot_meta = it.shot_metadata if isinstance(it.shot_metadata, dict) else {}
                group_id = (shot_meta.get("scene_group_id") or "").strip()
                ref_item_id = (shot_meta.get("reference_item_id") or "").strip()

                ref_path: Optional[str] = None
                if ref_item_id and ref_item_id != it.id and ref_item_id in ready_by_item_id:
                    ref_path = ready_by_item_id[ref_item_id]
                elif group_id and group_id in group_anchor_map:
                    anc_id, anc_path = group_anchor_map[group_id]
                    if anc_id != it.id:
                        ref_path = anc_path

                group_seed = compute_scene_group_seed(project_id, group_id)

                resolved_prompt = resolve_prompt_variables(
                    it.image_prompt,
                    characters=getattr(proj, "characters", None) if proj else None,
                    locations=getattr(proj, "locations", None) if proj else None,
                    world_setting=getattr(proj, "world_setting", None) if proj else None,
                    preset_master_prompt=style_prompt,
                    shot_metadata=shot_meta,
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
                        negative_prompt=negative_prompt,
                        size=target_size,
                        reference_image_path=ref_path,
                        seed=group_seed,
                        steps=cfg_steps,
                        guidance_scale=cfg_scale,
                    )

                async with db_lock:
                    it.file_path = f_path
                    it.status = "ready"
                    it.error_message = None
                    ready_by_item_id[it.id] = f_path
                    if group_id and group_id not in group_anchor_map:
                        group_anchor_map[group_id] = (it.id, f_path)
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

        # Group items by scene_group_id so Shot 1 (Establishing/Wide) finishes before Shot 2 (Close-Up) in the same group,
        # while independent scene groups run concurrently up to `concurrency`!
        grouped_chains: List[List[StoryboardItem]] = []
        chain_index_by_group: Dict[str, int] = {}
        for it in items:
            grp = ((it.shot_metadata or {}).get("scene_group_id") or "").strip() if isinstance(it.shot_metadata, dict) else ""
            if grp:
                if grp not in chain_index_by_group:
                    chain_index_by_group[grp] = len(grouped_chains)
                    grouped_chains.append([it])
                else:
                    grouped_chains[chain_index_by_group[grp]].append(it)
            else:
                grouped_chains.append([it])

        async def _process_chain(chain: List[StoryboardItem]) -> None:
            for chain_item in chain:
                await _process_item(chain_item)

        await asyncio.gather(*[_process_chain(ch) for ch in grouped_chains], return_exceptions=True)

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
