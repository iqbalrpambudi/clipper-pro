from app.services.bgm import available_moods, bgm_dir, pick_track


def test_pick_track_by_mood():
    calm = bgm_dir() / "calm"
    calm.mkdir()
    for name in ("a.mp3", "b.mp3", "notes.txt"):
        (calm / name).write_bytes(b"x")
    (bgm_dir() / "empty").mkdir()

    assert available_moods() == ["calm"]
    track = pick_track("calm", "project-1")
    assert track.suffix == ".mp3"
    assert pick_track("calm", "project-1") == track  # stable across re-renders
    assert pick_track(None, "project-1") is None
    assert pick_track("missing", "project-1") is None
    assert pick_track("../calm", "project-1") == track  # traversal stripped to folder name


def test_track_credit():
    from pathlib import Path
    from app.services.bgm import track_credit

    assert track_credit(Path("Limujii - Cloud (freetouse.com).mp3")) == \
        "Music from Free To Use\nSource: https://freetouse.com/music\nCloud by Limujii"
    assert track_credit(Path("pixabay-track.mp3")) is None
    assert track_credit(None) is None
