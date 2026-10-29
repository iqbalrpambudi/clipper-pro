from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.frame_math import COMPOSITION_FPS, frame_to_sec, sec_to_frame
from app.core.tasks import run_background_task
from app.models.motion import MotionScene
from app.models.narration import AudioTrack, Narration
from app.models.project import Project
from app.prompts.motion import MOTION_THEMES_META
from app.schemas.motion import (
    MotionBatchGenerateRequest,
    MotionSceneCreateRequest,
    MotionSceneResponse,
    MotionSceneUpdateRequest,
    MotionScriptGenerateRequest,
    MotionSingleGenerateRequest,
)
from app.services.motion_director import (
    build_synthetic_cues,
    estimate_spoken_duration_secs,
    generate_motion_script_and_plan,
    generate_single_motion_scene_code,
    sync_motion_scenes_from_alignment,
)
from app.workers.motion import generate_motion_scenes_job

router = APIRouter(prefix="/projects/{project_id}/motion", tags=["motion"])


async def _rebuild_narration_from_motion_scenes(db: AsyncSession, project_id: str) -> None:
    """Keep Narration raw_text & segments aligned when user edits/adds/deletes MotionScenes."""
    res = await db.execute(
        select(MotionScene)
        .where(MotionScene.project_id == project_id)
        .order_by(MotionScene.order_index.asc())
    )
    scenes = list(res.scalars().all())

    cursor_frame = 0
    segments = []
    lines = []
    for idx, sc in enumerate(scenes):
        sc.order_index = idx
        sc.segment_id = f"seg-{idx + 1}"
        dur_f = max(45, sc.duration_frames or sec_to_frame(sc.duration or 4.0, COMPOSITION_FPS))
        start_s = frame_to_sec(cursor_frame, COMPOSITION_FPS)
        end_s = frame_to_sec(cursor_frame + dur_f, COMPOSITION_FPS)
        sc.start_time = round(start_s, 3)
        sc.end_time = round(end_s, 3)
        sc.duration = round(end_s - start_s, 3)
        sc.duration_frames = dur_f
        if not sc.cues:
            sc.cues = build_synthetic_cues(sc.script_text, dur_f)
        cursor_frame += dur_f

        lines.append(sc.script_text)
        segments.append(
            {
                "id": sc.segment_id,
                "index": idx,
                "text": sc.script_text,
                "start_ms": int(round(start_s * 1000)),
                "end_ms": int(round(end_s * 1000)),
                "words": [
                    {
                        "word": c["word"],
                        "start_ms": int(round(start_s * 1000)) + int(c.get("start_ms", 0)),
                        "end_ms": int(round(start_s * 1000)) + int(c.get("end_ms", 150)),
                    }
                    for c in (sc.cues or [])
                ],
            }
        )

    n_res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = n_res.scalars().first()
    if narration:
        narration.raw_text = "\n\n".join(lines)
        narration.segments = segments
        narration.target_duration = int(round(frame_to_sec(cursor_frame, COMPOSITION_FPS)))
    elif scenes:
        proj = await db.get(Project, project_id)
        narration = Narration(
            project_id=project_id,
            template_id="motion_director",
            topic=proj.name if proj else "Motion Project",
            tone="analytical",
            target_duration=int(round(frame_to_sec(cursor_frame, COMPOSITION_FPS))),
            raw_text="\n\n".join(lines),
            language=(proj.language if proj else "id") or "id",
            segments=segments,
            status="generated",
        )
        db.add(narration)


@router.get("/themes")
async def list_motion_themes(project_id: str):
    return [
        {"id": tid, "name": meta["name"], "vibe": meta["vibe"]}
        for tid, meta in MOTION_THEMES_META.items()
    ]


@router.get("/scenes", response_model=List[MotionSceneResponse])
async def list_motion_scenes(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(MotionScene)
        .where(MotionScene.project_id == project_id)
        .order_by(MotionScene.order_index.asc())
    )
    return [MotionSceneResponse.model_validate(s) for s in res.scalars().all()]


@router.post("/generate-script")
async def generate_motion_script(
    project_id: str,
    payload: MotionScriptGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    try:
        narration, scenes = await generate_motion_script_and_plan(
            db=db,
            project_id=project_id,
            topic=payload.topic,
            target_duration_secs=payload.target_duration_secs,
            tone=payload.tone,
            language=(payload.language or proj.language or "id").strip().lower(),
            theme_id=payload.theme_id,
            custom_instructions=payload.custom_instructions,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal merancang naskah & motion plan: {exc}")

    return {
        "narration_id": narration.id,
        "raw_text": narration.raw_text,
        "scene_count": len(scenes),
        "motion_scenes": [MotionSceneResponse.model_validate(s) for s in scenes],
    }


@router.post("/scenes", response_model=MotionSceneResponse)
async def create_motion_scene(
    project_id: str,
    payload: MotionSceneCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    res = await db.execute(
        select(MotionScene)
        .where(MotionScene.project_id == project_id)
        .order_by(MotionScene.order_index.asc())
    )
    existing = list(res.scalars().all())
    next_idx = len(existing)
    prev_end = existing[-1].end_time if existing else 0.0

    dur_sec = payload.duration or estimate_spoken_duration_secs(payload.script_text, proj.language or "id")
    dur_frames = max(60, sec_to_frame(dur_sec, COMPOSITION_FPS))
    actual_dur = frame_to_sec(dur_frames, COMPOSITION_FPS)

    scene = MotionScene(
        project_id=project_id,
        segment_id=f"seg-{next_idx + 1}",
        order_index=next_idx,
        title=payload.title or f"Scene {next_idx + 1}",
        archetype=payload.archetype or "kinetic_emblem",
        script_text=payload.script_text.strip(),
        visual_concept=payload.visual_concept.strip(),
        cues=build_synthetic_cues(payload.script_text, dur_frames),
        key_facts=[],
        transition_type="camera_push",
        start_time=round(prev_end, 3),
        end_time=round(prev_end + actual_dur, 3),
        duration=round(actual_dur, 3),
        duration_frames=dur_frames,
        status="pending",
    )
    db.add(scene)
    await db.flush()
    await _rebuild_narration_from_motion_scenes(db, project_id)
    await db.commit()
    await db.refresh(scene)
    return MotionSceneResponse.model_validate(scene)


@router.patch("/scenes/{scene_id}", response_model=MotionSceneResponse)
async def update_motion_scene(
    project_id: str,
    scene_id: str,
    payload: MotionSceneUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    scene = await db.get(MotionScene, scene_id)
    if not scene or scene.project_id != project_id:
        raise HTTPException(status_code=404, detail="Adegan motion tidak ditemukan")

    script_changed = False
    timing_changed = False

    if payload.title is not None:
        scene.title = payload.title.strip()
    if payload.archetype is not None:
        scene.archetype = payload.archetype.strip()
    if payload.script_text is not None and payload.script_text.strip() != scene.script_text:
        scene.script_text = payload.script_text.strip()
        script_changed = True
    if payload.visual_concept is not None:
        scene.visual_concept = payload.visual_concept.strip()
    if payload.transition_type is not None:
        scene.transition_type = payload.transition_type.strip()
    if payload.component_code is not None:
        scene.component_code = payload.component_code
        scene.status = "ready" if payload.component_code.strip() else "pending"
        scene.error_message = None
    if payload.duration_frames is not None:
        scene.duration_frames = max(45, int(payload.duration_frames))
        scene.duration = round(frame_to_sec(scene.duration_frames, COMPOSITION_FPS), 3)
        timing_changed = True
    elif payload.duration is not None:
        scene.duration_frames = max(45, sec_to_frame(float(payload.duration), COMPOSITION_FPS))
        scene.duration = round(frame_to_sec(scene.duration_frames, COMPOSITION_FPS), 3)
        timing_changed = True

    if payload.cues is not None:
        scene.cues = payload.cues
    elif script_changed:
        scene.cues = build_synthetic_cues(scene.script_text, scene.duration_frames)

    scene.updated_at = datetime.utcnow()

    if script_changed or timing_changed:
        await _rebuild_narration_from_motion_scenes(db, project_id)

    await db.commit()
    await db.refresh(scene)
    return MotionSceneResponse.model_validate(scene)


@router.delete("/scenes/{scene_id}", status_code=204)
async def delete_motion_scene(
    project_id: str,
    scene_id: str,
    db: AsyncSession = Depends(get_db),
):
    scene = await db.get(MotionScene, scene_id)
    if not scene or scene.project_id != project_id:
        raise HTTPException(status_code=404, detail="Adegan motion tidak ditemukan")

    await db.delete(scene)
    await db.flush()
    await _rebuild_narration_from_motion_scenes(db, project_id)
    await db.commit()


@router.post("/sync-timing", response_model=List[MotionSceneResponse])
async def sync_motion_timing(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    n_res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = n_res.scalars().first()
    if not narration or not narration.segments:
        raise HTTPException(status_code=400, detail="Belum ada naskah atau hasil alignment suara.")

    a_res = await db.execute(
        select(AudioTrack)
        .where(AudioTrack.project_id == project_id)
        .order_by(AudioTrack.created_at.desc())
    )
    audio = a_res.scalars().first()
    audio_dur = float(audio.duration) if (audio and audio.duration) else 0.0

    scenes = await sync_motion_scenes_from_alignment(
        db=db,
        project_id=project_id,
        aligned_segments=narration.segments,
        total_audio_duration=audio_dur,
    )
    return [MotionSceneResponse.model_validate(s) for s in scenes]


@router.post("/generate-code")
async def trigger_batch_motion_code_generation(
    project_id: str,
    payload: MotionBatchGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    run_background_task(
        generate_motion_scenes_job,
        {},
        project_id,
        payload.only_pending,
        payload.theme_id,
        payload.style_instructions,
    )
    return {
        "status": "queued",
        "message": "Sintesis komponen animasi React/Remotion dimulai di background.",
    }


@router.post("/scenes/{scene_id}/regenerate", response_model=MotionSceneResponse)
async def regenerate_single_motion_scene(
    project_id: str,
    scene_id: str,
    payload: MotionSingleGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    scene = await db.get(MotionScene, scene_id)
    if not scene or scene.project_id != project_id:
        raise HTTPException(status_code=404, detail="Adegan motion tidak ditemukan")

    res = await db.execute(select(MotionScene).where(MotionScene.project_id == project_id))
    all_scenes = list(res.scalars().all())
    prev = next((s for s in all_scenes if s.order_index == scene.order_index - 1), None)

    scene.status = "generating"
    scene.error_message = None
    await db.commit()

    try:
        tsx_code = await generate_single_motion_scene_code(
            db=db,
            project=proj,
            scene=scene,
            total_scenes=max(1, len(all_scenes)),
            prev_archetype=prev.archetype if prev else None,
            remix_prompt=payload.remix_prompt,
            theme_id=payload.theme_id,
        )
        scene.component_code = tsx_code
        scene.status = "ready"
        scene.error_message = None
        scene.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(scene)
        return MotionSceneResponse.model_validate(scene)
    except Exception as exc:
        scene.status = "failed"
        scene.error_message = str(exc)
        scene.updated_at = datetime.utcnow()
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Gagal me-remix kode animasi: {exc}")

