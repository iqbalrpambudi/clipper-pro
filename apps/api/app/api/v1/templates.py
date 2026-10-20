from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.narration import NarrationTemplate
from app.schemas.narration import TemplateCreate, TemplateResponse, TemplateUpdate
from app.services.narrative import DEFAULT_TEMPLATES

router = APIRouter(prefix="/templates", tags=["templates"])


async def seed_templates(db: AsyncSession):
    """Seed builtin templates if not existing or sync builtin definitions."""
    active_builtin_ids = {item["id"] for item in DEFAULT_TEMPLATES}
    for item in DEFAULT_TEMPLATES:
        t = await db.get(NarrationTemplate, item["id"])
        if not t:
            template = NarrationTemplate(
                id=item["id"],
                name=item["name"],
                description=item["description"],
                category=item["category"],
                sub_category=item["sub_category"],
                system_prompt=item["system_prompt"],
                user_prompt_template=item["user_prompt_template"],
                default_tone=item["default_tone"],
                default_voice=item["default_voice"],
                is_builtin=item["is_builtin"],
            )
            db.add(template)
        elif t.is_builtin:
            t.name = item["name"]
            t.description = item["description"]
            t.category = item["category"]
            t.sub_category = item["sub_category"]
            t.system_prompt = item["system_prompt"]
            t.user_prompt_template = item["user_prompt_template"]
            t.default_tone = item["default_tone"]
            t.default_voice = item["default_voice"]

    # Clean up obsolete builtins that have been consolidated
    res = await db.execute(select(NarrationTemplate).where(NarrationTemplate.is_builtin == True))
    for old_t in res.scalars().all():
        if old_t.id not in active_builtin_ids:
            await db.delete(old_t)

    await db.commit()


@router.get("", response_model=List[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    await seed_templates(db)
    res = await db.execute(select(NarrationTemplate).order_by(NarrationTemplate.is_builtin.desc()))
    return res.scalars().all()


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.get(NarrationTemplate, payload.id)
    if existing:
        raise HTTPException(status_code=400, detail="Template ID sudah digunakan")

    template = NarrationTemplate(
        id=payload.id,
        name=payload.name,
        description=payload.description,
        category=payload.category or "custom",
        sub_category=payload.sub_category,
        system_prompt=payload.system_prompt,
        user_prompt_template=payload.user_prompt_template,
        default_tone=payload.default_tone,
        default_voice=payload.default_voice,
        is_builtin=False,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: str,
    payload: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    template = await db.get(NarrationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")

    if payload.name is not None:
        template.name = payload.name
    if payload.description is not None:
        template.description = payload.description
    if "category" in payload.model_fields_set:
        template.category = payload.category or "custom"
    if "sub_category" in payload.model_fields_set:
        template.sub_category = payload.sub_category
    if payload.system_prompt is not None:
        template.system_prompt = payload.system_prompt
    if payload.user_prompt_template is not None:
        template.user_prompt_template = payload.user_prompt_template
    if payload.default_tone is not None:
        template.default_tone = payload.default_tone
    if payload.default_voice is not None:
        template.default_voice = payload.default_voice

    await db.commit()
    await db.refresh(template)
    return template


@router.post("/{template_id}/reset", response_model=TemplateResponse)
async def reset_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
):
    template = await db.get(NarrationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")

    default_data = next((t for t in DEFAULT_TEMPLATES if t["id"] == template_id), None)
    if not default_data:
        raise HTTPException(status_code=400, detail="Template bukan template bawaan yang dapat di-reset")

    template.name = default_data["name"]
    template.description = default_data["description"]
    template.category = default_data["category"]
    template.sub_category = default_data["sub_category"]
    template.system_prompt = default_data["system_prompt"]
    template.user_prompt_template = default_data["user_prompt_template"]
    template.default_tone = default_data["default_tone"]
    template.default_voice = default_data["default_voice"]

    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db)):
    template = await db.get(NarrationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    if template.is_builtin:
        raise HTTPException(status_code=400, detail="Template bawaan tidak dapat dihapus")

    await db.delete(template)
    await db.commit()
