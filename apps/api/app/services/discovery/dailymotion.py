import logging
from typing import List

import httpx

from app.schemas.discovery import VideoCandidate
from app.services.discovery.filters import format_duration, format_views

log = logging.getLogger(__name__)

DAILYMOTION_API_URL = "https://api.dailymotion.com/videos"


async def search_dailymotion(
    query: str,
    page: int = 1,
    min_duration: int = 120,
    max_duration: int = 1800,
    fetch_limit: int = 18,
    timeout_sec: float = 15.0,
) -> List[VideoCandidate]:
    """Search Dailymotion public API with native pagination and duration filters."""
    params = {
        "search": query,
        "fields": "id,title,description,duration,views_total,thumbnail_720_url,thumbnail_url,owner.screenname,owner.url,url",
        "longer_than": max(1, int(min_duration // 60)),
        "shorter_than": max(2, int((max_duration + 59) // 60)),
        "sort": "relevance" if page % 2 == 1 else "visited",
        "page": max(1, page),
        "limit": min(50, max(10, fetch_limit)),
    }

    log.info("Searching Dailymotion (page=%d): %s", page, query)
    try:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.get(DAILYMOTION_API_URL, params=params)
            if resp.status_code != 200:
                log.warning("Dailymotion API HTTP %s: %s", resp.status_code, resp.text[:200])
                return []
            payload = resp.json()
    except Exception as exc:
        log.warning("Dailymotion search failed: %s", exc)
        return []

    results: List[VideoCandidate] = []
    for item in payload.get("list") or []:
        if not isinstance(item, dict):
            continue
        vid_id = str(item.get("id") or "").strip()
        if not vid_id:
            continue

        duration = float(item.get("duration") or 0.0)
        if duration < min_duration or duration > max_duration:
            continue

        views = int(item.get("views_total") or 0)
        url = str(item.get("url") or f"https://www.dailymotion.com/video/{vid_id}")
        thumbnail = item.get("thumbnail_720_url") or item.get("thumbnail_url")
        channel = str(item.get("owner.screenname") or "Dailymotion Creator")
        channel_url = item.get("owner.url")

        results.append(
            VideoCandidate(
                id=f"dm_{vid_id}",
                source="dailymotion",
                source_label="Dailymotion",
                title=str(item.get("title") or "Dailymotion Video"),
                url=url,
                duration=duration,
                duration_str=format_duration(duration),
                views=views,
                views_str=format_views(views),
                channel=channel,
                channel_url=channel_url,
                thumbnail=thumbnail,
            )
        )

    return results
