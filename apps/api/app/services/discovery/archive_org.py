import logging
from typing import Any, List, Optional

import httpx

from app.schemas.discovery import VideoCandidate
from app.services.discovery.filters import format_duration, format_views

log = logging.getLogger(__name__)

ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php"


def _parse_archive_duration(raw: Any) -> float:
    """Parse Archive.org `runtime` / `length` fields (seconds float or HH:MM:SS string)."""
    if raw is None:
        return 0.0
    if isinstance(raw, list) and raw:
        raw = raw[0]
    if isinstance(raw, (int, float)):
        return float(raw)
    text = str(raw).strip()
    if not text:
        return 0.0
    if ":" in text:
        parts = text.split(":")
        try:
            nums = [float(p) for p in parts]
            if len(nums) == 3:
                return nums[0] * 3600 + nums[1] * 60 + nums[2]
            if len(nums) == 2:
                return nums[0] * 60 + nums[1]
        except ValueError:
            return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


async def search_archive_org(
    query: str,
    page: int = 1,
    min_duration: int = 120,
    max_duration: int = 1800,
    fetch_limit: int = 18,
    timeout_sec: float = 15.0,
) -> List[VideoCandidate]:
    """Search Internet Archive movies/documentaries compatible with yt-dlp's archive.org extractor."""
    # Keep query focused on public video items with downloadable MPEG4/h.264 derivatives
    clean_q = query.replace('"', "").strip()
    lucide_q = f'({clean_q}) AND mediatype:(movies) AND format:("MPEG4" OR "h.264")'

    params: List[tuple[str, Any]] = [
        ("q", lucide_q),
        ("fl[]", "identifier"),
        ("fl[]", "title"),
        ("fl[]", "creator"),
        ("fl[]", "downloads"),
        ("fl[]", "runtime"),
        ("fl[]", "length"),
        ("fl[]", "description"),
        ("sort[]", "downloads desc" if page % 2 == 1 else "week desc"),
        ("rows", min(40, max(12, fetch_limit))),
        ("page", max(1, page)),
        ("output", "json"),
    ]

    log.info("Searching Internet Archive (page=%d): %s", page, query)
    try:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.get(ARCHIVE_SEARCH_URL, params=params)
            if resp.status_code != 200:
                log.warning("Archive.org API HTTP %s: %s", resp.status_code, resp.text[:200])
                return []
            payload = resp.json()
    except Exception as exc:
        log.warning("Archive.org search failed: %s", exc)
        return []

    docs = (payload.get("response") or {}).get("docs") or []
    results: List[VideoCandidate] = []
    for doc in docs:
        if not isinstance(doc, dict):
            continue
        ident = str(doc.get("identifier") or "").strip()
        if not ident:
            continue

        duration = _parse_archive_duration(doc.get("runtime") or doc.get("length"))
        # Some Archive.org records omit runtime; keep if 0 only when unknown? Prefer bounded if present
        if duration > 0 and (duration < min_duration or duration > max_duration):
            continue

        title_val = doc.get("title")
        if isinstance(title_val, list):
            title = str(title_val[0] if title_val else ident)
        else:
            title = str(title_val or ident)

        creator_val = doc.get("creator")
        if isinstance(creator_val, list):
            channel = str(creator_val[0] if creator_val else "Internet Archive")
        else:
            channel = str(creator_val or "Internet Archive")

        views = int(doc.get("downloads") or 0)
        url = f"https://archive.org/details/{ident}"
        thumbnail: Optional[str] = f"https://archive.org/services/img/{ident}"

        results.append(
            VideoCandidate(
                id=f"ia_{ident}",
                source="archive_org",
                source_label="Archive.org",
                title=title,
                url=url,
                duration=duration,
                duration_str=format_duration(duration) if duration > 0 else "Dokumenter",
                views=views,
                views_str=format_views(views),
                channel=channel,
                channel_url=f"https://archive.org/search?query=creator%3A%22{channel}%22",
                thumbnail=thumbnail,
            )
        )

    return results
