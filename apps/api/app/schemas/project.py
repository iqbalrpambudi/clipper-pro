from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict


class BackgroundFillSchema(BaseModel):
    mode: str = "blur"  # blur | black | cover
    color: str = "#000000"
    zoom: float = 1.0  # custom zoom factor (1.0 = 100% fit, up to 3.0)
    anti_copyright: bool = True
    dynamic_zoom: bool = True
    color_grading: bool = True


class WatermarkSchema(BaseModel):
    enabled: bool = False
    text: str = ""
    font_family: str = "Poppins"
    font_size: int = 36
    font_color: str = "#FFFFFF"
    opacity: float = 0.85
    position: str = "bottom-right"  # top-left, top-center, top-right, center, bottom-left, bottom-center, bottom-right
    offset_x: int = 30
    offset_y: int = 30
    has_background: bool = False
    background_color: str = "#000000"
    background_opacity: float = 0.5
    has_shadow: bool = True
    shadow_color: str = "#000000"


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    project_type: str = "short_video"  # short_video | long_storyboard
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    language: str = "id"  # id | en
    background_fill: BackgroundFillSchema = BackgroundFillSchema()
    watermark: Optional[WatermarkSchema] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    project_type: Optional[str] = None
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None
    language: Optional[str] = None
    background_fill: Optional[BackgroundFillSchema] = None
    watermark: Optional[WatermarkSchema] = None
    status: Optional[str] = None
    characters: Optional[List[Dict[str, Any]]] = None


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
    storyboard_count: int = 0
    youtube_metadata: Optional[Dict[str, Any]] = None
    characters: Optional[List[Dict[str, Any]]] = None


class ProjectDetailResponse(ProjectResponse):
    source_videos: List[SourceVideoResponse] = []
    scenes: List[SceneResponse] = []
    narration: Optional[Dict[str, Any]] = None
    audio: Optional[Dict[str, Any]] = None
    timeline: Optional[Dict[str, Any]] = None
    subtitle_style: Optional[Dict[str, Any]] = None
    render_jobs: List[RenderJobResponse] = []
    storyboard_items: List[Dict[str, Any]] = []
