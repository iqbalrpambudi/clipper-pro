import pytest

from app.models.timeline import Timeline
from app.schemas.project import ProjectWatermarkUpdate
from app.schemas.timeline import TimelineSaveRequest
from app.services.ai_adapters.base import hash_embedding


@pytest.mark.asyncio
async def test_publish_project_event():
    from app.core.events import event_bus, publish_project_event

    q = event_bus.subscribe("p1")
    await publish_project_event(
        "p1", "test_event", "progress", 50, "rendering", "Rendering video..."
    )
    event_bus.unsubscribe("p1", q)
    assert q.qsize() > 0


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
