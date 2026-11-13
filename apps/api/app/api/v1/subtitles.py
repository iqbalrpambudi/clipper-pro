from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.narration import Narration
from app.models.project import Project
from app.models.timeline import SubtitleStyle
from app.schemas.subtitle import (
    SubtitlePreviewResponse,
    SubtitleRenderRequest,
    SubtitleStyleIn,
    SubtitleStyleResponse,
)
from app.services.subtitle_ass import generate_ass_subtitles, generate_srt_subtitles, style_to_dict

router = APIRouter(tags=["subtitles"])


async def _latest_segments(db: AsyncSession, project_id: str) -> list:
    res = await db.execute(
        select(Narration).where(Narration.project_id == project_id).order_by(Narration.created_at.desc())
    )
    narration = res.scalars().first()
    return (narration.segments or []) if narration else []


async def _style_row(db: AsyncSession, project_id: str):
    res = await db.execute(select(SubtitleStyle).where(SubtitleStyle.project_id == project_id))
    return res.scalar_one_or_none()


def _preview(segments: list, style) -> SubtitlePreviewResponse:
    ass = generate_ass_subtitles(segments, style_to_dict(style))
    return SubtitlePreviewResponse(ass_content=ass, line_count=ass.count("\nDialogue:"))


@router.put("/projects/{project_id}/subtitles/style", response_model=SubtitleStyleResponse)
async def update_project_subtitle_style(
    project_id: str,
    payload: SubtitleStyleIn,
    db: AsyncSession = Depends(get_db),
):
    style = await _style_row(db, project_id)
    if not style:
        style = SubtitleStyle(project_id=project_id)
        db.add(style)
    for key, value in payload.model_dump().items():
        setattr(style, key, value)
    await db.commit()
    await db.refresh(style)
    return SubtitleStyleResponse.model_validate(style)


@router.post("/projects/{project_id}/subtitles/render-ass", response_model=SubtitlePreviewResponse)
async def render_ass_for_preview(project_id: str, payload: SubtitleRenderRequest):
    """Live preview: same generator as the final render, fed the editor's unsaved style + segments."""
    return _preview(payload.segments, payload.style.model_dump())


@router.get("/projects/{project_id}/subtitles/preview-ass", response_model=SubtitlePreviewResponse)
async def preview_ass_subtitles(project_id: str, db: AsyncSession = Depends(get_db)):
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    return _preview(await _latest_segments(db, project_id), await _style_row(db, project_id))


@router.get("/projects/{project_id}/subtitles/export")
async def export_subtitles(project_id: str, format: str = "ass", db: AsyncSession = Depends(get_db)):
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    segments = await _latest_segments(db, project_id)
    if not segments:
        raise HTTPException(status_code=400, detail="Belum ada segmen narasi untuk subtitle")

    if format.lower().strip() == "srt":
        content, ext = generate_srt_subtitles(segments), "srt"
    else:
        content, ext = generate_ass_subtitles(segments, style_to_dict(await _style_row(db, project_id))), "ass"
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="subtitles_{project_id}.{ext}"'},
    )
