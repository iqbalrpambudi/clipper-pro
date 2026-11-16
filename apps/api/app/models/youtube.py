import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class YouTubeAccount(Base):
    """Single-row store for the OAuth client and the connected channel."""

    __tablename__ = "youtube_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    client_secret_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refresh_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    channel_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    channel_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    channel_thumbnail: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class YouTubeUpload(Base):
    __tablename__ = "youtube_uploads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    render_job_id: Mapped[str] = mapped_column(String(36), nullable=False)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[List[str]] = mapped_column(JSON, default=list)
    privacy: Mapped[str] = mapped_column(String(20), default="private")  # public, unlisted, private
    publish_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # naive UTC
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued, uploading, uploaded, failed
    progress: Mapped[int] = mapped_column(Integer, default=0)
    video_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
