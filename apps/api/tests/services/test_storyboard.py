from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.storyboard import (
    NarrationSegmentImprovement,
    StoryboardItemResponse,
)
from app.services.storyboard import (
    _is_closeup_shot,
    _sanitize_director_image_prompt,
    _synthesize_director_fallback_scene,
    _synthesize_fallback_beats,
    build_character_agent_prompt,
    build_director_chapter_prompt,
    build_scriptwriter_chapter_prompt,
    build_scriptwriter_outline_prompt,
    clean_narration_for_tts,
    extract_json_payload,
    repair_json_string,
    resolve_prompt_variables,
)
from app.services.storyboard_analyzer import (
    apply_narration_improvements_to_project,
)


def test_build_scriptwriter_outline_prompt_scales_with_duration():
    s1, u1 = build_scriptwriter_outline_prompt("Topik 1", duration_mins=2)
    s5, u5 = build_scriptwriter_outline_prompt("Topik 1", duration_mins=5)
    assert "2 Menit" in u1
    assert "5 Menit" in u5


def test_build_scriptwriter_outline_prompt_scales_correctly():
    sys_p, usr_p = build_scriptwriter_outline_prompt(
        topic="Asal Usul Danau Toba",
        duration_mins=5,
        tone="dramatis",
        num_chapters=4,
    )
    assert "4 babak" in usr_p
    assert "Danau Toba" in usr_p
    assert "dramatis" in usr_p


def test_build_scriptwriter_chapter_prompt_targets():
    sys_p, usr_p = build_scriptwriter_chapter_prompt(
        video_title="Legenda Nusantara",
        video_overview="Kumpulan cerita rakyat",
        chapter_index=1,
        total_chapters=3,
        chapter_title="Babak 1: Sang Petani",
        chapter_synopsis="Toba menangkap ikan mas ajaib",
        opening_hook="Di sebuah lembah yang sunyi...",
        closing_rehook="Namun janji itu akan segera diuji...",
        target_beats=8,
        target_chapter_words=300,
        tone="dramatis",
    )
    assert "Babak 1" in usr_p
    assert "Sang Petani" in usr_p
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


def test_extract_json_payload_repair_truncated():
    truncated_ch = (
        '{"title": "Kisah Malin", "chapters": [{"chapter_title": "Babak 1", '
        '"segments": [{"segment_id": "seg-1_1", "scenes": [{"scene_id": "scene-1", '
        '"narration_text": "Di sebuah pantai terpencil hiduplah seorang anak", "image_prompt": "A boy by the coast'
    )
    parsed = extract_json_payload(truncated_ch)
    assert parsed["title"] == "Kisah Malin"
    assert len(parsed["chapters"]) == 1
    assert parsed["chapters"][0]["chapter_title"] == "Babak 1"
    assert "Di sebuah pantai" in parsed["chapters"][0]["segments"][0]["scenes"][0]["narration_text"]


def test_synthesize_fallback_beats_and_director_scene():
    characters = [{"id": "malin", "name": "Malin Kundang"}]
    locations = [{"id": "dermaga_kapal", "name": "Dermaga Pelabuhan"}]

    beats = _synthesize_fallback_beats(
        topic="Legenda Malin Kundang",
        chapter_index=3,
        chapter_title="Babak 3: Puncak Konflik",
        target_beats=8,
        target_words=180,
        language="id",
    )

    assert len(beats) == 8
    for b in beats:
        assert len(b.get("narration_text", "")) > 0

    sc = _synthesize_director_fallback_scene(
        beat=beats[0],
        b_i=0,
        total_beats=8,
        characters=characters,
        locations=locations,
        ch_idx=3,
    )

    assert "[char:malin]" in sc["image_prompt"]
    assert "[loc:dermaga_kapal]" in sc["image_prompt"]
    assert sc["shot_type"] in ["establishing_wide", "medium", "close_up", "medium_closeup", "wide", "full_shot", "two_shot", "group_shot", "insert_detail", "pov", "aerial", "silhouette_wide"]
    assert len(sc["narration_text"]) > 0


def test_long_duration_outline_scaling_7_minutes():
    sys_p, usr_p = build_scriptwriter_outline_prompt(
        topic="Misteri Segitiga Bermuda",
        duration_mins=7,
        tone="misterius",
        num_chapters=5,
    )
    assert "7 menit" in usr_p.lower() or "7" in usr_p
    assert "5 babak" in usr_p
    assert "Segitiga Bermuda" in usr_p


def test_scriptwriter_agent_targets_7_and_8_minutes():
    # 7 minutes target: ~945 words total, 5 chapters -> ~189 words/ch, 10 beats/ch
    sys7, usr7 = build_scriptwriter_outline_prompt(
        topic="Misteri Hilangnya Kapal Mary Celeste",
        duration_mins=7,
        tone="misterius",
        num_chapters=5,
        language="id",
    )
    assert "945 kata" in usr7
    assert "5 babak" in usr7
    assert "10 beat" in usr7

    # 8 minutes target: ~1080 words total, 6 chapters -> ~180 words/ch, 9-10 beats/ch
    sys8, usr8 = build_scriptwriter_outline_prompt(
        topic="Revolusi Industri dan Mesin Uap",
        duration_mins=8,
        tone="edukatif",
        num_chapters=6,
        language="id",
    )
    assert "1080 kata" in usr8
    assert "6 babak" in usr8

    # Chapter beat target:
    ch_sys, ch_usr = build_scriptwriter_chapter_prompt(
        video_title="Mary Celeste",
        video_overview="Kapal tanpa awak",
        chapter_index=1,
        total_chapters=5,
        chapter_title="Babak 1: Penemuan di Tengah Samudra",
        chapter_synopsis="Kapal ditemukan terapung tanpa awak",
        opening_hook="Kabut dingin menyelimuti laut Atlantik saat siluet aneh muncul.",
        closing_rehook="Namun saat mereka menaiki geladak, tak ada seorang pun di sana.",
        target_beats=10,
        target_chapter_words=190,
        tone="misterius",
        language="id",
    )
    assert "10 beat" in ch_usr
    assert "190 kata" in ch_usr
    assert "Babak 1" in ch_usr


def test_character_agent_prompt_structure():
    script_sample = (
        "Malin berdiri di samping lapak kayu tua pedagang rempah. "
        "Matanya tajam memandangi kapal besar yang bersandar di dermaga pesisir."
    )
    sys_p, usr_p = build_character_agent_prompt(
        full_script_text=script_sample,
        topic="Legenda Malin Kundang",
        tone="dramatis",
        language="id",
    )
    assert "Malin berdiri" in usr_p
    assert "Continuity Bible" in usr_p
    assert "face_head_anchor" in sys_p
    assert "outfit_body_anchor" in sys_p


def test_director_agent_prompt_mapping():
    beats = [
        {"beat_index": 1, "narration_text": "Langkah pemuda itu terhenti tepat di muka dermaga yang riuh."},
        {"beat_index": 2, "narration_text": "Di hadapannya, kapal perak saudagar kaya memuntahkan peti-peti rempah."},
    ]
    chars = [{"id": "malin", "name": "Malin Kundang"}]
    locs = [{"id": "dermaga", "name": "Dermaga Pelabuhan"}]

    sys_p, usr_p = build_director_chapter_prompt(
        chapter_index=1,
        chapter_title="Babak 1: Dermaga Harapan",
        beats=beats,
        characters=chars,
        locations=locs,
        language="id",
    )
    assert "Babak 1: Dermaga Harapan" in usr_p
    assert "Langkah pemuda itu" in usr_p
    assert "scene_group_id" in sys_p
    assert "shot_type" in sys_p
    assert "spatial_blocking" in sys_p


def test_synthesize_fallback_beats():
    beats = _synthesize_fallback_beats(
        topic="Eksplorasi Palung Mariana",
        chapter_index=2,
        chapter_title="Babak 2: Zona Abisal",
        target_beats=8,
        target_words=160,
        language="id",
    )
    assert len(beats) == 8
    for i, b in enumerate(beats):
        assert b["beat_index"] == i + 1
        assert len(b["narration_text"]) > 10
        assert "Zona Abisal" in b["narration_text"]


def test_is_closeup_shot_variations():
    assert _is_closeup_shot("Full-bleed 16:9 close_up shot in [preset:style]") is True
    assert _is_closeup_shot("Full-bleed 16:9 close-up shot in [preset:style]") is True
    assert _is_closeup_shot("Full-bleed 16:9 medium_closeup shot in [preset:style]") is True
    assert _is_closeup_shot("Full-bleed 16:9 extreme_close_up shot in [preset:style]") is True
    assert _is_closeup_shot("Full-bleed 16:9 wide shot in [preset:style]") is False
    assert _is_closeup_shot("A shot in [preset:style]", {"shot_type": "close_up"}) is True
    assert _is_closeup_shot("A shot in [preset:style]", {"shot_type": "wide"}) is False


def test_director_fallback_scene_sentry_vs_protagonist():
    chars = [
        {"id": "anoman", "name": "Anoman", "face_head_anchor": "white monkey face"},
        {"id": "sinta", "name": "Dewi Sinta", "face_head_anchor": "gentle royal face"},
    ]
    locs = [
        {"id": "gerbang_alengka", "name": "Gerbang Alengka", "environment_anchor": "massive red stone gate"},
        {"id": "kurungan", "name": "Kurungan Istana", "environment_anchor": "ornate iron cage"},
    ]

    # Test 1: Rahul the gatekeeper sentry - must NOT assign Anoman
    rahul_beat = {"beat_index": 1, "narration_text": "Rahul, penjaga gerbang utama, menyekat jalan masuk ke benteng."}
    sc_rahul = _synthesize_director_fallback_scene(
        beat=rahul_beat,
        b_i=0,
        total_beats=1,
        characters=chars,
        locations=locs,
    )
    assert "[char:anoman]" not in sc_rahul["image_prompt"]
    assert "[char:sinta]" not in sc_rahul["image_prompt"]
    assert "the stern gatekeeper sentry on guard duty" in sc_rahul["image_prompt"]
    assert "[loc:gerbang_alengka]" in sc_rahul["image_prompt"]
    assert "menyek" not in sc_rahul["image_prompt"]
    assert "illustrating" not in sc_rahul["image_prompt"]

    # Test 2: Sinta in cage - must assign Sinta, NOT Anoman or Gerbang
    sinta_beat = {"beat_index": 2, "narration_text": "Di balik jeruji kurungan, Sinta terdiam memandang cakrawala, merasakan hawa dingin malam."}
    sc_sinta = _synthesize_director_fallback_scene(
        beat=sinta_beat,
        b_i=1,
        total_beats=1,
        characters=chars,
        locations=locs,
    )
    assert "[char:sinta]" in sc_sinta["image_prompt"]
    assert "[char:anoman]" not in sc_sinta["image_prompt"]
    assert "[loc:kurungan]" in sc_sinta["image_prompt"]
    assert "[loc:gerbang_alengka]" not in sc_sinta["image_prompt"]
    assert "hawa ding." not in sc_sinta["image_prompt"]


def test_sanitize_director_image_prompt_anti_leak_and_dedup():
    chars = [
        {"id": "anoman", "name": "Anoman"},
        {"id": "sinta", "name": "Dewi Sinta"},
    ]
    locs = [
        {"id": "gerbang_alengka", "name": "Gerbang Alengka"},
        {"id": "kurungan", "name": "Kurungan Istana"},
    ]

    # User's complaint sample
    user_bad_sample = "Full-bleed 16:9 wide shot in [preset:style] on [loc:gerbang_alengka], featuring [char:anoman] illustrating Rahul, penjaga gerbang utama, menyek"
    rahul_beat = {"beat_index": 1, "narration_text": "Rahul, penjaga gerbang utama, menyekat jalan masuk ke benteng."}
    sanitized = _sanitize_director_image_prompt(
        img_prompt=user_bad_sample,
        beat=rahul_beat,
        b_i=0,
        shot_type="wide",
        characters=chars,
        locations=locs,
    )
    assert "[char:anoman]" not in sanitized
    assert "illustrating" not in sanitized
    assert "menyek" not in sanitized
    assert "the stern gatekeeper sentry on guard duty" in sanitized
    assert "[loc:gerbang_alengka]" in sanitized
    assert "Full-bleed 16:9" not in sanitized
    assert sanitized.startswith("[preset:style]")

    # Sinta sample with wrong character prefix
    user_bad_sinta = "Full-bleed 16:9 close_up shot in [preset:style] on [loc:gerbang_alengka], featuring [char:anoman] illustrating Di balik jeruji kurungan, Sinta terdiam memandang cakrawala, merasakan hawa ding."
    sinta_beat = {"beat_index": 2, "narration_text": "Di balik jeruji kurungan, Sinta terdiam memandang cakrawala, merasakan hawa dingin malam."}
    sanitized_sinta = _sanitize_director_image_prompt(
        img_prompt=user_bad_sinta,
        beat=sinta_beat,
        b_i=1,
        shot_type="close_up",
        characters=chars,
        locations=locs,
    )
    assert "[char:anoman]" not in sanitized_sinta
    assert "[char:sinta]" in sanitized_sinta
    assert sanitized_sinta.count("[char:sinta]") == 1
    assert "[loc:kurungan]" in sanitized_sinta
    assert "illustrating" not in sanitized_sinta
    assert "hawa ding." not in sanitized_sinta
    assert "Full-bleed 16:9" not in sanitized_sinta
    assert sanitized_sinta.startswith("[preset:style]")


def test_outdoor_reference_continuity_not_room():
    locs = [
        {
            "id": "gerbang_alengka",
            "name": "Gerbang Alengka",
            "environment_anchor": "massive red stone arched gate, carved guardian statues, stone watchtower",
        }
    ]
    prompt = "Full-bleed 16:9 wide shot in on massive red stone arched gate, guard blocking passage to inner rooms."
    resolved = resolve_prompt_variables(
        prompt,
        locations=locs,
        shot_metadata={"reference_item_id": "ref-123", "location_id": "gerbang_alengka"},
    )
    assert "room architecture, furniture placement" not in resolved
    assert "strictly preserve identical" not in resolved
    assert "Full-bleed 16:9" not in resolved
    assert "16:9" not in resolved







def test_comic_shot_variety_planner_rules():
    from app.services.storyboard_shots import plan_shot_variety, storyboard_quality_metrics, FACE_SHOTS, WIDE_OPENERS

    # Simulate 10 scenes where all scenes are close-up initially
    scenes = [
        {
            "_chapter": 1,
            "beat_index": i + 1,
            "beat_type": "reaction" if i % 2 == 0 else "action",
            "scene_group_id": "grp_1" if i < 5 else "grp_2",
            "shot_type": "close_up",
            "camera_angle": "eye_level",
            "subjects": [{"char_id": "malin", "pose": "standing", "expression": "tense"}],
        }
        for i in range(10)
    ]

    planned = plan_shot_variety(scenes, group_key="scene_group_id", chapter_key="_chapter")
    metrics = storyboard_quality_metrics(planned)

    # 1. Close-up ratio must be <= 25% (target ~20%)
    assert metrics["closeup_ratio"] <= 0.25

    # 2. No adjacent face shots
    assert metrics["adjacent_face_shots"] == 0

    # 3. Every new group must open with wide opener
    assert planned[0]["shot_type"] in WIDE_OPENERS
    assert planned[5]["shot_type"] in WIDE_OPENERS

    # 4. Same shot type max run <= 2
    assert metrics["max_same_shot_run"] <= 2


def test_fallback_does_not_force_protagonist_on_general_explainer():
    from app.services.storyboard import _synthesize_director_fallback_scene

    chars = [{"id": "malin", "name": "Malin Kundang"}]
    locs = [{"id": "kota_padang", "name": "Kota Padang", "environment_anchor": "bustling 14th century market square"}]

    general_beat = {
        "beat_index": 1,
        "narration_text": "Di masa itu, perdagangan rempah di seluruh kepulauan Nusantara berkembang dengan sangat pesat.",
    }

    sc = _synthesize_director_fallback_scene(
        beat=general_beat,
        b_i=0,
        total_beats=5,
        characters=chars,
        locations=locs,
    )

    # Must NOT force [char:malin] onto general historical explainer!
    assert "[char:malin]" not in sc["image_prompt"]
    assert sc["beat_type"] in ("general_explainer", "establishing")
    assert sc["shot_type"] in ("establishing_wide", "wide", "full_shot", "aerial")


def test_neutralize_static_style_phrases():
    from app.services.image_gen import _neutralize_static_style_phrases

    style_with_static = "Hand-drawn comic illustration, vintage ink on parchment. Ample negative space, no clutter, diagrammatic storytelling elements. Warm sepia palette."
    neutralized = _neutralize_static_style_phrases(style_with_static)

    assert "negative space" not in neutralized.lower()
    assert "no clutter" not in neutralized.lower()
    assert "diagrammatic" not in neutralized.lower()
    assert "Hand-drawn comic illustration" in neutralized
    assert "Warm sepia palette" in neutralized


def test_director_prompt_without_character_bible():
    from app.services.storyboard import build_director_chapter_prompt

    beats = [
        {"beat_index": 1, "narration_text": "Inflasi dan krisis ekonomi melumpuhkan pasar global."},
    ]
    # No characters (character bible disabled)
    sys_p, usr_p = build_director_chapter_prompt(
        chapter_index=1,
        chapter_title="Krisis Global",
        beats=beats,
        characters=[],
        locations=[],
    )

    assert "KONSISTENSI KARAKTER: NON-AKTIF" in sys_p
    assert "JANGAN gunakan token `[char:...]`" in sys_p


def test_explainer_mode_doodle_stickman_clean_upstream_pipeline():
    from app.services.image_studio import DEFAULT_DOODLE_STYLE_PROMPT
    from app.services.image_gen import build_full_image_prompt
    from app.services.storyboard_shots import compile_scene_prompt

    # 1. Preset is clean
    assert "Full bleed" not in DEFAULT_DOODLE_STYLE_PROMPT
    assert "16:9" not in DEFAULT_DOODLE_STYLE_PROMPT
    assert "No 3D CGI" not in DEFAULT_DOODLE_STYLE_PROMPT

    # 2. Kitchen scene in explainer mode (no character)
    kitchen_loc = [
        {
            "id": "dapur_rumah",
            "name": "Dapur Rumah",
            "environment_anchor": "Wide domestic kitchen with warm wooden cabinetry, tiled backsplash, gas stove with blue flame",
            "focal_props": "cast-iron skillet, wooden chopping board",
            "ambient_life": "steam curling from skillet, drifting cooking smoke",
            "lighting_direction": "warm tungsten pendant light from upper right",
        }
    ]
    raw_kitchen_scene = {
        "shot_type": "wide",
        "camera_angle": "high_angle",
        "location_id": "dapur_rumah",
        "subjects": [],
        "visual_action": "three heavy plates sliding across a long wooden dining table with sizzling steak, burger, and rendang",
        "environment_detail": "cook silhouette flipping steak at stove in background, hanging pots and steam",
        "lighting_time": "warm tungsten amber pendant light from upper right",
    }
    compiled_prompt = compile_scene_prompt(raw_kitchen_scene, characters=[], locations=kitchen_loc)

    # Must NOT have Full-bleed 16:9
    assert "Full-bleed 16:9" not in compiled_prompt
    assert "16:9" not in compiled_prompt

    # 3. Variable resolution with style
    resolved = resolve_prompt_variables(
        compiled_prompt,
        characters=[],
        locations=kitchen_loc,
        preset_master_prompt=DEFAULT_DOODLE_STYLE_PROMPT,
        shot_metadata={"spatial_blocking": "Expansive landscape composition with depth layers and atmospheric haze"},
    )
    # Must NOT have hallucinated outdoor landscape blocking
    assert "Expansive landscape" not in resolved
    assert "atmospheric haze" not in resolved
    assert "Full-bleed" not in resolved

    # 4. Final generation prompt
    final_prompt = build_full_image_prompt(resolved, DEFAULT_DOODLE_STYLE_PROMPT)
    # Style must be front-loaded
    assert final_prompt.lower().startswith("minimalist stickman doodle art style")
    # Action must be prominent
    assert "three heavy plates sliding" in final_prompt.lower()
    # Must be concise (< 135 words, well below the previous 250+ word bloat)
    assert len(final_prompt.split()) < 135

