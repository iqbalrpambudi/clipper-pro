from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict


class ClipSchema(BaseModel):
    id: str
    segment_id: Optional[str] = None
    scene_id: str
    source_video_id: str
    timeline_start: float
    timeline_end: float
    clip_start: float
    clip_end: float
    speed: float = 1.0
    transition: Optional[str] = None
    background_fill_override: Optional[Dict[str, Any]] = None
    thumbnail_url: Optional[str] = None
    video_url: Optional[str] = None
    text: Optional[str] = None


class TimelineUpdateRequest(BaseModel):
    clips: List[ClipSchema]
    total_duration: Optional[float] = None
    has_audio: Optional[bool] = None
    has_subtitles: Optional[bool] = None


class TimelineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    clips: List[Dict[str, Any]] = []
    total_duration: float
    has_audio: bool = True
    has_subtitles: bool = True
