"""Frame-accurate math utilities for video composition matching FFmpeg CFR 30 FPS."""

COMPOSITION_FPS = 30


def sec_to_frame(sec: float, fps: int = COMPOSITION_FPS) -> int:
    """Convert seconds to discrete integer frame index."""
    if not sec or sec < 0:
        return 0
    return int(round(sec * fps))


def frame_to_sec(frame: int, fps: int = COMPOSITION_FPS) -> float:
    """Convert discrete frame index to exact seconds (rounded to 4 decimal places)."""
    if not frame or frame < 0:
        return 0.0
    return round(frame / fps, 4)


def snap_to_frame(sec: float, fps: int = COMPOSITION_FPS) -> float:
    """Snap a floating-point seconds value to the nearest exact frame timestamp."""
    return frame_to_sec(sec_to_frame(sec, fps), fps)


def frame_duration(start_sec: float, end_sec: float, fps: int = COMPOSITION_FPS) -> float:
    """Calculate exact duration in seconds based on discrete frame count."""
    start_f = sec_to_frame(start_sec, fps)
    end_f = sec_to_frame(end_sec, fps)
    dur_f = max(1, end_f - start_f)
    return frame_to_sec(dur_f, fps)
