from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class MotionCueItem(BaseModel):
    word: str
    start_frame: int
    end_frame: int
    start_ms: int = 0
    end_ms: int = 0


class MotionSceneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    narration_id: Optional[str] = None
    segment_id: str
    order_index: int
    title: Optional[str] = None
    archetype: str = "kinetic_emblem"
    script_text: str
    visual_concept: str
    component_code: Optional[str] = None
    cues: List[Dict[str, Any]] = []
    key_facts: List[str] = []
    transition_type: str = "camera_push"
    start_time: float = 0.0
    end_time: float = 4.0
    duration: float = 4.0
    duration_frames: int = 120
    status: str = "pending"
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MotionScriptGenerateRequest(BaseModel):
    topic: str
    target_duration_secs: int = 60
    tone: str = "analytical"
    language: str = "id"
    theme_id: str = "claude_editorial"
    custom_instructions: Optional[str] = None


class MotionSceneCreateRequest(BaseModel):
    title: Optional[str] = None
    archetype: str = "kinetic_emblem"
    script_text: str
    visual_concept: str = ""
    duration: float = 4.5


class MotionSceneUpdateRequest(BaseModel):
    title: Optional[str] = None
    archetype: Optional[str] = None
    script_text: Optional[str] = None
    visual_concept: Optional[str] = None
    component_code: Optional[str] = None
    transition_type: Optional[str] = None
    duration: Optional[float] = None
    duration_frames: Optional[int] = None
    cues: Optional[List[Dict[str, Any]]] = None


class MotionBatchGenerateRequest(BaseModel):
    only_pending: bool = False
    theme_id: Optional[str] = None
    style_instructions: Optional[str] = None


class MotionSingleGenerateRequest(BaseModel):
    remix_prompt: Optional[str] = None
    theme_id: Optional[str] = None

