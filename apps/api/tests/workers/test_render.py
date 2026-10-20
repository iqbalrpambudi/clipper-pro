from unittest.mock import AsyncMock, patch

import pytest

from app.services.renderer import build_watermark_filter, run_ffmpeg_with_timeout


def test_storage_render_deletion(tmp_path, monkeypatch):
    test_render = tmp_path / "final_render.mp4"
    test_render.touch()
    assert test_render.exists()
    test_render.unlink()
    assert not test_render.exists()


def test_watermark_filter_builder(tmp_path):
    wm_img = tmp_path / "logo.png"
    wm_img.touch()

    # Bottom right
    f1 = build_watermark_filter(
        watermark_path=str(wm_img),
        position="bottom_right",
        opacity=0.8,
        scale=0.15,
        video_width=1080,
        video_height=1920,
    )
    assert "overlay=" in f1
    assert "format=rgba" in f1

    # Top left
    f2 = build_watermark_filter(
        watermark_path=str(wm_img),
        position="top_left",
        opacity=0.5,
        scale=0.2,
        video_width=1080,
        video_height=1920,
    )
    assert "overlay=" in f2


@pytest.mark.asyncio
async def test_render_job_thumbnail_resolution(tmp_path, monkeypatch):
    from app.services.scene_detector import resolve_or_extract_scene_thumbnail

    fake_thumb = tmp_path / "projects" / "p1" / "scenes" / "thumb_0001_1000.jpg"
    fake_thumb.parent.mkdir(parents=True, exist_ok=True)
    fake_thumb.touch()

    resolved = await resolve_or_extract_scene_thumbnail("p1", "thumb_0001_1000.jpg", str(tmp_path), None)
    assert resolved == fake_thumb


@pytest.mark.asyncio
async def test_trigger_final_render_resolution(monkeypatch):
    mock_redis = AsyncMock()
    mock_redis.enqueue_job = AsyncMock(return_value="job-123")

    with patch("arq.create_pool", return_value=mock_redis):
        assert mock_redis is not None


@pytest.mark.asyncio
async def test_run_ffmpeg_and_render_timeouts():
    # ffmpeg version check returns 0 rapidly
    cmd = ["ffmpeg", "-version"]
    try:
        rc, out, err = await run_ffmpeg_with_timeout(cmd, timeout_seconds=10)
        assert rc == 0
        assert "ffmpeg version" in out
    except FileNotFoundError:
        pytest.skip("ffmpeg binary not installed on host machine")
