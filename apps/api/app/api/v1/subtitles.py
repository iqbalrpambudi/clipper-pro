import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.models.project import Project
from app.models.narration import Narration, AudioTrack
from app.models.timeline import SubtitleStyle
from app.schemas.subtitle import (
    SubtitlePresetResponse,
    SubtitlePresetCreate,
    SubtitlePresetUpdate,
    SubtitleStyleResponse,
    SubtitleStyleUpdateRequest,
    SubtitlePreviewResponse,
)
from app.schemas.narration import NarrationResponse
from app.schemas.tts import RealignWordsRequest
from fastapi.responses import Response
from app.services.alignment import align_audio_with_text
from app.core.events import publish_project_event
from app.services.subtitle_ass import (
    get_builtin_presets,
    generate_ass_subtitles,
    generate_srt_subtitles,
    generate_vtt_subtitles,
)

router = APIRouter(tags=["subtitles"])

BUILTIN_PRESET_IDS = ["viral_tiktok", "hormozi_punch", "minimalist", "neon_glow"]


async def seed_subtitle_presets(db: AsyncSession):
    """Seed builtin subtitle style presets into the database if not present."""
    builtin = get_builtin_presets()
    for item in builtin:
        style = await db.get(SubtitleStyle, item["id"])
        if not style:
            style = SubtitleStyle(
                id=item["id"],
                project_id=None,
                preset_name=item["name"],
                description=item["description"],
                is_preset=True,
                font_family=item["font_family"],
                font_size=item["font_size"],
                font_weight=item["font_weight"],
                primary_color=item["primary_color"],
                highlight_color=item["highlight_color"],
                outline_color=item["outline_color"],
                outline_width=item["outline_width"],
                box_color=item["box_color"],
                box_opacity=item["box_opacity"],
                position=item["position"],
                offset_y=item["offset_y"],
                offset_x=item["offset_x"],
                display_mode=item["display_mode"],
                burst_word_count=item["burst_word_count"],
                highlight_animation=item["highlight_animation"],
                scale_factor=item.get("scale_factor", 1.15),
                emoji_enabled=item["emoji_enabled"],
            )
            db.add(style)
        else:
            if item["id"] in ("hormozi_punch", "neon_glow", "viral_tiktok", "minimalist"):
                style.preset_name = item["name"]
                style.description = item["description"]
                style.font_family = item["font_family"]
                style.font_weight = "Regular" if item.get("font_weight") in ("Normal", "Regular") else item.get("font_weight", "Bold")
                style.box_opacity = item["box_opacity"]
                style.box_color = item["box_color"]
                style.scale_factor = item.get("scale_factor", 1.15)
    await db.commit()


@router.get("/subtitles/presets", response_model=List[SubtitlePresetResponse])
async def list_subtitle_presets(db: AsyncSession = Depends(get_db)):
    await seed_subtitle_presets(db)
    res = await db.execute(
        select(SubtitleStyle)
        .where(SubtitleStyle.is_preset == True)
        .order_by(SubtitleStyle.created_at.asc())
    )
    presets = res.scalars().all()

    output = []
    for s in presets:
        is_builtin = s.id in BUILTIN_PRESET_IDS
        output.append(SubtitlePresetResponse(
            id=s.id,
            name=s.preset_name,
            description=s.description or ("Preset bawaan sistem" if is_builtin else "Preset kustom pengguna"),
            is_builtin=is_builtin,
            preset_name=s.preset_name,
            font_family=s.font_family,
            font_size=s.font_size,
            font_weight=s.font_weight,
            primary_color=s.primary_color,
            highlight_color=s.highlight_color,
            outline_color=s.outline_color,
            outline_width=s.outline_width,
            box_color=s.box_color,
            box_opacity=s.box_opacity,
            position=s.position,
            offset_y=s.offset_y,
            offset_x=s.offset_x,
            display_mode=s.display_mode,
            burst_word_count=s.burst_word_count,
            highlight_animation=s.highlight_animation,
            scale_factor=s.scale_factor if s.scale_factor is not None else 1.15,
            emoji_enabled=s.emoji_enabled,
        ))

    # Sort builtin first, then custom
    output.sort(key=lambda x: (not x.is_builtin, x.name))
    return output


@router.post("/subtitles/presets", response_model=SubtitlePresetResponse, status_code=status.HTTP_201_CREATED)
async def create_subtitle_preset(
    payload: SubtitlePresetCreate,
    db: AsyncSession = Depends(get_db),
):
    preset_id = payload.id.strip().lower().replace(" ", "_") if payload.id else f"preset_{uuid.uuid4().hex[:8]}"
    existing = await db.get(SubtitleStyle, preset_id)
    if existing:
        raise HTTPException(status_code=400, detail="ID Preset Subtitle sudah digunakan")

    style = SubtitleStyle(
        id=preset_id,
        project_id=None,
        preset_name=payload.name,
        description=payload.description,
        is_preset=True,
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
    db.add(style)
    await db.commit()
    await db.refresh(style)

    return SubtitlePresetResponse(
        id=style.id,
        name=style.preset_name,
        description=style.description or "Preset kustom pengguna",
        is_builtin=False,
        preset_name=style.preset_name,
        font_family=style.font_family,
        font_size=style.font_size,
        font_weight=style.font_weight,
        primary_color=style.primary_color,
        highlight_color=style.highlight_color,
        outline_color=style.outline_color,
        outline_width=style.outline_width,
        box_color=style.box_color,
        box_opacity=style.box_opacity,
        position=style.position,
        offset_y=style.offset_y,
        offset_x=style.offset_x,
        display_mode=style.display_mode,
        burst_word_count=style.burst_word_count,
        highlight_animation=style.highlight_animation,
        scale_factor=style.scale_factor if style.scale_factor is not None else 1.5,
        emoji_enabled=style.emoji_enabled,
    )


@router.put("/subtitles/presets/{preset_id}", response_model=SubtitlePresetResponse)
async def update_subtitle_preset(
    preset_id: str,
    payload: SubtitlePresetUpdate,
    db: AsyncSession = Depends(get_db),
):
    await seed_subtitle_presets(db)
    style = await db.get(SubtitleStyle, preset_id)
    if not style or not style.is_preset:
        raise HTTPException(status_code=404, detail="Preset subtitle tidak ditemukan")

    if payload.name is not None:
        style.preset_name = payload.name
    if payload.description is not None:
        style.description = payload.description
    if payload.font_family is not None:
        style.font_family = payload.font_family
    if payload.font_size is not None:
        style.font_size = payload.font_size
    if payload.font_weight is not None:
        style.font_weight = payload.font_weight
    if payload.primary_color is not None:
        style.primary_color = payload.primary_color
    if payload.highlight_color is not None:
        style.highlight_color = payload.highlight_color
    if payload.outline_color is not None:
        style.outline_color = payload.outline_color
    if payload.outline_width is not None:
        style.outline_width = payload.outline_width
    if payload.box_color is not None:
        style.box_color = payload.box_color
    if payload.box_opacity is not None:
        style.box_opacity = payload.box_opacity
    if payload.position is not None:
        style.position = payload.position
    if payload.offset_y is not None:
        style.offset_y = payload.offset_y
    if payload.offset_x is not None:
        style.offset_x = payload.offset_x
    if payload.display_mode is not None:
        style.display_mode = payload.display_mode
    if payload.burst_word_count is not None:
        style.burst_word_count = payload.burst_word_count
    if payload.highlight_animation is not None:
        style.highlight_animation = payload.highlight_animation
    if payload.scale_factor is not None:
        style.scale_factor = payload.scale_factor
    if payload.emoji_enabled is not None:
        style.emoji_enabled = payload.emoji_enabled

    await db.commit()
    await db.refresh(style)

    is_builtin = style.id in BUILTIN_PRESET_IDS
    return SubtitlePresetResponse(
        id=style.id,
        name=style.preset_name,
        description=style.description or ("Preset bawaan sistem" if is_builtin else "Preset kustom pengguna"),
        is_builtin=is_builtin,
        preset_name=style.preset_name,
        font_family=style.font_family,
        font_size=style.font_size,
        font_weight=style.font_weight,
        primary_color=style.primary_color,
        highlight_color=style.highlight_color,
        outline_color=style.outline_color,
        outline_width=style.outline_width,
        box_color=style.box_color,
        box_opacity=style.box_opacity,
        position=style.position,
        offset_y=style.offset_y,
        offset_x=style.offset_x,
        display_mode=style.display_mode,
        burst_word_count=style.burst_word_count,
        highlight_animation=style.highlight_animation,
        scale_factor=style.scale_factor if style.scale_factor is not None else 1.15,
        emoji_enabled=style.emoji_enabled,
    )


@router.post("/subtitles/presets/{preset_id}/reset", response_model=SubtitlePresetResponse)
async def reset_subtitle_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    builtin = get_builtin_presets()
    default_data = next((p for p in builtin if p["id"] == preset_id), None)
    if not default_data:
        raise HTTPException(status_code=400, detail="Preset bukan preset bawaan yang dapat di-reset")

    style = await db.get(SubtitleStyle, preset_id)
    if not style:
        style = SubtitleStyle(id=preset_id, is_preset=True, project_id=None)
        db.add(style)

    style.preset_name = default_data["name"]
    style.description = default_data["description"]
    style.font_family = default_data["font_family"]
    style.font_size = default_data["font_size"]
    style.font_weight = default_data["font_weight"]
    style.primary_color = default_data["primary_color"]
    style.highlight_color = default_data["highlight_color"]
    style.outline_color = default_data["outline_color"]
    style.outline_width = default_data["outline_width"]
    style.box_color = default_data["box_color"]
    style.box_opacity = default_data["box_opacity"]
    style.position = default_data["position"]
    style.offset_y = default_data["offset_y"]
    style.offset_x = default_data["offset_x"]
    style.display_mode = default_data["display_mode"]
    style.burst_word_count = default_data["burst_word_count"]
    style.highlight_animation = default_data["highlight_animation"]
    style.scale_factor = default_data.get("scale_factor", 1.15)
    style.emoji_enabled = default_data["emoji_enabled"]

    await db.commit()
    await db.refresh(style)

    return SubtitlePresetResponse(
        id=style.id,
        name=style.preset_name,
        description=style.description,
        is_builtin=True,
        preset_name=style.preset_name,
        font_family=style.font_family,
        font_size=style.font_size,
        font_weight=style.font_weight,
        primary_color=style.primary_color,
        highlight_color=style.highlight_color,
        outline_color=style.outline_color,
        outline_width=style.outline_width,
        box_color=style.box_color,
        box_opacity=style.box_opacity,
        position=style.position,
        offset_y=style.offset_y,
        offset_x=style.offset_x,
        display_mode=style.display_mode,
        burst_word_count=style.burst_word_count,
        highlight_animation=style.highlight_animation,
        scale_factor=style.scale_factor if style.scale_factor is not None else 1.15,
        emoji_enabled=style.emoji_enabled,
    )


@router.delete("/subtitles/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtitle_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    if preset_id in BUILTIN_PRESET_IDS:
        raise HTTPException(status_code=400, detail="Preset bawaan tidak dapat dihapus")

    style = await db.get(SubtitleStyle, preset_id)
    if not style or not style.is_preset:
        raise HTTPException(status_code=404, detail="Preset subtitle tidak ditemukan")

    await db.delete(style)
    await db.commit()


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
            id=f"preset_{uuid.uuid4().hex[:8]}",
            project_id=None,
            is_preset=True,
            preset_name=payload.new_preset_name,
            description="Preset kustom pengguna",
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
        "font_family": style.font_family if style else "Poppins",
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
            "font_family": style.font_family if style else "Poppins",
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
async def match_subtitles_with_audio(
    project_id: str,
    payload: Optional[RealignWordsRequest] = None,
    db: AsyncSession = Depends(get_db),
):
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

    offset_ms = payload.offset_ms if payload else 0
    language = payload.language if payload else "id"
    model_size = payload.model_size if payload else "base"

    # 3. Run audio-anchored forced alignment via Whisper AI
    try:
        aligned_segments = await align_audio_with_text(
            audio_path=audio_track.file_path,
            segments=narration.segments,
            total_audio_duration_sec=audio_track.duration or 30.0,
            language=language,
            model_size=model_size,
            offset_ms=offset_ms,
            force_realignment=True,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Subtitles match audio error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Gagal mencocokkan subtitle dengan audio via Whisper AI: {str(e)}",
        )

    narration.segments = aligned_segments
    narration.status = "aligned"
    await db.commit()
    await db.refresh(narration)

    await publish_project_event(
        project_id,
        task_type="tts_align",
        status="success",
        progress=100,
        stage="completed",
        message="Realignment kata selesai! Word timestamp telah disinkronkan ulang dengan audio.",
        data={"narration_id": narration.id, "segments_count": len(aligned_segments)},
    )

    return NarrationResponse.model_validate(narration)
