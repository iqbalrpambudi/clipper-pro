from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.narration import NarrationTemplate
from app.schemas.narration import TemplateCreate, TemplateResponse, TemplateUpdate
from app.services.narrative import DEFAULT_TEMPLATES

router = APIRouter(prefix="/templates", tags=["templates"])

_FIELDS = ("name", "description", "system_prompt", "default_tone")


async def seed_templates(db: AsyncSession):
    """Insert builtins, keep them in sync with code, drop builtins no longer shipped."""
    builtin_ids = {item["id"] for item in DEFAULT_TEMPLATES}
    for item in DEFAULT_TEMPLATES:
        t = await db.get(NarrationTemplate, item["id"])
        if not t:
            # category / user_prompt_template are legacy NOT NULL columns, unused now
            db.add(
                NarrationTemplate(
                    id=item["id"],
                    is_builtin=True,
                    category="builtin",
                    user_prompt_template="",
                    **{f: item[f] for f in _FIELDS},
                )
            )
        elif t.is_builtin:
            for f in _FIELDS:
                setattr(t, f, item[f])

    res = await db.execute(select(NarrationTemplate).where(NarrationTemplate.is_builtin == True))  # noqa: E712
    for old_t in res.scalars().all():
        if old_t.id not in builtin_ids:
            await db.delete(old_t)
    await db.commit()


@router.get("", response_model=List[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    await seed_templates(db)
    res = await db.execute(
        select(NarrationTemplate).order_by(
            (NarrationTemplate.id == "auto").desc(), NarrationTemplate.is_builtin.desc()
        )
    )
    return res.scalars().all()


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_template(payload: TemplateCreate, db: AsyncSession = Depends(get_db)):
    if await db.get(NarrationTemplate, payload.id):
        raise HTTPException(status_code=400, detail="Template ID sudah digunakan")
    template = NarrationTemplate(
        id=payload.id,
        is_builtin=False,
        category="custom",
        user_prompt_template="",
        **{f: getattr(payload, f) for f in _FIELDS},
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: str, payload: TemplateUpdate, db: AsyncSession = Depends(get_db)
):
    template = await db.get(NarrationTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan")
    if template.is_builtin:
        # builtins are re-synced from code on every list; copy one to customise it
        raise HTTPException(
            status_code=400, detail="Template bawaan tidak bisa diubah. Duplikat dulu."
        )
    for f in _FIELDS:
        if getattr(payload, f) is not None:
            setattr(template, f, getattr(payload, f))
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
