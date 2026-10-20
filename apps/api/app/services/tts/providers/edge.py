from pathlib import Path
from typing import Optional

import edge_tts

from app.services.tts.audio_utils import get_audio_duration


def _normalize_edge_rate(rate: Optional[str]) -> str:
    """Ensure Edge-TTS rate string format is signed like +10%, -10%, or +0%."""
    if not rate:
        return "+0%"
    r = rate.strip()
    if not r.endswith("%"):
        r = f"{r}%"
    if not r.startswith(("+", "-")):
        r = f"+{r}"
    return r


def _normalize_edge_pitch(pitch: Optional[str]) -> str:
    """Ensure Edge-TTS pitch string format is signed like +5Hz, -5Hz, or +0Hz."""
    if not pitch:
        return "+0Hz"
    p = pitch.strip()
    if not p.lower().endswith("hz"):
        p = f"{p}Hz"
    if not p.startswith(("+", "-")):
        p = f"+{p}"
    return p


async def generate_edge_tts(
    text: str,
    output_path: str,
    voice: str = "id-ID-GadisNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> float:
    """Generate audio via Edge-TTS."""
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    norm_rate = _normalize_edge_rate(rate)
    norm_pitch = _normalize_edge_pitch(pitch)
    communicate = edge_tts.Communicate(text, voice=voice, rate=norm_rate, pitch=norm_pitch)
    await communicate.save(str(out_p))

    return await get_audio_duration(str(out_p))
