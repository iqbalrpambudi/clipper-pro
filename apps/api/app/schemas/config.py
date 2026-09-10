from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class ModelConfigUpdate(BaseModel):
    base_url: Optional[str] = None
    chat_model: Optional[str] = None
    vision_model: Optional[str] = None
    api_key: Optional[str] = None  # Plaintext from user, will be encrypted
    tts_provider: Optional[str] = None
    tts_api_key: Optional[str] = None  # Plaintext from user, will be encrypted


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
