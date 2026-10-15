import re
import time
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.core.config import get_settings
from app.core.security import encrypt_secret, mask_secret, decrypt_secret
from app.models.config import ModelConfig
from app.schemas.config import (
    ModelConfigUpdate,
    ModelConfigResponse,
    TestConnectionRequest,
    TestConnectionResponse,
    TestImageConnectionRequest,
    TestImageConnectionResponse,
)
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter
from app.services.ai_adapters.gemini_adapter import GeminiAdapter
from app.services.image_gen import test_image_connection

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
            tts_api_key_encrypted=encrypt_secret(settings.GEMINI_API_KEY) if settings.GEMINI_API_KEY else None,
            image_base_url=settings.IMAGE_BASE_URL,
            image_model=settings.IMAGE_MODEL,
            image_api_key_encrypted=encrypt_secret(settings.IMAGE_API_KEY) if settings.IMAGE_API_KEY else None,
            image_system_prompt=settings.IMAGE_SYSTEM_PROMPT,
        )
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)

    raw_api_key = decrypt_secret(cfg.api_key_encrypted) if cfg.api_key_encrypted else ""
    raw_tts_key = decrypt_secret(cfg.tts_api_key_encrypted) if cfg.tts_api_key_encrypted else ""
    raw_image_key = decrypt_secret(cfg.image_api_key_encrypted) if cfg.image_api_key_encrypted else ""

    return ModelConfigResponse(
        id=cfg.id,
        name=cfg.name,
        base_url=cfg.base_url,
        chat_model=cfg.chat_model,
        vision_model=cfg.vision_model,
        api_key_masked=mask_secret(raw_api_key),
        has_api_key=bool(raw_api_key),
        tts_provider=cfg.tts_provider,
        tts_api_key_masked=mask_secret(raw_tts_key),
        has_tts_api_key=bool(raw_tts_key),
        image_base_url=cfg.image_base_url,
        image_model=cfg.image_model or "dall-e-3",
        image_api_key_masked=mask_secret(raw_image_key),
        has_image_api_key=bool(raw_image_key),
        image_system_prompt=cfg.image_system_prompt or settings.IMAGE_SYSTEM_PROMPT,
        is_active=cfg.is_active,
    )


@router.post("/config", response_model=ModelConfigResponse)
async def save_model_configuration(
    payload: ModelConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
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
    if payload.api_key is not None and payload.api_key.strip():
        cfg.api_key_encrypted = encrypt_secret(payload.api_key.strip())
    if payload.tts_provider is not None:
        cfg.tts_provider = payload.tts_provider
    if payload.tts_api_key is not None and payload.tts_api_key.strip():
        cfg.tts_api_key_encrypted = encrypt_secret(payload.tts_api_key.strip())
    if payload.image_base_url is not None:
        cfg.image_base_url = payload.image_base_url
    if payload.image_model is not None:
        cfg.image_model = payload.image_model
    if payload.image_api_key is not None and payload.image_api_key.strip():
        cfg.image_api_key_encrypted = encrypt_secret(payload.image_api_key.strip())
    if payload.image_system_prompt is not None:
        cfg.image_system_prompt = payload.image_system_prompt

    await db.commit()
    await db.refresh(cfg)

    raw_api_key = decrypt_secret(cfg.api_key_encrypted) if cfg.api_key_encrypted else ""
    raw_tts_key = decrypt_secret(cfg.tts_api_key_encrypted) if cfg.tts_api_key_encrypted else ""
    raw_image_key = decrypt_secret(cfg.image_api_key_encrypted) if cfg.image_api_key_encrypted else ""

    return ModelConfigResponse(
        id=cfg.id,
        name=cfg.name,
        base_url=cfg.base_url,
        chat_model=cfg.chat_model,
        vision_model=cfg.vision_model,
        api_key_masked=mask_secret(raw_api_key),
        has_api_key=bool(raw_api_key),
        tts_provider=cfg.tts_provider,
        tts_api_key_masked=mask_secret(raw_tts_key),
        has_tts_api_key=bool(raw_tts_key),
        image_base_url=cfg.image_base_url,
        image_model=cfg.image_model or "dall-e-3",
        image_api_key_masked=mask_secret(raw_image_key),
        has_image_api_key=bool(raw_image_key),
        image_system_prompt=cfg.image_system_prompt or settings.IMAGE_SYSTEM_PROMPT,
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
        chat_resp = await adapter.generate_chat("Jawab satu kata: OK")
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


@router.post("/test-image-connection", response_model=TestImageConnectionResponse)
async def test_image_model_connection(
    payload: TestImageConnectionRequest,
    db: AsyncSession = Depends(get_db),
):
    api_key = payload.api_key
    base_url = payload.base_url
    image_model = payload.image_model

    if not api_key:
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()
        if cfg and cfg.image_api_key_encrypted:
            api_key = decrypt_secret(cfg.image_api_key_encrypted)
        if not base_url and cfg:
            base_url = cfg.image_base_url
        if not image_model and cfg:
            image_model = cfg.image_model

    result = await test_image_connection(base_url=base_url, api_key=api_key, model=image_model)
    return TestImageConnectionResponse(
        success=result["success"],
        image_model_status=result["image_model_status"],
        latency_ms=result["latency_ms"],
        message=result["message"],
    )


_MODELS_CACHE: dict = {}
_MODELS_CACHE_TTL: float = 300.0  # 5 minutes

@router.get("/models")
async def list_available_models(
    base_url: str = "",
    x_api_key: str = Header("", alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch list of available models from [OI]-compatible endpoint or 9Router.
    The key travels in the X-Api-Key header so it never lands in access logs.
    """
    target_url = base_url.strip()
    target_key = x_api_key.strip()

    if not target_url:
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()
        if cfg and cfg.base_url:
            target_url = cfg.base_url
            if not target_key and cfg.api_key_encrypted:
                target_key = decrypt_secret(cfg.api_key_encrypted)

    if not target_url:
        return {
            "models": [
                "gemini-2.0-flash",
                "gemini-1.5-flash",
                "gpt-4o",
                "gpt-4o-mini",
                "claude-3-5-sonnet-20241022",
            ]
        }

    raw_url = target_url.rstrip("/")
    raw_url = re.sub(r"^(https?://)(localhost|127\.0\.0\.1)", r"\1host.docker.internal", raw_url)
    if not raw_url.endswith("/v1") and "googleapis.com" not in raw_url:
        raw_url = f"{raw_url}/v1"

    headers = {"Content-Type": "application/json"}
    if target_key:
        headers["Authorization"] = f"Bearer {target_key}"

    cache_key = f"{raw_url}::{target_key}"
    now = time.time()
    if cache_key in _MODELS_CACHE:
        cached_time, cached_models = _MODELS_CACHE[cache_key]
        if now - cached_time < _MODELS_CACHE_TTL:
            return {"models": cached_models}
        # ponytail: drop only the expired entry; switch to an LRU when the key
        # space grows beyond a handful of provider configs.
        _MODELS_CACHE.pop(cache_key, None)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{raw_url}/models", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                raw_models = data.get("data", [])
                models = [m["id"] for m in raw_models if isinstance(m, dict) and "id" in m]
                _MODELS_CACHE[cache_key] = (now, models)
                return {"models": models}
    except Exception as e:
        pass

    return {"models": []}

