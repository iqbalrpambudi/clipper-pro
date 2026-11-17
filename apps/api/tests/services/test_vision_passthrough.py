import json

import pytest

from app.services.ai_adapters import openai_adapter
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter
from app.services.vision_tagger import parse_scene_analysis


class _Resp:
    status_code = 200

    def __init__(self, content: str):
        self.text = json.dumps({"choices": [{"message": {"content": content}}]})


class _Client:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, *a, **k):
        return _Resp(
            '{"description": "Pisau memotong kubis.", "tags": ["kubis"], "action": "memotong", '
            '"visual_satisfaction": 0.91, "focal_point": "left", "confidence": 0.8}'
        )


@pytest.mark.asyncio
async def test_vision_keeps_every_field_the_prompt_asked_for(monkeypatch, tmp_path):
    img = tmp_path / "f.jpg"
    img.write_bytes(b"not-really-a-jpeg")
    monkeypatch.setattr(openai_adapter.httpx, "AsyncClient", _Client)
    adapter = OpenAICompatibleAdapter(base_url="http://x/v1", api_key="k")
    res = await adapter.analyze_vision([str(img)], "prompt")
    analysis = parse_scene_analysis(res["analysis"])
    assert analysis["visual_satisfaction"] == 0.91 and analysis["focal_point"] == "left"
