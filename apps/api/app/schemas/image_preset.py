from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class ImagePresetBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "custom"
    master_prompt: str
    negative_prompt: Optional[str] = None
    reference_image_url: Optional[str] = None
    preview_image_url: Optional[str] = None
    user_text_input: Optional[str] = None
    style_attributes: Optional[Dict[str, Any]] = Field(default_factory=dict)
    is_active: bool = False


class ImagePresetCreate(ImagePresetBase):
    id: Optional[str] = None


class ImagePresetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    master_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    reference_image_url: Optional[str] = None
    preview_image_url: Optional[str] = None
    user_text_input: Optional[str] = None
    style_attributes: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class ImagePresetResponse(ImagePresetBase):
    id: str
    is_builtin: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StudioAnalyzeRequest(BaseModel):
    user_text: str
    reference_image_url: Optional[str] = None
    reference_image_path: Optional[str] = None


class StudioAnalyzeResponse(BaseModel):
    name: str
    category: str
    description: str
    master_prompt: str
    negative_prompt: str
    style_attributes: Dict[str, Any]


class StudioTestGenerateRequest(BaseModel):
    master_prompt: str
    scene_prompt: Optional[str] = None
    aspect_ratio: Optional[str] = "16:9"


class StudioTestGenerateResponse(BaseModel):
    image_url: str
    file_path: str
    prompt_used: str
