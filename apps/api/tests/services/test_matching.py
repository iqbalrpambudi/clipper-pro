import pytest

from app.services.matching import (
    build_visual_shot_windows,
    match_scenes_to_segments,
    verify_and_heal_timeline_clips,
)


class _FakeAdapter:
    async def generate_embedding(self, text: str):
        return [1.0, 0.0]


def _scene(sid: str, start: float, end: float):
    return {
        "id": sid,
        "source_video_id": "vid-1",
        "start_time": start,
        "end_time": end,
        "duration": end - start,
        "description": sid,
        "tags": [],
        "transcript": "",
        "shot_info": {"usable_ranges": [[start + 0.2, end - 0.2]]},
        "embedding": [1.0, 0.0],
        "thumbnail_url": None,
    }


def test_short_tagged_sentence_merges_instead_of_flash_window():
    segments = [
        {"id": "seg-1", "text": "a", "start_ms": 0, "end_ms": 2000, "scene_id": "A"},
        {"id": "seg-2", "text": "b", "start_ms": 2000, "end_ms": 6000, "scene_id": "B"},
        {"id": "seg-3", "text": "c", "start_ms": 6000, "end_ms": 10000, "scene_id": "C"},
    ]
    windows = build_visual_shot_windows(segments, min_dur=3.5, max_dur=7.0)
    assert [w["scene_id"] for w in windows] == ["A", "C"]
    assert all(w["duration"] >= 3.5 for w in windows)


def test_tag_change_splits_once_window_clears_floor():
    segments = [
        {"id": "seg-1", "text": "a", "start_ms": 0, "end_ms": 3200, "scene_id": "A"},
        {"id": "seg-2", "text": "b", "start_ms": 3200, "end_ms": 7000, "scene_id": "B"},
    ]
    windows = build_visual_shot_windows(segments, min_dur=3.5, max_dur=7.0)
    assert [w["scene_id"] for w in windows] == ["A", "B"]


@pytest.mark.asyncio
async def test_short_scene_runs_into_next_scene_not_slowmo():
    a = _scene("A", 0, 3.0)  # usable 2.6 s
    b = _scene("B", 3.03, 9.0)
    segments = [{"id": "seg-1", "text": "satu", "start_ms": 0, "end_ms": 5000, "scene_id": "A"}]
    clips = await match_scenes_to_segments(_FakeAdapter(), segments, [a, b], total_audio_duration_sec=5.0)
    # 5 s line = tagged shot + one follow-up cut (2-3.5 s pacing), both at real speed
    assert [c["scene_id"] for c in clips] == ["A", "B"]
    assert all(c["speed"] == pytest.approx(1.0, abs=0.07) for c in clips)
    assert clips[-1]["timeline_end"] == pytest.approx(5.0, abs=0.05)


def test_heal_short_first_clip_keeps_its_scene():
    clips = [
        {"scene_id": "A", "timeline_start": 0.0, "timeline_end": 2.0, "clip_start": 10.0, "clip_end": 12.0, "speed": 1.0, "text": "a", "_safe_end": 20.0},
        {"scene_id": "B", "timeline_start": 2.0, "timeline_end": 6.0, "clip_start": 30.0, "clip_end": 34.0, "speed": 1.0, "text": "b"},
    ]
    healed = verify_and_heal_timeline_clips(clips, min_clip_dur=3.0)
    assert [c["scene_id"] for c in healed] == ["A"]
    assert healed[0]["clip_end"] == pytest.approx(16.0, abs=0.05)


@pytest.mark.asyncio
async def test_tagged_scene_wins_and_no_clip_under_3s():
    scenes = [_scene("A", 0, 12), _scene("B", 12, 24), _scene("C", 24, 36)]
    segments = [
        {"id": "seg-1", "text": "satu", "start_ms": 0, "end_ms": 4000, "scene_id": "C"},
        {"id": "seg-2", "text": "dua", "start_ms": 4000, "end_ms": 8000, "scene_id": "A"},
        {"id": "seg-3", "text": "tiga", "start_ms": 8000, "end_ms": 12000, "scene_id": "B"},
    ]
    clips = await match_scenes_to_segments(_FakeAdapter(), segments, scenes, total_audio_duration_sec=12.0)
    assert [c["scene_id"] for c in clips] == ["C", "A", "B"]
    assert all(c["timeline_end"] - c["timeline_start"] >= 3.0 for c in clips)
    assert all("_safe_end" not in c for c in clips)


def test_heal_extends_source_before_slowing():
    clips = [
        {"timeline_start": 0.0, "timeline_end": 5.0, "clip_start": 0.0, "clip_end": 5.0, "speed": 1.0, "text": "a", "_safe_end": 12.0},
        {"timeline_start": 5.0, "timeline_end": 6.5, "clip_start": 20.0, "clip_end": 21.5, "speed": 1.0, "text": "b"},
    ]
    healed = verify_and_heal_timeline_clips(clips, min_clip_dur=3.0)
    assert len(healed) == 1
    assert healed[0]["clip_end"] == pytest.approx(6.5, abs=0.05)
    assert healed[0]["speed"] == pytest.approx(1.0, abs=0.02)


def test_span_just_over_max_dur_is_not_split_into_flash_chunks():
    # 3.87 s line: two 1.93 s chunks would fall under the 2 s heal floor and get merged away.
    segments = [
        {"id": "seg-1", "text": "a", "start_ms": 0, "end_ms": 3000, "scene_id": "A"},
        {"id": "seg-2", "text": "b", "start_ms": 3000, "end_ms": 6870, "scene_id": "B"},
    ]
    windows = build_visual_shot_windows(segments, min_dur=2.0, max_dur=3.5)
    assert [w["scene_id"] for w in windows] == ["A", "B"]
    assert all(w["duration"] >= 2.0 for w in windows)


def test_heal_plays_into_next_scene_instead_of_slowmo():
    scenes = [_scene("A", 0, 5.0), _scene("B", 5.0, 20.0)]
    clips = [
        {"scene_id": "A", "timeline_start": 0.0, "timeline_end": 4.0, "clip_start": 0.5, "clip_end": 4.5, "speed": 1.0, "text": "a", "_safe_end": 4.8},
        {"scene_id": "X", "timeline_start": 4.0, "timeline_end": 9.0, "clip_start": 30.0, "clip_end": 35.0, "speed": 1.0, "text": "b"},
        {"scene_id": "Y", "timeline_start": 9.0, "timeline_end": 10.0, "clip_start": 40.0, "clip_end": 41.0, "speed": 1.0, "text": "c"},
    ]
    clips[1]["timeline_end"] = 5.5  # X is a 1.5 s flash -> absorbed into A, slot grows to 5.5 s
    clips[2]["timeline_start"] = 5.5
    clips[2]["timeline_end"] = 9.0
    healed = verify_and_heal_timeline_clips(clips, min_clip_dur=2.0, scenes=scenes)
    assert healed[0]["clip_end"] == pytest.approx(6.0, abs=0.05)
    assert healed[0]["speed"] == pytest.approx(1.0, abs=0.02)


@pytest.mark.asyncio
async def test_follow_up_cut_continues_with_next_shots_of_the_step():
    scenes = [_scene(f"S{i}", i * 6.0, i * 6.0 + 6.0) for i in range(21)]
    # Hook shot from mid-video; the second cut of the same line should be its next move, not a far shot.
    segments = [{"id": "seg-1", "text": "satu", "start_ms": 0, "end_ms": 6000, "scene_id": "S10"}]
    clips = await match_scenes_to_segments(_FakeAdapter(), segments, scenes, total_audio_duration_sec=6.0)
    assert clips[0]["scene_id"] == "S10"
    assert clips[1]["scene_id"] in {"S11", "S12", "S13"}


@pytest.mark.asyncio
async def test_follow_up_cuts_stay_inside_the_scripts_footage():
    # Script tags S2 and S6 (one chapter); S12+ is another subject later in the compilation.
    scenes = [_scene(f"S{i}", i * 6.0, i * 6.0 + 6.0) for i in range(20)]
    segments = [
        {"id": "seg-1", "text": "satu", "start_ms": 0, "end_ms": 6000, "scene_id": "S2"},
        {"id": "seg-2", "text": "dua", "start_ms": 6000, "end_ms": 12000, "scene_id": "S6"},
    ]
    clips = await match_scenes_to_segments(_FakeAdapter(), segments, scenes, total_audio_duration_sec=12.0)
    assert {c["scene_id"] for c in clips} <= {f"S{i}" for i in range(2, 7)}


@pytest.mark.asyncio
async def test_no_fresh_shot_left_plays_on_instead_of_repeating():
    # Story span S0..S2 with one free shot (S1): the second follow-up cut has only a used shot left.
    scenes = [_scene(f"S{i}", i * 6.0, i * 6.0 + 6.0) for i in range(3)]
    segments = [
        {"id": "seg-1", "text": "x", "start_ms": 0, "end_ms": 6000, "scene_id": "S0"},
        {"id": "seg-2", "text": "y", "start_ms": 6000, "end_ms": 12000, "scene_id": "S2"},
    ]
    clips = await match_scenes_to_segments(_FakeAdapter(), segments, scenes, total_audio_duration_sec=12.0)
    ids = [c["scene_id"] for c in clips]
    assert len(ids) == len(set(ids))
    assert clips[-1]["timeline_end"] == pytest.approx(12.0, abs=0.05)


@pytest.mark.asyncio
async def test_untagged_scenes_are_never_picked():
    scenes = [_scene(f"S{i}", i * 6.0, i * 6.0 + 6.0) for i in range(6)]
    for sc in scenes[1::2]:
        sc["status"] = "untagged"
    segments = [{"id": "seg-1", "text": "x", "start_ms": 0, "end_ms": 12000}]
    clips = await match_scenes_to_segments(_FakeAdapter(), segments, scenes, total_audio_duration_sec=12.0)
    assert clips and {c["scene_id"] for c in clips} <= {"S0", "S2", "S4"}
