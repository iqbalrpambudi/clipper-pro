from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


class SubtitleStyleBase(BaseModel):
    preset_name: str = "viral_tiktok"  # viral_tiktok | hormozi_punch | minimalist | custom
    font_family: str = "Montserrat"
    font_size: int = 52
    font_weight: str = "Bold"
    primary_color: str = "#FFFFFF"
    highlight_color: str = "#FFE600"
    outline_color: str = "#000000"
    outline_width: int = 4
    box_color: str = "#000000"
    box_opacity: float = 0.0
    position: str = "bottom"  # top | center | bottom
    offset_y: int = 0
    offset_x: int = 0
    display_mode: str = "per_word"  # per_word | full_sentence | burst
    burst_word_count: int = 2
    highlight_animation: str = "scale"  # scale | color | box | none
    emoji_enabled: bool = True


class SubtitleStyleUpdateRequest(SubtitleStyleBase):
    save_as_preset: bool = False
    new_preset_name: Optional[str] = None


class SubtitlePresetResponse(SubtitleStyleBase):
    id: str
    name: str
    description: str
    is_builtin: bool
    preview_style: Dict[str, Any] = {}


class SubtitleStyleResponse(SubtitleStyleBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: Optional[str] = None
    is_preset: bool


class SubtitlePreviewResponse(BaseModel):
    ass_content: str
    subtitle_url: Optional[str] = None
    line_count: int
