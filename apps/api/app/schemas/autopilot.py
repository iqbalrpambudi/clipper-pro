import re
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _check_hhmm(s: str) -> str:
    m = re.fullmatch(r"(\d{2}):(\d{2})", s)
    if not m or int(m[1]) > 23 or int(m[2]) > 59:
        raise ValueError(f"Jam tidak valid: {s} (format HH:MM)")
    return s


class ProductionWindow(BaseModel):
    time: str
    count: int = Field(ge=1, le=10)

    @field_validator("time")
    @classmethod
    def valid_time(cls, v: str) -> str:
        return _check_hhmm(v)


class AutopilotConfigIn(BaseModel):
    enabled: bool
    niche: str = Field(min_length=10, max_length=2000)
    categories: List[str] = Field(min_length=1)
    slots: List[str] = Field(min_length=1, max_length=6)
    utc_offset_minutes: int = Field(ge=-720, le=840)
    pool_size: int = Field(ge=1, le=20)
    production_windows: List[ProductionWindow] = Field(min_length=1, max_length=6)
    publish_ahead_hours: int = Field(ge=1, le=72)
    template_id: str = "fakta"
    target_duration: int = Field(default=50, ge=15, le=170)

    @field_validator("slots")
    @classmethod
    def valid_slots(cls, v: List[str]) -> List[str]:
        return sorted({_check_hhmm(s) for s in v})

    @field_validator("production_windows")
    @classmethod
    def unique_windows(cls, v: List[ProductionWindow]) -> List[ProductionWindow]:
        if len({w.time for w in v}) != len(v):
            raise ValueError("Jam produksi tidak boleh dobel")
        return sorted(v, key=lambda w: w.time)


class AutopilotConfigOut(AutopilotConfigIn):
    model_config = ConfigDict(from_attributes=True)

    producing: bool = False
    pool_count: int = 0
    youtube_connected: bool = False


class AutopilotRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    stage: str
    category: Optional[str] = None
    topic: Optional[str] = None
    project_id: Optional[str] = None
    render_job_id: Optional[str] = None
    title: Optional[str] = None
    slot_at: Optional[datetime] = None
    video_id: Optional[str] = None
    error_message: Optional[str] = None
    publish_error: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None

    @field_validator("slot_at", "created_at", "finished_at")
    @classmethod
    def as_utc(cls, v: Optional[datetime]) -> Optional[datetime]:
        # DB stores naive UTC; tag it so the browser doesn't read it as local time
        return v.replace(tzinfo=timezone.utc) if v and v.tzinfo is None else v
