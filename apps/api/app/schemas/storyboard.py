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
    language: Optional[str] = "id"  # id | en
    reset_bible: Optional[bool] = True  # If True, regenerates fresh characters/locations instead of keeping old story


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
    resolved_prompt: Optional[str] = None
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
    language: Optional[str] = None


class YouTubeMetadataGenerateRequest(BaseModel):
    focus_angle: Optional[str] = None  # e.g. "curiosity_gap", "question", "storytelling", "educational"
    custom_prompt: Optional[str] = None
    language: Optional[str] = "id"  # id | en


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


class StoryboardContinuityBibleUpdateRequest(BaseModel):
    characters: Optional[List[dict]] = None
    locations: Optional[List[dict]] = None
    world_setting: Optional[dict] = None


class StoryboardContinuityBibleExtractRequest(BaseModel):
    custom_instructions: Optional[str] = None


class StoryboardSegmentItemUpdate(BaseModel):
    id: str
    image_prompt: str


class StoryboardSegmentUpdateRequest(BaseModel):
    chapter: Optional[str] = None
    text: Optional[str] = None
    segment_index: Optional[int] = None
    items: Optional[List[StoryboardSegmentItemUpdate]] = None


class NarrationDimensionScore(BaseModel):
    score: int
    label: str
    status: str = "good"  # excellent, good, needs_improvement
    feedback: str = ""


class NarrationSegmentImprovement(BaseModel):
    segment_id: str
    segment_index: int = 0
    chapter_title: Optional[str] = None
    original_text: str
    improved_text: str
    change_summary: str = ""
    original_visual_prompt: Optional[str] = None
    improved_visual_prompt: Optional[str] = None


class StoryboardNarrationAnalysisRequest(BaseModel):
    focus_aspect: Optional[str] = "youtube_retention"  # youtube_retention, viral_hook, documentary_depth, educational_clarity
    custom_instructions: Optional[str] = None


class StoryboardNarrationAnalysisResponse(BaseModel):
    overall_score: int
    grade: str  # S, A+, A, B, C, D
    summary: str
    hook_score: NarrationDimensionScore
    retention_pacing_score: NarrationDimensionScore
    emotional_storytelling_score: NarrationDimensionScore
    clarity_delivery_score: NarrationDimensionScore
    call_to_action_score: NarrationDimensionScore
    strengths: List[str] = []
    weaknesses: List[str] = []
    actionable_recommendations: List[str] = []
    has_improvements: bool = False
    improved_segments: List[NarrationSegmentImprovement] = []


class StoryboardApplyNarrationImprovementsRequest(BaseModel):
    improved_segments: List[NarrationSegmentImprovement]
    update_visual_prompts: bool = True


