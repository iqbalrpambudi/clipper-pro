import asyncio
from pathlib import Path
from typing import List, Optional
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
    RealignWordsRequest,
)
from app.schemas.narration import NarrationResponse
import httpx
from app.core.config import get_settings
from app.services.tts import AVAILABLE_VOICES, estimate_tts_cost, get_or_generate_voice_sample
from app.services.alignment import align_audio_with_text
from app.core.events import publish_project_event
from app.workers.tasks import generate_tts_and_align_job

router = APIRouter(tags=["tts"])


@router.get("/tts/voices", response_model=List[VoiceInfo])
async def list_voices():
    return AVAILABLE_VOICES


@router.get("/tts/elevenlabs/voices")
async def get_elevenlabs_voices(
    api_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Fetch all voices available in the user's ElevenLabs account (premade, cloned, added from library)."""
    key = api_key
    if not key:
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()
        if cfg and cfg.elevenlabs_api_key_encrypted:
            key = decrypt_secret(cfg.elevenlabs_api_key_encrypted)
    if not key:
        settings = get_settings()
        key = settings.ELEVENLABS_API_KEY

    if not key:
        raise HTTPException(
            status_code=400,
            detail="ElevenLabs API Key belum dikonfigurasi. Masukkan API Key di menu Pengaturan terlebih dahulu.",
        )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": key})
            if resp.status_code != 200:
                err_text = resp.text
                if "missing_permissions" in err_text or "voices_read" in err_text:
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            "API Key ElevenLabs Anda tidak memiliki izin 'voices_read'. "
                            "Gunakan Full Access API Key atau salin langsung Voice ID suara dari web ElevenLabs "
                            "dan tempel ke kolom 'Custom Voice ID' di bawah!"
                        ),
                    )
                raise HTTPException(status_code=resp.status_code, detail=f"ElevenLabs API Error: {err_text}")
            data = resp.json()
            raw_voices = data.get("voices", [])
            result = []
            for v in raw_voices:
                labels = v.get("labels") or {}
                desc_parts = [labels.get("description", ""), labels.get("accent", ""), labels.get("use case", "")]
                desc = ", ".join(p for p in desc_parts if p) or v.get("category", "ElevenLabs Voice")
                result.append({
                    "id": v["voice_id"],
                    "name": f"{v['name']} (ElevenLabs)",
                    "provider": "elevenlabs",
                    "gender": labels.get("gender", "Neutral").capitalize(),
                    "category": v.get("category", "premade"),
                    "preview_url": v.get("preview_url"),
                    "description": desc,
                    "sample_text": "Halo, ini adalah contoh sampel suara dari akun ElevenLabs Anda.",
                })
            return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil daftar suara ElevenLabs: {str(e)}")


@router.get("/tts/sample")
async def get_voice_sample(
    provider: str = "gemini",
    voice: str = "Puck",
    model: Optional[str] = None,
    language: Optional[str] = None,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Serve real 2-3s sample audio for the specified voice."""
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()
    api_key = ""
    settings = get_settings()
    clean_prov = provider.lower().strip()
    if clean_prov == "elevenlabs":
        tts_model = model or (getattr(cfg, "elevenlabs_model", "eleven_multilingual_v2") if cfg else "eleven_multilingual_v2")
        if cfg and cfg.elevenlabs_api_key_encrypted:
            api_key = decrypt_secret(cfg.elevenlabs_api_key_encrypted)
        if not api_key:
            api_key = getattr(settings, "ELEVENLABS_API_KEY", "") or ""
    elif clean_prov == "runware":
        tts_model = model or (getattr(cfg, "runware_tts_model", "fishaudio:s2.1@pro") if cfg else "fishaudio:s2.1@pro")
        if cfg:
            if getattr(cfg, "runware_api_key_encrypted", None):
                api_key = decrypt_secret(cfg.runware_api_key_encrypted)
            elif cfg.image_api_key_encrypted:
                api_key = decrypt_secret(cfg.image_api_key_encrypted)
        if not api_key:
            api_key = getattr(settings, "IMAGE_API_KEY", "") or ""
    elif clean_prov == "gemini":
        tts_model = model or "gemini-2.5-flash-preview-tts"
        if cfg:
            if cfg.tts_api_key_encrypted:
                api_key = decrypt_secret(cfg.tts_api_key_encrypted)
            elif cfg.api_key_encrypted:
                api_key = decrypt_secret(cfg.api_key_encrypted)
            if not model and cfg.tts_provider and cfg.tts_provider.startswith("gemini-"):
                tts_model = cfg.tts_provider
        if not api_key:
            api_key = getattr(settings, "GEMINI_API_KEY", "") or getattr(settings, "AI_API_KEY", "") or ""
    else:
        tts_model = model or "edge"

    try:
        sample_path = await get_or_generate_voice_sample(
            provider=provider,
            voice=voice,
            model=tts_model,
            api_key=api_key or None,
            force_refresh=force,
            language=language,
        )
        return FileResponse(
            path=str(sample_path),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memuat sampel suara {voice} ({provider}): {e}")


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

    target_lang = (payload.language or getattr(narration, "language", None) or getattr(proj, "language", None) or "id").strip().lower()

    provider = payload.provider or "gemini"
    if payload.voice:
        voice = payload.voice
    elif provider == "gemini":
        voice = "Puck"
    elif provider == "elevenlabs":
        voice = "Adam"
    elif provider == "runware":
        voice = "fishaudio:s2.1@pro"
    else:
        voice = "en-US-JennyNeural" if target_lang == "en" else "id-ID-GadisNeural"

    # If edge provider is selected for English narration but an ID voice was left, auto-switch to English voice
    if provider == "edge" and target_lang == "en" and voice.startswith("id-"):
        voice = "en-US-JennyNeural"

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
            payload.model,
            payload.fallback_enabled,
            target_lang,
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
                payload.model,
                payload.fallback_enabled,
                target_lang,
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

    raw_url = storage.to_relative_url(track.file_path)
    if raw_url:
        ts = int(track.created_at.timestamp()) if track.created_at else 0
        audio_url = f"{raw_url}?v={ts}"
    else:
        audio_url = None

    return AudioTrackResponse(
        id=track.id,
        project_id=track.project_id,
        narration_id=track.narration_id,
        provider=track.provider,
        voice=track.voice,
        rate=track.rate,
        pitch=track.pitch,
        audio_url=audio_url,
        duration=track.duration,
        estimated_cost=track.estimated_cost,
        status=track.status,
    )


@router.post("/projects/{project_id}/tts/realign", response_model=NarrationResponse)
async def realign_narration_words(
    project_id: str,
    payload: Optional[RealignWordsRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Re-sync word-level forced alignment against the existing audio track using Whisper AI."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # 1. Fetch active audio track (prefer ready status)
    a_res = await db.execute(
        select(AudioTrack)
        .where(
            AudioTrack.project_id == project_id,
            AudioTrack.status == "ready",
            AudioTrack.file_path.isnot(None),
        )
        .order_by(AudioTrack.created_at.desc())
    )
    audio_track = a_res.scalars().first()
    if not audio_track or not audio_track.file_path or not Path(audio_track.file_path).exists():
        # Fallback to any audio track with an existing file
        a_res_any = await db.execute(
            select(AudioTrack)
            .where(AudioTrack.project_id == project_id, AudioTrack.file_path.isnot(None))
            .order_by(AudioTrack.created_at.desc())
        )
        audio_track = a_res_any.scalars().first()

    if not audio_track or not audio_track.file_path or not Path(audio_track.file_path).exists():
        raise HTTPException(
            status_code=400,
            detail="File audio narasi belum tersedia. Generate suara TTS terlebih dahulu.",
        )

    # 2. Fetch narration
    n_res = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
    )
    narration = n_res.scalars().first()
    if not narration:
        raise HTTPException(status_code=400, detail="Belum ada naskah narasi untuk disinkronkan.")

    # Determine segments to align
    from app.services.narrative import split_into_sentence_segments
    target_segments = None
    if payload and payload.segments:
        target_segments = payload.segments
    elif narration.segments and len(narration.segments) > 0:
        target_segments = narration.segments
    elif narration.raw_text:
        target_segments = split_into_sentence_segments(narration.raw_text)

    if not target_segments:
        raise HTTPException(status_code=400, detail="Belum ada segmen narasi untuk disinkronkan.")

    offset_ms = payload.offset_ms if payload else 0
    language = payload.language if payload else "id"
    model_size = payload.model_size if payload else "base"

    # 3. Strictly run audio-anchored forced alignment via Whisper AI
    try:
        aligned_segments = await align_audio_with_text(
            audio_path=audio_track.file_path,
            segments=target_segments,
            total_audio_duration_sec=audio_track.duration or 30.0,
            language=language,
            model_size=model_size,
            offset_ms=offset_ms,
            force_realignment=True,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Realignment error for project %s: %s", project_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Gagal melakukan realign kata via Whisper AI: {str(e)}",
        )

    narration.segments = aligned_segments
    narration.status = "aligned"
    await db.commit()
    await db.refresh(narration)

    # Publish real-time event so open tabs refresh automatically
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
