import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.db import get_db
from app.core.storage import storage
from app.models.image_preset import ImagePreset
from app.schemas.image_preset import (
    ImagePresetResponse,
    ImagePresetCreate,
    ImagePresetUpdate,
    StudioAnalyzeRequest,
    StudioAnalyzeResponse,
    StudioTestGenerateRequest,
    StudioTestGenerateResponse,
)
from app.services.image_studio import (
    seed_default_image_presets,
    get_active_image_preset,
    set_active_image_preset,
    analyze_visual_style,
    generate_preset_test_image,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["image_studio"])


# ==========================================
# PRESETS CRUD
# ==========================================

@router.get("/image-presets", response_model=List[ImagePresetResponse])
async def list_image_presets(db: AsyncSession = Depends(get_db)):
    """List all AI image illustration style presets."""
    await seed_default_image_presets(db)
    stmt = select(ImagePreset).order_by(
        ImagePreset.is_active.desc(),
        ImagePreset.is_builtin.desc(),
        desc(ImagePreset.created_at),
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/image-presets/{preset_id}", response_model=ImagePresetResponse)
async def get_image_preset(preset_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single image preset by ID."""
    preset = await db.get(ImagePreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset tidak ditemukan")
    return preset


@router.post("/image-presets", response_model=ImagePresetResponse, status_code=status.HTTP_201_CREATED)
async def create_or_save_image_preset(
    payload: ImagePresetCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new image preset or save/overwrite preset (e.g. 'doodle-ilustrasi')."""
    await seed_default_image_presets(db)
    
    preset_id = payload.id or f"preset-{uuid.uuid4().hex[:8]}"

    existing = await db.get(ImagePreset, preset_id)
    if existing:
        # Update existing
        existing.name = payload.name
        if payload.description is not None:
            existing.description = payload.description
        if payload.category:
            existing.category = payload.category
        existing.master_prompt = payload.master_prompt
        if payload.negative_prompt is not None:
            existing.negative_prompt = payload.negative_prompt
        if payload.reference_image_url is not None:
            existing.reference_image_url = payload.reference_image_url
        if payload.preview_image_url is not None:
            existing.preview_image_url = payload.preview_image_url
        if payload.user_text_input is not None:
            existing.user_text_input = payload.user_text_input
        if payload.style_attributes is not None:
            existing.style_attributes = payload.style_attributes
        
        if payload.is_active:
            await set_active_image_preset(db, preset_id)
        else:
            await db.commit()
            await db.refresh(existing)
        return existing

    # Create new
    preset = ImagePreset(
        id=preset_id,
        name=payload.name,
        description=payload.description,
        category=payload.category or "custom",
        master_prompt=payload.master_prompt,
        negative_prompt=payload.negative_prompt,
        reference_image_url=payload.reference_image_url,
        preview_image_url=payload.preview_image_url,
        user_text_input=payload.user_text_input,
        style_attributes=payload.style_attributes or {},
        is_builtin=False,
        is_active=False,
    )
    db.add(preset)
    await db.commit()

    if payload.is_active:
        return await set_active_image_preset(db, preset.id)

    await db.refresh(preset)
    return preset


@router.put("/image-presets/{preset_id}", response_model=ImagePresetResponse)
async def update_image_preset(
    preset_id: str,
    payload: ImagePresetUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing image preset."""
    preset = await db.get(ImagePreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset tidak ditemukan")

    if payload.name is not None:
        preset.name = payload.name
    if payload.description is not None:
        preset.description = payload.description
    if payload.category is not None:
        preset.category = payload.category
    if payload.master_prompt is not None:
        preset.master_prompt = payload.master_prompt
    if payload.negative_prompt is not None:
        preset.negative_prompt = payload.negative_prompt
    if payload.reference_image_url is not None:
        preset.reference_image_url = payload.reference_image_url
    if payload.preview_image_url is not None:
        preset.preview_image_url = payload.preview_image_url
    if payload.user_text_input is not None:
        preset.user_text_input = payload.user_text_input
    if payload.style_attributes is not None:
        preset.style_attributes = payload.style_attributes

    if payload.is_active is True:
        return await set_active_image_preset(db, preset_id)

    await db.commit()
    await db.refresh(preset)
    return preset


@router.delete("/image-presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image_preset(preset_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a custom image preset."""
    preset = await db.get(ImagePreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset tidak ditemukan")
    if preset.is_builtin:
        raise HTTPException(status_code=400, detail="Preset bawaan sistem tidak dapat dihapus")

    was_active = preset.is_active
    await db.delete(preset)
    await db.commit()

    if was_active:
        # Fallback to doodle-ilustrasi
        doodle = await db.get(ImagePreset, "doodle-ilustrasi")
        if doodle:
            await set_active_image_preset(db, "doodle-ilustrasi")


@router.post("/image-presets/{preset_id}/activate", response_model=ImagePresetResponse)
async def activate_preset(preset_id: str, db: AsyncSession = Depends(get_db)):
    """Set preset as the active style for Ilustrasi AI."""
    try:
        return await set_active_image_preset(db, preset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ==========================================
# AI VISUAL STUDIO WORKFLOW
# ==========================================

@router.post("/image-studio/upload-reference")
async def upload_reference_image(file: UploadFile = File(...)):
    """Upload a visual reference image for style analysis."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File gambar wajib disertakan")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        raise HTTPException(status_code=400, detail="Format file tidak didukung. Gunakan PNG, JPG, JPEG, atau WebP")

    presets_dir = storage.get_presets_dir()
    unique_name = f"ref_{uuid.uuid4().hex[:12]}{ext}"
    dest_path = presets_dir / unique_name

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan file gambar: {str(e)}")

    rel_url = storage.to_relative_url(dest_path)
    return {
        "success": True,
        "filename": unique_name,
        "file_path": str(dest_path),
        "url": rel_url or f"/storage/presets/{unique_name}",
    }


@router.post("/image-studio/analyze", response_model=StudioAnalyzeResponse)
async def analyze_style_preset(
    payload: StudioAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    AI Visual Engine: Analyzes reference image & user text prompt to synthesize
    a consistent Master Prompt and structured style attributes for Ilustrasi AI.
    """
    resolved_path: Optional[str] = None
    if payload.reference_image_path:
        resolved_path = payload.reference_image_path
    elif payload.reference_image_url:
        abs_p = storage.to_absolute_path(payload.reference_image_url)
        if abs_p and abs_p.exists():
            resolved_path = str(abs_p)

    try:
        res = await analyze_visual_style(
            user_text=payload.user_text,
            reference_image_path=resolved_path,
            db=db,
        )
        return StudioAnalyzeResponse(**res)
    except Exception as e:
        log.exception("Error in analyze_visual_style: %s", e)
        raise HTTPException(status_code=500, detail=f"Gagal menganalisis gaya visual: {str(e)}")


@router.post("/image-studio/test-generate", response_model=StudioTestGenerateResponse)
async def test_generate_preset_image(
    payload: StudioTestGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an interactive test preview image using the synthesized master prompt.
    """
    try:
        abs_path, rel_url = await generate_preset_test_image(
            master_prompt=payload.master_prompt,
            scene_prompt=payload.scene_prompt,
            db=db,
        )
        return StudioTestGenerateResponse(
            image_url=rel_url,
            file_path=abs_path,
            prompt_used=payload.scene_prompt or "Seorang kakek bijak menceritakan kisah kuno di bawah pohon",
        )
    except Exception as e:
        log.exception("Error in generate_preset_test_image: %s", e)
        raise HTTPException(status_code=500, detail=f"Gagal generate gambar uji coba: {str(e)}")
