"""Royalty-free BGM library: storage/bgm/<mood>/*.mp3, tracks downloaded by hand (e.g. freetouse.com).

Pixabay has no music API and blocks scripted downloads, so the library is filled manually once.
The folder names are the moods the autopilot LLM can pick from.
"""

import zlib
from pathlib import Path
from typing import List, Optional

from app.core.storage import StorageManager

AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".ogg"}


def bgm_dir() -> Path:
    p = StorageManager().base_dir / "bgm"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _tracks(mood: str) -> List[Path]:
    d = bgm_dir() / mood
    return sorted(f for f in d.iterdir() if f.suffix.lower() in AUDIO_EXTS) if d.is_dir() else []


def available_moods() -> List[str]:
    return sorted(d.name for d in bgm_dir().iterdir() if d.is_dir() and _tracks(d.name))


def pick_track(mood: Optional[str], seed: str) -> Optional[Path]:
    """Stable pick per project (same seed -> same track), so re-renders keep their music."""
    tracks = _tracks(Path(mood).name) if mood else []  # Path().name blocks ../ traversal
    return tracks[zlib.crc32(seed.encode()) % len(tracks)] if tracks else None


def track_credit(track: Optional[Path]) -> Optional[str]:
    """Free To Use requires this credit in the description before the video goes public.

    Their downloads are named 'Artist - Title (freetouse.com).mp3'; other tracks need no credit.
    """
    if not track or "(freetouse.com)" not in track.stem:
        return None
    artist, _, title = track.stem.replace("(freetouse.com)", "").strip().partition(" - ")
    return (
        f"Music from Free To Use\nSource: https://freetouse.com/music\n{title} by {artist}"
        if title
        else f"Music from Free To Use\nSource: https://freetouse.com/music\n{artist}"
    )
