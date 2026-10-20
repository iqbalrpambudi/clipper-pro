from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class VoiceInfo(BaseModel):
    id: str
    name: str
    provider: str  # gemini | edge | elevenlabs | runware
    gender: str
    sample_text: str
    sample_audio_url: Optional[str] = None
    description: str
    language: Optional[str] = "multi"  # "id", "en", or "multi"
    languages: List[str] = ["id", "en"]


class CostEstimateRequest(BaseModel):
    text: str
    provider: str = "gemini"


class CostEstimateResponse(BaseModel):
    char_count: int
    word_count: int
    estimated_duration_sec: float
    estimated_cost_usd: float
    currency: str = "USD"
    provider: str


class TTSGenerateRequest(BaseModel):
    provider: Optional[str] = None  # None = use project/config default
    voice: Optional[str] = None
    rate: str = "+0%"
    pitch: str = "+0Hz"
    model: Optional[str] = None
    fallback_enabled: Optional[bool] = None
    language: Optional[str] = None  # id | en (inferred from narration if omitted)


class AudioTrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    narration_id: str
    provider: str
    voice: str
    rate: str
    pitch: str
    audio_url: Optional[str] = None
    duration: float
    estimated_cost: float
    status: str


class RealignWordsRequest(BaseModel):
    offset_ms: int = 0
    language: Optional[str] = "id"
    model_size: Optional[str] = "base"
    segments: Optional[List[Dict[str, Any]]] = None

