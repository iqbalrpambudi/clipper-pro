from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import get_settings
from app.core.security import decrypt_secret
from app.models.config import ModelConfig
from app.services.ai_adapters.base import BaseLLMAdapter
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter
from app.services.ai_adapters.gemini_adapter import GeminiAdapter


async def get_active_llm_adapter(db: AsyncSession) -> BaseLLMAdapter:
    settings = get_settings()

    # Query active config from DB
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    db_config = res.scalar_one_or_none()

    if db_config:
        api_key = decrypt_secret(db_config.api_key_encrypted) if db_config.api_key_encrypted else settings.AI_API_KEY
        base_url = db_config.base_url or settings.AI_BASE_URL
        chat_model = db_config.chat_model or settings.AI_CHAT_MODEL
        vision_model = db_config.vision_model or settings.AI_VISION_MODEL
    else:
        api_key = settings.AI_API_KEY or settings.GEMINI_API_KEY
        base_url = settings.AI_BASE_URL
        chat_model = settings.AI_CHAT_MODEL
        vision_model = settings.AI_VISION_MODEL

    # If base_url or model mentions gemini or google
    if (base_url and "googleapis.com" in base_url) or "gemini" in chat_model.lower():
        return GeminiAdapter(
            api_key=api_key,
            chat_model=chat_model,
            vision_model=vision_model,
            base_url=base_url,
        )

    return OpenAICompatibleAdapter(
        base_url=base_url,
        api_key=api_key,
        chat_model=chat_model,
        vision_model=vision_model,
    )
