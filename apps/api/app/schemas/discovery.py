from typing import List, Optional

from pydantic import BaseModel, Field


class PresetCategory(BaseModel):
    id: str
    title: str
    description: str
    badge: str
    search_query: str
    icon_name: str


class VideoCandidate(BaseModel):
    id: str
    source: str = "youtube"
    source_label: str = "YouTube"
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
    sources: List[str] = Field(
        default_factory=lambda: ["youtube", "dailymotion", "archive_org", "bilibili"]
    )
    page: int = Field(1, ge=1, le=50)
    exclude_ai: bool = True
    hide_imported: bool = True
    exclude_urls: List[str] = Field(default_factory=list)
    min_duration: int = 120  # 2 menit
    max_duration: int = 1800  # 30 menit (batas Cliper Pro)
    min_views: int = 0
    limit: int = Field(12, ge=1, le=40)


class VideoSearchResponse(BaseModel):
    query_used: str
    preset_id: Optional[str] = None
    exclude_ai: bool = True
    hide_imported: bool = True
    page: int = 1
    has_more: bool = True
    sources_used: List[str] = Field(default_factory=list)
    skipped_imported_count: int = 0
    candidates: List[VideoCandidate] = Field(default_factory=list)


class VideoImportRequest(BaseModel):
    url: str
    title: str
    source: Optional[str] = None
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
