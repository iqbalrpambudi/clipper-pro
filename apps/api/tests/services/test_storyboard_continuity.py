"""Tests for storyboard continuity bible, shot-aware prompt compilation, and TTS chapter grouping."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.storyboard import NarrationSegmentImprovement
from app.services.image_gen import build_full_image_prompt
from app.services.storyboard import (
    _extract_rolling_context_from_chapter,
    build_chapter_expansion_prompt,
    build_storyboard_outline_prompt,
    resolve_prompt_variables,
)
from app.services.storyboard_analyzer import apply_narration_improvements_to_project
from app.services.subtitle_ass import generate_ass_subtitles
from app.services.tts.audio_utils import _group_segments_by_chapter

CHARACTERS = [
    {
        "id": "pedagang",
        "name": "Pak Darto",
        "face_head_anchor": "sun-tanned man in 40s with thick mustache and brown peci",
        "outfit_body_anchor": "lean build, faded indigo lurik shirt with rolled sleeves",
        "visual_anchor": "legacy full anchor",
    }
]
LOCATIONS = [
    {
        "id": "kios_pasar",
        "name": "Kios Pasar",
        "environment_anchor": "rustic bamboo spice stall in a busy Javanese market",
        "closeup_background_anchor": "blurred shelves of spice jars and olive awning bokeh",
        "focal_props": "olive canvas awning, brass scale",
        "lighting_direction": "warm morning sunlight from the left",
    }
]


def test_wide_shot_uses_full_character_and_environment_anchor():
    resolved = resolve_prompt_variables(
        "[char:pedagang] arranging goods at [loc:kios_pasar].",
        characters=CHARACTERS,
        locations=LOCATIONS,
        shot_metadata={"shot_type": "establishing_wide"},
    )
    assert "thick mustache" in resolved
    assert "indigo lurik shirt" in resolved
    assert "rustic bamboo spice stall" in resolved
    assert "spice jars and olive awning bokeh" not in resolved
    assert "olive canvas awning, brass scale" in resolved
    assert "warm morning sunlight from the left" in resolved


def test_closeup_shot_uses_face_and_bokeh_background_keeping_props_and_light():
    resolved = resolve_prompt_variables(
        "[char:pedagang] smiling at [loc:kios_pasar].",
        characters=CHARACTERS,
        locations=LOCATIONS,
        shot_metadata={"shot_type": "close_up"},
    )
    assert "thick mustache" in resolved
    assert "indigo lurik shirt" not in resolved
    assert "spice jars and olive awning bokeh" in resolved
    assert "rustic bamboo spice stall" not in resolved
    # Same props & lighting stay locked across shot scales
    assert "olive canvas awning, brass scale" in resolved
    assert "warm morning sunlight from the left" in resolved


def test_inline_closeup_modifier_overrides_scene_scale():
    resolved = resolve_prompt_variables(
        "[char:pedagang:closeup] at [loc:kios_pasar:wide]",
        characters=CHARACTERS,
        locations=LOCATIONS,
        shot_metadata={"shot_type": "wide"},
    )
    assert "indigo lurik shirt" not in resolved
    assert "rustic bamboo spice stall" in resolved


def test_spatial_blocking_is_injected():
    resolved = resolve_prompt_variables(
        "[char:pedagang] at [loc:kios_pasar].",
        characters=CHARACTERS,
        locations=LOCATIONS,
        shot_metadata={
            "shot_type": "medium",
            "spatial_blocking": "vendor stands behind the counter on the right of frame",
        },
    )
    assert "180-degree spatial blocking" in resolved
    assert "vendor stands behind the counter" in resolved


def test_legacy_character_without_structured_anchors_still_resolves():
    legacy = [{"id": "ibu", "name": "Ibu", "visual_anchor": "elderly mother with wrinkled face"}]
    resolved = resolve_prompt_variables(
        "[char:ibu] weeping", characters=legacy, shot_metadata={"shot_type": "close_up"}
    )
    assert "elderly mother with wrinkled face" in resolved


def test_build_full_image_prompt_does_not_duplicate_resolved_style():
    style = "Cinematic hand-drawn 2D animation, warm parchment palette, soft ink linework"
    user_prompt = f"{style}. A vendor at a market stall."
    out = build_full_image_prompt(user_prompt, style)
    assert out.lower().count("cinematic hand-drawn 2d animation") == 1

    out_plain = build_full_image_prompt("A vendor at a market stall.", style)
    assert out_plain.lower().count("cinematic hand-drawn 2d animation") == 1


def test_outline_prompt_is_preset_aware_without_keyerror():
    preset = MagicMock()
    preset.name = "Stickman Doodle"
    preset.master_prompt = "minimalist stickman doodle, bald white head, stick limbs, dot eyes"
    preset.style_attributes = {"character_style": "stickman"}

    for lang in ("id", "en"):
        sys_p, usr_p = build_storyboard_outline_prompt(
            topic="Pasar Tradisional",
            duration_mins=5,
            tone="santai",
            num_chapters=4,
            language=lang,
            preset=preset,
        )
        assert "stickman" in sys_p.lower()
        assert "{preset_character_guidance}" not in sys_p
        assert "face_head_anchor" in sys_p


def test_outline_prompt_without_preset_has_no_guidance_placeholder():
    sys_p, _ = build_storyboard_outline_prompt(topic="Topik", duration_mins=5)
    assert "{preset_character_guidance}" not in sys_p


def test_rolling_context_extracts_tail_and_last_group():
    chapter = {
        "segments": [
            {
                "scenes": [
                    {"narration_text": "Kalimat pembuka yang pertama di pasar.", "scene_group_id": "pasar_1"},
                    {
                        "narration_text": "Kalimat penutup yang terakhir sebelum babak berganti.",
                        "scene_group_id": "pasar_2",
                        "spatial_blocking": "vendor right of frame",
                    },
                ]
            }
        ]
    }
    ctx = _extract_rolling_context_from_chapter(chapter)
    assert "Kalimat penutup yang terakhir" in str(ctx)
    assert "pasar_2" in str(ctx)


def test_chapter_expansion_prompt_accepts_rolling_context():
    rolling = _extract_rolling_context_from_chapter(
        {"segments": [{"scenes": [{"narration_text": "Ujung babak sebelumnya yang unik."}]}]}
    )
    sys_p, usr_p = build_chapter_expansion_prompt(
        video_title="Legenda",
        video_overview="Ringkasan",
        chapter_index=2,
        total_chapters=3,
        chapter_title="Babak 2",
        chapter_synopsis="Sinopsis",
        chapter_key_points=["a"],
        target_chapter_words=300,
        target_segments=2,
        images_per_segment=2,
        tone="santai",
        previous_chapter_context=rolling,
    )
    assert "Ujung babak sebelumnya yang unik" in sys_p + usr_p


@pytest.mark.asyncio
async def test_apply_improvements_maps_by_segment_id_not_integer_division():
    mock_db = AsyncMock()
    proj = MagicMock()
    proj.characters = []
    proj.locations = []
    proj.world_setting = {}
    mock_db.get.return_value = proj

    narration = MagicMock()
    narration.segments = [
        {"id": "seg-1", "chapter": "B1", "text": "satu"},
        {"id": "seg-2", "chapter": "B2", "text": "dua"},
    ]
    narration.raw_text = "satu\n\ndua"
    nar_res = MagicMock()
    nar_res.scalar_one_or_none.return_value = narration

    def _item(seg_id, order, text):
        it = MagicMock()
        it.segment_id = seg_id
        it.order_index = order
        it.script_text = text
        it.image_prompt = f"prompt-{seg_id}"
        it.chapter_title = "x"
        return it

    # Scenes: seg-1 has 2 sub-scenes, seg-2 has 1
    i0 = _item("seg-1_1", 0, "satu a")
    i1 = _item("seg-1_2", 1, "satu b")
    i2 = _item("seg-2", 2, "dua")
    items_res = MagicMock()
    items_res.scalars.return_value.all.return_value = [i0, i1, i2]
    mock_db.execute.side_effect = [nar_res, items_res]

    improvements = [
        NarrationSegmentImprovement(
            segment_id="seg-2",
            segment_index=1,
            chapter_title="B2",
            original_text="dua",
            improved_text="dua yang lebih baik",
            change_summary="x",
            original_visual_prompt="prompt-seg-2",
            improved_visual_prompt="prompt baru seg-2",
        )
    ]
    res = await apply_narration_improvements_to_project(
        mock_db, "p", improvements, update_visual_prompts=True
    )
    assert res["success"] is True
    # Unrelated multi-scene items must not be overwritten
    assert i0.image_prompt == "prompt-seg-1_1"
    assert i1.image_prompt == "prompt-seg-1_2"
    assert i2.image_prompt == "prompt baru seg-2"


def test_group_segments_by_chapter_requires_multiple_chapters():
    one = [{"text": "a", "chapter": "Bab 1"}, {"text": "b", "chapter": "Bab 1"}]
    assert _group_segments_by_chapter(one) == []
    assert _group_segments_by_chapter(None) == []

    multi = [
        {"text": "a", "chapter": "Bab 1"},
        {"text": "b", "chapter": "Bab 1"},
        {"text": "c", "chapter": "Bab 2"},
    ]
    blocks = _group_segments_by_chapter(multi)
    assert len(blocks) == 2
    assert "a" in blocks[0] and "b" in blocks[0]
    assert blocks[1] == "c"


def _ass_text(text_case):
    segments = [
        {
            "id": "s1",
            "text": "Halo dunia yang indah",
            "start_ms": 0,
            "end_ms": 2000,
            "words": [
                {"word": "Halo", "start_ms": 0, "end_ms": 400},
                {"word": "dunia", "start_ms": 400, "end_ms": 900},
                {"word": "yang", "start_ms": 900, "end_ms": 1300},
                {"word": "indah", "start_ms": 1300, "end_ms": 2000},
            ],
        }
    ]
    style = {
        "font_family": "Inter",
        "font_size": 36,
        "primary_color": "#F8FAFC",
        "highlight_color": "#FDE047",
        "outline_color": "#0F172A",
        "outline_width": 2,
        "box_color": "#0F172A",
        "box_opacity": 0.65,
        "position": "bottom",
        "offset_y": -24,
        "display_mode": "full_sentence",
        "highlight_animation": "color",
        "text_case": text_case,
    }
    return generate_ass_subtitles(segments, style, play_res_x=1920, play_res_y=1080)


def test_ass_sentence_case_preserves_casing():
    ass = _ass_text("sentence")
    assert "Halo" in ass
    assert "HALO" not in ass


def test_ass_uppercase_converts_text():
    ass = _ass_text("uppercase")
    assert "HALO" in ass
