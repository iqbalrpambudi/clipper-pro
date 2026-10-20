from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, model_validator

# ASS style headers, fontconfig names and ffmpeg filter strings are built from
# these values, so restrict them to known-safe shapes instead of passing user
# text through verbatim.
_HEX_COLOR_RE = r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
_FONT_FAMILIES = {
    "Montserrat", "BebasNeue", "Bebas Neue", "Poppins", "Inter",
    "Anton", "Oswald", "Roboto", "Arial", "Liberation Sans",
}
_FONT_WEIGHTS = {"Thin", "Light", "Regular", "Normal", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"}


def _validate_style_fields(values: Dict[str, Any]) -> Dict[str, Any]:
    import re

    for key in ("primary_color", "highlight_color", "outline_color", "box_color"):
        v = values.get(key)
        if v is not None and not re.fullmatch(_HEX_COLOR_RE, str(v)):
            raise ValueError(f"{key} harus berupa warna hex, contoh #FFFFFF")
    ff = values.get("font_family")
    if ff is not None and ff not in _FONT_FAMILIES:
        raise ValueError(f"font_family tidak didukung: {ff}")
    fw = values.get("font_weight")
    if fw is not None and fw not in _FONT_WEIGHTS:
        raise ValueError(f"font_weight tidak didukung: {fw}")
    if fw == "Normal":
        values["font_weight"] = "Regular"
    return values


class StyleFieldsMixin(BaseModel):
    """Rejects unsafe ASS / fontconfig / ffmpeg values for models carrying style fields."""

    @model_validator(mode="after")
    def _check_style_fields(self):
        _validate_style_fields(self.model_dump())
        return self


class SubtitleStyleBase(StyleFieldsMixin):
    preset_name: str = "viral_tiktok"  # viral_tiktok | hormozi_punch | minimalist | custom
    enabled: bool = True
    description: Optional[str] = None
    font_family: str = "Poppins"
    font_size: int = 56
    font_weight: str = "Bold"
    primary_color: str = "#FFFFFF"
    highlight_color: str = "#FFE600"
    outline_color: str = "#000000"
    outline_width: int = 4
    box_color: str = "#000000"
    box_opacity: float = 0.0
    position: str = "bottom"  # top | center | bottom
    offset_y: int = -120
    offset_x: int = 0
    display_mode: str = "per_word"  # per_word | full_sentence | burst
    burst_word_count: int = 2
    highlight_animation: str = "color"  # scale | color | box | none
    scale_factor: float = 1.0
    emoji_enabled: bool = True


class SubtitleStyleUpdateRequest(SubtitleStyleBase):
    save_as_preset: bool = False
    new_preset_name: Optional[str] = None


class SubtitlePresetResponse(SubtitleStyleBase):
    id: str
    name: str
    description: Optional[str] = None
    is_builtin: bool
    preview_style: Dict[str, Any] = {}


class SubtitlePresetCreate(StyleFieldsMixin):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    font_family: str = "Poppins"
    font_size: int = 56
    font_weight: str = "Bold"
    primary_color: str = "#FFFFFF"
    highlight_color: str = "#FFE600"
    outline_color: str = "#000000"
    outline_width: int = 4
    box_color: str = "#000000"
    box_opacity: float = 0.0
    position: str = "bottom"
    offset_y: int = -120
    offset_x: int = 0
    display_mode: str = "per_word"
    burst_word_count: int = 2
    highlight_animation: str = "scale"
    scale_factor: float = 1.15
    emoji_enabled: bool = True


class SubtitlePresetUpdate(StyleFieldsMixin):
    name: Optional[str] = None
    description: Optional[str] = None
    font_family: Optional[str] = None
    font_size: Optional[int] = None
    font_weight: Optional[str] = None
    primary_color: Optional[str] = None
    highlight_color: Optional[str] = None
    outline_color: Optional[str] = None
    outline_width: Optional[int] = None
    box_color: Optional[str] = None
    box_opacity: Optional[float] = None
    position: Optional[str] = None
    offset_y: Optional[int] = None
    offset_x: Optional[int] = None
    display_mode: Optional[str] = None
    burst_word_count: Optional[int] = None
    highlight_animation: Optional[str] = None
    scale_factor: Optional[float] = None
    emoji_enabled: Optional[bool] = None


class SubtitleStyleResponse(SubtitleStyleBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: Optional[str] = None
    is_preset: bool


class SubtitlePreviewResponse(BaseModel):
    ass_content: str
    subtitle_url: Optional[str] = None
    line_count: int
