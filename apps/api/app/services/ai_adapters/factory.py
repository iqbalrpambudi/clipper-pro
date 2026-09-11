from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import get_settings
from app.core.security import decrypt_secret
from app.models.config import ModelConfig
from app.services.ai_adapters.base import BaseLLMAdapter
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter
from app.services.ai_adapters.gemini_adapter import GeminiAdapter


def _normalize_gemini_model(model_name: str) -> str:
    m = (model_name or "").strip().lower()
    if m in ("gemini", "gemini-flash", "gemini-2.0-flash", "gemini-1.5-flash"):
        return "gemini-2.5-flash-lite"
    if m.startswith("models/"):
        return m[len("models/"):]
    return model_name or "gemini-2.5-flash-lite"


async def get_active_vision_adapter(db: AsyncSession) -> BaseLLMAdapter:
    """Get adapter specifically configured for scene vision analysis."""
    settings = get_settings()

    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    db_config = res.scalar_one_or_none()

    if db_config:
        vision_model = db_config.vision_model or settings.AI_VISION_MODEL
        api_key = decrypt_secret(db_config.api_key_encrypted) if db_config.api_key_encrypted else ""
        tts_key = decrypt_secret(db_config.tts_api_key_encrypted) if db_config.tts_api_key_encrypted else ""
        base_url = db_config.base_url or settings.AI_BASE_URL
    else:
        vision_model = settings.AI_VISION_MODEL
        api_key = settings.AI_API_KEY or ""
        tts_key = settings.GEMINI_API_KEY or ""
        base_url = settings.AI_BASE_URL

    # Check if selected vision_model is Gemini
    if "gemini" in (vision_model or "").lower():
        gemini_key = api_key if (api_key and ("AIza" in api_key or "AQ." in api_key)) else (tts_key or settings.GEMINI_API_KEY or api_key)
        norm_model = _normalize_gemini_model(vision_model)
        return GeminiAdapter(
            api_key=gemini_key,
            vision_model=norm_model,
            chat_model=norm_model,
        )

    # If base_url explicitly points to Google Gemini
    if base_url and "googleapis.com" in base_url:
        gemini_key = api_key or tts_key or settings.GEMINI_API_KEY
        return GeminiAdapter(
            api_key=gemini_key,
            vision_model=_normalize_gemini_model(vision_model),
            chat_model=_normalize_gemini_model(vision_model),
            base_url=base_url,
        )

    # Standard OpenAI compatible vision model
    return OpenAICompatibleAdapter(
        base_url=base_url,
        api_key=api_key,
        chat_model=vision_model,
        vision_model=vision_model,
    )


async def get_active_llm_adapter(db: AsyncSession) -> BaseLLMAdapter:
    """Get adapter for chat, narrative, and timeline script operations."""
    settings = get_settings()

    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    db_config = res.scalar_one_or_none()

    if db_config:
        api_key = decrypt_secret(db_config.api_key_encrypted) if db_config.api_key_encrypted else settings.AI_API_KEY
        tts_key = decrypt_secret(db_config.tts_api_key_encrypted) if db_config.tts_api_key_encrypted else settings.GEMINI_API_KEY
        base_url = db_config.base_url or settings.AI_BASE_URL
        chat_model = db_config.chat_model or settings.AI_CHAT_MODEL
        vision_model = db_config.vision_model or settings.AI_VISION_MODEL
    else:
        api_key = settings.AI_API_KEY or settings.GEMINI_API_KEY
        tts_key = settings.GEMINI_API_KEY
        base_url = settings.AI_BASE_URL
        chat_model = settings.AI_CHAT_MODEL
        vision_model = settings.AI_VISION_MODEL

    if (base_url and "googleapis.com" in base_url) or (not base_url and "gemini" in (chat_model or "").lower()) or ("gemini" in (chat_model or "").lower() and not api_key):
        gemini_key = api_key if (api_key and ("AIza" in api_key or "AQ." in api_key)) else (tts_key or api_key)
        return GeminiAdapter(
            api_key=gemini_key,
            chat_model=_normalize_gemini_model(chat_model),
            vision_model=_normalize_gemini_model(vision_model),
            base_url=base_url if (base_url and "googleapis.com" in base_url) else None,
        )

    return OpenAICompatibleAdapter(
        base_url=base_url,
        api_key=api_key,
        chat_model=chat_model,
        vision_model=vision_model,
    )
