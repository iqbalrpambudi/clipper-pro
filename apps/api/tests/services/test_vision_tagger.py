import pytest

from app.services.vision_tagger import PLACEHOLDER_DESCRIPTION, analyze_scenes_batch


class _FlakyVisionAdapter:
    """Scene 0 tags fine; scene 1 gets the placeholder adapters return on timeout."""

    async def analyze_vision_batch(self, batch_items):
        return [
            {"scene_id": "0", "description": "Mesin memotong baja.", "tags": ["baja"], "analysis": {"action": "potong"}},
            {"scene_id": "1", "description": PLACEHOLDER_DESCRIPTION, "tags": ["video", "scene", "aktivitas"]},
        ]

    async def analyze_vision(self, keyframe_paths, prompt):
        return {"description": PLACEHOLDER_DESCRIPTION, "tags": ["video", "scene", "aktivitas"]}

    async def generate_embedding(self, text):
        return [1.0, 0.0]


@pytest.mark.asyncio
async def test_placeholder_from_adapter_is_not_counted_as_tagged():
    items = [{"scene_index": i, "thumbnail_path": f"/x/{i}.jpg"} for i in range(2)]
    results = await analyze_scenes_batch(_FlakyVisionAdapter(), items)
    assert [ok for *_, ok in results] == [True, False]
