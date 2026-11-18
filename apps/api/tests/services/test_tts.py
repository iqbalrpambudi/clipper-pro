from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import get_settings
from app.schemas.tts import TTSGenerateRequest
from app.services.tts import (
    AVAILABLE_VOICES,
    estimate_tts_cost,
    generate_gemini_tts,
    generate_speech_audio,
)
from app.services.tts.audio_utils import _split_text_for_tts
from app.services.tts.exceptions import ElevenLabsCharacterLimitError
from app.services.tts.providers.elevenlabs import generate_elevenlabs_tts


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

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")

    with (
        patch("httpx.AsyncClient.post", return_value=mock_resp) as mock_post,
        patch("asyncio.create_subprocess_exec", return_value=mock_proc),
        patch("app.services.tts.providers.gemini.get_audio_duration", return_value=1.5),
    ):
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


@pytest.mark.asyncio
async def test_generate_speech_audio_empty_text():
    with pytest.raises(ValueError, match="Teks narasi tidak boleh kosong"):
        await generate_speech_audio(text="", voice="Puck", output_path="/tmp/out.mp3")


@pytest.mark.asyncio
async def test_generate_speech_audio_provider_error_propagates_without_fallback():
    with patch(
        "app.services.tts.dispatcher.generate_gemini_tts",
        side_effect=RuntimeError("Gemini quota error"),
    ):
        with pytest.raises(RuntimeError, match="Gemini quota error"):
            await generate_speech_audio(
                text="Halo dunia",
                voice="Puck",
                output_path="/tmp/test_fb.mp3",
                provider="gemini",
                api_key="valid-key",
            )


def test_only_gemini_and_elevenlabs_voices():
    assert {v.provider for v in AVAILABLE_VOICES} == {"gemini", "elevenlabs"}


def test_tts_cost_estimates_all_providers():
    gemini_est = estimate_tts_cost("Test 1234", provider="gemini")
    el_est = estimate_tts_cost("Test 1234", provider="elevenlabs")
    assert el_est.estimated_cost_usd > gemini_est.estimated_cost_usd


def _elevenlabs_error_response(status_code: int, message: str):
    resp = AsyncMock()
    resp.status_code = status_code
    resp.text = message
    resp.json = lambda: {"detail": {"message": message, "status": "too_large"}}
    return resp


@pytest.mark.asyncio
async def test_elevenlabs_tts_missing_key_throws_error(monkeypatch):
    monkeypatch.setattr(get_settings(), "ELEVENLABS_API_KEY", "")
    with pytest.raises(RuntimeError, match="ElevenLabs API Key belum dikonfigurasi"):
        await generate_elevenlabs_tts(
            text="Halo", voice="Adam", output_path="/tmp/el.mp3", api_key=""
        )


@pytest.mark.asyncio
async def test_elevenlabs_character_limit_error_is_typed(tmp_path):
    resp = _elevenlabs_error_response(422, "Text exceeds the maximum character limit")
    with patch("httpx.AsyncClient.post", return_value=resp):
        with pytest.raises(ElevenLabsCharacterLimitError):
            await generate_elevenlabs_tts(
                text="A" * 15000,
                voice="Adam",
                output_path=str(tmp_path / "el_lim.mp3"),
                api_key="mock",
                model="eleven_multilingual_v2",
            )


@pytest.mark.asyncio
async def test_elevenlabs_character_limit_blocks_fallback(tmp_path):
    resp = _elevenlabs_error_response(422, "Text exceeds the maximum character limit")
    with patch("httpx.AsyncClient.post", return_value=resp):
        with pytest.raises(RuntimeError, match="Character Limit Exceeded"):
            await generate_speech_audio(
                text="A" * 15000,
                voice="Adam",
                output_path=str(tmp_path / "el_fb.mp3"),
                provider="elevenlabs",
                api_key="mock",
            )


@pytest.mark.asyncio
async def test_gemini_tts_raises_immediately_on_http_error_without_fallback(tmp_path):
    out_file = tmp_path / "test_err.mp3"
    mock_resp = AsyncMock()
    mock_resp.status_code = 403
    mock_resp.json.return_value = {
        "error": {
            "code": 403,
            "message": "Method doesn't allow unregistered callers. Please use API Key.",
            "status": "PERMISSION_DENIED",
        }
    }

    with patch("httpx.AsyncClient.post", return_value=mock_resp) as mock_post:
        with pytest.raises(RuntimeError, match="Akses Gemini API ditolak.*HTTP 403"):
            await generate_gemini_tts(
                text="Halo dunia",
                voice="Puck",
                output_path=str(out_file),
                api_key="fake-key",
                model="gemini-2.5-flash-preview-tts",
            )
        # Verify it called the API exactly once and did NOT attempt any fallback models
        assert mock_post.call_count == 1


@pytest.mark.asyncio
async def test_gemini_tts_respects_cancellation(tmp_path):
    out_file = tmp_path / "test_cancel.mp3"
    from app.services.cancellation import TaskCancelledException

    with patch("app.services.tts.providers.gemini.is_cancelled", return_value=True):
        with pytest.raises(TaskCancelledException, match="dibatalkan oleh pengguna"):
            await generate_gemini_tts(
                text="Halo dunia",
                voice="Puck",
                output_path=str(out_file),
                api_key="fake-key",
                project_id="proj-cancel-123",
            )


@pytest.mark.asyncio
async def test_generate_speech_audio_gemini_propagates_error_without_silent_fallback(tmp_path):
    out_file = tmp_path / "test_no_fb.mp3"

    with patch(
        "app.services.tts.dispatcher.generate_gemini_tts",
        side_effect=RuntimeError("Gemini quota exceeded"),
    ):
        with pytest.raises(RuntimeError, match="Gemini quota exceeded"):
            await generate_speech_audio(
                text="Halo dari naskah narasi",
                output_path=str(out_file),
                provider="gemini",
                voice="Puck",
                api_key="fake-key",
            )


@pytest.mark.asyncio
async def test_generate_speech_audio_gemini_cancels_in_chapter_loop(tmp_path):
    out_file = tmp_path / "test_cancel_loop.mp3"
    from app.services.cancellation import TaskCancelledException

    with patch("app.services.tts.dispatcher.is_cancelled", return_value=True):
        with pytest.raises(TaskCancelledException, match="dibatalkan oleh pengguna"):
            await generate_speech_audio(
                text="Babak satu narasi. Babak dua kelanjutan.",
                output_path=str(out_file),
                provider="gemini",
                voice="Puck",
                api_key="fake-key",
                project_id="proj-cancel-loop",
                segments=[
                    {"text": "Babak satu narasi.", "chapter_index": 1},
                    {"text": "Babak dua kelanjutan.", "chapter_index": 2},
                ],
            )


def _write_voice_wav(path, segments, sr=16000):
    """Write a voice-like harmonic tone: list of (seconds, f0_hz)."""
    import wave

    import numpy as np

    parts = []
    for secs, f0 in segments:
        t = np.arange(int(secs * sr)) / sr
        vib = f0 * (1 + 0.06 * np.sin(2 * np.pi * 0.5 * t))  # natural-ish intonation
        phase = 2 * np.pi * np.cumsum(vib) / sr
        parts.append(sum(np.sin(k * phase) / k for k in range(1, 6)) * 0.2)
    pcm = (np.concatenate(parts) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def test_voice_drift_detects_speaker_switch_not_intonation(tmp_path):
    from app.services.tts.audio_utils import count_voice_drift_windows

    steady = tmp_path / "steady.wav"
    _write_voice_wav(steady, [(20, 115)])
    assert count_voice_drift_windows(str(steady)) == 0

    switched = tmp_path / "switched.wav"
    _write_voice_wav(switched, [(6, 230), (16, 115)])  # female-ish start, then male
    assert count_voice_drift_windows(str(switched)) >= 2


@pytest.mark.asyncio
async def test_gemini_tts_regenerates_on_voice_drift(tmp_path):
    from app.services.tts.providers import gemini as gem

    calls = []

    async def fake_once(text, output_path, **kw):
        calls.append(output_path)
        Path(output_path).write_bytes(b"take%d" % len(calls))
        return 10.0

    drift_by_take = {b"take1": 5, b"take2": 0}
    with (
        patch.object(gem, "_generate_gemini_tts_once", side_effect=fake_once),
        patch.object(
            gem,
            "count_voice_drift_windows",
            side_effect=lambda p: drift_by_take[Path(p).read_bytes()],
        ),
    ):
        out = tmp_path / "out.mp3"
        await gem.generate_gemini_tts("Halo", str(out), voice="Charon")

    assert len(calls) == 2
    assert out.read_bytes() == b"take2"
    assert not (tmp_path / "out.retry.mp3").exists()
