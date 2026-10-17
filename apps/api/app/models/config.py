import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Boolean, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), default="default")
    base_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    chat_model: Mapped[str] = mapped_column(String(100), default="gemini-2.0-flash")
    vision_model: Mapped[str] = mapped_column(String(100), default="gemini-2.0-flash")
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tts_provider: Mapped[str] = mapped_column(String(50), default="gemini-2.5-flash-preview-tts")
    tts_api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tts_fallback_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    elevenlabs_api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    elevenlabs_model: Mapped[str] = mapped_column(String(100), default="eleven_multilingual_v2")
    runware_api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    runware_tts_model: Mapped[str] = mapped_column(String(100), default="fishaudio:s2.1@pro")
    image_base_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    image_model: Mapped[str] = mapped_column(String(100), default="dall-e-3")
    image_concurrency: Mapped[int] = mapped_column(Integer, default=2)
    image_api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
