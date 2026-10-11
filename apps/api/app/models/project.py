import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Text, Float, Integer, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from app.core.db import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft")  # draft, processing, ready, rendering, completed, failed
    aspect_ratio: Mapped[str] = mapped_column(String(20), default="9:16")  # 9:16, 1:1, 16:9
    resolution: Mapped[str] = mapped_column(String(20), default="1080p")  # 1080p, 720p
    background_fill: Mapped[dict] = mapped_column(JSON, default=lambda: {"mode": "blur", "color": "#000000"})
    watermark: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    source_videos: Mapped[List["SourceVideo"]] = relationship("SourceVideo", back_populates="project", cascade="all, delete-orphan")
    scenes: Mapped[List["Scene"]] = relationship("Scene", back_populates="project", cascade="all, delete-orphan")
    narrations: Mapped[List["Narration"]] = relationship("Narration", back_populates="project", cascade="all, delete-orphan")
    audio_tracks: Mapped[List["AudioTrack"]] = relationship("AudioTrack", back_populates="project", cascade="all, delete-orphan")
    timeline: Mapped[Optional["Timeline"]] = relationship("Timeline", back_populates="project", uselist=False, cascade="all, delete-orphan")
    subtitle_style: Mapped[Optional["SubtitleStyle"]] = relationship("SubtitleStyle", back_populates="project", uselist=False, cascade="all, delete-orphan")
    render_jobs: Mapped[List["RenderJob"]] = relationship("RenderJob", back_populates="project", cascade="all, delete-orphan")


class SourceVideo(Base):
    __tablename__ = "source_videos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(20), default="upload")  # upload | ytdlp
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    youtube_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    selected_resolution: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    fps: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, downloading, processing, ready, failed
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="source_videos")
    scenes: Mapped[List["Scene"]] = relationship("Scene", back_populates="source_video", cascade="all, delete-orphan")


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_video_id: Mapped[str] = mapped_column(String(36), ForeignKey("source_videos.id", ondelete="CASCADE"), nullable=False, index=True)
    scene_index: Mapped[int] = mapped_column(Integer, default=0)
    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    end_time: Mapped[float] = mapped_column(Float, default=0.0)
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    analysis: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # structured: characters, action, location, objects, state, confidence
    transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    embedding: Mapped[Optional[list]] = mapped_column(Vector(768), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="detected")  # detected, analyzing, ready, failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="scenes")
    source_video: Mapped["SourceVideo"] = relationship("SourceVideo", back_populates="scenes")


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    render_type: Mapped[str] = mapped_column(String(20), default="final")  # final | preview
    status: Mapped[str] = mapped_column(String(50), default="queued")  # queued, rendering, completed, failed
    progress: Mapped[int] = mapped_column(Integer, default=0)
    output_file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    log_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="render_jobs")
