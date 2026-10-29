import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class MotionScene(Base):
    __tablename__ = "motion_scenes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    narration_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("narrations.id", ondelete="SET NULL"), nullable=True, index=True
    )

    segment_id: Mapped[str] = mapped_column(String(50), default="seg-1")
    order_index: Mapped[int] = mapped_column(Integer, default=0, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    archetype: Mapped[str] = mapped_column(String(80), default="kinetic_emblem")

    # Spoken narration & choreographed visual direction
    script_text: Mapped[str] = mapped_column(Text, default="")
    visual_concept: Mapped[str] = mapped_column(Text, default="")

    # Generative React/Remotion TSX code
    component_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Word-level frame cues & structured metadata
    cues: Mapped[list] = mapped_column(JSON, default=list)
    key_facts: Mapped[list] = mapped_column(JSON, default=list)
    transition_type: Mapped[str] = mapped_column(String(50), default="camera_push")

    # Timing & frames (30 FPS standard)
    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    end_time: Mapped[float] = mapped_column(Float, default=4.0)
    duration: Mapped[float] = mapped_column(Float, default=4.0)
    duration_frames: Mapped[int] = mapped_column(Integer, default=120)

    # Code synthesis status: pending | generating | ready | failed
    status: Mapped[str] = mapped_column(String(50), default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped["Project"] = relationship("Project", back_populates="motion_scenes")

