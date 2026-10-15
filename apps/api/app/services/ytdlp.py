import asyncio
import json
import logging
import re
import shutil
from pathlib import Path
from typing import Optional, Callable, Dict, Any, List
from app.schemas.media import YTFormatOption, YTInfoResponse

log = logging.getLogger(__name__)


def _format_duration(seconds: float) -> str:
    mins, secs = divmod(int(seconds), 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def _get_quality_tier(h: Optional[int], w: Optional[int]):
    if not h:
        return None
    if h >= 1400 or (w and w >= 2560):
        return ("4K / 2K", 2160)
    elif h >= 900 or (w and w >= 1600):
        return ("1080p (Full HD)", 1080)
    elif h >= 600 or (w and w >= 1100):
        return ("720p (HD)", 720)
    elif h >= 400 or (w and w >= 700):
        return ("480p (SD)", 480)
    elif h >= 300:
        return ("360p", 360)
    return None


async def get_video_info(url: str) -> YTInfoResponse:
    """Fetch video metadata and available formats using yt-dlp."""
    cmd = [
        "yt-dlp",
        "--dump-json",
        "--no-playlist",
        "--skip-download",
        url,
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode().strip()
        log.error("yt-dlp failed: %s", err_msg)
        raise RuntimeError(f"Gagal mengambil info video YouTube: {err_msg[:200]}")

    data = json.loads(stdout.decode())
    title = data.get("title", "YouTube Video")
    duration = float(data.get("duration", 0.0))
    thumbnail = data.get("thumbnail")

    raw_formats = data.get("formats", [])
    tier_map: Dict[str, tuple] = {}

    for f in raw_formats:
        vcodec = f.get("vcodec", "none")
        if vcodec == "none":
            continue

        h = f.get("height")
        w = f.get("width")
        tier_info = _get_quality_tier(h, w)
        if not tier_info:
            continue

        tier_name, sort_order = tier_info
        ext = f.get("ext", "mp4")
        filesize = f.get("filesize") or f.get("filesize_approx")
        filesize_mb = round(filesize / (1024 * 1024), 1) if filesize else None

        existing = tier_map.get(tier_name)
        if not existing:
            tier_map[tier_name] = (sort_order, f, filesize_mb)
        else:
            # Prefer mp4 container or higher filesize
            if ext == "mp4" and existing[1].get("ext") != "mp4":
                tier_map[tier_name] = (sort_order, f, filesize_mb)
            elif ext == existing[1].get("ext") and (filesize or 0) > (existing[1].get("filesize") or existing[1].get("filesize_approx") or 0):
                tier_map[tier_name] = (sort_order, f, filesize_mb)

    sorted_tiers = sorted(tier_map.items(), key=lambda x: x[1][0], reverse=True)
    sorted_formats: List[YTFormatOption] = []

    # Always add Auto (Best Quality) as the premier option
    sorted_formats.append(
        YTFormatOption(
            format_id="bestvideo+bestaudio/best",
            resolution="Auto (Best)",
            ext="mp4",
            label="Auto (Kualitas Terbaik)",
        )
    )

    for name, (_, f, size_mb) in sorted_tiers:
        res_label = name.split(" ")[0]  # e.g., "1080p", "720p", "480p", "360p"
        sorted_formats.append(
            YTFormatOption(
                format_id=str(f.get("format_id")),
                resolution=res_label,
                ext="mp4",
                filesize_approx_mb=size_mb,
                fps=float(f.get("fps")) if f.get("fps") else None,
                vcodec=f.get("vcodec"),
                acodec=f.get("acodec"),
                label=f"{name} ({size_mb} MB)" if size_mb else name,
            )
        )

    return YTInfoResponse(
        title=title,
        duration=duration,
        duration_str=_format_duration(duration),
        thumbnail=thumbnail,
        formats=sorted_formats,
    )


from app.services.cancellation import (
    register_process,
    unregister_process,
    is_cancelled,
    clear_cancellation,
    TaskCancelledException,
)


async def download_video(
    url: str,
    output_path: str,
    format_id: Optional[str] = None,
    progress_callback: Optional[Callable[[int], Any]] = None,
    project_id: Optional[str] = None,
    video_id: Optional[str] = None,
) -> str:
    """Download video with yt-dlp, track stdout progress, and support instant cancellation."""
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    if project_id or video_id:
        await clear_cancellation(project_id, video_id=video_id)

    # If format_id is specified (like 137 for 1080p video only), combine with bestaudio
    if format_id and "+" not in format_id and "best" not in format_id:
        f_spec = f"{format_id}+bestaudio/best"
    elif format_id:
        f_spec = format_id
    else:
        f_spec = "bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best"

    cmd = [
        "yt-dlp",
        "--newline",
        "-f",
        f_spec,
        "--merge-output-format",
        "mp4",
        "-o",
        str(out_p),
        url,
    ]

    proc_key = f"video:{video_id}" if video_id else f"download:{out_p.stem}"
    log.info("Running download cmd: %s (key=%s)", " ".join(cmd), proc_key)

    # Merge stderr into stdout: reading stdout while stderr stays a full PIPE would deadlock.
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    register_process(proc_key, proc)

    percent_regex = re.compile(r"\[download\]\s+([0-9\.]+)%")
    tail_lines: List[str] = []

    try:
        while True:
            # Check cancellation flag before reading next line
            if await is_cancelled(project_id, video_id=video_id):
                log.info("Cancellation detected during yt-dlp download for video %s", video_id)
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
                await proc.wait()
                out_p.unlink(missing_ok=True)
                raise TaskCancelledException("Download video YouTube dibatalkan oleh pengguna.")

            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode(errors="replace").strip()
            tail_lines.append(text)
            if len(tail_lines) > 40:
                tail_lines.pop(0)
            match = percent_regex.search(text)
            if match:
                pct = int(float(match.group(1)))
                if progress_callback:
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(pct)
                    else:
                        progress_callback(pct)

        await proc.wait()
        if proc.returncode != 0:
            err_msg = "\n".join(tail_lines)[-400:]
            out_p.unlink(missing_ok=True)
            raise RuntimeError(f"Gagal mendownload video YouTube: {err_msg}")

        if progress_callback:
            if asyncio.iscoroutinefunction(progress_callback):
                await progress_callback(100)
            else:
                progress_callback(100)

        return str(out_p)
    except (asyncio.CancelledError, TaskCancelledException):
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        out_p.unlink(missing_ok=True)
        raise
    finally:
        unregister_process(proc_key)


async def get_ytdlp_version() -> str:
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp", "--version", stdout=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        return stdout.decode().strip()
    except Exception:
        return "unknown"


async def update_ytdlp() -> str:
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp", "-U", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        out = stdout.decode().strip() or stderr.decode().strip()
        return out
    except Exception as e:
        return str(e)
