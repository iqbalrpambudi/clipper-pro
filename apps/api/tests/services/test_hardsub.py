import json
import subprocess

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.main import app
from app.models.project import SourceVideo
from app.services import hardsub as hs
from app.services.media_probe import probe


def test_band_needs_two_frames_and_is_padded():
    one = [
        {"has_burned_subtitles": True, "top": 0.8, "bottom": 0.9},
        {"has_burned_subtitles": False},
    ]
    assert hs.band_from_frames(one) is None

    band = hs.band_from_frames(
        [
            {"has_burned_subtitles": True, "top": 0.82, "bottom": 0.90},
            {"has_burned_subtitles": True, "top": 0.80, "bottom": 0.93},
            {"has_burned_subtitles": True, "top": "bad"},
        ]
    )
    assert band == {"enabled": True, "top": 0.78, "bottom": 0.95, "source": "auto"}


def test_treatment_crops_low_band_and_blurs_high_band():
    assert hs.treatment({"enabled": True, "top": 0.78, "bottom": 0.95})["kind"] == "crop"
    assert hs.treatment({"enabled": True, "top": 0.55, "bottom": 0.65})["kind"] == "blur"
    assert hs.treatment({"enabled": False, "top": 0.8, "bottom": 0.9}) is None
    assert hs.treatment(None) is None


def _probe_wh(path):
    info = probe(path)
    return info["width"], info["height"]


@pytest.mark.parametrize(
    "band, expected_h",
    [
        ({"enabled": True, "top": 0.8, "bottom": 0.95}, 288),  # crop keeps top 80% of 360
        ({"enabled": True, "top": 0.5, "bottom": 0.6}, 360),  # blur keeps full frame
        ({"enabled": True, "top": 0.6, "bottom": 0.62}, 360),  # thin band: blur radius must fit
        (None, 360),
    ],
)
def test_ffmpeg_chain_runs_in_real_ffmpeg(tmp_path, band, expected_h):
    out = tmp_path / "out.mp4"
    graph = hs.ffmpeg_chain(band, "[0:v]", "[v_src]") + "[v_src]null[v_out]"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x360:duration=1:rate=10",
            "-filter_complex",
            graph,
            "-map",
            "[v_out]",
            str(out),
        ],
        check=True,
    )
    assert _probe_wh(out) == (640, expected_h)


@pytest.mark.asyncio
async def test_detect_hardsub_with_fake_vision(tmp_path):
    video = tmp_path / "src.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x180:duration=4:rate=10",
            str(video),
        ],
        check=True,
    )
    seen = {}

    class FakeVision:
        async def analyze_multimodal(self, prompt, image_paths, json_mode=True, system_prompt=None):
            seen["n"] = len(image_paths)
            return json.dumps(
                {
                    "frames": [{"has_burned_subtitles": True, "top": 0.8, "bottom": 0.9}]
                    * len(image_paths)
                }
            )

    band = await hs.detect_hardsub(FakeVision(), str(video), 4.0)
    assert seen["n"] == hs.SAMPLE_FRAMES
    assert band["enabled"] and band["top"] == 0.78

    class Broken:
        async def analyze_multimodal(self, **_kw):
            raise RuntimeError("no key")

    assert await hs.detect_hardsub(Broken(), str(video), 4.0) is None


@pytest_asyncio.fixture
async def client_db(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 't.db'}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with factory() as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, factory
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_patch_hardsub_marks_manual_and_validates(client_db):
    client, factory = client_db
    pid = (await client.post("/api/v1/projects", json={"name": "HS"})).json()["id"]
    async with factory() as db:
        db.add(
            SourceVideo(
                id="v1",
                project_id=pid,
                filename="a.mp4",
                duration=10,
                status="ready",
                hardsub={"enabled": True, "top": 0.8, "bottom": 0.9, "source": "auto"},
            )
        )
        await db.commit()

    r = await client.patch(
        f"/api/v1/projects/{pid}/media/v1",
        json={"hardsub": {"enabled": True, "top": 0.7, "bottom": 0.92}},
    )
    assert r.status_code == 200
    assert r.json()["hardsub"] == {"enabled": True, "top": 0.7, "bottom": 0.92, "source": "manual"}

    bad = await client.patch(
        f"/api/v1/projects/{pid}/media/v1",
        json={"hardsub": {"enabled": True, "top": 0.9, "bottom": 0.8}},
    )
    assert bad.status_code == 422
