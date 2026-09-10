from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.models.narration import NarrationTemplate
from app.schemas.narration import TemplateResponse, TemplateCreate
from app.services.narrative import DEFAULT_TEMPLATES

router = APIRouter(prefix="/templates", tags=["templates"])


async def seed_templates(db: AsyncSession):
    """Seed builtin templates if not existing."""
    for item in DEFAULT_TEMPLATES:
        t = await db.get(NarrationTemplate, item["id"])
        if not t:
            template = NarrationTemplate(
                id=item["id"],
                name=item["name"],
                description=item["description"],
                category=item["category"],
                system_prompt=item["system_prompt"],
                user_prompt_template=item["user_prompt_template"],
                default_tone=item["default_tone"],
                default_voice=item["default_voice"],
                is_builtin=item["is_builtin"],
            )
            db.add(template)
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
        category="custom",
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


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db)):
    template = await db.get(NarrationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    if template.is_builtin:
        raise HTTPException(status_code=400, detail="Template bawaan tidak dapat dihapus")

    await db.delete(template)
    await db.commit()
