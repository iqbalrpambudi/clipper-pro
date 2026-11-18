from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ASS style headers and fontconfig names are built from these values, so keep them to known-safe shapes.
_HEX_COLOR = r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
FontFamily = Literal[
    "Montserrat", "Poppins", "Bebas Neue", "BebasNeue", "Inter", "Anton", "Oswald", "Roboto"
]
_FONT_FAMILY_CANONICAL = {
    "montserrat": "Montserrat",
    "poppins": "Poppins",
    "bebas neue": "Bebas Neue",
    "bebasneue": "Bebas Neue",
    "inter": "Inter",
    "anton": "Anton",
    "oswald": "Oswald",
    "roboto": "Roboto",
}


class SubtitleStyleIn(BaseModel):
    preset_name: str = Field("pop_kuning", max_length=50)
    enabled: bool = True
    font_family: FontFamily = "Poppins"
    font_size: int = Field(58, ge=20, le=140)
    highlight_color: str = Field("#FFE600", pattern=_HEX_COLOR)
    position: Literal["bottom", "center"] = "bottom"
    offset_y: int = Field(260, ge=-1000, le=1000)
    burst_word_count: Literal[1, 2, 3] = 3
    highlight_animation: Literal["scale", "none"] = "scale"

    @field_validator("font_family", mode="before")
    @classmethod
    def _normalize_font_family(cls, v: Any) -> Any:
        if isinstance(v, str):
            key = v.strip().lower()
            if key in _FONT_FAMILY_CANONICAL:
                return _FONT_FAMILY_CANONICAL[key]
        return v


class SubtitleStyleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Lenient on purpose: rows saved by older versions may hold values the input schema no longer allows.
    id: str
    project_id: Optional[str] = None
    preset_name: Optional[str] = None
    enabled: Optional[bool] = True
    font_family: Optional[str] = None
    font_size: Optional[int] = None
    highlight_color: Optional[str] = None
    position: Optional[str] = None
    offset_y: Optional[int] = None
    burst_word_count: Optional[int] = None
    highlight_animation: Optional[str] = None


class SubtitleRenderRequest(BaseModel):
    style: SubtitleStyleIn
    segments: List[Dict[str, Any]]


class SubtitlePreviewResponse(BaseModel):
    ass_content: str
    line_count: int
