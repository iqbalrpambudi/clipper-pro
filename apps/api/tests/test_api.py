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


def test_hex_to_ass_color_opacity():
    # Opacity 1.0 -> Alpha 00 -> &H00...
    assert hex_to_ass_color("#000000", opacity=1.0) == "&H00000000"
    # Opacity 0.0 -> Alpha FF -> &HFF...
    assert hex_to_ass_color("#000000", opacity=0.0) == "&HFF000000"
    # Opacity 0.8 -> Alpha ~51 (33 hex) -> &H33...
    assert hex_to_ass_color("#111111", opacity=0.8) == "&H33111111"


def test_generate_ass_subtitles_modes_and_exports():
    from app.services.subtitle_ass import generate_srt_subtitles, generate_vtt_subtitles

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

    # 1. Burst mode (Hormozi)
    burst_style = {
        "preset_name": "hormozi_punch",
        "font_family": "Bebas Neue",
        "font_size": 68,
        "primary_color": "#FFFFFF",
        "highlight_color": "#00FF66",
        "outline_color": "#000000",
        "outline_width": 6,
        "box_color": "#111111",
        "box_opacity": 0.8,
        "display_mode": "burst",
        "burst_word_count": 2,
        "highlight_animation": "scale",
        "emoji_enabled": True,
    }
    ass_burst = generate_ass_subtitles(segments, burst_style)
    assert "Bebas Neue" in ass_burst
    assert "Dialogue:" in ass_burst
    assert "BorderStyle, Outline, Shadow" in ass_burst
    # Check that discrete highlights exist
    assert "&H0066FF00" in ass_burst  # BGR of #00FF66

    # 2. Full sentence mode (Minimalist)
    sentence_style = {
        "preset_name": "minimalist",
        "font_family": "Inter",
        "font_size": 44,
        "primary_color": "#EEEEEE",
        "highlight_color": "#38BDF8",
        "display_mode": "full_sentence",
        "highlight_animation": "color",
        "emoji_enabled": False,
    }
    ass_sentence = generate_ass_subtitles(segments, sentence_style)
    assert "Inter" in ass_sentence
    assert "Dialogue:" in ass_sentence
    assert "&H00F8BD38" in ass_sentence  # BGR of #38BDF8

    # 3. SRT export
    srt_out = generate_srt_subtitles(segments)
    assert "00:00:00,100 --> 00:00:01,800" in srt_out
    assert "Rahasia luar biasa!" in srt_out

    # 4. VTT export
    vtt_out = generate_vtt_subtitles(segments)
    assert "WEBVTT" in vtt_out
    assert "00:00:00.100 --> 00:00:01.800" in vtt_out


def test_sequence_anchored_forced_alignment():
    from app.services.alignment import sequence_anchored_forced_alignment

    target_segments = [
        {"id": "seg-1", "text": "Kucing biasamu sangat lucu."},
        {"id": "seg-2", "text": "Lihat bulunya."},
    ]

    # Whisper heard "biasa" and "amu" as two words, and "Lihat" starts at 3000ms
    whisper_words = [
        {"word": "Kucing", "start_ms": 0, "end_ms": 600},
        {"word": "biasa", "start_ms": 600, "end_ms": 1100},
        {"word": "amu", "start_ms": 1100, "end_ms": 1500},
        {"word": "sangat", "start_ms": 1500, "end_ms": 2000},
        {"word": "lucu.", "start_ms": 2000, "end_ms": 2500},
        {"word": "Lihat", "start_ms": 3000, "end_ms": 3400},
        {"word": "bulunya.", "start_ms": 3400, "end_ms": 3900},
    ]

    aligned = sequence_anchored_forced_alignment(target_segments, whisper_words, 4.0)

    # 1. biasamu should span [600, 1500]
    seg1_words = {w["word"]: (w["start_ms"], w["end_ms"]) for w in aligned[0]["words"]}
    assert seg1_words["Kucing"] == (0, 600)
    assert seg1_words["biasamu"] == (600, 1500)
    assert seg1_words["sangat"] == (1500, 2000)

    # 2. seg-2 words must NOT be shifted! Lihat must start at 3000ms!
    seg2_words = {w["word"]: (w["start_ms"], w["end_ms"]) for w in aligned[1]["words"]}
    assert seg2_words["Lihat"] == (3000, 3400)
    assert seg2_words["bulunya."] == (3400, 3900)


def test_sequence_anchored_forced_alignment_with_offset():
    from app.services.alignment import sequence_anchored_forced_alignment

    target_segments = [
        {"id": "seg-1", "text": "Kucing lucu."},
    ]
    whisper_words = [
        {"word": "Kucing", "start_ms": 100, "end_ms": 600},
        {"word": "lucu.", "start_ms": 600, "end_ms": 1100},
    ]

    # Test +100ms offset
    aligned = sequence_anchored_forced_alignment(target_segments, whisper_words, 2.0, offset_ms=100)
    seg_words = {w["word"]: (w["start_ms"], w["end_ms"]) for w in aligned[0]["words"]}
    assert seg_words["Kucing"] == (200, 700)
    assert seg_words["lucu."] == (700, 1200)

    # Test -50ms offset
    aligned_neg = sequence_anchored_forced_alignment(target_segments, whisper_words, 2.0, offset_ms=-50)
    seg_words_neg = {w["word"]: (w["start_ms"], w["end_ms"]) for w in aligned_neg[0]["words"]}
    assert seg_words_neg["Kucing"] == (50, 550)
    assert seg_words_neg["lucu."] == (550, 1050)





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


def test_ass_subtitles_pos_and_scale_factor():
    segments = [
        {
            "id": "seg-1",
            "text": "Kucing hutan",
            "start_ms": 0,
            "end_ms": 1000,
            "words": [
                {"word": "Kucing", "start_ms": 0, "end_ms": 500},
                {"word": "hutan", "start_ms": 500, "end_ms": 1000},
            ],
        }
    ]

    # Test 1: Bottom position with offset_y=50, offset_x=20, scale_factor=1.5
    style_bottom = {
        "position": "bottom",
        "offset_y": 50,
        "offset_x": 20,
        "display_mode": "burst",
        "burst_word_count": 2,
        "highlight_animation": "scale",
        "scale_factor": 1.5,
    }
    ass_b = generate_ass_subtitles(segments, style_bottom)
    # 540 + 20 = 560; 1700 - 50 = 1650
    assert r"\an2\pos(560,1650)" in ass_b
    assert r"\fscx150\fscy150" in ass_b
    assert r"\fscx100\fscy100" in ass_b

    # Test 2: Center position with offset_y=0, offset_x=0
    style_center = {
        "position": "center",
        "offset_y": 0,
        "offset_x": 0,
        "display_mode": "per_word",
        "highlight_animation": "scale",
        "scale_factor": 1.75,
    }
    ass_c = generate_ass_subtitles(segments, style_center)
    assert r"\an5\pos(540,960)" in ass_c
    assert r"\fscx175\fscy175" in ass_c

    # Test 3: Top position
    style_top = {
        "position": "top",
        "offset_y": 10,
        "offset_x": -10,
        "display_mode": "full_sentence",
        "highlight_animation": "color",
    }
    ass_t = generate_ass_subtitles(segments, style_top)
    # 540 - 10 = 530; 180 + 10 = 190
    assert r"\an8\pos(530,190)" in ass_t
    # In color-only mode, no scale tags
    assert r"\fscx" not in ass_t


def test_ass_font_metric_compensation():
    from app.services.subtitle_ass import FONT_METRIC_COMPENSATION, generate_ass_subtitles

    segments = [
        {
            "id": "seg-1",
            "text": "Testing Parity",
            "start_ms": 0,
            "end_ms": 1000,
            "words": [
                {"word": "Testing", "start_ms": 0, "end_ms": 500},
                {"word": "Parity", "start_ms": 500, "end_ms": 1000},
            ],
        }
    ]

    expected_sizes = {
        "Poppins": int(round(56 * FONT_METRIC_COMPENSATION["Poppins"])),       # 56 * 1.77 = 99
        "Montserrat": int(round(56 * FONT_METRIC_COMPENSATION["Montserrat"])), # 56 * 1.56 = 87
        "Bebas Neue": int(round(56 * FONT_METRIC_COMPENSATION["Bebas Neue"])), # 56 * 1.30 = 73
        "Inter": int(round(56 * FONT_METRIC_COMPENSATION["Inter"])),           # 56 * 1.39 = 78
        "Anton": int(round(56 * FONT_METRIC_COMPENSATION["Anton"])),           # 56 * 1.72 = 96
        "Oswald": int(round(56 * FONT_METRIC_COMPENSATION["Oswald"])),         # 56 * 1.70 = 95
        "Roboto": int(round(56 * FONT_METRIC_COMPENSATION["Roboto"])),         # 56 * 1.20 = 67
    }

    for font, exp_size in expected_sizes.items():
        style = {
            "font_family": font,
            "font_size": 56,
            "display_mode": "per_word",
            "highlight_animation": "scale",
        }
        ass = generate_ass_subtitles(segments, style)
        # Verify Style line has compensated font size
        assert f"Style: KaraokeDefault,{font},{exp_size}," in ass, f"Failed for {font}: expected size {exp_size}"

    # Aspect ratio PlayRes test for 16:9
    ass_landscape = generate_ass_subtitles(
        segments,
        {"font_family": "Montserrat", "font_size": 56, "position": "center"},
        play_res_x=1920,
        play_res_y=1080,
    )
    assert "PlayResX: 1920" in ass_landscape
    assert "PlayResY: 1080" in ass_landscape
    # Center y for 1080 is 540
    assert r"\an5\pos(960,540)" in ass_landscape


@pytest.mark.asyncio
async def test_publish_project_event():
    from app.core.events import publish_project_event

    # Publishing an event shouldn't raise exception even if redis is disconnected or in test env
    await publish_project_event(
        project_id="test-proj-123",
        task_type="scene_detect",
        status="progress",
        progress=50,
        stage="testing",
        message="Running unit test",
        data={"key": "val"},
    )


def test_storage_render_deletion(tmp_path, monkeypatch):
    from app.core.storage import StorageManager
    sm = StorageManager()
    monkeypatch.setattr(sm.settings, "STORAGE_PATH", str(tmp_path))

    project_id = "test-proj-delete"
    renders_dir = sm.get_renders_dir(project_id)

    # Create dummy render files
    job_id_1 = "job-uuid-1111"
    job_id_2 = "job-uuid-2222"

    file_1 = renders_dir / f"render_final_{job_id_1}.mp4"
    file_1.write_bytes(b"dummy video 1 data 1234567890")

    file_2 = renders_dir / f"render_preview_{job_id_2}.mp4"
    file_2.write_bytes(b"dummy video 2 data abcdefghij")

    assert file_1.exists()
    assert file_2.exists()
    assert sm.get_file_size(file_1) == len(b"dummy video 1 data 1234567890")

    # Delete job 1
    freed_1 = sm.delete_render_job_files(project_id, job_id_1, str(file_1))
    assert freed_1 == len(b"dummy video 1 data 1234567890")
    assert not file_1.exists()
    assert file_2.exists()

    # Clear all remaining renders
    freed_2 = sm.clear_all_project_renders(project_id)
    assert freed_2 == len(b"dummy video 2 data abcdefghij")
    assert not file_2.exists()


@pytest.mark.asyncio
async def test_gemini_tts_missing_key_throws_error(tmp_path, monkeypatch):
    from app.services.tts import generate_gemini_tts
    from app.core.config import get_settings

    # Empty API keys
    settings = get_settings()
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(settings, "AI_API_KEY", "")

    out_file = tmp_path / "test.mp3"
    with pytest.raises(RuntimeError, match="Gemini API Key belum dikonfigurasi"):
        await generate_gemini_tts(
            text="Halo dunia",
            output_path=str(out_file),
            api_key="",
            voice="Puck",
        )







def test_list_available_models_takes_key_from_header():
    """The provider key must arrive via X-Api-Key, never as a query param (URLs land in logs)."""
    import inspect

    from app.api.v1.settings import list_available_models

    params = inspect.signature(list_available_models).parameters
    assert "api_key" not in params, "api_key query param reintroduced"
    assert params["x_api_key"].default.alias == "X-Api-Key"


def test_hash_embedding_deterministic_unit_norm():
    """Degraded fallback must be stable and unit-normalized so cosine math still behaves."""
    import math

    from app.services.ai_adapters.base import EMBEDDING_DIM, hash_embedding

    a = hash_embedding("pria menyeduh kopi di kafe")
    b = hash_embedding("pria menyeduh kopi di kafe")
    c = hash_embedding("drone terbang di atas kota malam")

    assert len(a) == EMBEDDING_DIM
    assert a == b
    assert a != c
    assert math.isclose(sum(v * v for v in a), 1.0, rel_tol=1e-6)


def test_timeline_schemas_has_audio_and_subtitles():
    from app.schemas.timeline import TimelineResponse, TimelineUpdateRequest
    import uuid

    req = TimelineUpdateRequest(clips=[], total_duration=0.0, has_audio=False, has_subtitles=False)
    assert req.has_audio is False
    assert req.has_subtitles is False

    res = TimelineResponse(
        id=str(uuid.uuid4()),
        project_id=str(uuid.uuid4()),
        clips=[],
        total_duration=0.0,
        has_audio=False,
        has_subtitles=False,
    )
    assert res.has_audio is False
    assert res.has_subtitles is False


def test_timeline_model_defaults():
    from app.models.timeline import Timeline
    import uuid

    t = Timeline(project_id=str(uuid.uuid4()))
    assert t.has_audio is True
    assert t.has_subtitles is True
    assert t.clips == []
    assert t.total_duration == 0.0


