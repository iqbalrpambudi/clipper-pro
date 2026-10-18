import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.db import get_db
from app.core.storage import storage
from app.core.security import decrypt_secret
from app.models.project import Project
from app.models.config import ModelConfig
from app.models.storyboard import StoryboardItem
from app.models.narration import Narration
from app.schemas.storyboard import (
    StoryboardScriptGenerateRequest,
    StoryboardItemResponse,
    StoryboardItemUpdateRequest,
    StoryboardSingleGenerateRequest,
    StoryboardBatchGenerateRequest,
    YouTubeMetadataGenerateRequest,
    YouTubeThumbnailGenerateRequest,
    YouTubeMetadataUpdateRequest,
)
from app.services.storyboard import (
    generate_storyboard_script,
    sync_storyboard_timing_from_alignment,
)
from app.services.image_gen import generate_single_image
from app.services.image_studio import get_active_image_preset
from app.services.youtube import (
    generate_youtube_metadata,
    generate_youtube_thumbnail,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/storyboard", tags=["storyboard"])


def _item_to_response(item: StoryboardItem) -> StoryboardItemResponse:
    url = storage.to_relative_url(item.file_path)
    if url and item.updated_at:
        v = int(item.updated_at.timestamp())
        url = f"{url}?v={v}"
    return StoryboardItemResponse(
        id=item.id,
        project_id=item.project_id,
        narration_id=item.narration_id,
        chapter_title=item.chapter_title,
        segment_id=item.segment_id,
        order_index=item.order_index,
        script_text=item.script_text,
        image_prompt=item.image_prompt,
        image_url=url,
        motion_effect=item.motion_effect or "zoom_in",
        start_time=float(item.start_time) if item.start_time is not None else 0.0,
        end_time=float(item.end_time) if item.end_time is not None else 0.0,
        duration=float(item.duration) if item.duration is not None else 0.0,
        status=item.status,
        error_message=item.error_message,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.post("/generate-script")
async def generate_script(
    project_id: str,
    payload: StoryboardScriptGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Step 1: Generate long-form narration (4-8 mins) and image prompts per segment."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    try:
        narration, items = await generate_storyboard_script(
            db=db,
            project_id=project_id,
            topic=payload.topic,
            duration_mins=payload.target_duration_mins,
            tone=payload.tone,
            images_per_segment=payload.images_per_segment,
            preset_id=payload.preset_id,
            custom_instructions=payload.custom_instructions,
        )
        return {
            "success": True,
            "project_id": project_id,
            "narration": {
                "id": narration.id,
                "topic": narration.topic,
                "tone": narration.tone,
                "target_duration": narration.target_duration,
                "raw_text": narration.raw_text,
                "segments": narration.segments,
                "status": narration.status,
            },
            "storyboard_items": [_item_to_response(it) for it in items],
        }
    except Exception as e:
        log.exception("Error generating storyboard script for project %s: %s", project_id, e)
        raise HTTPException(status_code=500, detail=f"Gagal generate naskah: {str(e)}")


@router.get("/items", response_model=List[StoryboardItemResponse])
async def list_storyboard_items(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all storyboard illustration slots for this project."""
    res = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index.asc())
    )
    items = res.scalars().all()
    return [_item_to_response(it) for it in items]


@router.patch("/items/{item_id}", response_model=StoryboardItemResponse)
async def update_storyboard_item(
    project_id: str,
    item_id: str,
    payload: StoryboardItemUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Edit visual prompt, motion effect, or timing for a specific storyboard image."""
    item = await db.get(StoryboardItem, item_id)
    if not item or item.project_id != project_id:
        raise HTTPException(status_code=404, detail="Storyboard item tidak ditemukan")

    if payload.chapter_title is not None:
        item.chapter_title = payload.chapter_title
    if payload.script_text is not None:
        item.script_text = payload.script_text
    if payload.image_prompt is not None:
        item.image_prompt = payload.image_prompt
    if payload.motion_effect is not None:
        item.motion_effect = payload.motion_effect
    if payload.start_time is not None:
        item.start_time = payload.start_time
    if payload.end_time is not None:
        item.end_time = payload.end_time
    if payload.duration is not None:
        item.duration = payload.duration

    await db.commit()
    await db.refresh(item)
    return _item_to_response(item)


@router.post("/items/{item_id}/generate-image", response_model=StoryboardItemResponse)
async def generate_single_storyboard_image(
    project_id: str,
    item_id: str,
    payload: Optional[StoryboardSingleGenerateRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Generate or regenerate a single storyboard illustration via AI image provider."""
    item = await db.get(StoryboardItem, item_id)
    if not item or item.project_id != project_id:
        raise HTTPException(status_code=404, detail="Storyboard item tidak ditemukan")

    # If an updated prompt is provided in payload, save and use it
    if payload and payload.prompt and payload.prompt.strip():
        item.image_prompt = payload.prompt.strip()

    # Fetch active model configuration for image credentials
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()

    base_url = cfg.image_base_url if cfg else None
    model = cfg.image_model if cfg else "dall-e-3"
    api_key = decrypt_secret(cfg.image_api_key_encrypted) if (cfg and cfg.image_api_key_encrypted) else None

    # Fetch style prompt from specified preset or active preset
    from app.models.image_preset import ImagePreset
    preset = None
    if payload and payload.preset_id:
        preset = await db.get(ImagePreset, payload.preset_id)
    if not preset:
        preset = await get_active_image_preset(db)

    style_prompt = preset.master_prompt if preset else (cfg.image_system_prompt if cfg else None)

    item.status = "generating"
    item.error_message = None
    item.updated_at = datetime.utcnow()
    await db.commit()

    try:
        file_path, _ = await generate_single_image(
            prompt=item.image_prompt,
            project_id=project_id,
            item_id=item_id,
            base_url=base_url,
            api_key=api_key,
            model=model,
            style_prompt=style_prompt,
            size="1792x1024",
        )
        item.file_path = file_path
        item.status = "ready"
        item.error_message = None
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return _item_to_response(item)
    except Exception as e:
        log.exception("Failed to generate image for storyboard item %s: %s", item_id, e)
        item.status = "failed"
        item.error_message = str(e)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        raise HTTPException(status_code=500, detail=f"Gagal generate gambar: {str(e)}")


@router.post("/generate-all-images")
async def generate_all_storyboard_images(
    project_id: str,
    payload: Optional[StoryboardBatchGenerateRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Batch generate all pending/requested storyboard illustrations."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # Fetch credentials
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()

    base_url = cfg.image_base_url if cfg else None
    model = cfg.image_model if cfg else "dall-e-3"
    api_key = decrypt_secret(cfg.image_api_key_encrypted) if (cfg and cfg.image_api_key_encrypted) else None
    active_preset = await get_active_image_preset(db)
    style_prompt = active_preset.master_prompt if active_preset else (cfg.image_system_prompt if cfg else None)

    # Determine items to process
    stmt = select(StoryboardItem).where(StoryboardItem.project_id == project_id)
    if payload and payload.item_ids:
        stmt = stmt.where(StoryboardItem.id.in_(payload.item_ids))
    else:
        # Default: process pending or failed or missing file
        stmt = stmt.where((StoryboardItem.status != "ready") | (StoryboardItem.file_path == None))

    stmt = stmt.order_by(StoryboardItem.order_index.asc())
    items_res = await db.execute(stmt)
    items = items_res.scalars().all()

    success_count = 0
    fail_count = 0

    raw_concurrency = 2
    if payload and payload.concurrency:
        raw_concurrency = payload.concurrency
    elif cfg and getattr(cfg, "image_concurrency", None):
        raw_concurrency = cfg.image_concurrency

    concurrency = max(1, min(4, int(raw_concurrency)))
    log.info("Batch storyboard image generation starting with concurrency=%d for %d items", concurrency, len(items))
    sem = asyncio.Semaphore(concurrency)
    db_lock = asyncio.Lock()

    async def _process_item(it: StoryboardItem):
        nonlocal success_count, fail_count
        async with db_lock:
            it.status = "generating"
            await db.commit()

        try:
            async with sem:
                f_path, _ = await generate_single_image(
                    prompt=it.image_prompt,
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
                await db.commit()
        except Exception as e:
            log.warning("Batch generation failed for item %s: %s", it.id, e)
            async with db_lock:
                it.status = "failed"
                it.error_message = str(e)
                fail_count += 1
                await db.commit()

    if items:
        await asyncio.gather(*[_process_item(it) for it in items], return_exceptions=True)

    return {
        "success": True,
        "total_processed": len(items),
        "success_count": success_count,
        "fail_count": fail_count,
    }


@router.post("/sync-timing")
async def sync_timing(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Sync storyboard item timestamps with the latest aligned narration audio."""
    res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
        .limit(1)
    )
    narration = res.scalar_one_or_none()
    if not narration or not narration.segments:
        raise HTTPException(status_code=400, detail="Belum ada data segmen narasi atau audio alignment.")

    await sync_storyboard_timing_from_alignment(
        db=db,
        project_id=project_id,
        aligned_segments=narration.segments,
    )
    return {"success": True, "message": "Timing storyboard berhasil disinkronkan."}


@router.post("/youtube/generate-metadata")
async def generate_yt_metadata(
    project_id: str,
    payload: Optional[YouTubeMetadataGenerateRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Generate high-CTR YouTube title, alternative titles, SEO description with chapters, tags, and thumbnail prompt."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    try:
        res = await generate_youtube_metadata(
            db=db,
            project_id=project_id,
            focus_angle=payload.focus_angle if payload else None,
            custom_prompt=payload.custom_prompt if payload else None,
        )
        return res
    except Exception as e:
        log.exception("Failed to generate YouTube metadata: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/youtube/generate-thumbnail")
async def generate_yt_thumbnail(
    project_id: str,
    payload: YouTubeThumbnailGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate 16:9 YouTube thumbnail image based on customizable prompt."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    try:
        res = await generate_youtube_thumbnail(
            db=db,
            project_id=project_id,
            prompt=payload.prompt,
            style_prompt=payload.style_prompt,
            preset_id=payload.preset_id,
        )
        return res
    except Exception as e:
        log.exception("Failed to generate YouTube thumbnail: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/youtube/metadata")
async def update_yt_metadata(
    project_id: str,
    payload: YouTubeMetadataUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update and persist YouTube metadata edits."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    curr = dict(proj.youtube_metadata or {})
    if payload.title is not None:
        curr["title"] = payload.title
    if payload.title_options is not None:
        curr["title_options"] = payload.title_options
    if payload.description is not None:
        curr["description"] = payload.description
    if payload.tags is not None:
        curr["tags"] = payload.tags
    if payload.thumbnail_prompt is not None:
        curr["thumbnail_prompt"] = payload.thumbnail_prompt
    if payload.thumbnail_concept is not None:
        curr["thumbnail_concept"] = payload.thumbnail_concept
    if payload.thumbnail_url is not None:
        curr["thumbnail_url"] = payload.thumbnail_url
    if payload.thumbnail_history is not None:
        curr["thumbnail_history"] = payload.thumbnail_history
    curr["updated_at"] = datetime.utcnow().isoformat()

    proj.youtube_metadata = curr
    await db.commit()
    await db.refresh(proj)
    return curr


@router.get("/youtube/metadata")
async def get_yt_metadata(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get current YouTube metadata and thumbnail state."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    return proj.youtube_metadata or {}

