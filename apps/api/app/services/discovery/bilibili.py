import asyncio
import json
import logging
from typing import List

from app.schemas.discovery import VideoCandidate
from app.services.discovery.filters import format_duration, format_views

log = logging.getLogger(__name__)


async def search_bilibili(
    query: str,
    page: int = 1,
    min_duration: int = 120,
    max_duration: int = 1800,
    fetch_limit: int = 16,
    timeout_sec: float = 20.0,
) -> List[VideoCandidate]:
    """Search Bilibili candidates via yt-dlp BiliBiliSearch (`bilisearch{N}:{query}`)."""
    fetch_count = max(16, fetch_limit * min(max(1, page), 4))
    cmd = [
        "yt-dlp",
        f"bilisearch{fetch_count}:{query}",
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
    ]

    log.info("Searching Bilibili (page=%d): %s", page, query)
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
        log.warning("Bilibili search timed out after %.1fs for query=%s", timeout_sec, query)
        return []

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace").strip()
        if err_msg:
            log.warning("yt-dlp Bilibili search stderr: %s", err_msg[:200])

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
        if duration > 0 and (duration < min_duration or duration > max_duration):
            continue

        views = int(data.get("view_count") or 0)
        url = (
            data.get("webpage_url")
            or data.get("url")
            or f"https://www.bilibili.com/video/{vid_id}"
        )

        thumbnail = data.get("thumbnail")
        if not thumbnail:
            thumbs = data.get("thumbnails")
            if isinstance(thumbs, list) and thumbs:
                thumbnail = thumbs[-1].get("url")
        if isinstance(thumbnail, str) and thumbnail.startswith("//"):
            thumbnail = f"https:{thumbnail}"

        results.append(
            VideoCandidate(
                id=f"bili_{vid_id}",
                source="bilibili",
                source_label="Bilibili",
                title=str(data.get("title") or "Bilibili Video"),
                url=url,
                duration=duration,
                duration_str=format_duration(duration) if duration > 0 else "Video",
                views=views,
                views_str=format_views(views),
                channel=str(data.get("uploader") or data.get("channel") or "Bilibili Creator"),
                channel_url=data.get("uploader_url") or data.get("channel_url"),
                thumbnail=thumbnail,
            )
        )

    return results
