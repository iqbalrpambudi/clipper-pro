import logging
import time
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import decrypt_secret, encrypt_secret, mask_secret
from app.models.config import ModelConfig
from app.schemas.config import (
    ModelConfigResponse,
    ModelConfigUpdate,
    ProjectDefaultsConfig,
    ProjectDefaultsResponse,
    TestConnectionRequest,
    TestConnectionResponse,
    TestTtsConnectionRequest,
    TestTtsConnectionResponse,
)
from app.services.ai_adapters.gemini_adapter import GeminiAdapter
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter
from app.services.project_defaults import (
    export_project_defaults_json,
    load_project_defaults,
    reset_project_defaults,
    resolve_config_json_path,
    save_project_defaults,
)
from app.services.tts import test_tts_connection

log = logging.getLogger("cliper-pro.settings")

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/config", response_model=ModelConfigResponse)
async def get_model_configuration(db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()

    if not cfg:
        # Create default from settings
        cfg = ModelConfig(
            name="default",
            base_url=settings.AI_BASE_URL,
            chat_model=settings.AI_CHAT_MODEL,
            vision_model=settings.AI_VISION_MODEL,
            api_key_encrypted=encrypt_secret(settings.AI_API_KEY) if settings.AI_API_KEY else None,
            tts_provider=settings.TTS_PROVIDER,
            tts_api_key_encrypted=encrypt_secret(settings.GEMINI_API_KEY)
            if settings.GEMINI_API_KEY
            else None,
        )
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)

    raw_api_key = decrypt_secret(cfg.api_key_encrypted) if cfg.api_key_encrypted else ""
    raw_tts_key = decrypt_secret(cfg.tts_api_key_encrypted) if cfg.tts_api_key_encrypted else ""
    raw_elevenlabs_key = (
        decrypt_secret(cfg.elevenlabs_api_key_encrypted) if cfg.elevenlabs_api_key_encrypted else ""
    )

    return ModelConfigResponse(
        id=cfg.id,
        name=cfg.name,
        base_url=cfg.base_url,
        chat_model=cfg.chat_model,
        vision_model=cfg.vision_model,
        vision_fallback_model=cfg.vision_fallback_model,
        api_key_masked=mask_secret(raw_api_key),
        has_api_key=bool(raw_api_key),
        tts_provider=cfg.tts_provider,
        tts_api_key_masked=mask_secret(raw_tts_key),
        has_tts_api_key=bool(raw_tts_key),
        elevenlabs_api_key_masked=mask_secret(raw_elevenlabs_key),
        has_elevenlabs_api_key=bool(raw_elevenlabs_key),
        elevenlabs_model=getattr(cfg, "elevenlabs_model", "eleven_multilingual_v2")
        or "eleven_multilingual_v2",
        is_active=cfg.is_active,
    )


@router.post("/config", response_model=ModelConfigResponse)
async def save_model_configuration(
    payload: ModelConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()
    if not cfg:
        cfg = ModelConfig(name="default")
        db.add(cfg)

    if payload.base_url is not None:
        cfg.base_url = payload.base_url
    if payload.chat_model is not None:
        cfg.chat_model = payload.chat_model
    if payload.vision_model is not None:
        cfg.vision_model = payload.vision_model
    if payload.vision_fallback_model is not None:
        cfg.vision_fallback_model = payload.vision_fallback_model.strip() or None
    if payload.api_key is not None and payload.api_key.strip():
        cfg.api_key_encrypted = encrypt_secret(payload.api_key.strip())
    if payload.tts_provider is not None:
        cfg.tts_provider = payload.tts_provider
    if payload.tts_api_key is not None and payload.tts_api_key.strip():
        cfg.tts_api_key_encrypted = encrypt_secret(payload.tts_api_key.strip())
    if payload.elevenlabs_api_key is not None and payload.elevenlabs_api_key.strip():
        cfg.elevenlabs_api_key_encrypted = encrypt_secret(payload.elevenlabs_api_key.strip())
    if payload.elevenlabs_model is not None:
        cfg.elevenlabs_model = payload.elevenlabs_model

    await db.commit()
    await db.refresh(cfg)

    raw_api_key = decrypt_secret(cfg.api_key_encrypted) if cfg.api_key_encrypted else ""
    raw_tts_key = decrypt_secret(cfg.tts_api_key_encrypted) if cfg.tts_api_key_encrypted else ""
    raw_elevenlabs_key = (
        decrypt_secret(cfg.elevenlabs_api_key_encrypted) if cfg.elevenlabs_api_key_encrypted else ""
    )

    return ModelConfigResponse(
        id=cfg.id,
        name=cfg.name,
        base_url=cfg.base_url,
        chat_model=cfg.chat_model,
        vision_model=cfg.vision_model,
        vision_fallback_model=cfg.vision_fallback_model,
        api_key_masked=mask_secret(raw_api_key),
        has_api_key=bool(raw_api_key),
        tts_provider=cfg.tts_provider,
        tts_api_key_masked=mask_secret(raw_tts_key),
        has_tts_api_key=bool(raw_tts_key),
        elevenlabs_api_key_masked=mask_secret(raw_elevenlabs_key),
        has_elevenlabs_api_key=bool(raw_elevenlabs_key),
        elevenlabs_model=getattr(cfg, "elevenlabs_model", "eleven_multilingual_v2")
        or "eleven_multilingual_v2",
        is_active=cfg.is_active,
    )


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_model_connection(
    payload: TestConnectionRequest,
    db: AsyncSession = Depends(get_db),
):
    # Resolve credentials: if not provided in payload, look up from DB
    api_key = payload.api_key
    base_url = payload.base_url
    chat_model = payload.chat_model or "gemini-2.0-flash"
    vision_model = payload.vision_model or "gemini-2.0-flash"

    if not api_key:
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()
        if cfg and cfg.api_key_encrypted:
            api_key = decrypt_secret(cfg.api_key_encrypted)
        if not base_url and cfg:
            base_url = cfg.base_url

    start_time = time.time()
    try:
        if base_url and "googleapis.com" in base_url:
            adapter = GeminiAdapter(
                api_key=api_key,
                chat_model=chat_model,
                vision_model=vision_model,
                base_url=base_url,
            )
        elif not base_url and "gemini" in chat_model.lower():
            adapter = GeminiAdapter(
                api_key=api_key,
                chat_model=chat_model,
                vision_model=vision_model,
            )
        else:
            adapter = OpenAICompatibleAdapter(
                base_url=base_url,
                api_key=api_key,
                chat_model=chat_model,
                vision_model=vision_model,
            )

        # Ping chat model
        _ = await adapter.generate_chat("hi")
        latency = int((time.time() - start_time) * 1000)

        return TestConnectionResponse(
            success=True,
            chat_model_status=f"Connected ({chat_model})",
            vision_model_status=f"Ready ({vision_model})",
            latency_ms=latency,
            message="Koneksi ke model AI berhasil!",
        )
    except Exception as e:
        latency = int((time.time() - start_time) * 1000)
        return TestConnectionResponse(
            success=False,
            chat_model_status="Failed",
            vision_model_status="Failed",
            latency_ms=latency,
            message=f"Gagal terhubung ke model: {str(e)}",
        )


@router.post("/test-tts-connection", response_model=TestTtsConnectionResponse)
async def test_tts_model_connection(
    payload: TestTtsConnectionRequest,
    db: AsyncSession = Depends(get_db),
):
    provider = payload.provider or "gemini"
    api_key = payload.api_key
    model = payload.model
    voice = payload.voice

    if not api_key:
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()
        if cfg:
            if provider == "elevenlabs" and cfg.elevenlabs_api_key_encrypted:
                api_key = decrypt_secret(cfg.elevenlabs_api_key_encrypted)
            elif provider == "gemini":
                if cfg.tts_api_key_encrypted:
                    api_key = decrypt_secret(cfg.tts_api_key_encrypted)
                elif cfg.api_key_encrypted:
                    api_key = decrypt_secret(cfg.api_key_encrypted)

            if not model:
                if provider == "elevenlabs":
                    model = getattr(cfg, "elevenlabs_model", "eleven_multilingual_v2")

    res = await test_tts_connection(
        provider=provider,
        api_key=api_key,
        model=model,
        voice=voice,
    )
    return TestTtsConnectionResponse(
        success=res["success"],
        provider_status=res["provider_status"],
        latency_ms=res["latency_ms"],
        message=res["message"],
    )


_MODELS_CACHE: dict = {}
_MODELS_CACHE_TTL: float = 300.0  # 5 minutes


@router.get("/models")
async def list_available_models(
    base_url: str = "",
    x_api_key: str = Header("", alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch model ids from an OpenAI-compatible endpoint. Key travels in X-Api-Key header."""
    target_url = base_url.strip()
    target_key = x_api_key.strip()

    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()
    if cfg:
        if not target_url:
            target_url = cfg.base_url or ""
        if not target_key and cfg.api_key_encrypted:
            target_key = decrypt_secret(cfg.api_key_encrypted)

    if not target_url:
        return {"models": ["gemini-2.0-flash", "gemini-1.5-flash", "gpt-4o", "gpt-4o-mini"]}

    raw_url = target_url.rstrip("/")
    if not raw_url.endswith("/v1") and "googleapis.com" not in raw_url:
        raw_url = f"{raw_url}/v1"

    headers = {"Content-Type": "application/json"}
    if target_key:
        headers["Authorization"] = f"Bearer {target_key}"

    cache_key = f"{raw_url}::{target_key}"
    now = time.time()
    if cache_key in _MODELS_CACHE:
        cached_time, cached_result = _MODELS_CACHE[cache_key]
        if now - cached_time < _MODELS_CACHE_TTL:
            return cached_result
        _MODELS_CACHE.pop(cache_key, None)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{raw_url}/models", headers=headers)
            if resp.status_code == 200:
                models = [
                    m["id"]
                    for m in resp.json().get("data", [])
                    if isinstance(m, dict) and "id" in m
                ]
                res_data = {"models": models}
                _MODELS_CACHE[cache_key] = (now, res_data)
                return res_data
    except Exception as e:
        log.warning("Failed to fetch models from %s: %s", raw_url, e)

    return {"models": []}


def _to_defaults_response(
    cfg: ProjectDefaultsConfig, path_str: str, from_file: bool
) -> ProjectDefaultsResponse:
    # Every section of the config, so a newly added one (e.g. background_fill) is never dropped.
    return ProjectDefaultsResponse(**cfg.model_dump(), config_path=path_str, from_file=from_file)


@router.get("/project-defaults", response_model=ProjectDefaultsResponse)
async def get_project_defaults():
    cfg, cfg_path, from_file = load_project_defaults()
    return _to_defaults_response(cfg, str(cfg_path), from_file)


@router.put("/project-defaults", response_model=ProjectDefaultsResponse)
async def update_project_defaults(payload: ProjectDefaultsConfig):
    saved = save_project_defaults(payload)
    target = resolve_config_json_path()
    return _to_defaults_response(saved, str(target), True)


@router.post("/project-defaults/import", response_model=ProjectDefaultsResponse)
async def import_project_defaults(payload: Dict[str, Any]):
    try:
        saved = save_project_defaults(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Format config.json tidak valid: {exc}")
    target = resolve_config_json_path()
    return _to_defaults_response(saved, str(target), True)


@router.post("/project-defaults/reset", response_model=ProjectDefaultsResponse)
async def reset_project_defaults_endpoint():
    saved = reset_project_defaults()
    target = resolve_config_json_path()
    return _to_defaults_response(saved, str(target), True)


@router.get("/project-defaults/export")
async def export_project_defaults():
    cfg, _, _ = load_project_defaults()
    content = export_project_defaults_json(cfg)
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="config.json"'},
    )
