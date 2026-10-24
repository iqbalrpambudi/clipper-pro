from typing import List, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator


class YTFormatOption(BaseModel):
    format_id: str
    resolution: str
    ext: str
    filesize_approx_mb: Optional[float] = None
    fps: Optional[float] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    label: str


class HeatmapBucket(BaseModel):
    start_time: float
    end_time: float
    value: float

class YTInfoResponse(BaseModel):
    title: str
    duration: float
    duration_str: str
    thumbnail: Optional[str] = None
    formats: List[YTFormatOption] = []
    heatmap: Optional[List[HeatmapBucket]] = None


class YTDownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = None
    selected_resolution: Optional[str] = None
    title: Optional[str] = None

    @field_validator("url")
    @classmethod
    def _validate_url(cls, v: str) -> str:
        v = (v or "").strip()
        parsed = urlparse(v)
        # ponytail: allowlist http/https and block local hosts. Widen when other sources are needed.
        if parsed.scheme not in ("http", "https"):
            raise ValueError("URL harus diawali http:// atau https://")
        host = (parsed.hostname or "").lower()
        if not host or host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
            raise ValueError("Host URL tidak valid")
        return v


class YTUpdateRequest(BaseModel):
    force: bool = False


class YTUpdateResponse(BaseModel):
    current_version: str
    status: str
    message: str
