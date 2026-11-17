from datetime import datetime

import pytest
from pydantic import ValidationError

from app.models.autopilot import AutopilotRun
from app.schemas.autopilot import AutopilotConfigIn
from app.services.autopilot import (
    clean_title,
    due_production_windows,
    free_publish_slots,
    is_quota_error,
    pick_category,
    tag_coverage,
    upcoming_slots,
)

WIB = 420
WINDOWS = [{"time": "12:00", "count": 2}, {"time": "18:00", "count": 2}]


def test_upcoming_slots_converts_wib_to_utc_and_skips_past():
    now = datetime(2026, 11, 15, 11, 4)  # 18:04 WIB
    slots = upcoming_slots(["07:00", "17:00"], WIB, now, days=2)
    # today's 07:00 & 17:00 WIB are past; tomorrow 07:00 WIB = 00:00 UTC
    assert slots == [datetime(2026, 11, 16, 0, 0), datetime(2026, 11, 16, 10, 0)]


def test_upcoming_slots_handles_local_date_ahead_of_utc():
    now = datetime(2026, 11, 15, 20, 0)  # 03:00 WIB on the 16th
    assert upcoming_slots(["07:00"], WIB, now, days=1) == [datetime(2026, 11, 16, 0, 0)]


def test_free_publish_slots_window_and_taken():
    now = datetime(2026, 11, 15, 23, 55)  # 06:55 WIB
    s_soon, s2, s3 = datetime(2026, 11, 16, 0, 0), datetime(2026, 11, 16, 10, 0), datetime(2026, 11, 17, 0, 0)
    slots = [s_soon, s2, s3]
    # s_soon is 5 min away: too late for publishAt; s3 is beyond 24h
    assert free_publish_slots(slots, set(), now, 24) == [s2]
    assert free_publish_slots(slots, {s2}, now, 24) == []
    assert free_publish_slots(slots, set(), now, 48) == [s2, s3]


def test_due_production_windows_once_per_day_with_catch_up():
    morning = datetime(2026, 11, 16, 4, 0)  # 11:00 WIB
    assert due_production_windows(WINDOWS, {}, morning, WIB) == []
    noon = datetime(2026, 11, 16, 5, 0)  # 12:00 WIB
    assert due_production_windows(WINDOWS, {}, noon, WIB) == [WINDOWS[0]]
    assert due_production_windows(WINDOWS, {"12:00": "2026-11-16"}, noon, WIB) == []
    # API was down all afternoon: at 20:00 both windows are due
    evening = datetime(2026, 11, 16, 13, 0)
    assert due_production_windows(WINDOWS, {}, evening, WIB) == WINDOWS
    # yesterday's marker does not block today
    assert due_production_windows(WINDOWS, {"12:00": "2026-11-15", "18:00": "2026-11-16"}, evening, WIB) == [WINDOWS[0]]


def test_quota_error_detection():
    assert is_quota_error("TTS gagal: 429 RESOURCE_EXHAUSTED: You exceeded your current quota")
    assert is_quota_error("Gemini TTS HTTP 429")
    assert not is_quota_error("Render gagal: ffmpeg exited 1")
    assert not is_quota_error("Tidak ada footage untuk query: x")


def test_pick_category_rotates_least_recent():
    recent = [AutopilotRun(category="farming"), AutopilotRun(category="craft")]  # newest first
    assert pick_category(["farming", "craft", "food"], recent) == "food"
    assert pick_category(["farming", "craft"], recent) == "craft"


def test_clean_title():
    assert clean_title("Rahasia <Kakao> #Shorts") == "Rahasia Kakao #shorts"
    assert len(clean_title("x" * 200)) <= 100


def test_config_validation():
    base = {"enabled": True, "niche": "fakta unik pertanian", "categories": ["farming"],
            "utc_offset_minutes": WIB, "pool_size": 4, "publish_ahead_hours": 24}
    cfg = AutopilotConfigIn(**base, slots=["17:00", "07:00", "07:00"], production_windows=WINDOWS[::-1])
    assert cfg.slots == ["07:00", "17:00"]
    assert [w.time for w in cfg.production_windows] == ["12:00", "18:00"]
    with pytest.raises(ValidationError):
        AutopilotConfigIn(**base, slots=["25:00"], production_windows=WINDOWS)
    with pytest.raises(ValidationError):
        AutopilotConfigIn(**base, slots=["07:00"], production_windows=[WINDOWS[0], WINDOWS[0]])


def test_tag_coverage_weights_by_duration():
    scenes = [
        {"duration": 9.0, "status": "ready"},
        {"duration": 1.0, "status": "untagged"},
        {"duration": 0.5, "status": "untagged"},
    ]
    assert tag_coverage(scenes) == pytest.approx(9 / 10.5)
    assert tag_coverage([]) == 0.0
