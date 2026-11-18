from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class YouTubeAccountStatus(BaseModel):
    configured: bool
    connected: bool
    client_id: Optional[str] = None
    client_secret_masked: Optional[str] = None
    redirect_uri: str
    channel_id: Optional[str] = None
    channel_title: Optional[str] = None
    channel_thumbnail: Optional[str] = None
    connected_at: Optional[datetime] = None


class YouTubeCredentialsIn(BaseModel):
    client_id: str = Field(min_length=10, max_length=255)
    # Empty keeps the stored secret so the form can be re-saved without re-typing it
    client_secret: Optional[str] = Field(default=None, max_length=255)


class YouTubeAuthStart(BaseModel):
    auth_url: str


class YouTubePublishIn(BaseModel):
    render_job_id: Optional[str] = None  # default: latest completed final render
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=5000)
    tags: List[str] = Field(default_factory=list)
    privacy: Literal["public", "unlisted", "private"] = "private"
    publish_at: Optional[datetime] = None

    @field_validator("title", "description")
    @classmethod
    def no_angle_brackets(cls, v: str) -> str:
        if "<" in v or ">" in v:
            raise ValueError("YouTube menolak karakter < dan >")
        return v.strip()

    @field_validator("tags")
    @classmethod
    def tags_limit(cls, v: List[str]) -> List[str]:
        tags = [t.strip() for t in v if t.strip()]
        if sum(len(t) for t in tags) > 500:
            raise ValueError("Total panjang tag maksimal 500 karakter")
        return tags

    @model_validator(mode="after")
    def schedule_rules(self):
        if self.publish_at:
            if self.publish_at.tzinfo is None:
                raise ValueError("publish_at harus menyertakan zona waktu")
            if self.publish_at <= datetime.now(timezone.utc):
                raise ValueError("Jadwal tayang harus di masa depan")
            # YouTube only honours publishAt on private videos
            self.privacy = "private"
        return self


class YouTubeUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    render_job_id: str
    title: str
    description: str
    tags: List[str]
    privacy: str
    publish_at: Optional[datetime] = None
    status: str
    progress: int
    video_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    @field_validator("publish_at", "created_at")
    @classmethod
    def as_utc(cls, v: Optional[datetime]) -> Optional[datetime]:
        # DB stores naive UTC; tag it so the browser doesn't read it as local time
        return v.replace(tzinfo=timezone.utc) if v and v.tzinfo is None else v
