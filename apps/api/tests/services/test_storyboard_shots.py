import pytest
from app.services.storyboard_shots import (
    classify_beat_type,
    plan_shot_variety,
    compile_scene_prompt,
    storyboard_quality_metrics,
    normalize_subjects,
    ALL_SHOT_TYPES,
)


def test_classify_beat_type():
    assert classify_beat_type("Matahari mulai terbenam di atas kota tua.", has_character=False) == "general_explainer"
    assert classify_beat_type('"Tunggu aku di sini!" serunya dengan panik.', has_character=True) == "dialogue"
    assert classify_beat_type('"Apakah kau yakin jalan ini aman?" tanya Budi.', has_character=True) == "dialogue"
    assert classify_beat_type("Budi terdiam kaget menatap surat itu.", has_character=True) == "reaction"
    assert classify_beat_type("Pada abad ke-16, rempah-rempah diperdagangkan secara luas.", has_character=False) == "general_explainer"
    assert classify_beat_type("Awal mula kisah di desa.", has_character=True, is_first=True) == "establishing"


def test_plan_shot_variety_limits_closeups_and_consecutive_types():
    raw_scenes = [
        {"shot_type": "close_up", "beat_type": "world_building", "scene_group_id": "grp1"},
        {"shot_type": "close_up", "beat_type": "dialogue", "scene_group_id": "grp1"},
        {"shot_type": "close_up", "beat_type": "reaction", "scene_group_id": "grp1"},
        {"shot_type": "close_up", "beat_type": "action", "scene_group_id": "grp1"},
        {"shot_type": "close_up", "beat_type": "dialogue", "scene_group_id": "grp2"},
    ]
    planned = plan_shot_variety(raw_scenes)

    # 1. Opener of grp1 must be establishing_wide or wide
    assert planned[0]["shot_type"] in {"establishing_wide", "wide"}

    # 2. Opener of grp2 must be establishing_wide or wide
    assert planned[4]["shot_type"] in {"establishing_wide", "wide"}

    # 3. No consecutive close-ups
    for i in range(len(planned) - 1):
        if planned[i]["shot_type"] in {"close_up", "extreme_closeup"}:
            assert planned[i + 1]["shot_type"] not in {"close_up", "extreme_closeup"}


def test_compile_scene_prompt_builds_dynamic_comic_description():
    scene = {
        "location_id": "kota_agrabah",
        "subjects": normalize_subjects([{"char_id": "aladin", "pose": "melompat di atas genteng bata merah", "expression": "confident grin"}]),
        "visual_action": "Aladin melompat di atas genteng bata merah menghindari kejaran prajurit",
        "environment_detail": "atap rumah kota gurun dengan kubah emas berkilau di kejauhan",
        "shot_type": "wide",
        "camera_angle": "low_angle",
        "lighting_time": "cahaya sore terik dengan bayangan kontras tajam",
        "composition": "diagonal dynamic comic framing, sense of high momentum",
    }
    characters = [
        {
            "id": "aladin",
            "name": "Aladin",
            "face_head_anchor": "young man with tousled black hair and mischievous grin",
            "outfit_body_anchor": "purple sleeveless vest, cream harem pants, red sash",
            "visual_anchor": "young agile desert thief",
        }
    ]
    locations = [
        {
            "id": "kota_agrabah",
            "name": "Kota Agrabah",
            "environment_anchor": "ancient desert city bazaar with clay buildings",
            "lighting_direction": "golden sunset light",
        }
    ]

    prompt = compile_scene_prompt(
        scene=scene,
        characters=characters,
        locations=locations,
    )

    assert "[char:aladin]" in prompt
    assert "[loc:kota_agrabah]" in prompt
    assert "melompat di atas genteng" in prompt
    assert "Low-angle perspective looking up" in prompt
    assert "Setting details: atap rumah kota gurun" in prompt
    assert "Composition: diagonal dynamic comic framing" in prompt
    assert "Full-bleed 16:9" not in prompt
    assert "16:9" not in prompt
    assert prompt.startswith("[preset:style]. Wide shot showing full bodies")


def test_compile_scene_prompt_explainer_without_characters():
    scene = {
        "beat_type": "general_explainer",
        "subjects": [],
        "visual_action": "selembar peta kuno dengan rute kapal layar terbentang di atas meja kayu",
        "environment_detail": "ruang navigasi kapal kayu yang temaram dengan kompas kuningan",
        "shot_type": "high_angle_overview",
        "lighting_time": "cahaya lilin temaram",
    }
    prompt = compile_scene_prompt(
        scene=scene,
        characters=[{"id": "budi", "name": "Budi", "visual_anchor": "man in suit"}],
        locations=[],
    )
    # Budi should NOT be in the prompt because subjects was empty!
    assert "[char:budi]" not in prompt
    assert "man in suit" not in prompt
    assert "peta kuno" in prompt
    assert "ruang navigasi" in prompt


def test_storyboard_quality_metrics():
    scenes = [
        {"shot_type": "establishing_wide"},
        {"shot_type": "medium"},
        {"shot_type": "medium_two_shot"},
        {"shot_type": "close_up"},
        {"shot_type": "wide"},
    ]
    metrics = storyboard_quality_metrics(scenes)
    assert metrics["scenes"] == 5
    assert metrics["closeup_ratio"] == 0.2
    assert metrics["adjacent_face_shots"] == 0
    assert metrics["max_same_shot_run"] == 1
