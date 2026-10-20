from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.prompts.image import DEFAULT_IMAGE_SYSTEM_PROMPT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://cliper:cliper@postgres:5432/cliper_db"
    REDIS_URL: str = "redis://redis:6379/0"
    STORAGE_PATH: str = "/app/storage"

    MAX_UPLOAD_SIZE: int = 2147483648  # 2GB
    MAX_SOURCE_DURATION_MINS: int = 30

    CORS_ORIGINS: str = "http://localhost:3030,http://127.0.0.1:3030,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080"
    ENCRYPTION_KEY: str = "dGhpcy1pcy1hLTMyLWJ5dGUtc2VjcmV0LWtleS1mb3ItZGI="

    AI_BASE_URL: str = ""
    AI_API_KEY: str = ""
    AI_CHAT_MODEL: str = "gemini-2.0-flash"
    AI_VISION_MODEL: str = "gemini-2.0-flash"

    TTS_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_TTS_VOICE: str = "Puck"
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_MODEL: str = "eleven_multilingual_v2"
    RUNWARE_TTS_MODEL: str = "fishaudio:s2.1@pro"

    IMAGE_BASE_URL: str = "https://api.openai.com/v1"
    IMAGE_API_KEY: str = ""
    IMAGE_MODEL: str = "dall-e-3"
    IMAGE_CONCURRENCY: int = 2
    IMAGE_SYSTEM_PROMPT: str = DEFAULT_IMAGE_SYSTEM_PROMPT

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def storage_dir(self) -> Path:
        p = Path(self.STORAGE_PATH)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache()
def get_settings() -> Settings:
    return Settings()
