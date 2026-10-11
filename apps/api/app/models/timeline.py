import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Float, Integer, ForeignKey, DateTime, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.db import Base


class Timeline(Base):
    __tablename__ = "timelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False)
    # clips: list of objects:
    # {
    #   "id": "clip-1",
    #   "segment_id": "seg-1",
    #   "scene_id": "scene-uuid",
    #   "source_video_id": "video-uuid",
    #   "timeline_start": 0.0,
    #   "timeline_end": 2.5,
    #   "clip_start": 0.0,
    #   "clip_end": 2.5,
    #   "speed": 1.0,
    #   "background_fill_override": None
    # }
    clips: Mapped[list] = mapped_column(JSON, default=list)
    total_duration: Mapped[float] = mapped_column(Float, default=0.0)
    has_audio: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    has_subtitles: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, **kwargs):
        kwargs.setdefault("has_audio", True)
        kwargs.setdefault("has_subtitles", True)
        kwargs.setdefault("clips", [])
        kwargs.setdefault("total_duration", 0.0)
        super().__init__(**kwargs)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="timeline")


class SubtitleStyle(Base):
    __tablename__ = "subtitle_styles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=True)
    preset_name: Mapped[str] = mapped_column(String(50), default="viral_tiktok")  # viral_tiktok | hormozi_punch | minimalist | custom
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_preset: Mapped[bool] = mapped_column(Boolean, default=False)
    font_family: Mapped[str] = mapped_column(String(100), default="Poppins")
    font_size: Mapped[int] = mapped_column(Integer, default=52)
    font_weight: Mapped[str] = mapped_column(String(20), default="Bold")
    primary_color: Mapped[str] = mapped_column(String(20), default="#FFFFFF")
    highlight_color: Mapped[str] = mapped_column(String(20), default="#FFE600")
    outline_color: Mapped[str] = mapped_column(String(20), default="#000000")
    outline_width: Mapped[int] = mapped_column(Integer, default=4)
    box_color: Mapped[str] = mapped_column(String(20), default="#000000")
    box_opacity: Mapped[float] = mapped_column(Float, default=0.0)  # 0 to 1
    position: Mapped[str] = mapped_column(String(20), default="bottom")  # top | center | bottom
    offset_y: Mapped[int] = mapped_column(Integer, default=0)
    offset_x: Mapped[int] = mapped_column(Integer, default=0)
    display_mode: Mapped[str] = mapped_column(String(20), default="per_word")  # per_word | full_sentence | burst
    burst_word_count: Mapped[int] = mapped_column(Integer, default=2)  # 2 or 3
    highlight_animation: Mapped[str] = mapped_column(String(20), default="scale")  # scale | color | box | none
    scale_factor: Mapped[float] = mapped_column(Float, default=1.15)
    emoji_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped[Optional["Project"]] = relationship("Project", back_populates="subtitle_style")
