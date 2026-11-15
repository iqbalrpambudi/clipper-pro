from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class WordTimestamp(BaseModel):
    word: str
    start_ms: int
    end_ms: int


class SentenceSegment(BaseModel):
    id: str
    text: str
    start_ms: int = 0
    end_ms: int = 0
    words: List[WordTimestamp] = []


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    default_tone: str
    is_builtin: bool


class TemplateCreate(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    default_tone: str = "santai"


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    default_tone: Optional[str] = None


class NarrationGenerateRequest(BaseModel):
    template_id: str = "auto"
    topic: Optional[str] = None
    target_duration: int = Field(55, ge=15, le=180)


class NarrationUpdateRequest(BaseModel):
    raw_text: str
    segments: Optional[List[Dict[str, Any]]] = None
    language: Optional[str] = None


class SegmentsUpdateRequest(BaseModel):
    segments: List[Dict[str, Any]]



class NarrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    template_id: Optional[str] = None
    topic: Optional[str] = None
    tone: str
    target_duration: int
    raw_text: str
    language: Optional[str] = "id"
    segments: List[Dict[str, Any]] = []
    status: str
