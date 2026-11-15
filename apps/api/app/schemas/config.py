from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.project import WatermarkSchema
from app.schemas.qc import QCConfigSchema
from app.schemas.subtitle import SubtitleStyleIn
from app.schemas.tts import TTSConfigSchema


class ProjectDefaultsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    subtitle: SubtitleStyleIn = Field(default_factory=SubtitleStyleIn)
    watermark: WatermarkSchema = Field(default_factory=WatermarkSchema)
    tts: TTSConfigSchema = Field(default_factory=TTSConfigSchema)
    qc: QCConfigSchema = Field(default_factory=QCConfigSchema)


class ProjectDefaultsResponse(ProjectDefaultsConfig):
    config_path: str
    from_file: bool = False


class ModelConfigUpdate(BaseModel):
    base_url: Optional[str] = None
    chat_model: Optional[str] = None
    vision_model: Optional[str] = None
    api_key: Optional[str] = None  # Plaintext from user, will be encrypted
    tts_provider: Optional[str] = None
    tts_api_key: Optional[str] = None  # Plaintext from user, will be encrypted
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_model: Optional[str] = None


class ModelConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    base_url: Optional[str] = None
    chat_model: str
    vision_model: str
    api_key_masked: Optional[str] = None
    has_api_key: bool = False
    tts_provider: str
    tts_api_key_masked: Optional[str] = None
    has_tts_api_key: bool = False
    elevenlabs_api_key_masked: Optional[str] = None
    has_elevenlabs_api_key: bool = False
    elevenlabs_model: str = "eleven_multilingual_v2"
    is_active: bool


class TestConnectionRequest(BaseModel):
    base_url: Optional[str] = None
    chat_model: Optional[str] = None
    vision_model: Optional[str] = None
    api_key: Optional[str] = None


class TestConnectionResponse(BaseModel):
    success: bool
    chat_model_status: str
    vision_model_status: str
    latency_ms: int
    message: str


class TestTtsConnectionRequest(BaseModel):
    provider: str = "gemini"
    api_key: Optional[str] = None
    model: Optional[str] = None
    voice: Optional[str] = None


class TestTtsConnectionResponse(BaseModel):
    success: bool
    provider_status: str
    latency_ms: int
    message: str


