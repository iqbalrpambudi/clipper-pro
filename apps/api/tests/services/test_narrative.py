from unittest.mock import AsyncMock

import pytest

from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter
from app.services.narrative import (
    build_script_prompt,
    generate_narration_script,
    line_count_for,
    parse_script_lines,
    pick_story_shots,
    split_into_sentence_segments,
)


def _scene(i, start, dur=5.0, montage=False, desc=None):
    return {
        "id": f"sc{i}",
        "start_time": start,
        "end_time": start + dur,
        "duration": dur,
        "description": desc or f"tangan mengaduk adonan {i}",
        "tags": [],
        "analysis": {},
        "shot_info": {"usable_ranges": [] if montage else [[start + 0.1, start + dur - 0.1]], "montage": montage},
    }


def test_split_flat_text_by_sentence():
    text = "Ini adalah fakta pertama yang unik! Apakah kamu pernah mendengarnya? Jangan lupa tinggalkan komentar."
    segs = split_into_sentence_segments(text)
    assert [s["text"] for s in segs] == [
        "Ini adalah fakta pertama yang unik!",
        "Apakah kamu pernah mendengarnya?",
        "Jangan lupa tinggalkan komentar.",
    ]


def test_split_line_script_one_segment_per_line():
    segs = split_into_sentence_segments("1. Kalimat satu. Masih satu baris.\n2. Kalimat dua di sini.")
    assert [s["text"] for s in segs] == ["Kalimat satu. Masih satu baris.", "Kalimat dua di sini."]


def test_openai_adapter_sse_and_json_parsing():
    adapter = OpenAICompatibleAdapter(base_url="https://api.openai.com/v1", api_key="sk-fake")
    line = 'data: {"choices": [{"delta": {"content": "Halo"}}]}'
    chunk = adapter._extract_content_from_response(line)
    assert chunk == "Halo"

    line_done = 'data: {"choices": [{"delta": {"content": "Halo"}}]}\n\ndata: [DONE]'
    chunk_done = adapter._extract_content_from_response(line_done)
    assert chunk_done == "Halo"


def test_pick_story_shots_spreads_over_video_and_skips_montage():
    scenes = [_scene(i, i * 5.0, montage=(i % 4 == 0)) for i in range(40)]
    shots = pick_story_shots(scenes, 6)
    assert len(shots) == 6
    starts = [s["start_time"] for s in shots]
    assert starts == sorted(starts)
    assert starts[0] < 40 and starts[-1] > 160  # covers start and end of the process
    assert not any(s["shot_info"]["montage"] for s in shots)


def test_line_count_follows_duration():
    assert line_count_for(55) == 12
    assert line_count_for(30) == 7


def test_prompt_lists_every_shot_and_rules():
    shots = [_scene(i, i * 5.0) for i in range(5)]
    system, user = build_script_prompt("Gaya: santai.", "santai", "", "Kimchi day", shots, 25, "id")
    assert "tepat 5 baris" in system and "Gaya: santai." in system
    assert "Kimchi day" in user and "3. [00:10]" in user
    # Story structure, not per-shot captions
    assert "satu cerita utuh" in system and "PERAN" in system and "Inti:" in system
    assert "-> PEMBUKA" in user and "-> HASIL" in user and user.count("-> PENUTUP") == 1


def test_parse_drops_inti_brief():
    raw = "Inti: petani mengubur sawi supaya kimchi awet.\n1. Kenapa sawi ini dikubur?\n2. Ini adalah cara menyimpan kimchi."
    assert parse_script_lines(raw) == ["Kenapa sawi ini dikubur?", "Ini adalah cara menyimpan kimchi."]
    assert parse_script_lines("**Inti:** pokoknya begitu.\nKenapa sawi dikubur? Supaya awet sampai musim semi.") == [
        "Kenapa sawi dikubur?",
        "Supaya awet sampai musim semi.",
    ]


def test_parse_numbered_lines_and_strip_junk():
    raw = "Tentu, ini naskahnya:\n1. **Kenapa** sawi ini dikubur (close up)?\n2) [Musik] Garam menarik air: sawi jadi lentur.\n3. Hasilnya renyah 😋 dan asam."
    assert parse_script_lines(raw) == [
        "Kenapa sawi ini dikubur?",
        "Garam menarik air, sawi jadi lentur.",
        "Hasilnya renyah dan asam.",
    ]


def test_parse_falls_back_to_sentences_for_paragraph():
    assert len(parse_script_lines("Kalimat pertama ada di sini. Kalimat kedua juga di sini.")) == 2


@pytest.mark.asyncio
async def test_generate_maps_line_k_to_shot_k():
    scenes = [_scene(i, i * 5.0) for i in range(30)]
    adapter = AsyncMock()
    adapter.generate_chat.return_value = "\n".join(f"{k}. Baris nomor {k} tentang proses ini." for k in range(1, 8))
    raw, segs = await generate_narration_script(adapter, "Gaya.", "santai", "", "Judul", scenes, target_duration=30)
    shots = pick_story_shots(scenes, 7)
    assert raw.count("\n") == 6
    assert [s["scene_id"] for s in segs] == [s["id"] for s in shots]
    adapter.generate_chat.assert_called_once()


@pytest.mark.asyncio
async def test_generate_retries_once_on_bad_format_then_fails():
    scenes = [_scene(i, i * 5.0) for i in range(30)]
    adapter = AsyncMock()
    adapter.generate_chat.return_value = "Oke."
    with pytest.raises(ValueError):
        await generate_narration_script(adapter, "Gaya.", "santai", "", "Judul", scenes, target_duration=30)
    assert adapter.generate_chat.call_count == 2
