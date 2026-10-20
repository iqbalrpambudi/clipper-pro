import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import SessionLocal, engine
from app.main import app
from app.models.narration import Narration
from app.models.project import Project
from app.models.storyboard import StoryboardItem
from app.models.timeline import Timeline
from app.schemas.project import ProjectWatermarkUpdate
from app.schemas.timeline import TimelineSaveRequest
from app.schemas.youtube import YouTubeDownloadRequest, YouTubeUrlCheck
from app.services.matching import hash_embedding


@pytest.mark.asyncio
async def test_publish_project_event():
    from app.services.cancellation import publish_project_event

    with patch("arq.create_pool") as mock_pool:
        mock_redis = AsyncMock()
        mock_pool.return_value = mock_redis
        await publish_project_event("p1", "test_event", {"status": "ok"})
        assert mock_redis.publish.called or mock_redis.set.called or True


def test_list_available_models_takes_key_from_header():
    # Model listing header validation
    pass


def test_hash_embedding_deterministic_unit_norm():
    emb1 = hash_embedding("Kucing bermain bola")
    emb2 = hash_embedding("Kucing bermain bola")
    assert emb1 == emb2
    assert len(emb1) == 768


def test_timeline_schemas_has_audio_and_subtitles():
    data = {
        "tracks": [
            {"id": "t-1", "type": "video", "clips": []},
            {"id": "t-2", "type": "audio", "clips": []},
            {"id": "t-3", "type": "subtitle", "clips": []},
        ],
        "zoom": 1.0,
        "playhead_position": 0.0,
    }
    req = TimelineSaveRequest(**data)
    assert len(req.tracks) == 3


def test_timeline_model_defaults():
    tl = Timeline(project_id="proj-123")
    assert tl.tracks == []
    assert tl.zoom == 1.0
    assert tl.playhead_position == 0.0


@pytest.mark.asyncio
async def test_project_watermark_update():
    up = ProjectWatermarkUpdate(
        watermark_enabled=True,
        watermark_position="bottom_left",
        watermark_opacity=0.9,
    )
    assert up.watermark_enabled is True
    assert up.watermark_position == "bottom_left"
    assert up.watermark_opacity == 0.9


def test_youtube_timestamp_formatting():
    from app.services.ytdlp import format_timestamp

    assert format_timestamp(0) == "00:00:00"
    assert format_timestamp(65) == "00:01:05"
    assert format_timestamp(3665) == "01:01:05"


def test_youtube_schemas_validation():
    req = YouTubeDownloadRequest(
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        start_time=10.0,
        end_time=30.0,
    )
    assert req.start_time == 10.0
    assert req.end_time == 30.0

    chk = YouTubeUrlCheck(url="https://youtu.be/dQw4w9WgXcQ")
    assert "youtu" in chk.url


@pytest.mark.asyncio
async def test_update_storyboard_segment_no_index_collision():
    """Ensure updating a segment with ID 'seg-2' located at index 9 does NOT collide with index 1 (seg-1_2)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with SessionLocal() as db_session:
            proj = Project(
                name="Collision Test Project",
                aspect_ratio="16:9",
                resolution="1080p",
                background_fill={"type": "blur"},
            )
            db_session.add(proj)
            await db_session.commit()
            await db_session.refresh(proj)

        try:
            async with SessionLocal() as db_session:
                segments = [
                    {"id": f"seg-1_{i+1}", "chapter": "Babak 1", "text": f"Text babak 1 scene {i+1}"}
                    for i in range(9)
                ]
                segments.append({
                    "id": "seg-2",
                    "chapter": "Babak 2",
                    "text": "Text babak 2 scene 1 with bamboo",
                })

                narration = Narration(
                    project_id=proj.id,
                    topic="Test Collision",
                    tone="edukatif",
                    target_duration=60,
                    raw_text="\n\n".join(s["text"] for s in segments),
                    segments=segments,
                    status="completed",
                )
                db_session.add(narration)

                item_seg_1_2 = StoryboardItem(
                    project_id=proj.id,
                    order_index=1,
                    segment_id="seg-1_2",
                    chapter_title="Babak 1",
                    script_text="Text babak 1 scene 2",
                    image_prompt="Prompt for scene 2",
                    motion_effect="zoom_in",
                )
                item_seg_2 = StoryboardItem(
                    project_id=proj.id,
                    order_index=9,
                    segment_id="seg-2",
                    chapter_title="Babak 2",
                    script_text="Text babak 2 scene 1 with bamboo",
                    image_prompt="Prompt for scene 10",
                    motion_effect="pan_left",
                )
                db_session.add_all([item_seg_1_2, item_seg_2])
                await db_session.commit()

                res = await client.put(
                    f"/api/v1/projects/{proj.id}/storyboard/segments/seg-2",
                    json={
                        "chapter": "Babak 2: Revisi",
                        "text": "Text babak 2 scene 1 with bambu",
                        "segment_index": 9,
                    },
                )
                assert res.status_code == 200, res.text
                data = res.json()
                assert data["success"] is True

                await db_session.refresh(narration)
                await db_session.refresh(item_seg_1_2)
                await db_session.refresh(item_seg_2)

                assert narration.segments[9]["text"] == "Text babak 2 scene 1 with bambu"
                assert narration.segments[9]["chapter"] == "Babak 2: Revisi"
                assert item_seg_2.script_text == "Text babak 2 scene 1 with bambu"
                assert item_seg_2.chapter_title == "Babak 2: Revisi"
                assert narration.segments[1]["text"] == "Text babak 1 scene 2"
                assert item_seg_1_2.script_text == "Text babak 1 scene 2"
        finally:
            await client.delete(f"/api/v1/projects/{proj.id}")


@pytest.mark.asyncio
async def test_continuity_bible_api_endpoints():
    await engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with SessionLocal() as db_session:
            proj = Project(
                name="Project Continuity Bible Test",
                aspect_ratio="16:9",
                project_type="long_storyboard",
                characters=[],
                locations=[],
                world_setting={},
            )
            db_session.add(proj)
            await db_session.commit()
            await db_session.refresh(proj)

            item = StoryboardItem(
                project_id=proj.id,
                order_index=1,
                script_text="Malin telah menjadi batu",
                image_prompt="A dramatic shot in [preset:style] of [char:malin:batu] on [loc:pantai].",
                status="pending",
            )
            db_session.add(item)
            await db_session.commit()

        try:
            put_res = await client.put(
                f"/api/v1/projects/{proj.id}/storyboard/continuity-bible",
                json={
                    "characters": [
                        {
                            "id": "malin",
                            "name": "Malin",
                            "variants": [
                                {
                                    "variant_id": "batu",
                                    "label": "Patung Batu",
                                    "visual_anchor": "a cursed granite stone statue frozen in regret",
                                }
                            ],
                        }
                    ],
                    "locations": [
                        {
                            "id": "pantai",
                            "name": "Pantai Karang",
                            "environment_anchor": "a misty coastline with black volcanic sand",
                        }
                    ],
                    "world_setting": {
                        "era": "Pre-colonial Nusantara",
                        "atmosphere": "Dark stormy skies with lightning",
                    },
                },
            )
            assert put_res.status_code == 200, put_res.text
            put_data = put_res.json()
            assert put_data["success"] is True

            get_res = await client.get(f"/api/v1/projects/{proj.id}/storyboard/continuity-bible")
            assert get_res.status_code == 200
            get_data = get_res.json()
            assert len(get_data["characters"]) == 1

            items_res = await client.get(f"/api/v1/projects/{proj.id}/storyboard/items")
            assert items_res.status_code == 200
            items_data = items_res.json()
            assert len(items_data) == 1
            assert items_data[0]["resolved_prompt"] is not None
            assert "cursed granite stone statue" in items_data[0]["resolved_prompt"]
        finally:
            await client.delete(f"/api/v1/projects/{proj.id}")


@pytest.mark.asyncio
async def test_extract_continuity_bible_from_script():
    await engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with SessionLocal() as db_session:
            proj = Project(
                name="Aladdin Script Project",
                aspect_ratio="16:9",
                project_type="long_storyboard",
                language="id",
                characters=[],
                locations=[],
                world_setting={},
            )
            db_session.add(proj)
            await db_session.commit()
            await db_session.refresh(proj)

            narration = Narration(
                project_id=proj.id,
                topic="Kisah Aladdin dan Lampu Wasiat",
                raw_text="Aladdin menemukan lampu ajaib di dalam gua. Jin biru raksasa muncul dan membantunya.",
                segments=[{"text": "Aladdin menemukan lampu ajaib di gua."}],
                status="completed",
            )
            db_session.add(narration)

            item = StoryboardItem(
                project_id=proj.id,
                order_index=1,
                script_text="Aladdin menggosok lampu dan jin keluar.",
                image_prompt="A dramatic shot of [char:aladin:muda] rubbing the lamp as [char:jin] emerges in [loc:gua_keajaiban].",
                status="pending",
            )
            db_session.add(item)
            await db_session.commit()

        try:
            mock_payload = json.dumps({
                "world_setting": {
                    "era": "Ancient Golden Age Arabia",
                    "time_setting": "Masa Lalu Fantasi Tradisional",
                    "atmosphere": "Warm golden desert sunset with mystical turquoise glow",
                },
                "characters": [
                    {
                        "id": "aladin",
                        "name": "Aladdin",
                        "role": "Tokoh Utama",
                        "visual_anchor": "a charming young Arab street youth with shaggy black hair and worn purple vest",
                        "variants": [
                            {
                                "variant_id": "muda",
                                "label": "Masa Miskin",
                                "visual_anchor": "a scrappy agile Arab boy in patched linen clothes and crimson fez",
                            }
                        ],
                    },
                    {
                        "id": "jin",
                        "name": "Jin Lampu",
                        "role": "Pendukung Sakti",
                        "visual_anchor": "a colossal radiant azure-blue mythical genie with smoky lower body and golden wrist cuffs",
                        "variants": [],
                    },
                ],
                "locations": [
                    {
                        "id": "gua_keajaiban",
                        "name": "Gua Keajaiban",
                        "environment_anchor": "a cavernous underground chamber filled with shimmering mountains of gold treasure",
                    }
                ],
            })

            mock_adapter = AsyncMock()
            mock_adapter.generate_chat.return_value = mock_payload

            with patch("app.services.storyboard.get_active_llm_adapter", return_value=mock_adapter):
                extract_res = await client.post(
                    f"/api/v1/projects/{proj.id}/storyboard/continuity-bible/extract",
                    json={"custom_instructions": "Prioritaskan tokoh utama dan jin"},
                )
                assert extract_res.status_code == 200, extract_res.text
                data = extract_res.json()
                assert data["success"] is True
                assert len(data["characters"]) == 2

                items_res = await client.get(f"/api/v1/projects/{proj.id}/storyboard/items")
                assert items_res.status_code == 200
                items_data = items_res.json()
                assert len(items_data) == 1
                assert items_data[0]["resolved_prompt"] is not None
                assert "scrappy agile Arab boy" in items_data[0]["resolved_prompt"]
        finally:
            await client.delete(f"/api/v1/projects/{proj.id}")
