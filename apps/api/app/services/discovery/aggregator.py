import asyncio
import logging
from typing import Awaitable, Callable, Dict, List, Set, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project, SourceVideo
from app.schemas.discovery import VideoCandidate, VideoSearchRequest, VideoSearchResponse
from app.services.discovery.archive_org import search_archive_org
from app.services.discovery.bilibili import search_bilibili
from app.services.discovery.dailymotion import search_dailymotion
from app.services.discovery.filters import (
    is_ai_content,
    is_talking_head_or_vlog,
    normalize_video_key,
)
from app.services.discovery.presets import resolve_query_for_page
from app.services.discovery.youtube import search_youtube

log = logging.getLogger(__name__)

ProviderFn = Callable[[str, int, int, int, int], Awaitable[List[VideoCandidate]]]

PROVIDER_REGISTRY: Dict[str, ProviderFn] = {
    "youtube": search_youtube,
    "dailymotion": search_dailymotion,
    "archive_org": search_archive_org,
    "bilibili": search_bilibili,
}

DEFAULT_SOURCES = ["youtube", "dailymotion", "archive_org", "bilibili"]


def _interleave_by_source(
    per_source: Dict[str, List[VideoCandidate]],
    source_order: List[str],
    limit: int,
) -> List[VideoCandidate]:
    """Round-robin merge across active providers so results stay balanced across platforms."""
    merged: List[VideoCandidate] = []
    idx = 0
    while len(merged) < limit:
        added_any = False
        for src in source_order:
            bucket = per_source.get(src) or []
            if idx < len(bucket):
                merged.append(bucket[idx])
                added_any = True
                if len(merged) >= limit:
                    break
        if not added_any:
            break
        idx += 1
    return merged


async def _load_existing_imports(
    db: AsyncSession,
) -> Tuple[Dict[str, Tuple[str, str]], Dict[str, Tuple[str, str]]]:
    """Return `(exact_url_map, normalized_key_map)` of videos already imported into projects."""
    stmt = (
        select(SourceVideo.youtube_url, SourceVideo.project_id, Project.name)
        .join(Project, SourceVideo.project_id == Project.id)
        .where(SourceVideo.youtube_url.isnot(None))
    )
    res = await db.execute(stmt)
    exact_map: Dict[str, Tuple[str, str]] = {}
    key_map: Dict[str, Tuple[str, str]] = {}
    for raw_url, pid, pname in res.all():
        if not raw_url:
            continue
        clean = raw_url.strip()
        exact_map[clean] = (pid, pname)
        nkey = normalize_video_key(clean)
        if nkey:
            key_map[nkey] = (pid, pname)
    return exact_map, key_map


async def search_candidates(req: VideoSearchRequest, db: AsyncSession) -> VideoSearchResponse:
    """Search multiple video providers concurrently with anti-exhaustion & deduplication."""
    query_used, resolved_preset_id = resolve_query_for_page(
        preset_id=req.preset_id,
        custom_query=req.custom_query,
        page=req.page,
    )

    active_sources = [s for s in (req.sources or DEFAULT_SOURCES) if s in PROVIDER_REGISTRY]
    if not active_sources:
        active_sources = list(DEFAULT_SOURCES)

    exact_map, key_map = await _load_existing_imports(db)
    excluded_keys: Set[str] = {normalize_video_key(u) for u in (req.exclude_urls or []) if u}
    excluded_urls: Set[str] = {u.strip() for u in (req.exclude_urls or []) if u}

    # Fetch more items per source when hide_imported=True so filtering keeps enough fresh candidates
    per_source_fetch = max(12, req.limit * 2)

    tasks = [
        PROVIDER_REGISTRY[src](
            query_used,
            req.page,
            req.min_duration,
            req.max_duration,
            per_source_fetch,
        )
        for src in active_sources
    ]
    raw_batches = await asyncio.gather(*tasks, return_exceptions=True)

    per_source_filtered: Dict[str, List[VideoCandidate]] = {}
    seen_keys: Set[str] = set()
    skipped_imported = 0

    for src, batch in zip(active_sources, raw_batches, strict=True):
        if isinstance(batch, Exception):
            log.warning("Provider %s raised exception: %s", src, batch)
            per_source_filtered[src] = []
            continue

        bucket: List[VideoCandidate] = []
        for cand in batch:
            nkey = normalize_video_key(cand.url) or cand.id
            if nkey in seen_keys:
                continue
            if cand.url.strip() in excluded_urls or nkey in excluded_keys:
                continue
            seen_keys.add(nkey)

            # Quality filters: exclude AI-generated videos & talking-head/vlog formats
            if req.exclude_ai and is_ai_content(cand.title, "", cand.channel):
                continue
            if is_talking_head_or_vlog(cand.title, ""):
                continue
            if req.min_views > 0 and cand.views > 0 and cand.views < req.min_views:
                continue

            # Check DB import status
            match = exact_map.get(cand.url.strip()) or key_map.get(nkey)
            if match:
                if req.hide_imported:
                    skipped_imported += 1
                    continue
                cand.is_already_imported = True
                cand.existing_project_id = match[0]
                cand.existing_project_name = match[1]

            bucket.append(cand)

        # Sort within each platform bucket by views descending so top-quality items lead
        bucket.sort(key=lambda item: item.views, reverse=True)
        per_source_filtered[src] = bucket

    merged = _interleave_by_source(per_source_filtered, active_sources, req.limit)
    total_available = sum(len(b) for b in per_source_filtered.values())
    has_more = total_available > len(merged) or req.page < 6

    return VideoSearchResponse(
        query_used=query_used,
        preset_id=resolved_preset_id,
        exclude_ai=req.exclude_ai,
        hide_imported=req.hide_imported,
        page=req.page,
        has_more=has_more,
        sources_used=active_sources,
        skipped_imported_count=skipped_imported,
        candidates=merged,
    )
