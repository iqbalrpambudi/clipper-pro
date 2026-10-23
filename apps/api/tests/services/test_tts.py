from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.schemas.tts import TTSGenerateRequest
from app.services.tts import (
    AVAILABLE_VOICES,
    estimate_tts_cost,
    generate_gemini_tts,
    generate_speech_audio,
    test_tts_connection,
)
from app.services.tts.providers.elevenlabs import generate_elevenlabs_tts
from app.services.tts.providers.runware import generate_runware_tts
from app.services.tts.audio_utils import _split_text_for_tts


def test_estimate_tts_cost():
    res = estimate_tts_cost("Halo teman-teman semua", provider="gemini")
    assert res.char_count == len("Halo teman-teman semua")
    assert res.word_count == 3
    assert res.estimated_duration_sec > 0
    assert res.estimated_cost_usd >= 0


@pytest.mark.asyncio
async def test_gemini_tts_missing_key_throws_error(tmp_path, monkeypatch):
    out_file = tmp_path / "test.mp3"
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        await generate_gemini_tts(
            text="Halo",
            voice="Puck",
            output_path=str(out_file),
            api_key="",
        )


def test_split_text_for_tts():
    text = "Kalimat pertama. Kalimat kedua yang agak panjang. Kalimat ketiga!"
    chunks = _split_text_for_tts(text, max_chars=40)
    assert len(chunks) >= 2
    for c in chunks:
        assert len(c) <= 40


@pytest.mark.asyncio
async def test_gemini_tts_payload_structure_omits_temperature(tmp_path, monkeypatch):
    out_file = tmp_path / "test_payload.mp3"

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "audio/mp3",
                                "data": "AAAA",
                            }
                        }
                    ]
                }
            }
        ]
    }

    with patch("httpx.AsyncClient.post", return_value=mock_resp) as mock_post:
        await generate_gemini_tts(
            text="Halo dunia",
            voice="Puck",
            output_path=str(out_file),
            api_key="fake-key",
            model="gemini-2.5-flash-preview-tts",
        )
        assert mock_post.called
        call_json = mock_post.call_args[1]["json"]
        assert "generationConfig" in call_json
        assert "temperature" not in call_json["generationConfig"]


def test_tts_generate_request_accepts_model():
    req = TTSGenerateRequest(
        text="Testing dynamic model param",
        voice="Puck",
        provider="gemini",
        model="gemini-2.5-flash-preview-tts",
    )
    assert req.model == "gemini-2.5-flash-preview-tts"


def test_edge_tts_normalization():
    from app.services.tts.providers.edge import normalize_edge_text

    raw = "Ini teks dengan *markdown* dan _formatting_ & simbol > 100!"
    norm = normalize_edge_text(raw)
    assert "*" not in norm
    assert "_" not in norm
    assert ">" not in norm


@pytest.mark.asyncio
async def test_generate_speech_audio_empty_text():
    with pytest.raises(ValueError, match="Teks narasi tidak boleh kosong"):
        await generate_speech_audio(text="", voice="Puck", output_path="/tmp/out.mp3")


@pytest.mark.asyncio
async def test_generate_speech_audio_provider_error_propagates_without_fallback():
    edge_called = False

    async def fake_edge(text, voice, output_path, speed_ratio=1.0):
        nonlocal edge_called
        edge_called = True
        Path(output_path).touch()

    with patch("app.services.tts.dispatcher.generate_gemini_tts", side_effect=RuntimeError("Gemini quota error")):
        with patch("app.services.tts.dispatcher.generate_edge_tts", side_effect=fake_edge):
            with pytest.raises(RuntimeError, match="Gemini quota error"):
                await generate_speech_audio(
                    text="Halo dunia",
                    voice="Puck",
                    output_path="/tmp/test_fb.mp3",
                    provider="gemini",
                    api_key="valid-key",
                )
    assert edge_called is False

def test_elevenlabs_and_runware_voices_exist():
    el_voices = [v for v in AVAILABLE_VOICES if v.provider == "elevenlabs"]
    rw_voices = [v for v in AVAILABLE_VOICES if v.provider == "runware"]
    assert len(el_voices) > 0
    assert len(rw_voices) > 0


def test_tts_cost_estimates_all_providers():
    gemini_est = estimate_tts_cost("Test 1234", provider="gemini")
    edge_est = estimate_tts_cost("Test 1234", provider="edge")
    el_est = estimate_tts_cost("Test 1234", provider="elevenlabs")
    assert edge_est.estimated_cost_usd == 0.0
    assert el_est.estimated_cost_usd > gemini_est.estimated_cost_usd


@pytest.mark.asyncio
async def test_elevenlabs_tts_missing_key_throws_error():
    with pytest.raises(ValueError, match="ELEVENLABS_API_KEY"):
        await generate_elevenlabs_tts(text="Halo", voice="Adam", output_path="/tmp/el.mp3", api_key="")


@pytest.mark.asyncio
async def test_elevenlabs_model_specific_character_limits(monkeypatch):
    long_text = "A" * 15000
    with pytest.raises(ValueError, match="melebihi batas maksimal"):
        await generate_elevenlabs_tts(
            text=long_text,
            voice="Adam",
            output_path="/tmp/el_lim.mp3",
            api_key="mock",
            model="eleven_multilingual_v2",
        )


@pytest.mark.asyncio
async def test_elevenlabs_character_limit_blocks_fallback(monkeypatch):
    long_text = "A" * 15000
    with pytest.raises(ValueError, match="melebihi batas maksimal"):
        await generate_speech_audio(
            text=long_text,
            voice="Adam",
            output_path="/tmp/el_fb.mp3",
            provider="elevenlabs",
            api_key="mock",
        )


@pytest.mark.asyncio
async def test_runware_tts_missing_key_throws_error():
    with pytest.raises(ValueError, match="RUNWARE_API_KEY"):
        await generate_runware_tts(text="Halo", voice="fishaudio:s2.1@pro", output_path="/tmp/rw.mp3", api_key="")


@pytest.mark.asyncio
async def test_test_tts_connection_edge_and_missing_keys():
    # Edge needs no api key
    ok, msg = await test_tts_connection(provider="edge")
    assert ok is True

    # Elevenlabs without key fails
    ok_el, msg_el = await test_tts_connection(provider="elevenlabs", api_key="")
    assert ok_el is False
    assert "tidak ditemukan" in msg_el
