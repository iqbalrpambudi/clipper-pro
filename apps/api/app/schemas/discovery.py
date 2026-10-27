from typing import List, Optional

from pydantic import BaseModel


class PresetCategory(BaseModel):
    id: str
    title: str
    description: str
    badge: str
    search_query: str
    icon_name: str


class VideoCandidate(BaseModel):
    id: str
    title: str
    url: str
    duration: float
    duration_str: str
    views: int
    views_str: str
    channel: str
    channel_url: Optional[str] = None
    thumbnail: Optional[str] = None
    is_already_imported: bool = False
    existing_project_id: Optional[str] = None
    existing_project_name: Optional[str] = None


class VideoSearchRequest(BaseModel):
    preset_id: Optional[str] = None
    custom_query: Optional[str] = None
    exclude_ai: bool = True
    min_duration: int = 300  # 5 menit
    max_duration: int = 1800  # 30 menit (batas Cliper Pro)
    min_views: int = 20000
    limit: int = 10


class VideoSearchResponse(BaseModel):
    query_used: str
    preset_id: Optional[str] = None
    exclude_ai: bool = True
    candidates: List[VideoCandidate] = []


class VideoImportRequest(BaseModel):
    url: str
    title: str
    project_name: Optional[str] = None
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    download_resolution: Optional[str] = "720p"  # 720p | 1080p | 480p | best
    language: str = "id"



class VideoImportResponse(BaseModel):
    project_id: str
    project_name: str
    video_id: str
    status: str
