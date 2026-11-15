from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.discovery import VideoCandidate, VideoSearchRequest
from app.services.discovery import (
    get_preset_categories,
    normalize_video_key,
    resolve_query_for_page,
    search_candidates,
)


def _cand(vid: str, source: str, url: str, views: int = 50000, title: str = "Factory process") -> VideoCandidate:
    return VideoCandidate(
        id=vid,
        source=source,
        source_label=source.capitalize(),
        title=title,
        url=url,
        duration=420.0,
        duration_str="7:00",
        views=views,
        views_str=f"{views // 1000}K",
        channel="Doc Channel",
    )


def test_presets_and_query_rotation():
    presets = get_preset_categories()
    ids = {p.id for p in presets}
    assert {"factory", "farming", "food", "craft", "restoration", "engineering", "nature_harvest"}.issubset(ids)

    q1, p1 = resolve_query_for_page("factory", None, page=1)
    q2, p2 = resolve_query_for_page("factory", None, page=2)
    assert p1 == "factory"
    assert p2 == "factory"
    assert q1 != q2

    cq1, cp1 = resolve_query_for_page(None, "ceramic pottery", page=1)
    cq2, cp2 = resolve_query_for_page(None, "ceramic pottery", page=2)
    assert cp1 is None and cp2 is None
    assert cq1 == "ceramic pottery"
    assert cq2 != cq1


def test_normalize_video_key():
    assert normalize_video_key("https://www.youtube.com/watch?v=abc123") == "youtube:abc123"
    assert normalize_video_key("https://youtu.be/abc123") == "youtube:abc123"
    assert normalize_video_key("https://www.dailymotion.com/video/x8abcde") == "dailymotion:x8abcde"
    assert normalize_video_key("https://www.bilibili.com/video/BV1xx411c7mD/") == "bilibili:BV1xx411c7mD"
    assert normalize_video_key("https://archive.org/details/factory-film-1950") == "archive_org:factory-film-1950"


@pytest.mark.asyncio
async def test_multi_source_interleaving_and_hide_imported():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.all.return_value = [
        ("https://www.youtube.com/watch?v=used_yt", "proj-1", "Existing Project"),
    ]
    mock_db.execute.return_value = mock_result

    yt_batch = [
        _cand("yt_used_yt", "youtube", "https://www.youtube.com/watch?v=used_yt", views=90000),
        _cand("yt_fresh", "youtube", "https://www.youtube.com/watch?v=fresh_yt", views=70000),
        _cand("yt_ai", "youtube", "https://www.youtube.com/watch?v=ai_vid", title="OpenAI Sora AI Video Factory"),
    ]
    dm_batch = [
        _cand("dm_1", "dailymotion", "https://www.dailymotion.com/video/x11111", views=60000),
    ]
    ia_batch = [
        _cand("ia_1", "archive_org", "https://archive.org/details/steel-mill-doc", views=25000),
    ]

    with patch.dict(
        "app.services.discovery.aggregator.PROVIDER_REGISTRY",
        {
            "youtube": AsyncMock(return_value=yt_batch),
            "dailymotion": AsyncMock(return_value=dm_batch),
            "archive_org": AsyncMock(return_value=ia_batch),
            "bilibili": AsyncMock(side_effect=RuntimeError("network timeout")),
        },
        clear=True,
    ):
        # 1. hide_imported=True (default): skips used_yt & filters Sora AI, tolerates bilibili failure
        res_hidden = await search_candidates(
            VideoSearchRequest(
                preset_id="factory",
                sources=["youtube", "dailymotion", "archive_org", "bilibili"],
                hide_imported=True,
                limit=10,
            ),
            mock_db,
        )
        assert res_hidden.skipped_imported_count == 1
        urls = [c.url for c in res_hidden.candidates]
        assert "https://www.youtube.com/watch?v=used_yt" not in urls
        assert "https://www.youtube.com/watch?v=ai_vid" not in urls
        assert "https://www.youtube.com/watch?v=fresh_yt" in urls
        assert "https://www.dailymotion.com/video/x11111" in urls
        assert "https://archive.org/details/steel-mill-doc" in urls
        # Interleaved order: youtube -> dailymotion -> archive_org
        assert [c.source for c in res_hidden.candidates] == ["youtube", "dailymotion", "archive_org"]

        # 2. hide_imported=False: surfaces previously imported video with badge metadata
        res_shown = await search_candidates(
            VideoSearchRequest(
                preset_id="factory",
                sources=["youtube"],
                hide_imported=False,
                limit=10,
            ),
            mock_db,
        )
        assert res_shown.skipped_imported_count == 0
        used_cand = next(c for c in res_shown.candidates if c.id == "yt_used_yt")
        assert used_cand.is_already_imported is True
        assert used_cand.existing_project_id == "proj-1"
        assert used_cand.existing_project_name == "Existing Project"
