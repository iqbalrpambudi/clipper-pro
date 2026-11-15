import asyncio
import json
import logging
from typing import List

from app.schemas.discovery import VideoCandidate
from app.services.discovery.filters import format_duration, format_views

log = logging.getLogger(__name__)


async def search_youtube(
    query: str,
    page: int = 1,
    min_duration: int = 120,
    max_duration: int = 1800,
    fetch_limit: int = 18,
    timeout_sec: float = 20.0,
) -> List[VideoCandidate]:
    """Search YouTube candidates via yt-dlp flat-playlist search."""
    # Scale fetch window on deeper pages so exclude_urls / pagination still finds fresh videos
    fetch_count = max(18, fetch_limit * min(max(1, page), 4))
    cmd = [
        "yt-dlp",
        f"ytsearch{fetch_count}:{query}",
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        "--match-filter",
        f"duration >= {min_duration} & duration <= {max_duration} & !is_live",
    ]

    log.info("Searching YouTube (page=%d): %s", page, query)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_sec)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        log.warning("YouTube search timed out after %.1fs for query=%s", timeout_sec, query)
        return []

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace").strip()
        if err_msg:
            log.warning("yt-dlp YouTube search stderr: %s", err_msg[:200])

    results: List[VideoCandidate] = []
    seen = set()
    for line in stdout.decode(errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        vid_id = str(data.get("id") or "").strip()
        if not vid_id or vid_id in seen:
            continue
        seen.add(vid_id)

        duration = float(data.get("duration") or 0.0)
        if duration < min_duration or duration > max_duration:
            continue

        views = int(data.get("view_count") or 0)
        url = (
            data.get("url")
            or data.get("webpage_url")
            or f"https://www.youtube.com/watch?v={vid_id}"
        )

        thumbnail = None
        thumbnails = data.get("thumbnails")
        if isinstance(thumbnails, list) and thumbnails:
            sorted_thumbs = sorted(thumbnails, key=lambda x: x.get("width") or 0, reverse=True)
            thumbnail = sorted_thumbs[0].get("url")
        if not thumbnail:
            thumbnail = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"

        results.append(
            VideoCandidate(
                id=f"yt_{vid_id}",
                source="youtube",
                source_label="YouTube",
                title=str(data.get("title") or "YouTube Video"),
                url=url,
                duration=duration,
                duration_str=format_duration(duration),
                views=views,
                views_str=format_views(views),
                channel=str(data.get("channel") or data.get("uploader") or "YouTube Creator"),
                channel_url=data.get("channel_url") or data.get("uploader_url"),
                thumbnail=thumbnail,
            )
        )

    return results
