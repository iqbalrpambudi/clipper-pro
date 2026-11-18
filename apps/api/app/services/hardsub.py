"""Burned-in subtitle (hardsub) band of a source video: detection and render treatment.

Band = {enabled, top, bottom, source}, fractions of frame height (0 = top edge).
Treatment rule is mirrored in web/src/lib/timeline/hardsub.ts (keep CROP_MIN_TOP in sync).
"""

import asyncio
import json
import logging
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.ai_adapters.base import BaseLLMAdapter
from app.services.scene_detector import extract_frames_batch

log = logging.getLogger("cliper-pro.hardsub")

# Band starting at/below 70% of the height is cropped off; a higher band would cost too much picture, so it is blurred.
CROP_MIN_TOP = 0.70
SAMPLE_FRAMES = 6
MIN_POSITIVE_FRAMES = 2
BAND_PADDING = 0.02

_PROMPT = (
    "Each image is a frame from the same video. For every frame, tell whether it shows burned-in "
    "subtitles / captions (text rendered into the picture that transcribes speech). Ignore logos, "
    "watermarks, signs and UI text. If present, give the vertical band that contains the subtitle "
    "lines as fractions of the image height (0 = top edge, 1 = bottom edge).\n"
    'Return ONLY JSON: {"frames": [{"has_burned_subtitles": true, "top": 0.82, "bottom": 0.93}, ...]} '
    "with one entry per image, in order."
)


def band_from_frames(frames: Any) -> Optional[Dict[str, Any]]:
    """Merge per-frame answers into one band; None unless subtitles appear in enough frames."""
    if not isinstance(frames, list):
        return None
    tops: List[float] = []
    bottoms: List[float] = []
    for f in frames:
        if not isinstance(f, dict) or not f.get("has_burned_subtitles"):
            continue
        try:
            t, b = float(f["top"]), float(f["bottom"])
        except (KeyError, TypeError, ValueError):
            continue
        if 0.0 <= t < b <= 1.0:
            tops.append(t)
            bottoms.append(b)
    if len(tops) < MIN_POSITIVE_FRAMES:
        return None
    return {
        "enabled": True,
        "top": round(max(0.0, min(tops) - BAND_PADDING), 3),
        "bottom": round(min(1.0, max(bottoms) + BAND_PADDING), 3),
        "source": "auto",
    }


async def detect_hardsub(
    adapter: BaseLLMAdapter, video_path: str, duration: float
) -> Optional[Dict[str, Any]]:
    """Ask the vision model where burned-in subtitles sit. Fail-open: any problem returns None."""
    if not video_path or duration <= 0:
        return None
    try:
        with tempfile.TemporaryDirectory(prefix="hardsub_") as tmp:
            items = [
                (duration * (0.1 + 0.8 * i / (SAMPLE_FRAMES - 1)), str(Path(tmp) / f"f{i}.jpg"))
                for i in range(SAMPLE_FRAMES)
            ]
            await asyncio.to_thread(extract_frames_batch, video_path, items)
            paths = [p for _, p in items if Path(p).is_file()]
            if len(paths) < MIN_POSITIVE_FRAMES:
                return None
            raw = await asyncio.wait_for(
                adapter.analyze_multimodal(prompt=_PROMPT, image_paths=paths, json_mode=True),
                timeout=60.0,
            )
        text = (raw or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        return band_from_frames(
            json.loads(text[text.find("{") : text.rfind("}") + 1]).get("frames")
        )
    except Exception as exc:
        log.warning("Hardsub detection skipped (fail-open): %s", exc)
        return None


def treatment(hardsub: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """{"kind": "crop", "top"} or {"kind": "blur", "top", "bottom"}; None when nothing to hide."""
    if not isinstance(hardsub, dict) or not hardsub.get("enabled"):
        return None
    try:
        top, bottom = float(hardsub["top"]), float(hardsub["bottom"])
    except (KeyError, TypeError, ValueError):
        return None
    if not 0.0 <= top < bottom <= 1.0:
        return None
    if top >= CROP_MIN_TOP:
        return {"kind": "crop", "top": top}
    return {"kind": "blur", "top": top, "bottom": bottom}


def ffmpeg_chain(hardsub: Optional[Dict[str, Any]], in_label: str, out_label: str) -> str:
    """Filtergraph segment hiding the band, reading in_label and writing out_label."""
    t = treatment(hardsub)
    if t is None:
        return f"{in_label}null{out_label};"
    if t["kind"] == "crop":
        return f"{in_label}crop=iw:trunc(ih*{t['top']:.4f}/2)*2:0:0{out_label};"
    top, height = t["top"], t["bottom"] - t["top"]
    return (
        f"{in_label}split[hs_main][hs_band];"
        f"[hs_band]crop=iw:trunc(ih*{height:.4f}/2)*2:0:trunc(ih*{top:.4f}),boxblur=lr='min(20,h/2-1)':lp=3:cr='min(10,ch/2-1)':cp=3[hs_blur];"
        f"[hs_main][hs_blur]overlay=0:trunc(H*{top:.4f}){out_label};"
    )
