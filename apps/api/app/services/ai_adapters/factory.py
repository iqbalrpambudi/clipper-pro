from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decrypt_secret
from app.models.config import ModelConfig
from app.services.ai_adapters.base import BaseLLMAdapter
from app.services.ai_adapters.gemini_adapter import GeminiAdapter
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter


def _normalize_gemini_model(model_name: str) -> str:
    m = (model_name or "").strip().lower()
    if m in ("gemini", "gemini-flash", "gemini-2.0-flash", "gemini-1.5-flash"):
        return "gemini-2.5-flash-lite"
    if m.startswith("models/"):
        return m[len("models/"):]
    return model_name or "gemini-2.5-flash-lite"


async def _resolve_config(db: AsyncSession) -> Tuple[str, str, str, str, str]:
    """Resolve (api_key, tts_key, base_url, chat_model, vision_model) from the active DB row, else env."""
    settings = get_settings()

    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()

    if cfg:
        db_key = decrypt_secret(cfg.api_key_encrypted) if cfg.api_key_encrypted else ""
        db_tts_key = decrypt_secret(cfg.tts_api_key_encrypted) if cfg.tts_api_key_encrypted else ""
        return (
            db_key or settings.AI_API_KEY or settings.GEMINI_API_KEY,
            db_tts_key or settings.GEMINI_API_KEY,
            cfg.base_url or settings.AI_BASE_URL,
            cfg.chat_model or settings.AI_CHAT_MODEL,
            cfg.vision_model or settings.AI_VISION_MODEL,
        )

    return (
        settings.AI_API_KEY or settings.GEMINI_API_KEY,
        settings.GEMINI_API_KEY,
        settings.AI_BASE_URL,
        settings.AI_CHAT_MODEL,
        settings.AI_VISION_MODEL,
    )


def _build_adapter(
    api_key: str,
    tts_key: str,
    base_url: Optional[str],
    chat_model: str,
    vision_model: str,
    trigger_model: str,
    inferhub_override: bool = False,
) -> BaseLLMAdapter:
    """Pick adapter by base_url/model. `trigger_model` decides Gemini routing."""
    settings = get_settings()
    is_google = bool(base_url and "googleapis.com" in base_url.lower())

    # Priority 1: custom base_url that is NOT googleapis.com (InferHub, LiteLLM, Ollama, OpenRouter)
    if base_url and not is_google:
        if inferhub_override and ("20128" in base_url or "inferhub" in base_url.lower()) and (
            not vision_model or vision_model.strip().lower() in ("gemini", "gemini-flash", "gemini-pro")
        ):
            chat_model = vision_model = "inferhub/gemini-3.6-flash"

        return OpenAICompatibleAdapter(
            base_url=base_url,
            api_key=api_key,
            chat_model=chat_model,
            vision_model=vision_model,
            gemini_key=tts_key or settings.GEMINI_API_KEY,
        )

    # Priority 2: Gemini model or explicit Google endpoint
    if "gemini" in (trigger_model or "").lower() or is_google:
        gemini_key = api_key if (api_key and ("AIza" in api_key or "AQ." in api_key)) else (tts_key or settings.GEMINI_API_KEY or api_key)
        return GeminiAdapter(
            api_key=gemini_key,
            chat_model=_normalize_gemini_model(chat_model),
            vision_model=_normalize_gemini_model(vision_model),
            base_url=base_url if is_google else None,
        )

    # Default: standard OpenAI-compatible endpoint
    return OpenAICompatibleAdapter(
        base_url=base_url,
        api_key=api_key,
        chat_model=chat_model,
        vision_model=vision_model,
        gemini_key=tts_key or settings.GEMINI_API_KEY,
    )


async def get_active_vision_adapter(db: AsyncSession) -> BaseLLMAdapter:
    """Get adapter specifically configured for scene vision analysis."""
    api_key, tts_key, base_url, _chat_model, vision_model = await _resolve_config(db)
    return _build_adapter(
        api_key, tts_key, base_url, vision_model, vision_model, vision_model,
        inferhub_override=True,
    )


async def get_active_llm_adapter(db: AsyncSession) -> BaseLLMAdapter:
    """Get adapter for chat, narrative, and timeline script operations."""
    api_key, tts_key, base_url, chat_model, vision_model = await _resolve_config(db)
    return _build_adapter(api_key, tts_key, base_url, chat_model, vision_model, chat_model)
