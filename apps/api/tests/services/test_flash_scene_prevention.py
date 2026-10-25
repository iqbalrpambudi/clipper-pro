import pytest

from app.services.matching import (
    _get_scene_usable_range,
    build_visual_shot_windows,
    match_scenes_to_segments,
    verify_and_heal_timeline_clips,
)
from app.services.scene_detector import (
    group_shots_into_scenes,
)


def test_group_shots_into_scenes_merges_flash_cuts():
    # Video 12s with shots:
    # Shot A: 0.0 - 4.0 (4.0s) -> anchor
    # Shot B: 4.0 - 4.6 (0.6s) -> flash
    # Shot C: 4.6 - 5.1 (0.5s) -> flash
    # Shot D: 5.1 - 12.0 (6.9s) -> anchor
    cuts = [4.0, 4.6, 5.1]
    scenes = group_shots_into_scenes(cuts, total_duration=12.0, fps=30.0, hard_cuts=True)

    assert len(scenes) >= 1
    # Check that usable_ranges does not contain the 0.6s or 0.5s shots
    for sc in scenes:
        shot_info = sc["shot_info"]
        for r_start, r_end in shot_info["usable_ranges"]:
            assert (r_end - r_start) >= 1.0
            # Ensure the cut points 4.6 and 5.1 are NOT inside any usable range
            assert not (r_start < 4.6 < r_end)
            assert not (r_start < 5.1 < r_end)


def test_get_scene_usable_range_picks_single_contiguous_shot():
    scene = {
        "id": "scene-1",
        "start_time": 0.0,
        "end_time": 10.0,
        "duration": 10.0,
        "shot_info": {
            "version": 1,
            "internal_cuts": [3.5, 4.0],
            "usable_ranges": [[0.12, 3.35], [4.12, 9.85]],
            "usable_duration": 5.73,
            "montage": False,
        },
    }

    # For a target duration of 2.5s, it should pick the range [4.12, 9.85] or [0.12, 3.35]
    start, end, dur, is_montage = _get_scene_usable_range(scene, target_duration=2.5)
    assert not is_montage
    assert dur >= 2.5
    # Must be completely inside one of the safe ranges:
    in_range1 = (0.12 <= start and end <= 3.35)
    in_range2 = (4.12 <= start and end <= 9.85)
    assert in_range1 or in_range2
    # Crucially, cut at 3.5 and 4.0 must NOT be inside [start, end]
    assert not (start < 3.5 < end)
    assert not (start < 4.0 < end)


def test_verify_and_heal_timeline_clips_eliminates_micro_clips():
    raw_clips = [
        {
            "id": "c1",
            "timeline_start": 0.0,
            "timeline_end": 3.0,
            "clip_start": 1.0,
            "clip_end": 4.0,
            "speed": 1.0,
            "text": "Kalimat pertama.",
        },
        {
            "id": "c2",
            "timeline_start": 3.0,
            "timeline_end": 3.8,  # only 0.8s! Flash clip
            "clip_start": 5.0,
            "clip_end": 5.8,
            "speed": 1.0,
            "text": "dan ini cepat.",
        },
        {
            "id": "c3",
            "timeline_start": 3.8,
            "timeline_end": 7.0,
            "clip_start": 10.0,
            "clip_end": 13.2,
            "speed": 1.0,
            "text": "Kalimat ketiga.",
        },
    ]

    healed = verify_and_heal_timeline_clips(raw_clips, min_clip_dur=1.8)
    assert len(healed) == 2  # c2 merged into c1
    # Check continuity
    assert healed[0]["timeline_start"] == 0.0
    assert healed[0]["timeline_end"] == 3.8
    assert healed[1]["timeline_start"] == 3.8
    assert healed[1]["timeline_end"] == 7.0
    # Every clip on timeline is >= 1.8s
    for c in healed:
        assert (c["timeline_end"] - c["timeline_start"]) >= 1.8


@pytest.mark.asyncio
async def test_match_scenes_to_segments_no_flash_scenes():
    class DummyAdapter:
        async def generate_embedding(self, text: str):
            return [0.1] * 768

    segments = [
        {"id": "s1", "start_ms": 0, "end_ms": 2500, "text": "Halo teman-teman sekalian."},
        {"id": "s2", "start_ms": 2500, "end_ms": 5200, "text": "Hari ini kita belajar anti flash cut."},
        {"id": "s3", "start_ms": 5200, "end_ms": 8000, "text": "Hasilnya rapi dan sangat presisi."},
    ]

    # Scene with internal flash cuts
    scenes = [
        {
            "id": "sc-1",
            "source_video_id": "vid-1",
            "start_time": 0.0,
            "end_time": 6.0,
            "duration": 6.0,
            "description": "Pemandangan alam yang indah",
            "tags": ["nature"],
            "embedding": [0.1] * 768,
            "shot_info": {
                "version": 1,
                "internal_cuts": [2.0, 2.5],
                "usable_ranges": [[0.12, 1.85], [2.62, 5.85]],
                "usable_duration": 3.23,
                "montage": False,
            },
        },
        {
            "id": "sc-2",
            "source_video_id": "vid-1",
            "start_time": 6.0,
            "end_time": 14.0,
            "duration": 8.0,
            "description": "Perkotaan megah",
            "tags": ["city"],
            "embedding": [0.1] * 768,
            "shot_info": {
                "version": 1,
                "internal_cuts": [],
                "usable_ranges": [[6.12, 13.85]],
                "usable_duration": 7.73,
                "montage": False,
            },
        },
    ]

    adapter = DummyAdapter()
    clips = await match_scenes_to_segments(adapter, segments, scenes, total_audio_duration_sec=8.0)

    assert len(clips) >= 1
    # Check that EVERY clip on timeline is at least 1.8 seconds (no flash scenes)
    for c in clips:
        dur = round(c["timeline_end"] - c["timeline_start"], 2)
        assert dur >= 1.8, f"Clip {c['id']} duration {dur}s is < 1.8s!"
        # If sc-1 is used, verify it didn't slice across cut at 2.0 or 2.5
        if c["scene_id"] == "sc-1":
            cs = c["clip_start"]
            ce = c["clip_end"]
            assert not (cs < 2.0 < ce), f"Clip crossed internal cut at 2.0s: [{cs}, {ce}]"
            assert not (cs < 2.5 < ce), f"Clip crossed internal cut at 2.5s: [{cs}, {ce}]"


def test_dual_engine_cut_deduplication():
    from app.services.scene_detector import find_shot_cuts_ffmpeg
    import unittest.mock as mock

    # Mock PySceneDetect and FFmpeg to verify union and deduplication
    with mock.patch("app.services.scene_detector._open_video_safe") as mock_open:
        mock_video = mock.MagicMock()
        mock_video.frame_rate = 30.0
        mock_open.return_value = mock_video

        with mock.patch("scenedetect.SceneManager") as mock_sm_cls:
            mock_sm = mock.MagicMock()
            mock_sm_cls.return_value = mock_sm
            
            # PySceneDetect finds cuts at frame 30 (1.0s), 60 (2.0s), 150 (5.0s)
            mock_sc1 = (mock.MagicMock(get_frames=lambda: 0), mock.MagicMock())
            mock_sc2 = (mock.MagicMock(get_frames=lambda: 30), mock.MagicMock())
            mock_sc3 = (mock.MagicMock(get_frames=lambda: 60), mock.MagicMock())
            mock_sc4 = (mock.MagicMock(get_frames=lambda: 150), mock.MagicMock())
            mock_sm.get_scene_list.return_value = [mock_sc1, mock_sc2, mock_sc3, mock_sc4]

            # FFmpeg finds cuts at 1.001s (duplicate of 1.0s), 3.0s (new cut), 5.02s (duplicate of 5.0s)
            with mock.patch("app.services.scene_detector.find_shot_cuts_ffmpeg") as mock_ff:
                mock_ff.return_value = [1.001, 3.0, 5.02]

                from app.services.scene_detector import find_shot_cuts
                cuts, fps = find_shot_cuts("dummy.mp4")

                assert fps == 30.0
                # Merged should be: 1.0 (or 1.001), 2.0, 3.0, 5.0 (or 5.02)
                # Duplicates within 0.15s are unified!
                assert len(cuts) == 4
                assert any(abs(c - 1.0) <= 0.05 for c in cuts)
                assert any(abs(c - 2.0) <= 0.05 for c in cuts)
                assert any(abs(c - 3.0) <= 0.05 for c in cuts)
                assert any(abs(c - 5.0) <= 0.05 for c in cuts)

