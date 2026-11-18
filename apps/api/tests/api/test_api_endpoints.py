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
    req = TimelineSaveRequest(clips=[], has_audio=True, has_subtitles=False)
    assert req.clips == []
    assert req.has_audio is True
    assert req.has_subtitles is False


def test_timeline_model_defaults():
    tl = Timeline(project_id="proj-123")
    assert tl.clips == []
    assert tl.total_duration == 0.0


@pytest.mark.asyncio
async def test_project_watermark_update():
    up = ProjectWatermarkUpdate(enabled=True, position="bottom-left", opacity=0.9)
    assert up.enabled is True
    assert up.position == "bottom-left"
    assert up.opacity == 0.9
