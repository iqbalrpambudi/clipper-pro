from datetime import datetime, timedelta, timezone

import httpx
import pytest
from pydantic import ValidationError

from app.schemas.youtube_publish import YouTubePublishIn
from app.services import youtube_publish as yt


@pytest.mark.asyncio
async def test_upload_resumes_from_server_range(tmp_path, monkeypatch):
    monkeypatch.setattr(yt, "CHUNK_SIZE", 4)
    video = tmp_path / "v.mp4"
    video.write_bytes(b"0123456789")  # 10 bytes -> chunks of 4
    puts = []

    def handler(req: httpx.Request) -> httpx.Response:
        if req.method == "POST":
            assert req.headers["x-upload-content-length"] == "10"
            return httpx.Response(200, headers={"location": "https://upload.test/session"})
        puts.append(req.headers["content-range"])
        if len(puts) == 1:
            # server only kept 3 of the 4 bytes: client must resend from byte 3
            return httpx.Response(308, headers={"range": "bytes=0-2"})
        if len(puts) == 2:
            return httpx.Response(308, headers={"range": "bytes=0-6"})
        return httpx.Response(200, json={"id": "vid123"})

    progress = []

    async def on_progress(p):
        progress.append(p)

    vid = await yt.upload_video("tok", video, {"snippet": {}}, on_progress, httpx.MockTransport(handler))
    assert vid == "vid123"
    assert puts == ["bytes 0-3/10", "bytes 3-6/10", "bytes 7-9/10"]
    assert progress[-1] == 100


@pytest.mark.asyncio
async def test_upload_raises_google_error_message(tmp_path):
    video = tmp_path / "v.mp4"
    video.write_bytes(b"x")

    def handler(req):
        return httpx.Response(403, json={"error": {"message": "quotaExceeded"}})

    with pytest.raises(yt.YouTubeError, match="quotaExceeded"):
        await yt.upload_video("tok", video, {}, transport=httpx.MockTransport(handler))


def test_schedule_forces_private_and_rejects_past():
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    p = YouTubePublishIn(title="Judul", privacy="public", publish_at=future)
    assert p.privacy == "private"

    with pytest.raises(ValidationError):
        YouTubePublishIn(title="Judul", publish_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    with pytest.raises(ValidationError):
        YouTubePublishIn(title="a <b>")


def test_auth_url_requests_offline_refresh_token():
    url = yt.build_auth_url("cid", "http://localhost:8080/cb", "st")
    assert "access_type=offline" in url and "prompt=consent" in url and "state=st" in url
