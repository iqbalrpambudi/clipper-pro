import pytest

from app.services.alignment import sequence_anchored_forced_alignment
from app.services.subtitle_ass import (
    generate_ass_subtitles,
    generate_srt_subtitles,
    hex_to_ass_color,
    ms_to_ass_time,
    style_to_dict,
    subtitle_y,
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


SEGMENTS = [
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


def test_ass_burst_groups_highlight_and_srt():
    ass = generate_ass_subtitles(SEGMENTS, {"burst_word_count": 2, "highlight_color": "#00FF66"})
    dialogues = [line for line in ass.splitlines() if line.startswith("Dialogue:")]
    assert len(dialogues) == 3  # one event per spoken word
    assert "RAHASIA" in dialogues[0] and "LUAR" in dialogues[0] and "BIASA" not in dialogues[0]
    assert "\\c&H0066FF00}" in dialogues[0] and "\\fscx110" in dialogues[0]
    assert "Style: KaraokeDefault,Poppins,103," in ass

    plain = generate_ass_subtitles(SEGMENTS, {"highlight_animation": "none"})
    assert "\\fscx" not in plain

    assert "1\n00:00:00,100 --> 00:00:01,800\nRahasia luar biasa!" in generate_srt_subtitles(
        SEGMENTS
    )


def test_style_defaults_and_safe_y():
    assert style_to_dict(None)["offset_y"] == 260
    assert style_to_dict({"font_size": 70, "offset_y": None})["font_size"] == 70
    assert subtitle_y(style_to_dict(None)) == (2, 1440)
    # old "Bawah" preset saved offset -120 -> y 1820, under the Shorts buttons; clamp keeps it visible
    assert subtitle_y({"position": "bottom", "offset_y": -120}) == (2, 1497)
    assert subtitle_y({"position": "center", "offset_y": 0}) == (5, 960)


def test_sequence_anchored_forced_alignment():
    segments = [{"id": "seg-1", "text": "Tahukah kamu bahwa bumi itu bulat?"}]

    transcribed_words = [
        {"word": "Tahukah", "start_ms": 120, "end_ms": 450},
        {"word": "kamu", "start_ms": 460, "end_ms": 780},
        {"word": "bumi", "start_ms": 900, "end_ms": 1300},
        {"word": "bulat", "start_ms": 1350, "end_ms": 1800},
    ]

    aligned = sequence_anchored_forced_alignment(
        segments, transcribed_words, total_audio_duration_sec=2.0
    )[0]["words"]
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
    segments = [{"id": "seg-1", "text": "fakta kedua"}]

    transcribed_words = [
        {"word": "fakta", "start_ms": 100, "end_ms": 300},
        {"word": "kedua", "start_ms": 350, "end_ms": 600},
    ]

    aligned = sequence_anchored_forced_alignment(
        segments, transcribed_words, total_audio_duration_sec=1.0, offset_ms=5000
    )[0]["words"]
    assert aligned[0]["start_ms"] == 5100
    assert aligned[0]["end_ms"] == 5300
    assert aligned[1]["start_ms"] == 5350
    assert aligned[1]["end_ms"] == 5600


@pytest.mark.asyncio
async def test_alignment_empty_segments_safe():
    res = sequence_anchored_forced_alignment([], [], total_audio_duration_sec=1.0)
    assert res == []


@pytest.mark.asyncio
async def test_render_ass_endpoint_uses_unsaved_style(async_client):
    res = await async_client.post(
        "/api/v1/projects/any/subtitles/render-ass",
        json={
            "style": {"highlight_color": "#00FF66", "position": "center", "offset_y": 0},
            "segments": SEGMENTS,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["line_count"] == 3
    assert "\\an5\\pos(540,960)" in body["ass_content"]

    bad = await async_client.post(
        "/api/v1/projects/any/subtitles/render-ass",
        json={"style": {"highlight_color": "red"}, "segments": []},
    )
    assert bad.status_code == 422
