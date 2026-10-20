from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
import pytest

from app.schemas.storyboard import (
    StoryboardItemResponse,
    NarrationSegmentImprovement,
    StoryboardNarrationAnalysisResponse,
)
from app.services.storyboard import (
    build_chapter_expansion_prompt,
    build_storyboard_outline_prompt,
    build_storyboard_prompt,
    clean_narration_for_tts,
    resolve_prompt_variables,
)
from app.services.storyboard_analyzer import (
    apply_narration_improvements_to_project,
)


def test_build_storyboard_prompt_scales_with_duration():
    s1, u1 = build_storyboard_prompt("Topik 1", duration_mins=2)
    s5, u5 = build_storyboard_prompt("Topik 1", duration_mins=5)
    assert "2 menit" in u1
    assert "5 menit" in u5


def test_build_storyboard_outline_prompt_scales_correctly():
    sys_p, usr_p = build_storyboard_outline_prompt(
        topic="Asal Usul Danau Toba",
        duration_mins=5,
        tone="dramatis",
        num_chapters=4,
    )
    assert "4 babak" in usr_p
    assert "Danau Toba" in usr_p
    assert "dramatis" in usr_p


def test_build_chapter_expansion_prompt_targets():
    sys_p, usr_p = build_chapter_expansion_prompt(
        video_title="Legenda Nusantara",
        video_overview="Kumpulan cerita rakyat",
        chapter_index=1,
        total_chapters=3,
        chapter_title="Babak 1: Sang Petani",
        chapter_synopsis="Toba menangkap ikan mas ajaib",
        chapter_key_points=["Pertemuan dengan ikan mas", "Janji rahasia"],
        target_chapter_words=300,
        target_segments=2,
        images_per_segment=2,
        tone="dramatis",
        characters=[{"name": "Toba", "visual_anchor": "Pria tegap berpakaian tradisional"}],
    )
    assert "Babak 1" in usr_p
    assert "Toba" in usr_p
    assert "300 kata" in usr_p


def test_storyboard_item_response_cache_busting():
    now = datetime.now()
    item = StoryboardItemResponse(
        id="item-123",
        project_id="proj-abc",
        segment_id="seg-1",
        order_index=1,
        script_text="Intro",
        image_prompt="Prompt image",
        image_url="/storage/projects/proj-abc/storyboard/item-123.jpg",
        status="completed",
        created_at=now,
        updated_at=now,
    )
    assert item.image_url == "/storage/projects/proj-abc/storyboard/item-123.jpg"


@pytest.mark.asyncio
async def test_character_consistency_bible():
    characters = [
        {
            "id": "char-1",
            "name": "Budi",
            "visual_anchor": "Seorang anak laki-laki berbaju merah dengan topi biru",
        }
    ]
    prompt = "A shot of [char:char-1] walking in the forest."
    resolved = resolve_prompt_variables(prompt, characters=characters)
    assert "Seorang anak laki-laki berbaju merah" in resolved
    assert "[char:char-1]" not in resolved


def test_clean_narration_for_tts_and_punctuation():
    characters = [
        {
            "id": "aladin",
            "name": "Aladin",
            "role": "Protagonis",
            "variants": [
                {"variant_id": "muda", "label": "Aladin Muda"},
            ],
        },
        {
            "id": "penyihir",
            "name": "Penyihir",
            "role": "Antagonis",
        },
    ]

    locations = [
        {"id": "pesisir_pantai", "name": "Pesisir Pantai Air Manis"},
    ]

    # 1. Exact case reported by user:
    raw_user_narration = (
        "“Bagi [char:aladin:muda], lampu itu adalah jalan keluar dari kemiskinan; "
        "bagi [char:penyihir], ia adalah kunci menuju kekuatan yang tak terbatas dan tak terkendali.”"
    )
    cleaned = clean_narration_for_tts(raw_user_narration, characters=characters)

    assert "[char:" not in cleaned
    assert "[char:aladin:muda]" not in cleaned
    assert "[char:penyihir]" not in cleaned
    assert ";" not in cleaned
    assert ":" not in cleaned
    assert "Aladin" in cleaned
    assert "Penyihir" in cleaned
    assert "kemiskinan, bagi Penyihir" in cleaned

    # 2. Case without characters list (fallback regex name inference):
    cleaned_fallback = clean_narration_for_tts(raw_user_narration)
    assert "[char:" not in cleaned_fallback
    assert ";" not in cleaned_fallback
    assert ":" not in cleaned_fallback
    assert "Aladin" in cleaned_fallback
    assert "Penyihir" in cleaned_fallback

    # 3. Colon and timestamp cleaning
    colon_text = "Fakta penting: pada pukul 10:00 malam, keajaiban dimulai; lampu itu bersinar."
    cleaned_colon = clean_narration_for_tts(colon_text)
    assert ";" not in cleaned_colon
    assert ":" not in cleaned_colon
    assert "10.00" in cleaned_colon
    assert "Fakta penting, pada pukul" in cleaned_colon
    assert "dimulai, lampu itu bersinar." in cleaned_colon

    # 4. Stray preset and location token leak cleaning
    leaked_preset = "Di [loc:pesisir_pantai], sang pemuda [preset:style] bersujud [era]."
    cleaned_leak = clean_narration_for_tts(leaked_preset, locations=locations)
    assert "[loc:" not in cleaned_leak
    assert "[preset:" not in cleaned_leak
    assert "[era]" not in cleaned_leak
    assert "Pesisir Pantai Air Manis" in cleaned_leak
    assert "sang pemuda bersujud" in cleaned_leak


@pytest.mark.asyncio
async def test_story_continuity_bible_variable_resolution():
    characters = [
        {
            "id": "malin",
            "name": "Malin Kundang",
            "visual_anchor": "a lean Indonesian man with determined eyes",
            "variants": [
                {
                    "variant_id": "muda",
                    "label": "Masa Kecil",
                    "visual_anchor": "a lean young Indonesian boy in crimson shirt and bare feet",
                },
                {
                    "variant_id": "dewasa",
                    "label": "Saudagar Sukses",
                    "visual_anchor": "an opulent wealthy merchant in emerald green royal robe and golden keris",
                },
                {
                    "variant_id": "batu",
                    "label": "Patung Batu",
                    "visual_anchor": "a weathered grey stone statue kneeling in prostration pose on the rocks",
                },
            ],
        },
        {
            "id": "ibu",
            "name": "Mande Rubayah",
            "visual_anchor": "an elderly mother with wrinkled face and faded cream headscarf",
        },
    ]

    locations = [
        {
            "id": "pesisir_pantai",
            "name": "Pesisir Pantai Air Manis",
            "environment_anchor": "a rocky Indonesian tropical coast with crashing ocean waves and palm trees",
        }
    ]

    world_setting = {
        "era": "14th Century Ancient Nusantara",
        "time_setting": "Traditional Maritime Past",
        "atmosphere": "Moody storm lighting and dramatic ocean spray",
    }

    preset_style = "Cinematic hand-drawn 2D animation, Studio Ghibli inspired, high quality"

    # Test 1: Standard tags [preset:style], [char:malin:batu], [loc:pesisir_pantai]
    raw_prompt_1 = "A cinematic [16:9] shot in [preset:style] of [char:malin:batu] crying on [loc:pesisir_pantai], in [era]."
    resolved_1 = resolve_prompt_variables(
        raw_prompt_1,
        characters=characters,
        locations=locations,
        world_setting=world_setting,
        preset_master_prompt=preset_style,
    )

    assert "[16:9]" in resolved_1  # Aspect ratio preserved!
    assert "Cinematic hand-drawn 2D animation" in resolved_1
    assert "weathered grey stone statue kneeling in prostration pose" in resolved_1
    assert "rocky Indonesian tropical coast with crashing ocean waves" in resolved_1
    assert "14th Century Ancient Nusantara" in resolved_1
    assert "[char:" not in resolved_1
    assert "[loc:" not in resolved_1

    # Test 2: Shorthand user syntax like [malinkundang:batu] and [pesisirpantai]
    raw_prompt_2 = "Close-up shot of [malinkundang:batu] kneeling, nearby [manderubayah] weeping at [pesisirpantai]."
    resolved_2 = resolve_prompt_variables(
        raw_prompt_2,
        characters=characters,
        locations=locations,
        world_setting=world_setting,
    )
    assert "weathered grey stone statue" in resolved_2
    assert "elderly mother with wrinkled face" in resolved_2
    assert "rocky Indonesian tropical coast" in resolved_2

    # Test 3: Location with focal_props (Anchor Props)
    locations_with_props = [
        {
            "id": "kios_pasar",
            "name": "Kios Rempah",
            "environment_anchor": "rustic bamboo stall with dark teak counter",
            "focal_props": "olive canvas awning, hanging garlic braids, brass scale",
        }
    ]
    raw_prompt_3 = "A shot in [preset:style] of [char:malin:muda] bargaining on [loc:kios_pasar]."
    resolved_3 = resolve_prompt_variables(
        raw_prompt_3,
        characters=characters,
        locations=locations_with_props,
        preset_master_prompt=preset_style,
    )
    assert "rustic bamboo stall with dark teak counter" in resolved_3
    assert "key anchor elements: olive canvas awning, hanging garlic braids, brass scale" in resolved_3


@pytest.mark.asyncio
async def test_apply_narration_improvements_to_project():
    mock_db = AsyncMock()

    proj = MagicMock()
    proj.id = "proj-test"
    proj.characters = []
    proj.locations = []
    proj.world_setting = {}

    narration = MagicMock()
    narration.project_id = "proj-test"
    narration.segments = [
        {"id": "seg-1", "chapter": "Babak 1", "text": "Teks lama yang datar."},
        {"id": "seg-2", "chapter": "Babak 2", "text": "Teks segmen kedua."},
    ]
    narration.raw_text = "Teks lama yang datar.\n\nTeks segmen kedua."

    mock_db.get.return_value = proj

    mock_nar_res = MagicMock()
    mock_nar_res.scalar_one_or_none.return_value = narration

    mock_items_res = MagicMock()
    item1 = MagicMock()
    item1.segment_id = "seg-1"
    item1.order_index = 0
    item1.script_text = "Teks lama yang datar."
    item1.image_prompt = "Old visual prompt of someone sitting."
    item1.chapter_title = "Babak 1"

    mock_items_res.scalars.return_value.all.return_value = [item1]

    mock_db.execute.side_effect = [mock_nar_res, mock_items_res]

    improvements = [
        NarrationSegmentImprovement(
            segment_id="seg-1",
            segment_index=0,
            chapter_title="Babak 1: Misteri",
            original_text="Teks lama yang datar.",
            improved_text="Teks baru yang jauh lebih dramatis dan memikat!",
            change_summary="Meningkatkan hook dan ketegangan",
            original_visual_prompt="Old visual prompt of someone sitting.",
            improved_visual_prompt="Dramatic cinematic shot of [char:budi] running under dark stormy skies.",
        )
    ]

    res = await apply_narration_improvements_to_project(
        mock_db, "proj-test", improvements, update_visual_prompts=True
    )

    assert res["success"] is True
    assert res["applied_count"] == 1
    assert res["updated_visual_count"] == 1
    assert "Teks baru yang jauh lebih dramatis" in narration.segments[0]["text"]
    assert narration.segments[0]["chapter"] == "Babak 1: Misteri"
    assert "Teks baru yang jauh lebih dramatis" in item1.script_text
    assert item1.chapter_title == "Babak 1: Misteri"
    assert "Dramatic cinematic shot of [char:budi]" in item1.image_prompt


