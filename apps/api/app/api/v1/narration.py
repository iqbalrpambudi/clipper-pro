from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.narration import Narration, NarrationTemplate
from app.models.project import Project, Scene, SourceVideo
from app.schemas.narration import (
    NarrationGenerateRequest,
    NarrationResponse,
    NarrationUpdateRequest,
    SegmentsUpdateRequest,
)
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.narrative import (
    DEFAULT_TEMPLATES,
    generate_narration_script,
    split_into_sentence_segments,
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

    template = await db.get(NarrationTemplate, payload.template_id)
    if template:
        style, tone = template.system_prompt, template.default_tone or "informatif"
    else:
        t = next((t for t in DEFAULT_TEMPLATES if t["id"] == payload.template_id), DEFAULT_TEMPLATES[0])
        style, tone = t["system_prompt"], t["default_tone"]

    scenes_res = await db.execute(
        select(Scene).where(Scene.project_id == project_id).order_by(Scene.start_time.asc())
    )
    all_scenes = scenes_res.scalars().all()
    # Placeholder descriptions of untagged scenes would only mislead the script writer
    scenes = [
        {
            "id": s.id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "duration": s.duration,
            "description": s.description,
            "tags": s.tags,
            "analysis": s.analysis,
            "shot_info": s.shot_info,
        }
        for s in [s for s in all_scenes if s.status != "untagged"] or all_scenes
    ]

    # Source video titles (YouTube downloads keep the title as filename) tell the model what the video is about
    names_res = await db.execute(select(SourceVideo.filename).where(SourceVideo.project_id == project_id))
    source_names = list(dict.fromkeys(n.rsplit(".", 1)[0] for n in names_res.scalars().all() if n))

    adapter = await get_active_llm_adapter(db)
    lang = proj.language or "id"
    try:
        script_text, segments = await generate_narration_script(
            adapter=adapter,
            style=style,
            tone=tone,
            topic=payload.topic or "",
            source_title=" | ".join(filter(None, [proj.name, *source_names])),
            scenes=scenes,
            target_duration=payload.target_duration,
            language=lang,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal generate naskah dari AI: {str(e)}")

    narration = Narration(
        project_id=project_id,
        template_id=payload.template_id,
        topic=payload.topic,
        tone=tone,
        target_duration=payload.target_duration,
        raw_text=script_text,
        language=lang,
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
            language=payload.language or "id",
            segments=payload.segments or split_into_sentence_segments(payload.raw_text),
            status="draft",
        )
        db.add(narration)
    else:
        narration.raw_text = payload.raw_text
        if payload.language:
            narration.language = payload.language
            proj = await db.get(Project, project_id)
            if proj:
                proj.language = payload.language
                db.add(proj)
        if payload.segments:
            narration.segments = payload.segments
        else:
            new_segs = split_into_sentence_segments(payload.raw_text)
            old_segs = narration.segments or []
            if len(new_segs) == len(old_segs):
                for new, old in zip(new_segs, old_segs):
                    if old.get("scene_id"):
                        new["scene_id"] = old["scene_id"]
            narration.segments = new_segs

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

