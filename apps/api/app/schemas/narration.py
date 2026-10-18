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
    sub_category: Optional[str] = None
    system_prompt: str
    user_prompt_template: str
    default_tone: str
    default_voice: str
    is_builtin: bool


class TemplateCreate(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None  # film | viral | fakta | edukasi | custom
    sub_category: Optional[str] = None
    system_prompt: str
    user_prompt_template: str
    default_tone: str = "santai"
    default_voice: str = "Puck"


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt_template: Optional[str] = None
    default_tone: Optional[str] = None
    default_voice: Optional[str] = None


class NarrationGenerateRequest(BaseModel):
    template_id: str = "fakta_unik"
    topic: Optional[str] = None
    tone: str = "santai"  # santai, tegang, dramatis, formal, kocak, berwibawa, mencekam, hangat
    target_duration: int = 60  # seconds
    custom_prompt: Optional[str] = None
    language: Optional[str] = "id"  # id | en


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
