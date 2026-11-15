import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _parse_int_offset(value: Any) -> int:
    """Accept integer offsets or strings like '+10%' / '-3Hz'."""
    if isinstance(value, bool):
        raise ValueError("Offset harus berupa angka")
    if isinstance(value, (int, float)):
        return int(round(value))
    if isinstance(value, str):
        m = re.search(r"[+-]?\d+", value.strip())
        if m:
            return int(m.group(0))
    raise ValueError(f"Format offset tidak valid: {value}")


class TTSConfigSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    provider: Literal["gemini", "elevenlabs"] = "gemini"
    voice: str = Field("Puck", min_length=1, max_length=120)
    rate: int = Field(0, ge=-50, le=100)
    pitch: int = Field(0, ge=-50, le=50)
    model: Optional[str] = "gemini-2.5-flash-preview-tts"

    @field_validator("provider", mode="before")
    @classmethod
    def _normalize_provider(cls, v: Any) -> str:
        s = str(v or "gemini").strip().lower()
        return s if s in ("gemini", "elevenlabs") else "gemini"

    @field_validator("voice", mode="before")
    @classmethod
    def _normalize_voice(cls, v: Any) -> str:
        s = str(v or "").strip()
        return s or "Puck"

    @field_validator("rate", "pitch", mode="before")
    @classmethod
    def _normalize_offset(cls, v: Any) -> int:
        if v is None or v == "":
            return 0
        return _parse_int_offset(v)


class VoiceInfo(BaseModel):
    id: str
    name: str
    provider: str  # gemini | elevenlabs
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
    rate: Optional[str] = None
    pitch: Optional[str] = None
    model: Optional[str] = None
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

