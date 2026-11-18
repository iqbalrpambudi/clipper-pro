import uuid
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

DEFAULT_NICHE = (
    "Fakta unik seputar pertanian, kerajinan, panen alam, proses pembuatan, restorasi, dan industri. "
    "Bahasa Indonesia, memancing rasa penasaran, faktanya harus benar."
)


class AutopilotConfig(Base):
    """Single-row config: a producer fills a pool of ready videos, a publisher drains it into posting slots."""

    __tablename__ = "autopilot_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    niche: Mapped[str] = mapped_column(Text, default=DEFAULT_NICHE)
    categories: Mapped[List[str]] = mapped_column(
        JSON, default=lambda: ["farming", "craft", "food", "restoration", "factory", "engineering"]
    )
    slots: Mapped[List[str]] = mapped_column(
        JSON, default=lambda: ["07:00", "17:00"]
    )  # posting times, local HH:MM
    utc_offset_minutes: Mapped[int] = mapped_column(Integer, default=420)  # WIB
    pool_size: Mapped[int] = mapped_column(Integer, default=4)
    # [{"time": "12:00", "count": 2}, ...] local times when the producer tops up the pool
    production_windows: Mapped[List[dict]] = mapped_column(
        JSON, default=lambda: [{"time": "12:00", "count": 2}, {"time": "18:00", "count": 2}]
    )
    # {"12:00": "2026-11-16"}: local date each window last fired, so it runs once per day
    production_last_runs: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict)
    publish_ahead_hours: Mapped[int] = mapped_column(Integer, default=24)
    template_id: Mapped[str] = mapped_column(String(36), default="fakta")
    target_duration: Mapped[int] = mapped_column(Integer, default=50)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class AutopilotRun(Base):
    """One produced video: running -> ready (in pool) -> scheduled (on YouTube); or failed / discarded."""

    __tablename__ = "autopilot_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    stage: Mapped[str] = mapped_column(String(40), default="idea")
    category: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    topic: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    query: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    render_job_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[List[str]] = mapped_column(JSON, default=list)
    slot_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, index=True
    )  # naive UTC, set on publish
    video_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publish_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publish_attempted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
