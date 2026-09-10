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
    format_map: Dict[str, YTFormatOption] = {}

    # Target standard heights
    target_heights = [1080, 720, 480, 360]

    for f in raw_formats:
        h = f.get("height")
        if not h or h not in target_heights:
            continue

        ext = f.get("ext", "mp4")
        vcodec = f.get("vcodec", "none")
        if vcodec == "none":
            continue

        res_str = f"{h}p"
        filesize = f.get("filesize") or f.get("filesize_approx")
        filesize_mb = round(filesize / (1024 * 1024), 1) if filesize else None
        fps = f.get("fps")

        # Prefer mp4 container or best video
        if res_str not in format_map or (ext == "mp4" and format_map[res_str].ext != "mp4"):
            format_map[res_str] = YTFormatOption(
                format_id=str(f.get("format_id")),
                resolution=res_str,
                ext=ext,
                filesize_approx_mb=filesize_mb,
                fps=float(fps) if fps else None,
                vcodec=vcodec,
                acodec=f.get("acodec"),
                label=f"{res_str} ({filesize_mb} MB)" if filesize_mb else res_str,
            )

    sorted_formats = [
        format_map[f"{h}p"] for h in target_heights if f"{h}p" in format_map
    ]

    # Fallback to "best" if specific heights aren't neatly separated
    if not sorted_formats:
        sorted_formats.append(
            YTFormatOption(
                format_id="bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                resolution="Auto (Best)",
                ext="mp4",
                label="Auto (Best Quality)",
            )
        )

    return YTInfoResponse(
        title=title,
        duration=duration,
        duration_str=_format_duration(duration),
        thumbnail=thumbnail,
        formats=sorted_formats,
    )


async def download_video(
    url: str,
    output_path: str,
    format_id: Optional[str] = None,
    progress_callback: Optional[Callable[[int], Any]] = None,
) -> str:
    """Download video with yt-dlp and track stdout progress."""
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    # If format_id is specified (like 137 for 1080p video only), combine with bestaudio
    if format_id and "+" not in format_id and "best" not in format_id:
        f_spec = f"{format_id}+bestaudio/best"
    elif format_id:
        f_spec = format_id
    else:
        f_spec = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"

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

    log.info("Running download cmd: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    percent_regex = re.compile(r"\[download\]\s+([0-9\.]+)%")

    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        text = line.decode().strip()
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
        stderr_bytes = await proc.stderr.read()
        err_msg = stderr_bytes.decode().strip()
        raise RuntimeError(f"Gagal mendownload video YouTube: {err_msg[:200]}")

    if progress_callback:
        if asyncio.iscoroutinefunction(progress_callback):
            await progress_callback(100)
        else:
            progress_callback(100)

    return str(out_p)


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
