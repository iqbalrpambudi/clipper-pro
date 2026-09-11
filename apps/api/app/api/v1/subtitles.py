from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.models.project import Project
from app.models.narration import Narration, AudioTrack
from app.models.timeline import SubtitleStyle
from app.schemas.subtitle import (
    SubtitlePresetResponse,
    SubtitleStyleResponse,
    SubtitleStyleUpdateRequest,
    SubtitlePreviewResponse,
)
from app.schemas.narration import NarrationResponse
from fastapi.responses import Response
from app.services.alignment import align_audio_with_text
from app.services.subtitle_ass import (
    get_builtin_presets,
    generate_ass_subtitles,
    generate_srt_subtitles,
    generate_vtt_subtitles,
)

router = APIRouter(tags=["subtitles"])


@router.get("/subtitles/presets", response_model=List[SubtitlePresetResponse])
async def list_subtitle_presets(db: AsyncSession = Depends(get_db)):
    presets = get_builtin_presets()
    res = await db.execute(select(SubtitleStyle).where(SubtitleStyle.is_preset == True))
    custom_presets = res.scalars().all()

    output = []
    for p in presets:
        output.append(SubtitlePresetResponse(
            id=p["id"],
            name=p["name"],
            description=p["description"],
            is_builtin=True,
            preset_name=p["id"],
            font_family=p["font_family"],
            font_size=p["font_size"],
            font_weight=p["font_weight"],
            primary_color=p["primary_color"],
            highlight_color=p["highlight_color"],
            outline_color=p["outline_color"],
            outline_width=p["outline_width"],
            box_color=p["box_color"],
            box_opacity=p["box_opacity"],
            position=p["position"],
            offset_y=p["offset_y"],
            offset_x=p["offset_x"],
            display_mode=p["display_mode"],
            burst_word_count=p["burst_word_count"],
            highlight_animation=p["highlight_animation"],
            emoji_enabled=p["emoji_enabled"],
        ))

    for cp in custom_presets:
        output.append(SubtitlePresetResponse(
            id=cp.id,
            name=cp.preset_name,
            description="Preset kustom pengguna",
            is_builtin=False,
            preset_name=cp.preset_name,
            font_family=cp.font_family,
            font_size=cp.font_size,
            font_weight=cp.font_weight,
            primary_color=cp.primary_color,
            highlight_color=cp.highlight_color,
            outline_color=cp.outline_color,
            outline_width=cp.outline_width,
            box_color=cp.box_color,
            box_opacity=cp.box_opacity,
            position=cp.position,
            offset_y=cp.offset_y,
            offset_x=cp.offset_x,
            display_mode=cp.display_mode,
            burst_word_count=cp.burst_word_count,
            highlight_animation=cp.highlight_animation,
            emoji_enabled=cp.emoji_enabled,
        ))

    return output


@router.get("/projects/{project_id}/subtitles/style", response_model=SubtitleStyleResponse)
async def get_project_subtitle_style(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SubtitleStyle).where(SubtitleStyle.project_id == project_id))
    style = res.scalar_one_or_none()
    if not style:
        # Create default
        style = SubtitleStyle(project_id=project_id)
        db.add(style)
        await db.commit()
        await db.refresh(style)
    return SubtitleStyleResponse.model_validate(style)


@router.put("/projects/{project_id}/subtitles/style", response_model=SubtitleStyleResponse)
async def update_project_subtitle_style(
    project_id: str,
    payload: SubtitleStyleUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SubtitleStyle).where(SubtitleStyle.project_id == project_id))
    style = res.scalar_one_or_none()
    if not style:
        style = SubtitleStyle(project_id=project_id)
        db.add(style)

    style.preset_name = payload.preset_name
    style.font_family = payload.font_family
    style.font_size = payload.font_size
    style.font_weight = payload.font_weight
    style.primary_color = payload.primary_color
    style.highlight_color = payload.highlight_color
    style.outline_color = payload.outline_color
    style.outline_width = payload.outline_width
    style.box_color = payload.box_color
    style.box_opacity = payload.box_opacity
    style.position = payload.position
    style.offset_y = payload.offset_y
    style.offset_x = payload.offset_x
    style.display_mode = payload.display_mode
    style.burst_word_count = payload.burst_word_count
    style.highlight_animation = payload.highlight_animation
    style.scale_factor = payload.scale_factor
    style.emoji_enabled = payload.emoji_enabled

    if payload.save_as_preset and payload.new_preset_name:
        custom_preset = SubtitleStyle(
            project_id=None,
            is_preset=True,
            preset_name=payload.new_preset_name,
            font_family=payload.font_family,
            font_size=payload.font_size,
            font_weight=payload.font_weight,
            primary_color=payload.primary_color,
            highlight_color=payload.highlight_color,
            outline_color=payload.outline_color,
            outline_width=payload.outline_width,
            box_color=payload.box_color,
            box_opacity=payload.box_opacity,
            position=payload.position,
            offset_y=payload.offset_y,
            offset_x=payload.offset_x,
            display_mode=payload.display_mode,
            burst_word_count=payload.burst_word_count,
            highlight_animation=payload.highlight_animation,
            scale_factor=payload.scale_factor,
            emoji_enabled=payload.emoji_enabled,
        )
        db.add(custom_preset)

    await db.commit()
    await db.refresh(style)
    return SubtitleStyleResponse.model_validate(style)




@router.get("/projects/{project_id}/subtitles/preview-ass", response_model=SubtitlePreviewResponse)
async def preview_ass_subtitles(project_id: str, db: AsyncSession = Depends(get_db)):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    n_res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = n_res.scalars().first()
    if not narration or not narration.segments:
        return SubtitlePreviewResponse(ass_content="", line_count=0)

    s_res = await db.execute(select(SubtitleStyle).where(SubtitleStyle.project_id == project_id))
    style = s_res.scalar_one_or_none()
    style_dict = {
        "font_family": style.font_family if style else "Montserrat",
        "font_size": style.font_size if style else 56,
        "font_weight": style.font_weight if style else "Bold",
        "primary_color": style.primary_color if style else "#FFFFFF",
        "highlight_color": style.highlight_color if style else "#FFE600",
        "outline_color": style.outline_color if style else "#000000",
        "outline_width": style.outline_width if style else 4,
        "box_color": style.box_color if style else "#000000",
        "box_opacity": style.box_opacity if style else 0.0,
        "position": style.position if style else "bottom",
        "offset_y": style.offset_y if style else 0,
        "offset_x": style.offset_x if style else 0,
        "display_mode": style.display_mode if style else "per_word",
        "burst_word_count": style.burst_word_count if style else 2,
        "highlight_animation": style.highlight_animation if style else "scale",
        "scale_factor": style.scale_factor if (style and style.scale_factor is not None) else 1.5,
        "emoji_enabled": style.emoji_enabled if style else True,
    }

    ass_text = generate_ass_subtitles(narration.segments, style_dict)
    lines = [l for l in ass_text.splitlines() if l.startswith("Dialogue:")]

    return SubtitlePreviewResponse(
        ass_content=ass_text,
        line_count=len(lines),
    )


@router.get("/projects/{project_id}/subtitles/export")
async def export_subtitles(
    project_id: str,
    format: str = "ass",
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    n_res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = n_res.scalars().first()
    if not narration or not narration.segments:
        raise HTTPException(status_code=400, detail="Belum ada segmen narasi untuk subtitle")

    fmt = format.lower().strip()
    if fmt == "srt":
        content = generate_srt_subtitles(narration.segments)
        media_type = "text/plain; charset=utf-8"
        filename = f"subtitles_{project_id}.srt"
    elif fmt == "vtt":
        content = generate_vtt_subtitles(narration.segments)
        media_type = "text/vtt; charset=utf-8"
        filename = f"subtitles_{project_id}.vtt"
    else:
        s_res = await db.execute(select(SubtitleStyle).where(SubtitleStyle.project_id == project_id))
        style = s_res.scalar_one_or_none()
        style_dict = {
            "font_family": style.font_family if style else "Montserrat",
            "font_size": style.font_size if style else 56,
            "font_weight": style.font_weight if style else "Bold",
            "primary_color": style.primary_color if style else "#FFFFFF",
            "highlight_color": style.highlight_color if style else "#FFE600",
            "outline_color": style.outline_color if style else "#000000",
            "outline_width": style.outline_width if style else 4,
            "box_color": style.box_color if style else "#000000",
            "box_opacity": style.box_opacity if style else 0.0,
            "position": style.position if style else "bottom",
            "offset_y": style.offset_y if style else 0,
            "offset_x": style.offset_x if style else 0,
            "display_mode": style.display_mode if style else "per_word",
            "burst_word_count": style.burst_word_count if style else 2,
            "highlight_animation": style.highlight_animation if style else "scale",
            "scale_factor": style.scale_factor if (style and style.scale_factor is not None) else 1.5,
            "emoji_enabled": style.emoji_enabled if style else True,
        }
        content = generate_ass_subtitles(narration.segments, style_dict)
        media_type = "text/plain; charset=utf-8"
        filename = f"subtitles_{project_id}.ass"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/projects/{project_id}/subtitles/match-audio", response_model=NarrationResponse)
async def match_subtitles_with_audio(project_id: str, db: AsyncSession = Depends(get_db)):
    """Re-sync narration segments and word timestamps directly against the project's audio using Whisper AI."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # 1. Fetch active audio track
    a_res = await db.execute(
        select(AudioTrack)
        .where(AudioTrack.project_id == project_id)
        .order_by(AudioTrack.created_at.desc())
    )
    audio_track = a_res.scalars().first()
    if not audio_track or not audio_track.file_path or not Path(audio_track.file_path).exists():
        raise HTTPException(
            status_code=400,
            detail="File audio narasi belum tersedia. Generate suara TTS terlebih dahulu di tab Suara & TTS.",
        )

    # 2. Fetch narration
    n_res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = n_res.scalars().first()
    if not narration or not narration.segments:
        raise HTTPException(status_code=400, detail="Belum ada naskah narasi untuk disinkronkan.")

    # 3. Run audio-anchored forced alignment via Whisper
    aligned_segments = await align_audio_with_text(
        audio_path=audio_track.file_path,
        segments=narration.segments,
        total_audio_duration_sec=audio_track.duration or 30.0,
    )

    narration.segments = aligned_segments
    narration.status = "aligned"
    await db.commit()
    await db.refresh(narration)

    return NarrationResponse.model_validate(narration)


