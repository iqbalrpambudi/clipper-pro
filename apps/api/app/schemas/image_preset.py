from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

PresetType = Literal["style", "character", "combined"]


class ImagePresetBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "custom"
    preset_type: PresetType = "style"
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
    preset_type: Optional[PresetType] = None
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
    user_text: Optional[str] = ""
    preset_type: Optional[PresetType] = "style"
    reference_image_url: Optional[str] = None
    reference_image_path: Optional[str] = None
    reference_image_urls: Optional[List[str]] = Field(default_factory=list)
    reference_image_paths: Optional[List[str]] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_has_source(self):
        has_text = bool(self.user_text and self.user_text.strip())
        has_images = bool(
            self.reference_image_path
            or self.reference_image_url
            or (self.reference_image_paths and len(self.reference_image_paths) > 0)
            or (self.reference_image_urls and len(self.reference_image_urls) > 0)
        )
        if not has_text and not has_images:
            raise ValueError("Wajib menyertakan ide visual (teks) atau minimal satu gambar referensi.")
        return self


class StudioAnalyzeResponse(BaseModel):
    name: str
    category: str
    preset_type: PresetType = "style"
    description: str
    master_prompt: str
    negative_prompt: str
    style_attributes: Dict[str, Any]


class StudioTestGenerateRequest(BaseModel):
    master_prompt: str
    negative_prompt: Optional[str] = None
    scene_prompt: Optional[str] = None
    aspect_ratio: Optional[str] = "16:9"


class StudioTestGenerateResponse(BaseModel):
    image_url: str
    file_path: str
    prompt_used: str
