from typing import List, Optional
from pydantic import BaseModel


class YTFormatOption(BaseModel):
    format_id: str
    resolution: str
    ext: str
    filesize_approx_mb: Optional[float] = None
    fps: Optional[float] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    label: str


class YTInfoResponse(BaseModel):
    title: str
    duration: float
    duration_str: str
    thumbnail: Optional[str] = None
    formats: List[YTFormatOption] = []


class YTDownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = None
    selected_resolution: Optional[str] = None
    title: Optional[str] = None


class YTUpdateRequest(BaseModel):
    force: bool = False


class YTUpdateResponse(BaseModel):
    current_version: str
    status: str
    message: str
