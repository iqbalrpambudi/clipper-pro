import pytest

from app.services.alignment import sequence_anchored_forced_alignment
from app.services.subtitle_ass import (
    generate_ass_subtitles,
    generate_srt_subtitles,
    generate_vtt_subtitles,
    hex_to_ass_color,
    ms_to_ass_time,
)


def test_hex_to_ass_color():
    # #FFFFFF -> &H00FFFFFF
    assert hex_to_ass_color("#FFFFFF") == "&H00FFFFFF"
    # #FFE600 -> R=FF, G=E6, B=00 -> ASS order BGR -> &H0000E6FF
    assert hex_to_ass_color("#FFE600") == "&H0000E6FF"


def test_ms_to_ass_time():
    assert ms_to_ass_time(0) == "0:00:00.00"
    assert ms_to_ass_time(1500) == "0:00:01.50"
    assert ms_to_ass_time(65430) == "0:01:05.43"


def test_hex_to_ass_color_opacity():
    # Opacity 1.0 -> Alpha 00 -> &H00...
    assert hex_to_ass_color("#000000", opacity=1.0) == "&H00000000"
    # Opacity 0.0 -> Alpha FF -> &HFF...
    assert hex_to_ass_color("#000000", opacity=0.0) == "&HFF000000"
    # Opacity 0.8 -> Alpha ~51 (33 hex) -> &H33...
    assert hex_to_ass_color("#111111", opacity=0.8) == "&H33111111"


def test_generate_ass_subtitles_modes_and_exports():
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
    ass_content = generate_ass_subtitles(segments, burst_style, video_width=1080, video_height=1920)
    assert "[Script Info]" in ass_content
    assert "PlayResX: 1080" in ass_content
    assert "PlayResY: 1920" in ass_content
    assert "Dialogue:" in ass_content
    assert "\\t(" in ass_content or "\\fscx" in ass_content

    # 2. SRT export
    srt_content = generate_srt_subtitles(segments)
    assert "1\n00:00:00,100 --> 00:00:01,800\nRahasia luar biasa!" in srt_content

    # 3. VTT export
    vtt_content = generate_vtt_subtitles(segments)
    assert "WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.800\nRahasia luar biasa!" in vtt_content


def test_sequence_anchored_forced_alignment():
    original_words = [
        {"word": "Tahukah", "start_ms": 0, "end_ms": 0},
        {"word": "kamu", "start_ms": 0, "end_ms": 0},
        {"word": "bahwa", "start_ms": 0, "end_ms": 0},
        {"word": "bumi", "start_ms": 0, "end_ms": 0},
        {"word": "itu", "start_ms": 0, "end_ms": 0},
        {"word": "bulat?", "start_ms": 0, "end_ms": 0},
    ]

    transcribed_words = [
        {"word": "Tahukah", "start_ms": 120, "end_ms": 450},
        {"word": "kamu", "start_ms": 460, "end_ms": 780},
        {"word": "bumi", "start_ms": 900, "end_ms": 1300},
        {"word": "bulat", "start_ms": 1350, "end_ms": 1800},
    ]

    aligned = sequence_anchored_forced_alignment(original_words, transcribed_words, total_duration_ms=2000)
    assert len(aligned) == 6
    assert aligned[0]["word"] == "Tahukah"
    assert aligned[0]["start_ms"] == 120
    assert aligned[0]["end_ms"] == 450

    assert aligned[1]["word"] == "kamu"
    assert aligned[1]["start_ms"] == 460
    assert aligned[1]["end_ms"] == 780

    assert aligned[2]["word"] == "bahwa"
    assert aligned[2]["start_ms"] >= 780
    assert aligned[2]["end_ms"] <= 900

    assert aligned[3]["word"] == "bumi"
    assert aligned[3]["start_ms"] == 900
    assert aligned[3]["end_ms"] == 1300


def test_sequence_anchored_forced_alignment_with_offset():
    original_words = [
        {"word": "fakta", "start_ms": 0, "end_ms": 0},
        {"word": "kedua", "start_ms": 0, "end_ms": 0},
    ]

    transcribed_words = [
        {"word": "fakta", "start_ms": 100, "end_ms": 300},
        {"word": "kedua", "start_ms": 350, "end_ms": 600},
    ]

    aligned = sequence_anchored_forced_alignment(
        original_words, transcribed_words, total_duration_ms=1000, segment_offset_ms=5000
    )
    assert aligned[0]["start_ms"] == 5100
    assert aligned[0]["end_ms"] == 5300
    assert aligned[1]["start_ms"] == 5350
    assert aligned[1]["end_ms"] == 5600


def test_ass_subtitles_pos_and_scale_factor():
    segments = [
        {
            "id": "seg-pos",
            "text": "Posisi Presisi",
            "start_ms": 100,
            "end_ms": 1500,
            "words": [
                {"word": "Posisi", "start_ms": 100, "end_ms": 700},
                {"word": "Presisi", "start_ms": 700, "end_ms": 1500},
            ],
        }
    ]

    custom_style = {
        "display_mode": "burst",
        "burst_word_count": 2,
        "position": "bottom",
        "position_x_offset": 50,
        "position_y_offset": 80,
        "font_family": "Montserrat",
        "font_size": 48,
        "primary_color": "#FFFFFF",
        "highlight_color": "#FFCC00",
        "outline_color": "#000000",
        "outline_width": 3,
        "highlight_animation": "scale",
        "highlight_scale_factor": 1.4,
    }

    ass_content = generate_ass_subtitles(segments, custom_style, video_width=1080, video_height=1920)
    assert "\\pos(" in ass_content
    assert "\\fscx140\\fscy140" in ass_content

    # Center-left position check
    style_center_left = dict(custom_style)
    style_center_left["position"] = "center_left"
    style_center_left["position_x_offset"] = 25
    style_center_left["position_y_offset"] = 45

    ass_center = generate_ass_subtitles(segments, style_center_left, video_width=1080, video_height=1920)
    assert "Dialogue:" in ass_center
    assert "\\pos(" in ass_center


def test_ass_font_metric_compensation():
    segments = [
        {
            "id": "seg-test",
            "text": "Bebas Test",
            "start_ms": 0,
            "end_ms": 1000,
            "words": [
                {"word": "Bebas", "start_ms": 0, "end_ms": 500},
                {"word": "Test", "start_ms": 500, "end_ms": 1000},
            ],
        }
    ]

    bebas_style = {
        "font_family": "Bebas Neue",
        "font_size": 60,
        "primary_color": "#FFFFFF",
        "highlight_color": "#FF0000",
        "outline_color": "#000000",
        "outline_width": 4,
        "display_mode": "full",
        "position": "bottom",
        "position_y_offset": 80,
    }

    ass_bebas = generate_ass_subtitles(segments, bebas_style, video_width=1080, video_height=1920)
    assert "Style: Default,Bebas Neue,60" in ass_bebas

    montserrat_style = dict(bebas_style)
    montserrat_style["font_family"] = "Montserrat"
    ass_montserrat = generate_ass_subtitles(segments, montserrat_style, video_width=1080, video_height=1920)
    assert "Style: Default,Montserrat,60" in ass_montserrat


@pytest.mark.asyncio
async def test_alignment_empty_segments_safe():
    res = sequence_anchored_forced_alignment([], [], total_duration_ms=1000)
    assert res == []
