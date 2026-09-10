from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict


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
    category: str
    system_prompt: str
    user_prompt_template: str
    default_tone: str
    default_voice: str
    is_builtin: bool


class TemplateCreate(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    user_prompt_template: str
    default_tone: str = "santai"
    default_voice: str = "Puck"


class NarrationGenerateRequest(BaseModel):
    template_id: str = "fakta_unik"
    topic: Optional[str] = None
    tone: str = "santai"  # santai, formal, dramatis
    target_duration: int = 60  # seconds
    custom_prompt: Optional[str] = None


class NarrationUpdateRequest(BaseModel):
    raw_text: str
    segments: Optional[List[Dict[str, Any]]] = None


class NarrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    template_id: Optional[str] = None
    topic: Optional[str] = None
    tone: str
    target_duration: int
    raw_text: str
    segments: List[Dict[str, Any]] = []
    status: str
