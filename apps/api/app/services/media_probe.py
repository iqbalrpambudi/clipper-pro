"""Media metadata via PyAV (already a dependency) instead of shelling out to ffprobe.

Dropping ffprobe saves a 66MB static binary in the desktop bundle.
"""

from pathlib import Path
from typing import Any, Dict, Union

import av


def probe(path: Union[str, Path]) -> Dict[str, Any]:
    """Return duration (s), width, height, fps (r_frame_rate), has_audio, sample_rate, channels.

    Raises av.error.FFmpegError (an OSError) if the file can't be opened.
    """
    with av.open(str(path)) as c:
        v = next((s for s in c.streams if s.type == "video"), None)
        a = next((s for s in c.streams if s.type == "audio"), None)

        # Prefer the video stream's own duration, like ffprobe's stream=duration
        if v is not None and v.duration and v.time_base:
            duration = float(v.duration * v.time_base)
        elif v is None and a is not None and a.codec_context.sample_rate:
            # Audio-only (narration/BGM): PyAV's bundled lavf misreads MP3 encoder padding by ~40ms,
            # which shifts subtitle sync. Decoded sample count matches ffprobe exactly (~35ms per minute).
            samples = sum(frame.samples for frame in c.decode(a))
            duration = samples / a.codec_context.sample_rate
        elif c.duration:
            duration = c.duration / av.time_base
        else:
            duration = 0.0

        rate = (v.base_rate or v.average_rate) if v is not None else None
        return {
            "duration": duration,
            "width": v.codec_context.width if v is not None else 0,
            "height": v.codec_context.height if v is not None else 0,
            "fps": float(rate) if rate else 0.0,
            "has_audio": a is not None,
            "sample_rate": a.codec_context.sample_rate if a is not None else 0,
            "channels": len(a.codec_context.layout.channels) if a is not None else 0,
        }
