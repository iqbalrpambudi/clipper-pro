import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class QCRun(Base):
    __tablename__ = "qc_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gate: Mapped[str] = mapped_column(String(20), nullable=False)  # "script" | "timeline"
    trigger: Mapped[str] = mapped_column(String(20), default="manual")  # "auto" | "manual"
    status: Mapped[str] = mapped_column(
        String(20), default="passed"
    )  # "passed" | "fixed" | "warning" | "skipped"
    passed: Mapped[bool] = mapped_column(Boolean, default=True)
    overall_score: Mapped[float] = mapped_column(Float, default=10.0)
    threshold: Mapped[float] = mapped_column(Float, default=7.5)
    rounds_used: Mapped[int] = mapped_column(Integer, default=0)
    dimension_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    issues: Mapped[list] = mapped_column(JSON, default=list)
    applied_fixes: Mapped[list] = mapped_column(JSON, default=list)
    pre_fix_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=None)
    reverted: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped["Project"] = relationship("Project", back_populates="qc_runs")
