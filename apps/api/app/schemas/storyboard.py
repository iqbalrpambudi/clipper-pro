from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class StoryboardScriptGenerateRequest(BaseModel):
    topic: str
    target_duration_mins: int = Field(default=5, ge=3, le=10)  # 4-8 mins, allow 3-10
    tone: str = "santai"  # santai, formal, dramatis, misterius, edukasi
    images_per_segment: int = Field(default=2, ge=1, le=3)
    preset_id: Optional[str] = None
    custom_instructions: Optional[str] = None


class StoryboardItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    narration_id: Optional[str] = None
    chapter_title: Optional[str] = None
    segment_id: str
    order_index: int
    script_text: str
    image_prompt: str
    image_url: Optional[str] = None
    motion_effect: str = "zoom_in"
    start_time: float = 0.0
    end_time: float = 0.0
    duration: float = 0.0
    status: str = "pending"
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StoryboardItemUpdateRequest(BaseModel):
    chapter_title: Optional[str] = None
    script_text: Optional[str] = None
    image_prompt: Optional[str] = None
    motion_effect: Optional[str] = None  # zoom_in, zoom_out, pan_left, pan_right, static
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    duration: Optional[float] = None


class StoryboardSingleGenerateRequest(BaseModel):
    prompt: Optional[str] = None
    preset_id: Optional[str] = None


class StoryboardBatchGenerateRequest(BaseModel):
    item_ids: Optional[List[str]] = None  # if None, generates all pending/failed items
    concurrency: Optional[int] = Field(default=None, ge=1, le=4)


class StoryboardVoiceoverGenerateRequest(BaseModel):
    voice: Optional[str] = None
    rate: Optional[str] = None
    pitch: Optional[str] = None


class YouTubeMetadataGenerateRequest(BaseModel):
    focus_angle: Optional[str] = None  # e.g. "curiosity_gap", "question", "storytelling", "educational"
    custom_prompt: Optional[str] = None


class YouTubeThumbnailGenerateRequest(BaseModel):
    prompt: str
    style_prompt: Optional[str] = None
    preset_id: Optional[str] = None


class YouTubeMetadataUpdateRequest(BaseModel):
    title: Optional[str] = None
    title_options: Optional[List[str]] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    thumbnail_prompt: Optional[str] = None
    thumbnail_concept: Optional[str] = None
    thumbnail_url: Optional[str] = None
    thumbnail_history: Optional[List[dict]] = None
    thumbnail_hook_line1: Optional[str] = None
    thumbnail_hook_line2: Optional[str] = None
    thumbnail_overlay: Optional[dict] = None


class StoryboardCharactersUpdateRequest(BaseModel):
    characters: List[dict]


class StoryboardSegmentItemUpdate(BaseModel):
    id: str
    image_prompt: str


class StoryboardSegmentUpdateRequest(BaseModel):
    chapter: Optional[str] = None
    text: Optional[str] = None
    items: Optional[List[StoryboardSegmentItemUpdate]] = None

