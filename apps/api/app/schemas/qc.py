from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class QCConfigSchema(BaseModel):
    """QC runs only when the user clicks "Cek QC"; old auto-gate keys in config.json are ignored."""

    max_fix_rounds: int = Field(default=2, ge=0, le=3)
    threshold: float = Field(default=7.5, ge=1.0, le=10.0)
    platform: Literal["tiktok", "reels", "shorts"] = "tiktok"
    qc_model: Optional[str] = None

    @field_validator("platform", mode="before")
    @classmethod
    def _normalize_platform(cls, v: Any) -> str:
        val = str(v or "tiktok").strip().lower()
        return val if val in ("tiktok", "reels", "shorts") else "tiktok"


class QCIssueSchema(BaseModel):
    id: str
    dimension: str
    severity: Literal["blocker", "major", "minor"] = "minor"
    message: str
    segment_index: Optional[int] = None
    clip_index: Optional[int] = None
    timestamp_sec: Optional[float] = None
    auto_fixable: bool = False


class QCAppliedFixSchema(BaseModel):
    round: int
    action: str
    target: str
    summary: str
    before: Optional[Any] = None
    after: Optional[Any] = None


class QCRunRequest(BaseModel):
    gate: Literal["script", "timeline"]
    # False = review only (report, no changes); True = apply fixes with before/after + revert
    auto_fix: bool = False
    trigger: Literal["auto", "manual"] = "manual"


class QCRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    gate: str
    trigger: str
    status: str
    passed: bool
    overall_score: float
    threshold: float
    rounds_used: int
    dimension_scores: Dict[str, float] = Field(default_factory=dict)
    issues: List[QCIssueSchema] = Field(default_factory=list)
    applied_fixes: List[QCAppliedFixSchema] = Field(default_factory=list)
    can_revert: bool = False
    reverted: bool = False
    summary: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime


class QCLatestResponse(BaseModel):
    script: Optional[QCRunResponse] = None
    timeline: Optional[QCRunResponse] = None
