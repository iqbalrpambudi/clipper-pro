from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.qc import QCConfigSchema
from app.schemas.tts import TTSConfigSchema


class BackgroundFillSchema(BaseModel):
    mode: str = "blur"  # blur | black | cover
    color: str = "#000000"
    zoom: float = 1.0  # custom zoom factor (1.0 = 100% fit, up to 3.0)
    anti_copyright: bool = True
    dynamic_zoom: bool = True
    color_grading: bool = True
    bgm_mood: Optional[str] = None  # folder name in storage/bgm; None = synthesized drone


class WatermarkSchema(BaseModel):
    enabled: bool = False
    watermark_type: str = "text"
    text: str = "@cliperpro"
    font_family: str = "Poppins"
    font_size: int = 34
    font_color: str = "#FFFFFF"
    opacity: float = 0.85
    position: str = "bottom-right"
    custom_x: Optional[float] = 50.0
    custom_y: Optional[float] = 50.0
    offset_x: int = 32
    offset_y: int = 32
    has_background: bool = False
    background_color: str = "#000000"
    background_opacity: float = 0.5
    has_shadow: bool = True
    shadow_color: str = "#000000"


ProjectWatermarkUpdate = WatermarkSchema



class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    project_type: str = "short_video"
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    language: str = "id"  # id | en
    background_fill: BackgroundFillSchema = BackgroundFillSchema()
    watermark: Optional[WatermarkSchema] = None
    tts_config: Optional[TTSConfigSchema] = None
    qc_config: Optional[QCConfigSchema] = None
    world_setting: Optional[Dict[str, Any]] = None


class ProjectCreate(ProjectBase):
    background_fill: Optional[BackgroundFillSchema] = None  # None = config.json default


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    project_type: Optional[str] = None
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None
    language: Optional[str] = None
    background_fill: Optional[BackgroundFillSchema] = None
    watermark: Optional[WatermarkSchema] = None
    tts_config: Optional[TTSConfigSchema] = None
    qc_config: Optional[QCConfigSchema] = None
    status: Optional[str] = None
    characters: Optional[List[Dict[str, Any]]] = None
    locations: Optional[List[Dict[str, Any]]] = None
    world_setting: Optional[Dict[str, Any]] = None


class HeatmapBucketOut(BaseModel):
    start_time: float
    end_time: float
    value: float

class HardsubSchema(BaseModel):
    """Burned-in subtitle band of a source video, as fractions of frame height (0 = top)."""

    enabled: bool = False
    top: float = Field(default=0.78, ge=0.0, le=1.0)
    bottom: float = Field(default=0.95, ge=0.0, le=1.0)
    source: Literal["auto", "manual"] = "auto"

    @model_validator(mode="after")
    def _band_order(self) -> "HardsubSchema":
        if self.bottom <= self.top:
            raise ValueError("hardsub.bottom harus lebih besar dari hardsub.top")
        return self


class SourceVideoUpdate(BaseModel):
    hardsub: HardsubSchema


class SourceVideoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    origin: str
    file_url: Optional[str] = None
    filename: str
    youtube_url: Optional[str] = None
    selected_resolution: Optional[str] = None
    duration: float
    width: int
    height: int
    fps: float
    status: str
    progress: int
    error_message: Optional[str] = None
    heatmap_data: Optional[List[HeatmapBucketOut]] = None
    hardsub: Optional[HardsubSchema] = None
    created_at: datetime


class SceneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    source_video_id: str
    scene_index: int
    start_time: float
    end_time: float
    duration: float
    thumbnail_url: Optional[str] = None
    video_url: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []
    analysis: Optional[dict] = None
    transcript: Optional[str] = None
    shot_info: Optional[dict] = None
    status: str
    created_at: datetime


class RenderJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    render_type: str
    status: str
    progress: int
    output_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size_bytes: Optional[int] = None
    log_output: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    created_at: datetime
    updated_at: datetime
    source_video_count: int = 0
    scene_count: int = 0
    youtube_metadata: Optional[Dict[str, Any]] = None
    characters: Optional[List[Dict[str, Any]]] = None
    locations: Optional[List[Dict[str, Any]]] = None
    world_setting: Optional[Dict[str, Any]] = None


class ProjectDetailResponse(ProjectResponse):
    source_videos: List[SourceVideoResponse] = []
    scenes: List[SceneResponse] = []
    narration: Optional[Dict[str, Any]] = None
    audio: Optional[Dict[str, Any]] = None
    timeline: Optional[Dict[str, Any]] = None
    subtitle_style: Optional[Dict[str, Any]] = None
    render_jobs: List[RenderJobResponse] = []
    bgm_credit: Optional[str] = None  # attribution the BGM license requires in the video description
