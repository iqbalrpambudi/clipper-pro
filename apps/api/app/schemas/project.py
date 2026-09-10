from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict


class BackgroundFillSchema(BaseModel):
    mode: str = "blur"  # blur | black | custom
    color: str = "#000000"


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    background_fill: BackgroundFillSchema = BackgroundFillSchema()


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None
    background_fill: Optional[BackgroundFillSchema] = None
    status: Optional[str] = None


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
    description: Optional[str] = None
    tags: List[str] = []
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


class ProjectDetailResponse(ProjectResponse):
    source_videos: List[SourceVideoResponse] = []
    scenes: List[SceneResponse] = []
    narration: Optional[Dict[str, Any]] = None
    audio: Optional[Dict[str, Any]] = None
    timeline: Optional[Dict[str, Any]] = None
    subtitle_style: Optional[Dict[str, Any]] = None
    render_jobs: List[RenderJobResponse] = []
