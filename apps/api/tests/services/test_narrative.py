from unittest.mock import AsyncMock, patch

import pytest

from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter
from app.services.narrative import (
    build_master_scriptwriting_directive,
    generate_narration_script,
    split_into_sentence_segments,
)
from app.services.storyboard import (
    build_chapter_expansion_prompt,
    build_storyboard_outline_prompt,
)
from app.services.tts import AVAILABLE_VOICES


def test_split_into_sentence_segments():
    text = "Ini adalah fakta pertama yang unik! Apakah kamu pernah mendengarnya? Jangan lupa tinggalkan komentar."
    segs = split_into_sentence_segments(text)
    assert len(segs) == 3
    assert segs[0]["text"] == "Ini adalah fakta pertama yang unik!"
    assert segs[1]["text"] == "Apakah kamu pernah mendengarnya?"
    assert segs[2]["text"] == "Jangan lupa tinggalkan komentar."


def test_openai_adapter_sse_and_json_parsing():
    adapter = OpenAICompatibleAdapter(base_url="https://api.openai.com/v1", api_key="sk-fake")
    line = 'data: {"choices": [{"delta": {"content": "Halo"}}]}'
    chunk = adapter._parse_sse_line(line)
    assert chunk == "Halo"

    line_done = "data: [DONE]"
    chunk_done = adapter._parse_sse_line(line_done)
    assert chunk_done is None


def test_build_master_scriptwriting_directive_includes_parameters():
    directive = build_master_scriptwriting_directive(
        topic="5 Fakta Menakjubkan Tentang Luar Angkasa",
        tone="dramatis",
        word_count=180,
        language="id",
    )
    assert "5 Fakta Menakjubkan Tentang Luar Angkasa" in directive
    assert "dramatis" in directive.lower()
    assert "180" in directive
    assert "Bahasa: BAHASA INDONESIA" in directive


@pytest.mark.asyncio
async def test_generate_narration_script_injects_parameters_into_master_prompt():
    mock_adapter = AsyncMock()
    mock_adapter.generate_chat.return_value = (
        "Tahukah kamu bahwa luar angkasa sangat sunyi? Tidak ada udara untuk merambatkan suara."
    )

    with patch("app.services.narrative.get_active_llm_adapter", return_value=mock_adapter):
        script = await generate_narration_script(
            topic="Keheningan Luar Angkasa",
            tone="misterius",
            duration=45,
            language="id",
        )
        assert "luar angkasa" in script.lower()
        mock_adapter.generate_chat.assert_called_once()
        call_prompt = mock_adapter.generate_chat.call_args[0][0]
        assert "Keheningan Luar Angkasa" in call_prompt
        assert "misterius" in call_prompt.lower()


def test_multilingual_script_and_storyboard_directives():
    # 1. Test short-form narrative directive in EN vs ID
    en_directive = build_master_scriptwriting_directive(
        topic="Secrets of the deep ocean",
        tone="dramatis",
        word_count=150,
        language="en",
    )
    assert "Language: ENGLISH ONLY" in en_directive
    assert "Secrets of the deep ocean" in en_directive

    id_directive = build_master_scriptwriting_directive(
        topic="Misteri segitiga bermuda",
        tone="misterius",
        word_count=150,
        language="id",
    )
    assert "Bahasa: BAHASA INDONESIA" in id_directive
    assert "Misteri segitiga bermuda" in id_directive

    # 2. Test storyboard outline prompt in EN
    sys_en, usr_en = build_storyboard_outline_prompt(
        topic="The Rise and Fall of the Roman Empire",
        duration_mins=10,
        tone="edukatif",
        num_chapters=5,
        language="en",
    )
    assert "CRITICAL LANGUAGE RULE: Write the entire outline" in sys_en
    assert "The Rise and Fall of the Roman Empire" in usr_en

    # 3. Test chapter expansion prompt in EN
    exp_sys, exp_usr = build_chapter_expansion_prompt(
        video_title="The Rise and Fall of the Roman Empire",
        video_overview="An in-depth historical documentary",
        chapter_index=1,
        total_chapters=5,
        chapter_title="Chapter 1: The Foundations of Rome",
        chapter_synopsis="From the mythical twins Romulus and Remus to the Senate",
        chapter_key_points=["Seven Hills of Rome", "Establishment of the Republic"],
        target_chapter_words=450,
        target_segments=3,
        images_per_segment=2,
        tone="edukatif",
        characters=[],
        language="en",
    )
    assert "All `narration_text` MUST be written in natural, engaging, fluent spoken ENGLISH" in exp_sys
    assert "The Foundations of Rome" in exp_usr

    # 4. Test voice list multilingual flags
    en_voices = [v for v in AVAILABLE_VOICES if "en" in (v.languages or [v.language])]
    id_voices = [v for v in AVAILABLE_VOICES if "id" in (v.languages or [v.language])]
    assert len(en_voices) > 0, "Should have English-compatible voices"
    assert len(id_voices) > 0, "Should have Indonesian-compatible voices"
    assert any(v.id == "en-US-JennyNeural" for v in en_voices)
    assert any(v.id == "id-ID-ArdiNeural" for v in id_voices)

    # 5. Test Project schemas default and language values
    proj_default = ProjectCreate(name="Default Project")
    assert proj_default.language == "id"

    proj_en = ProjectCreate(name="English Doc", language="en")
    assert proj_en.language == "en"

    proj_up = ProjectUpdate(language="en")
    assert proj_up.language == "en"
