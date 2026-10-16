from functools import lru_cache
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    IMAGE_BASE_URL: str = "https://api.openai.com/v1"
    IMAGE_API_KEY: str = ""
    IMAGE_MODEL: str = "dall-e-3"
    IMAGE_CONCURRENCY: int = 2
    IMAGE_SYSTEM_PROMPT: str = (
        "Widescreen 16:9 landscape aspect ratio (horizontal orientation, 16:9 widescreen framing, wide composition, NOT square, NOT vertical). "
        "A minimal, storybook-style 2D line-art illustration, loose and clean black ink doodle, "
        "hand-drawn sketchy feeling with varying pen stroke thickness, on an isolated stark plain pure white background. "
        "Minimalist expressive doodle style, simple black dots for eyes, round pale head, charming clean proportions. "
        "Extremely sparse environment with only essential loosely-drawn contextual props, ample negative space on plain white background. "
        "Highly limited and selective color palette with muted, desaturated watercolor wash fills, subtle transparency and soft brush strokes, "
        "maintaining a gentle, calm, everyday slice-of-life storytelling mood. "
        "Pure white background, no 3D rendering, no heavy gradients, no borders, no frames, no text, no watermark."
    )

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
