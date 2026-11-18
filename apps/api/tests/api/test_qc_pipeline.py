import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.main import app
from app.models.narration import AudioTrack, Narration
from app.models.project import Scene, SourceVideo
from app.models.timeline import Timeline
from app.services import project_defaults
from app.services import qc as qc_service


@pytest_asyncio.fixture
async def qc_client(tmp_path, monkeypatch):
    config_file = tmp_path / "config.json"
    monkeypatch.setattr(project_defaults, "resolve_config_json_path", lambda: config_file)

    async def _no_external_llm(*_args, **_kwargs):
        return None, False

    monkeypatch.setattr(qc_service, "_get_qc_adapter", _no_external_llm)

    db_file = tmp_path / "test_qc.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}", echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, session_factory

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_gate1_script_passes_without_nitpicking_when_clean(qc_client):
    client, session_factory = qc_client

    create_resp = await client.post(
        "/api/v1/projects",
        json={"name": "Clean Script Project"},
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["id"]

    async with session_factory() as db:
        video = SourceVideo(
            id="vid-1",
            project_id=project_id,
            filename="sample.mp4",
            file_path="/tmp/sample.mp4",
            duration=30.0,
            status="ready",
        )
        scene1 = Scene(
            id="scene-1",
            project_id=project_id,
            source_video_id="vid-1",
            scene_index=0,
            start_time=0.0,
            end_time=6.0,
            duration=6.0,
            description="Kreator memegang smartphone menampilkan grafik performa video",
            tags=["kreator", "smartphone", "grafik", "video"],
            status="ready",
        )
        scene2 = Scene(
            id="scene-2",
            project_id=project_id,
            source_video_id="vid-1",
            scene_index=1,
            start_time=6.0,
            end_time=14.0,
            duration=8.0,
            description="Close up kreator mengedit ritme potongan timeline di laptop",
            tags=["timeline", "laptop", "ritme", "potongan"],
            status="ready",
        )
        narration = Narration(
            id="narr-1",
            project_id=project_id,
            tone="santai",
            target_duration=15,
            raw_text=(
                "Tahukah kamu kenapa grafik performa video banyak kreator gagal naik di tiga detik pertama?\n\n"
                "Kuncinya ada pada ritme potongan timeline di laptop yang langsung menjawab rasa penasaran penonton."
            ),
            segments=[
                {
                    "id": "seg-1",
                    "text": "Tahukah kamu kenapa grafik performa video banyak kreator gagal naik di tiga detik pertama?",
                    "start_ms": 0,
                    "end_ms": 5000,
                    "scene_id": "scene-1",
                },
                {
                    "id": "seg-2",
                    "text": "Kuncinya ada pada ritme potongan timeline di laptop yang langsung menjawab rasa penasaran penonton.",
                    "start_ms": 5000,
                    "end_ms": 11000,
                    "scene_id": "scene-2",
                },
            ],
            status="generated",
        )
        db.add_all([video, scene1, scene2, narration])
        await db.commit()

    run_resp = await client.post(
        f"/api/v1/projects/{project_id}/qc/run",
        json={"gate": "script", "auto_fix": True},
    )
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert run_data["gate"] == "script"
    assert run_data["status"] == "passed"
    assert run_data["overall_score"] >= 7.5
    assert run_data["rounds_used"] == 0
    assert run_data["applied_fixes"] == []


@pytest.mark.asyncio
async def test_gate1_script_autofix_and_revert(qc_client):
    client, session_factory = qc_client

    create_resp = await client.post(
        "/api/v1/projects",
        json={"name": "Dirty Script Project"},
    )
    project_id = create_resp.json()["id"]

    original_seg0 = (
        "[Hook] **Halo semuanya kembali lagi**, di video kali ini kita bahas mesin kopi espresso!"
    )
    async with session_factory() as db:
        video = SourceVideo(
            id="vid-2",
            project_id=project_id,
            filename="sample2.mp4",
            file_path="/tmp/sample2.mp4",
            duration=20.0,
            status="ready",
        )
        scene1 = Scene(
            id="scene-a",
            project_id=project_id,
            source_video_id="vid-2",
            scene_index=0,
            start_time=0.0,
            end_time=8.0,
            duration=8.0,
            description="Close up mesin kopi espresso sedang mengekstraksi kopi",
            tags=["mesin", "kopi", "espresso"],
            status="ready",
        )
        narration = Narration(
            id="narr-2",
            project_id=project_id,
            tone="santai",
            target_duration=15,
            raw_text=original_seg0,
            segments=[
                {
                    "id": "seg-1",
                    "text": original_seg0,
                    "start_ms": 0,
                    "end_ms": 4500,
                },
                {
                    "id": "seg-2",
                    "text": "1. Tekanan air mesin kopi harus stabil di sembilan bar agar ekstraksi espresso sempurna.",
                    "start_ms": 4500,
                    "end_ms": 9500,
                },
            ],
            status="generated",
        )
        db.add_all([video, scene1, narration])
        await db.commit()

    run_resp = await client.post(
        f"/api/v1/projects/{project_id}/qc/run",
        json={"gate": "script", "auto_fix": True},
    )
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert run_data["rounds_used"] >= 1
    assert len(run_data["applied_fixes"]) >= 1
    assert run_data["can_revert"] is True

    # Verify segments were cleaned and linked to scene-a
    proj_resp = await client.get(f"/api/v1/projects/{project_id}")
    updated_segments = proj_resp.json()["narration"]["segments"]
    assert "[Hook]" not in updated_segments[0]["text"]
    assert "**" not in updated_segments[0]["text"]
    assert updated_segments[0]["scene_id"] == "scene-a"

    # Revert QC auto-fix and verify original text is restored
    revert_resp = await client.post(
        f"/api/v1/projects/{project_id}/qc/runs/{run_data['id']}/revert"
    )
    assert revert_resp.status_code == 200
    assert revert_resp.json()["can_revert"] is False

    proj_after_revert = await client.get(f"/api/v1/projects/{project_id}")
    reverted_segments = proj_after_revert.json()["narration"]["segments"]
    assert reverted_segments[0]["text"] == original_seg0


@pytest.mark.asyncio
async def test_gate2_timeline_autofix_duplicates_and_flash_cuts_and_revert(qc_client):
    client, session_factory = qc_client

    create_resp = await client.post(
        "/api/v1/projects",
        json={"name": "Timeline QC Project"},
    )
    project_id = create_resp.json()["id"]

    async with session_factory() as db:
        video = SourceVideo(
            id="vid-tl",
            project_id=project_id,
            filename="tl.mp4",
            file_path="/tmp/tl.mp4",
            duration=30.0,
            status="ready",
        )
        s1 = Scene(
            id="tl-scene-1",
            project_id=project_id,
            source_video_id="vid-tl",
            scene_index=0,
            start_time=0.0,
            end_time=6.0,
            duration=6.0,
            description="Drone shot puncak gunung saat matahari terbit",
            tags=["gunung", "matahari", "drone"],
            status="ready",
        )
        s2 = Scene(
            id="tl-scene-2",
            project_id=project_id,
            source_video_id="vid-tl",
            scene_index=1,
            start_time=6.0,
            end_time=15.0,
            duration=9.0,
            description="Pendaki berjalan menyeberangi jembatan gantung di pegunungan",
            tags=["pendaki", "jembatan", "pegunungan"],
            status="ready",
        )
        narration = Narration(
            id="narr-tl",
            project_id=project_id,
            tone="dramatis",
            target_duration=10,
            raw_text="Pemandangan puncak gunung ini luar biasa. Pendaki menyeberangi jembatan gantung.",
            segments=[
                {
                    "id": "seg-1",
                    "text": "Pemandangan puncak gunung ini benar-benar luar biasa saat matahari terbit.",
                    "start_ms": 0,
                    "end_ms": 4500,
                    "scene_id": "tl-scene-1",
                },
                {
                    "id": "seg-2",
                    "text": "Pendaki berjalan menyeberangi jembatan gantung di tengah kabut pegunungan.",
                    "start_ms": 4500,
                    "end_ms": 10500,
                    "scene_id": "tl-scene-2",
                },
            ],
            status="aligned",
        )
        audio = AudioTrack(
            id="audio-1",
            project_id=project_id,
            narration_id="narr-tl",
            file_path="/tmp/voice.mp3",
            duration=9.0,
            voice="Puck",
            provider="gemini",
        )
        # Adjacent duplicate scene (tl-scene-1 twice on clip-1 & clip-2) AND a 0.4s flash cut on clip-3
        tl_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
        timeline = tl_res.scalars().first()
        assert timeline is not None
        timeline.total_duration = 6.9
        timeline.clips = [
            {
                "id": "clip-1",
                "segment_id": "seg-1",
                "scene_id": "tl-scene-1",
                "source_video_id": "vid-tl",
                "timeline_start": 0.0,
                "timeline_end": 3.5,
                "clip_start": 0.0,
                "clip_end": 3.5,
                "speed": 1.0,
            },
            {
                "id": "clip-2",
                "segment_id": "seg-2",
                "scene_id": "tl-scene-1",
                "source_video_id": "vid-tl",
                "timeline_start": 3.5,
                "timeline_end": 6.5,
                "clip_start": 0.0,
                "clip_end": 3.0,
                "speed": 1.0,
            },
            {
                "id": "clip-3",
                "segment_id": "seg-2",
                "scene_id": "tl-scene-2",
                "source_video_id": "vid-tl",
                "timeline_start": 6.5,
                "timeline_end": 6.9,
                "clip_start": 6.0,
                "clip_end": 6.4,
                "speed": 1.0,
            },
        ]
        db.add_all([video, s1, s2, narration, audio])
        await db.commit()

    run_resp = await client.post(
        f"/api/v1/projects/{project_id}/qc/run",
        json={"gate": "timeline", "auto_fix": True},
    )
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert run_data["gate"] == "timeline"
    assert run_data["rounds_used"] >= 1
    assert len(run_data["applied_fixes"]) >= 2
    assert run_data["can_revert"] is True

    proj_resp = await client.get(f"/api/v1/projects/{project_id}")
    proj_json = proj_resp.json()
    clips = proj_json["timeline"]["clips"]
    # Duplicate scene swapped to tl-scene-2, flash cut healed, and synced to 9.0s audio
    assert len(clips) == 2
    assert clips[0]["scene_id"] != clips[1]["scene_id"]
    assert all((c["timeline_end"] - c["timeline_start"]) >= 1.5 for c in clips)
    assert abs(proj_json["timeline"]["total_duration"] - 9.0) <= 0.6

    # Revert and verify original 3 clips & scene_ids are restored
    revert_resp = await client.post(
        f"/api/v1/projects/{project_id}/qc/runs/{run_data['id']}/revert"
    )
    assert revert_resp.status_code == 200
    proj_after_revert = await client.get(f"/api/v1/projects/{project_id}")
    reverted_clips = proj_after_revert.json()["timeline"]["clips"]
    assert len(reverted_clips) == 3
    assert reverted_clips[0]["scene_id"] == "tl-scene-1"
    assert reverted_clips[1]["scene_id"] == "tl-scene-1"
    assert (
        abs((reverted_clips[2]["timeline_end"] - reverted_clips[2]["timeline_start"]) - 0.4) < 0.05
    )


def test_split_long_sentence_never_drops_words():
    text = (
        "Mesin kopi ini punya tekanan sembilan bar yang stabil, sehingga ekstraksi espresso jadi "
        "lebih kaya rasa dan crema tebal, tetapi kamu tetap harus pakai biji kopi segar setiap hari"
    )
    lines = qc_service._split_long_sentence(text, max_words=20)
    assert len(lines) > 1
    assert all(len(line.split()) <= 20 for line in lines)

    def norm(s: str) -> list[str]:
        return [w.strip(",.").lower() for w in s.split()]

    assert norm(" ".join(lines)) == norm(text)
    # No clause boundary: keep the line whole rather than cutting it
    unbroken = " ".join(["kata"] * 30)
    assert qc_service._split_long_sentence(unbroken, max_words=20) == [unbroken]


def test_judge_score_sets_score_and_rules_cap_it():
    scores = {"hook": 8.8, "flow_retention": 6.0}
    qc_service._merge_judge_scores(scores, {"hook": 5.5, "flow_retention": 9.5})
    assert scores == {"hook": 5.5, "flow_retention": 6.0}


@pytest.mark.asyncio
async def test_review_only_run_reports_but_never_changes_script(qc_client):
    client, session_factory = qc_client
    project_id = (await client.post("/api/v1/projects", json={"name": "Review Only"})).json()["id"]
    dirty = "[Hook] **Halo semuanya**, kita bahas mesin kopi espresso hari ini!"
    async with session_factory() as db:
        db.add(
            Narration(
                id="narr-review",
                project_id=project_id,
                tone="santai",
                target_duration=15,
                raw_text=dirty,
                segments=[{"id": "seg-1", "text": dirty, "start_ms": 0, "end_ms": 4000}],
                status="generated",
            )
        )
        await db.commit()

    run = (
        await client.post(f"/api/v1/projects/{project_id}/qc/run", json={"gate": "script"})
    ).json()
    assert run["issues"], "review must still report problems"
    assert run["applied_fixes"] == [] and run["rounds_used"] == 0

    async with session_factory() as db:
        assert (await db.get(Narration, "narr-review")).segments[0]["text"] == dirty
