import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class StoryboardItem(Base):
    __tablename__ = "storyboard_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    narration_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("narrations.id", ondelete="SET NULL"), nullable=True, index=True)

    # Structural hierarchy
    chapter_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    segment_id: Mapped[str] = mapped_column(String(50), default="seg-1")
    order_index: Mapped[int] = mapped_column(Integer, default=0, index=True)

    # Narration & visual prompts
    script_text: Mapped[str] = mapped_column(Text, default="")
    image_prompt: Mapped[str] = mapped_column(Text, default="")

    # Generated asset
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Timeline & Motion properties
    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    end_time: Mapped[float] = mapped_column(Float, default=0.0)
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    motion_effect: Mapped[str] = mapped_column(String(50), default="zoom_in")  # zoom_in, zoom_out, pan_left, pan_right, static

    # Generation status
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, generating, ready, failed
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="storyboard_items")
