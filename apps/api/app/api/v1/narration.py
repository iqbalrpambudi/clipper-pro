from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.models.project import Project, Scene
from app.models.narration import Narration, NarrationTemplate
from app.schemas.narration import (
    NarrationGenerateRequest,
    NarrationUpdateRequest,
    SegmentsUpdateRequest,
    NarrationResponse,
)
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.narrative import (
    generate_narration_script,
    split_into_sentence_segments,
    DEFAULT_TEMPLATES,
    LEGACY_TEMPLATE_ALIASES,
)

router = APIRouter(prefix="/projects/{project_id}/narration", tags=["narration"])


@router.post("/generate", response_model=NarrationResponse)
async def generate_narration(
    project_id: str,
    payload: NarrationGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # Fetch template with legacy ID alias resolution
    target_tpl_id = LEGACY_TEMPLATE_ALIASES.get(payload.template_id, payload.template_id)
    template = await db.get(NarrationTemplate, target_tpl_id)
    if not template and target_tpl_id != payload.template_id:
        template = await db.get(NarrationTemplate, payload.template_id)

    category = "recap"
    if not template:
        # Fallback to default matching target_tpl_id or first
        t_data = next((t for t in DEFAULT_TEMPLATES if t["id"] == target_tpl_id), None)
        if not t_data:
            t_data = next((t for t in DEFAULT_TEMPLATES if t["id"] == payload.template_id), DEFAULT_TEMPLATES[0])
        sys_prompt = t_data["system_prompt"]
        usr_template = t_data["user_prompt_template"]
        category = t_data.get("category", "recap")
    else:
        sys_prompt = template.system_prompt
        usr_template = template.user_prompt_template
        category = template.category or "recap"

    # Fetch scenes summary for context
    scenes_res = await db.execute(
        select(Scene).where(Scene.project_id == project_id).order_by(Scene.start_time.asc())
    )
    scenes = scenes_res.scalars().all()
    scenes_summary = [
        {
            "duration": s.duration,
            "start_time": s.start_time,
            "description": s.description,
            "tags": s.tags,
            "transcript": s.transcript,
            "analysis": s.analysis,
        }
        for s in scenes
    ]

    adapter = await get_active_llm_adapter(db)

    try:
        script_text = await generate_narration_script(
            adapter=adapter,
            system_prompt=sys_prompt,
            user_prompt_template=usr_template,
            topic=payload.topic or "Fakta unik seputar materi video",
            tone=payload.tone,
            target_duration=payload.target_duration,
            scenes_summary=scenes_summary,
            custom_prompt=payload.custom_prompt,
            category=category,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal generate naskah dari AI: {str(e)}")

    segments = split_into_sentence_segments(script_text)

    narration = Narration(
        project_id=project_id,
        template_id=payload.template_id,
        topic=payload.topic,
        tone=payload.tone,
        target_duration=payload.target_duration,
        raw_text=script_text,
        segments=segments,
        status="generated",
    )
    db.add(narration)
    await db.commit()
    await db.refresh(narration)

    return NarrationResponse.model_validate(narration)


@router.get("", response_model=NarrationResponse)
async def get_active_narration(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = res.scalars().first()
    if not narration:
        raise HTTPException(status_code=404, detail="Belum ada narasi untuk project ini")
    return NarrationResponse.model_validate(narration)


@router.put("", response_model=NarrationResponse)
async def update_narration(
    project_id: str,
    payload: NarrationUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = res.scalars().first()
    if not narration:
        narration = Narration(
            project_id=project_id,
            raw_text=payload.raw_text,
            segments=payload.segments or split_into_sentence_segments(payload.raw_text),
            status="draft",
        )
        db.add(narration)
    else:
        narration.raw_text = payload.raw_text
        if payload.segments:
            narration.segments = payload.segments
        else:
            narration.segments = split_into_sentence_segments(payload.raw_text)

    await db.commit()
    await db.refresh(narration)
    return NarrationResponse.model_validate(narration)


@router.put("/segments", response_model=NarrationResponse)
async def update_narration_segments(
    project_id: str,
    payload: SegmentsUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = res.scalars().first()
    if not narration:
        raise HTTPException(status_code=404, detail="Narasi tidak ditemukan")

    narration.segments = payload.segments
    # Keep raw_text synchronized
    reconstructed = " ".join(seg.get("text", "").strip() for seg in payload.segments if seg.get("text"))
    if reconstructed:
        narration.raw_text = reconstructed

    await db.commit()
    await db.refresh(narration)
    return NarrationResponse.model_validate(narration)

