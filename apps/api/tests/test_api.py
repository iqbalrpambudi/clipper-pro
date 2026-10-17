import pytest
from typing import Optional
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


def test_split_text_for_tts():
    from app.services.tts import _split_text_for_tts

    # Short text remains a single chunk
    short_text = "Halo semuanya, selamat datang di channel kami."
    assert _split_text_for_tts(short_text, max_chars=2400) == [short_text]

    # Long text with multiple paragraphs splits cleanly
    p1 = "Kalimat pertama paragraf satu. " * 40  # ~1240 chars
    p2 = "Kalimat pertama paragraf dua tanpa titik " * 10  # ~410 chars, total > 1400 chars
    full = f"{p1.strip()}\n\n{p2.strip()}"
    chunks = _split_text_for_tts(full, max_chars=1400)
    assert len(chunks) == 2
    assert chunks[0].endswith(".")
    assert all(len(c) <= 1400 for c in chunks)


@pytest.mark.asyncio
async def test_gemini_tts_payload_structure_omits_temperature(tmp_path, monkeypatch):
    from app.services.tts import generate_gemini_tts
    import httpx

    captured_payload = {}

    class MockAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, json=None, **kwargs):
            nonlocal captured_payload
            captured_payload = json
            return httpx.Response(status_code=400, text="intentional stop after payload capture")

    monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

    out_file = tmp_path / "test.mp3"
    with pytest.raises(RuntimeError):
        await generate_gemini_tts(
            text="Halo dunia",
            output_path=str(out_file),
            api_key="dummy_key",
            voice="Puck",
        )

    assert "systemInstruction" not in captured_payload
    # Temperature must NOT be present in TTS payload as Google API hangs/times out if supplied
    assert "temperature" not in captured_payload["generationConfig"]
    assert captured_payload["generationConfig"]["responseModalities"] == ["AUDIO"]


def test_build_master_scriptwriting_directive_includes_parameters():
    from app.services.narrative import build_master_scriptwriting_directive

    directive = build_master_scriptwriting_directive(
        topic="Pembuatan Sepeda Gerobak",
        tone="santai",
        target_duration=60,
        word_count=132,
    )
    assert "Pembuatan Sepeda Gerobak" in directive
    assert "santai" in directive
    assert "60 detik" in directive
    assert "132 kata" in directive
    assert "DILARANG MELEBIHI" in directive


@pytest.mark.asyncio
async def test_generate_narration_script_injects_parameters_into_master_prompt():
    from app.services.narrative import generate_narration_script
    from app.services.ai_adapters.base import BaseLLMAdapter

    captured_args = {}

    class DummyAdapter(BaseLLMAdapter):
        async def generate_chat(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
            captured_args["prompt"] = prompt
            captured_args["system_prompt"] = system_prompt
            return "Ini kalimat hook pertama yang memikat. Ini narasi kelanjutan yang mengalir padat."

        async def analyze_vision(self, image_paths: list, prompt: str) -> dict:
            return {}

        async def generate_embedding(self, text: str) -> list:
            return []

    adapter = DummyAdapter()
    result = await generate_narration_script(
        adapter=adapter,
        system_prompt="System template base.",
        user_prompt_template="Topik: {topic}\nDurasi: {target_duration}\nVisual:\n{scene_context}",
        topic="Robot Canggih",
        tone="tegang",
        target_duration=45,
        scenes_summary=[],
    )

    assert "Robot Canggih" in captured_args["system_prompt"]
    assert "tegang" in captured_args["system_prompt"]
    assert "45 detik" in captured_args["system_prompt"]
    # Dual-anchoring in user prompt
    assert "PENGINGAT KETAT DURASI, INTONASI & ALUR NARASI" in captured_args["prompt"]
    assert "45 detik" in captured_args["prompt"]
    assert "tegang" in captured_args["prompt"]
    assert "Ini kalimat hook pertama" in result









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


def test_watermark_filter_builder(tmp_path):
    from app.services.renderer import _build_watermark_filter
    from app.schemas.project import WatermarkSchema

    wm = WatermarkSchema(
        enabled=True,
        text="@cliper_channel",
        font_family="Poppins",
        font_size=40,
        font_color="#FFE600",
        opacity=0.8,
        position="bottom-right",
        offset_x=45,
        offset_y=35,
        has_background=True,
        background_color="#121212",
        background_opacity=0.6,
        has_shadow=True,
    ).model_dump()

    filter_str = _build_watermark_filter(wm, tmp_path, video_w=1080, video_h=1920)
    assert filter_str is not None
    assert "drawtext=" in filter_str
    assert "Poppins.ttf" in filter_str
    assert "0xFFE600@0.80" in filter_str
    assert "w-text_w-45" in filter_str
    assert "h-text_h-35" in filter_str
    assert "box=1" in filter_str
    assert "0x121212@0.60" in filter_str
    assert "shadowcolor=" in filter_str

    # Test disabled watermark returns None
    wm_disabled = WatermarkSchema(enabled=False, text="hello").model_dump()
    assert _build_watermark_filter(wm_disabled, tmp_path, 1080, 1920) is None


@pytest.mark.asyncio
async def test_project_watermark_update():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create project
        create_res = await client.post("/api/v1/projects", json={"name": "Watermark Test Project"})
        assert create_res.status_code == 201
        proj_id = create_res.json()["id"]

        try:
            # Patch project with watermark
            wm_data = {
                "enabled": True,
                "text": "@brand_video",
                "font_family": "Bebas Neue",
                "font_size": 48,
                "font_color": "#FFFFFF",
                "opacity": 0.9,
                "position": "top-right",
                "offset_x": 30,
                "offset_y": 40,
                "has_background": False,
                "has_shadow": True,
            }
            patch_res = await client.patch(
                f"/api/v1/projects/{proj_id}",
                json={"watermark": wm_data},
            )
            assert patch_res.status_code == 200
            patched = patch_res.json()
            assert patched["watermark"]["enabled"] is True
            assert patched["watermark"]["text"] == "@brand_video"
            assert patched["watermark"]["font_family"] == "Bebas Neue"

            # Fetch project detail
            get_res = await client.get(f"/api/v1/projects/{proj_id}")
            assert get_res.status_code == 200
            detail = get_res.json()
            assert detail["watermark"]["enabled"] is True
            assert detail["watermark"]["text"] == "@brand_video"
            assert detail["watermark"]["position"] == "top-right"
        finally:
            await client.delete(f"/api/v1/projects/{proj_id}")


@pytest.mark.asyncio
async def test_render_job_thumbnail_resolution(tmp_path, monkeypatch):
    from app.core.storage import StorageManager
    sm = StorageManager()
    monkeypatch.setattr(sm.settings, "STORAGE_PATH", str(tmp_path))
    proj_id = "test-proj-thumb"
    renders_dir = sm.get_renders_dir(proj_id)
    renders_dir.mkdir(parents=True, exist_ok=True)

    job_id = "test-job-123"
    mp4_file = renders_dir / f"render_final_{job_id}.mp4"
    mp4_file.write_bytes(b"dummy mp4")

    thumb_file = renders_dir / f"render_final_{job_id}_thumb.jpg"
    thumb_file.write_bytes(b"dummy thumb jpg")

    # 1. Resolve with explicit thumbnail_path
    url1 = sm.resolve_render_job_thumbnail_url(thumbnail_path=str(thumb_file))
    assert url1 is not None
    assert url1.endswith(f"render_final_{job_id}_thumb.jpg")

    # 2. Resolve via output_file_path matching sibling thumb
    url2 = sm.resolve_render_job_thumbnail_url(output_file_path=str(mp4_file))
    assert url2 is not None
    assert url2.endswith(f"render_final_{job_id}_thumb.jpg")

    # 3. None when file does not exist
    url3 = sm.resolve_render_job_thumbnail_url(thumbnail_path="/non/existent/thumb.jpg")
    assert url3 is None


def test_tts_generate_request_accepts_model():
    from app.schemas.tts import TTSGenerateRequest

    req = TTSGenerateRequest(
        provider="gemini",
        voice="Puck",
        rate="+10%",
        pitch="+0Hz",
        model="gemini-3.8-flash-tts",
    )
    assert req.provider == "gemini"
    assert req.voice == "Puck"
    assert req.model == "gemini-3.8-flash-tts"


def test_edge_tts_normalization():
    from app.services.tts import _normalize_edge_rate, _normalize_edge_pitch

    assert _normalize_edge_rate("10%") == "+10%"
    assert _normalize_edge_rate("-10%") == "-10%"
    assert _normalize_edge_rate("+15%") == "+15%"
    assert _normalize_edge_rate("") == "+0%"
    assert _normalize_edge_rate(None) == "+0%"

    assert _normalize_edge_pitch("5Hz") == "+5Hz"
    assert _normalize_edge_pitch("-5Hz") == "-5Hz"
    assert _normalize_edge_pitch("+10Hz") == "+10Hz"
    assert _normalize_edge_pitch("") == "+0Hz"
    assert _normalize_edge_pitch(None) == "+0Hz"


@pytest.mark.asyncio
async def test_alignment_empty_segments_safe():
    from app.services.alignment import align_audio_with_text, sequence_anchored_forced_alignment, _align_fallback

    assert await align_audio_with_text("/dummy/path.mp3", [], 10.0) == []
    assert await align_audio_with_text("/dummy/path.mp3", None, 10.0) == []
    assert sequence_anchored_forced_alignment([], [], 10.0) == []
    assert sequence_anchored_forced_alignment(None, [], 10.0) == []
    assert _align_fallback([], 10.0) == []
    assert _align_fallback(None, 10.0) == []


@pytest.mark.asyncio
async def test_generate_speech_audio_empty_text():
    from app.services.tts import generate_speech_audio

    with pytest.raises(ValueError, match="Teks narasi tidak boleh kosong"):
        await generate_speech_audio("", "/tmp/out.mp3")

    with pytest.raises(ValueError, match="Teks narasi tidak boleh kosong"):
        await generate_speech_audio("   ", "/tmp/out.mp3")


@pytest.mark.asyncio
async def test_generate_speech_audio_fallback_disabled_raises_error(monkeypatch):
    from app.services import tts

    async def mock_fail(*args, **kwargs):
        raise RuntimeError("Google API Quota Limit Exceeded")

    monkeypatch.setattr(tts, "generate_gemini_tts", mock_fail)

    with pytest.raises(RuntimeError, match="Google API Quota Limit Exceeded"):
        await tts.generate_speech_audio(
            text="Halo dunia untuk pengujian",
            output_path="/tmp/test_fallback_disabled.mp3",
            provider="gemini",
            fallback_enabled=False,
        )


@pytest.mark.asyncio
async def test_generate_speech_audio_fallback_enabled_uses_edge(monkeypatch):
    from app.services import tts

    async def mock_gemini_fail(*args, **kwargs):
        raise RuntimeError("Google API Quota Limit Exceeded")

    edge_called = False
    async def mock_edge_success(*args, **kwargs):
        nonlocal edge_called
        edge_called = True
        return 5.0

    monkeypatch.setattr(tts, "generate_gemini_tts", mock_gemini_fail)
    monkeypatch.setattr(tts, "generate_edge_tts", mock_edge_success)

    fallback_info = {}
    dur = await tts.generate_speech_audio(
        text="Halo dunia untuk pengujian",
        output_path="/tmp/test_fallback_enabled.mp3",
        provider="gemini",
        fallback_enabled=True,
        fallback_info=fallback_info,
    )

    assert edge_called is True
    assert dur == 5.0
    assert fallback_info.get("fell_back") is True


@pytest.mark.asyncio
async def test_trigger_final_render_resolution(monkeypatch):
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.db import engine
    import app.api.v1.render as render_module
    async def mock_enqueue(job_id):
        pass
    monkeypatch.setattr(render_module, "enqueue_render_task", mock_enqueue)

    await engine.dispose()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post("/api/v1/projects", json={"name": "Resolution Test Project"})
            assert create_res.status_code == 201
            proj_id = create_res.json()["id"]
            assert create_res.json()["resolution"] == "1080p"

            try:
                render_res = await client.post(f"/api/v1/projects/{proj_id}/render", json={"resolution": "720p"})
                assert render_res.status_code == 200

                proj_res = await client.get(f"/api/v1/projects/{proj_id}")
                assert proj_res.status_code == 200
                assert proj_res.json()["resolution"] == "720p"

                render_res2 = await client.post(f"/api/v1/projects/{proj_id}/render", json={"resolution": "1080p"})
                assert render_res2.status_code == 200

                proj_res2 = await client.get(f"/api/v1/projects/{proj_id}")
                assert proj_res2.status_code == 200
                assert proj_res2.json()["resolution"] == "1080p"
            finally:
                await client.delete(f"/api/v1/projects/{proj_id}")
    finally:
        await engine.dispose()


def test_elevenlabs_and_runware_voices_exist():
    from app.services.tts import AVAILABLE_VOICES, ELEVENLABS_VOICE_MAP

    providers = {v.provider for v in AVAILABLE_VOICES}
    assert "gemini" in providers
    assert "elevenlabs" in providers
    assert "runware" in providers
    assert "edge" in providers

    eleven_voices = [v for v in AVAILABLE_VOICES if v.provider == "elevenlabs"]
    assert len(eleven_voices) >= 6
    assert any(v.id == "Adam" for v in eleven_voices)
    assert any(v.id == "Rachel" for v in eleven_voices)

    assert "adam" in ELEVENLABS_VOICE_MAP
    assert "rachel" in ELEVENLABS_VOICE_MAP

    runware_voices = [v for v in AVAILABLE_VOICES if v.provider == "runware"]
    assert len(runware_voices) >= 3
    assert any(v.id == "fishaudio:s2.1@pro" for v in runware_voices)


def test_tts_cost_estimates_all_providers():
    from app.services.tts import estimate_tts_cost

    text = "Halo, selamat datang di channel ini!"
    gemini_est = estimate_tts_cost(text, "gemini")
    eleven_est = estimate_tts_cost(text, "elevenlabs")
    runware_est = estimate_tts_cost(text, "runware")
    edge_est = estimate_tts_cost(text, "edge")

    assert gemini_est.estimated_cost_usd > 0
    assert eleven_est.estimated_cost_usd > gemini_est.estimated_cost_usd
    assert runware_est.estimated_cost_usd > gemini_est.estimated_cost_usd
    assert edge_est.estimated_cost_usd == 0.0


@pytest.mark.asyncio
async def test_elevenlabs_tts_missing_key_throws_error():
    from app.services.tts import generate_elevenlabs_tts

    with pytest.raises(RuntimeError) as exc_info:
        await generate_elevenlabs_tts(
            "Test narasi",
            "/tmp/test_eleven.mp3",
            api_key="",
            voice="Adam",
        )
    assert "ElevenLabs API Key belum dikonfigurasi" in str(exc_info.value)


@pytest.mark.asyncio
async def test_runware_tts_missing_key_throws_error():
    from app.services.tts import generate_runware_tts

    with pytest.raises(RuntimeError) as exc_info:
        await generate_runware_tts(
            "Test narasi",
            "/tmp/test_runware.mp3",
            api_key="",
            model="fishaudio:s2.1@pro",
        )
    assert "Runware API Key belum dikonfigurasi" in str(exc_info.value)


@pytest.mark.asyncio
async def test_test_tts_connection_edge_and_missing_keys():
    from app.services.tts import test_tts_connection

    # Edge test
    edge_res = await test_tts_connection("edge")
    assert edge_res["success"] is True
    assert "Edge-TTS" in edge_res["provider_status"]

    # ElevenLabs missing key
    eleven_res = await test_tts_connection("elevenlabs", api_key="")
    assert eleven_res["success"] is False
    assert "Missing API Key" in eleven_res["provider_status"]

    # Runware missing key
    runware_res = await test_tts_connection("runware", api_key="")
    assert runware_res["success"] is False
    assert "Missing API Key" in runware_res["provider_status"]


def test_build_storyboard_prompt_scales_with_duration():
    from app.services.storyboard import build_storyboard_prompt

    # Test 5-minute prompt
    sys_5, user_5 = build_storyboard_prompt(topic="Sejarah Komputer", duration_mins=5)
    assert "675 kata" in sys_5
    assert "5 Menit" in sys_5
    assert "5 menit" in user_5

    # Test 8-minute prompt
    sys_8, user_8 = build_storyboard_prompt(topic="Sejarah Komputer", duration_mins=8)
    assert "1080 kata" in sys_8
    assert "8 Menit" in sys_8
    assert "8 menit" in user_8
    assert "60 scenes" in user_8 or "scenes" in user_8


def test_build_storyboard_outline_prompt_scales_correctly():
    from app.services.storyboard import build_storyboard_outline_prompt

    sys_p, usr_p = build_storyboard_outline_prompt(
        topic="Misteri Segitiga Bermuda",
        duration_mins=8,
        tone="misterius",
        num_chapters=6,
    )
    assert "8 Menit" in sys_p
    assert "1080 kata" in sys_p
    assert "Tepat 6 babak" in sys_p or "6 babak" in sys_p
    assert "180 kata" in usr_p
    assert "Misteri Segitiga Bermuda" in usr_p


def test_build_chapter_expansion_prompt_targets():
    from app.services.storyboard import build_chapter_expansion_prompt

    sys_p, usr_p = build_chapter_expansion_prompt(
        video_title="Misteri Segitiga Bermuda",
        video_overview="Penjelasan sains di balik hilangnya kapal dan pesawat.",
        chapter_index=2,
        total_chapters=6,
        chapter_title="Babak 2: Medan Magnet Anomali",
        chapter_synopsis="Kompas berputar tanpa kendali.",
        chapter_key_points=["Navigasi terganggu", "Catatan penerbangan 19"],
        target_chapter_words=180,
        target_segments=5,
        images_per_segment=2,
        tone="misterius",
    )
    assert "Babak 2 dari 6" in sys_p
    assert "180 kata" in sys_p
    assert "162 kata" in sys_p  # 90% min
    assert "10 scenes" in sys_p or "5 segmen" in sys_p
    assert "Misteri Segitiga Bermuda" in usr_p
    assert "Catatan penerbangan 19" in usr_p


def test_storyboard_item_response_cache_busting():
    from datetime import datetime
    from app.models.storyboard import StoryboardItem
    from app.api.v1.storyboard import _item_to_response

    now = datetime(2026, 10, 17, 15, 0, 0)
    item = StoryboardItem(
        id="item-test-123",
        project_id="proj-123",
        segment_id="seg-1",
        order_index=0,
        script_text="Testing script",
        image_prompt="A test prompt",
        file_path="/app/storage/projects/proj-123/storyboard/img_item-test-123.png",
        status="ready",
        created_at=now,
        updated_at=now,
    )
    resp = _item_to_response(item)
    assert resp.image_url is not None
    assert "?v=" in resp.image_url
    assert str(int(now.timestamp())) in resp.image_url




