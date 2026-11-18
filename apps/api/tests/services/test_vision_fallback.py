import json

import cv2
import httpx
import numpy as np
import pytest

from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter


@pytest.fixture
def frame(tmp_path):
    path = tmp_path / "frame.jpg"
    cv2.imwrite(str(path), np.zeros((90, 160, 3), dtype=np.uint8))
    return str(path)


def _gateway(monkeypatch, status_by_model):
    """Fake /chat/completions: the status per model, a valid tagging JSON on 200."""
    calls = []

    async def post(self, url, **kw):
        model = kw["json"]["model"]
        calls.append(model)
        status = status_by_model[model]
        body = (
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"description": f"tagged by {model}", "tags": ["x"], "action": "a"}
                            )
                        }
                    }
                ]
            }
            if status == 200
            else {"error": "busy"}
        )
        return httpx.Response(status, json=body, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    return calls


def _adapter(fallback):
    a = OpenAICompatibleAdapter(base_url="http://gw/v1", api_key="k", vision_model="primary")
    a.vision_fallback_model = fallback
    return a


@pytest.mark.asyncio
async def test_primary_error_retries_scene_on_fallback(monkeypatch, frame):
    calls = _gateway(monkeypatch, {"primary": 503, "backup": 200})
    res = await _adapter("backup").analyze_vision([frame], "p")
    assert calls == ["primary", "backup"]
    assert res["description"] == "tagged by backup" and res["analysis"]


@pytest.mark.asyncio
async def test_fallback_outage_does_not_disable_primary(monkeypatch, frame):
    calls = _gateway(monkeypatch, {"primary": 503, "backup": 404})
    a = _adapter("backup")
    res = await a.analyze_vision([frame], "p")
    assert "analysis" not in res  # placeholder
    _gateway(monkeypatch, {"primary": 200, "backup": 200})
    assert (await a.analyze_vision([frame], "p"))["description"] == "tagged by primary"
    assert calls == ["primary", "backup"]


@pytest.mark.asyncio
async def test_no_fallback_configured_keeps_placeholder(monkeypatch, frame):
    calls = _gateway(monkeypatch, {"primary": 503})
    res = await _adapter("").analyze_vision([frame], "p")
    assert calls == ["primary"] and "analysis" not in res


@pytest.mark.asyncio
async def test_chat_retries_gateway_5xx(monkeypatch):
    statuses = iter([503, 502, 200])

    async def post(self, url, **kw):
        status = next(statuses)
        body = {"choices": [{"message": {"content": "ok"}}]} if status == 200 else {"error": "x"}
        return httpx.Response(status, json=body, request=httpx.Request("POST", url))

    async def no_sleep(_):
        pass

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    monkeypatch.setattr("app.services.ai_adapters.openai_adapter.asyncio.sleep", no_sleep)
    res = await OpenAICompatibleAdapter(base_url="http://gw/v1", api_key="k").generate_chat("p")
    assert res == "ok"
