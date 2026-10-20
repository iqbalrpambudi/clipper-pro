import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class NarrationTemplate(Base):
    __tablename__ = "narration_templates"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # slug / id
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), default="custom")  # preset: film | viral | edukasi | fakta | custom
    sub_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # sub/genre dalam preset
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    default_tone: Mapped[str] = mapped_column(String(50), default="santai")
    default_voice: Mapped[str] = mapped_column(String(50), default="Puck")
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Narration(Base):
    __tablename__ = "narrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    topic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tone: Mapped[str] = mapped_column(String(50), default="santai")  # santai, formal, dramatis
    target_duration: Mapped[int] = mapped_column(Integer, default=60)  # seconds
    raw_text: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(10), default="id")
    # segments: [ { "id": "seg-1", "text": "...", "start_ms": 0, "end_ms": 2500, "words": [...] } ]
    segments: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(50), default="draft")  # draft, generating, generated, tts_generating, aligned, failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="narrations")
    audio_tracks: Mapped[List["AudioTrack"]] = relationship("AudioTrack", back_populates="narration", cascade="all, delete-orphan")


class AudioTrack(Base):
    __tablename__ = "audio_tracks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    narration_id: Mapped[str] = mapped_column(String(36), ForeignKey("narrations.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(50), default="gemini")  # gemini | edge
    voice: Mapped[str] = mapped_column(String(100), default="Puck")
    rate: Mapped[str] = mapped_column(String(20), default="+0%")
    pitch: Mapped[str] = mapped_column(String(20), default="+0Hz")
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="generating")  # generating, ready, failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="audio_tracks")
    narration: Mapped["Narration"] = relationship("Narration", back_populates="audio_tracks")
