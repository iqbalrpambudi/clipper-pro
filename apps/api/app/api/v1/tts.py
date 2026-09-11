import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from arq import create_pool
from app.core.db import get_db
from app.core.redis import get_redis_settings
from app.core.storage import storage
from app.core.security import decrypt_secret
from app.models.config import ModelConfig
from app.models.project import Project
from app.models.narration import Narration, AudioTrack
from app.schemas.tts import (
    VoiceInfo,
    CostEstimateRequest,
    CostEstimateResponse,
    TTSGenerateRequest,
    AudioTrackResponse,
)
from app.services.tts import AVAILABLE_VOICES, estimate_tts_cost, get_or_generate_voice_sample
from app.workers.tasks import generate_tts_and_align_job

router = APIRouter(tags=["tts"])


@router.get("/tts/voices", response_model=List[VoiceInfo])
async def list_voices():
    return AVAILABLE_VOICES


@router.get("/tts/sample")
async def get_voice_sample(
    provider: str = "gemini",
    voice: str = "Puck",
    db: AsyncSession = Depends(get_db),
):
    """Serve real 2-3s sample audio for the specified voice."""
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()
    api_key = ""
    if cfg:
        if cfg.tts_api_key_encrypted:
            api_key = decrypt_secret(cfg.tts_api_key_encrypted)
        elif cfg.api_key_encrypted:
            api_key = decrypt_secret(cfg.api_key_encrypted)

    try:
        sample_path = await get_or_generate_voice_sample(
            provider=provider,
            voice=voice,
            api_key=api_key or None,
        )
        return FileResponse(
            path=str(sample_path),
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memuat sampel suara: {e}")


@router.post("/tts/estimate-cost", response_model=CostEstimateResponse)
async def calculate_cost_estimate(payload: CostEstimateRequest):
    return estimate_tts_cost(payload.text, payload.provider)


@router.post("/projects/{project_id}/tts/generate", response_model=AudioTrackResponse)
async def trigger_tts_generation(
    project_id: str,
    payload: TTSGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # Find latest narration
    res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = res.scalars().first()
    if not narration or not narration.raw_text:
        raise HTTPException(status_code=400, detail="Naskah narasi belum dibuat")

    provider = payload.provider or "gemini"
    voice = payload.voice or ("Puck" if provider == "gemini" else "id-ID-GadisNeural")

    # Estimate cost
    cost_est = estimate_tts_cost(narration.raw_text, provider)

    track = AudioTrack(
        project_id=project_id,
        narration_id=narration.id,
        provider=provider,
        voice=voice,
        rate=payload.rate,
        pitch=payload.pitch,
        estimated_cost=cost_est.estimated_cost_usd,
        status="generating",
    )
    db.add(track)
    await db.commit()
    await db.refresh(track)

    # Queue background job or fallback asyncio task
    try:
        pool = await create_pool(get_redis_settings())
        await pool.enqueue_job(
            "generate_tts_and_align_job",
            project_id,
            narration.id,
            voice,
            provider,
            payload.rate,
            payload.pitch,
        )
        await pool.close()
    except Exception:
        asyncio.create_task(
            generate_tts_and_align_job(
                {},
                project_id,
                narration.id,
                voice,
                provider,
                payload.rate,
                payload.pitch,
            )
        )

    return AudioTrackResponse(
        id=track.id,
        project_id=track.project_id,
        narration_id=track.narration_id,
        provider=track.provider,
        voice=track.voice,
        rate=track.rate,
        pitch=track.pitch,
        audio_url=None,
        duration=0.0,
        estimated_cost=track.estimated_cost,
        status=track.status,
    )


@router.get("/projects/{project_id}/audio", response_model=AudioTrackResponse)
async def get_latest_audio(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(AudioTrack)
        .where(AudioTrack.project_id == project_id)
        .order_by(AudioTrack.created_at.desc())
    )
    track = res.scalars().first()
    if not track:
        raise HTTPException(status_code=404, detail="Belum ada audio track yang di-generate")

    return AudioTrackResponse(
        id=track.id,
        project_id=track.project_id,
        narration_id=track.narration_id,
        provider=track.provider,
        voice=track.voice,
        rate=track.rate,
        pitch=track.pitch,
        audio_url=storage.to_relative_url(track.file_path),
        duration=track.duration,
        estimated_cost=track.estimated_cost,
        status=track.status,
    )
