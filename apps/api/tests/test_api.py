import pytest
from app.services.subtitle_ass import hex_to_ass_color, ms_to_ass_time, generate_ass_subtitles
from app.services.tts import estimate_tts_cost
from app.services.narrative import split_into_sentence_segments


def test_hex_to_ass_color():
    # #FFFFFF -> &H00FFFFFF
    assert hex_to_ass_color("#FFFFFF") == "&H00FFFFFF"
    # #FFE600 -> R=FF, G=E6, B=00 -> ASS order BGR -> &H0000E6FF
    assert hex_to_ass_color("#FFE600") == "&H0000E6FF"


def test_ms_to_ass_time():
    assert ms_to_ass_time(0) == "0:00:00.00"
    assert ms_to_ass_time(1500) == "0:00:01.50"
    assert ms_to_ass_time(65430) == "0:01:05.43"


def test_split_into_sentence_segments():
    text = "Ini adalah fakta pertama yang unik! Apakah kamu pernah mendengarnya? Jangan lupa tinggalkan komentar."
    segs = split_into_sentence_segments(text)
    assert len(segs) == 3
    assert segs[0]["text"] == "Ini adalah fakta pertama yang unik!"
    assert segs[1]["text"] == "Apakah kamu pernah mendengarnya?"
    assert segs[2]["text"] == "Jangan lupa tinggalkan komentar."


def test_estimate_tts_cost():
    res = estimate_tts_cost("Halo teman-teman semua", provider="gemini")
    assert res.char_count == len("Halo teman-teman semua")
    assert res.word_count == 3
    assert res.estimated_duration_sec > 0
    assert res.estimated_cost_usd >= 0


def test_generate_ass_subtitles():
    segments = [
        {
            "id": "seg-1",
            "text": "Rahasia luar biasa!",
            "start_ms": 100,
            "end_ms": 1800,
            "words": [
                {"word": "Rahasia", "start_ms": 100, "end_ms": 700},
                {"word": "luar", "start_ms": 710, "end_ms": 1200},
                {"word": "biasa!", "start_ms": 1210, "end_ms": 1800},
            ],
        }
    ]
    style = {
        "preset_name": "viral_tiktok",
        "font_family": "Montserrat",
        "font_size": 56,
        "primary_color": "#FFFFFF",
        "highlight_color": "#FFE600",
        "display_mode": "per_word",
        "emoji_enabled": True,
    }
    ass_text = generate_ass_subtitles(segments, style)
    assert "[Script Info]" in ass_text
    assert "[V4+ Styles]" in ass_text
    assert "Dialogue:" in ass_text
    assert "RAHASIA" in ass_text or "rahasia" in ass_text


def test_openai_adapter_sse_and_json_parsing():
    from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter

    adapter = OpenAICompatibleAdapter(base_url="http://localhost:20128/v1", api_key="dummy")

    # 1. Standard JSON
    json_text = '{"choices": [{"message": {"content": "Halo dunia"}}]}'
    assert adapter._extract_content_from_response(json_text) == "Halo dunia"

    # 2. SSE streaming format (e.g. from 9Router)
    sse_text = (
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"Halo "}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"Dunia!"}}]}\n\n'
        'data: [DONE]\n\n'
    )
    assert adapter._extract_content_from_response(sse_text) == "Halo Dunia!"

    # 3. Model error in JSON
    error_text = '{"error": {"message": "Model not available"}}'
    with pytest.raises(RuntimeError, match="Model not available"):
        adapter._extract_content_from_response(error_text)

