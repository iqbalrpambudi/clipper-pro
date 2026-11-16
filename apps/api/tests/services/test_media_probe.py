import subprocess

from app.services.media_probe import probe


def _ffmpeg(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def test_probe_video_with_audio(tmp_path):
    out = tmp_path / "v.mp4"
    _ffmpeg("-f", "lavfi", "-i", "testsrc=size=320x240:duration=2:rate=25",
            "-f", "lavfi", "-i", "sine=f=440:sample_rate=48000:duration=2",
            "-c:v", "libx264", "-c:a", "aac", "-ac", "2", "-shortest", str(out))
    info = probe(out)
    assert (info["width"], info["height"], info["fps"]) == (320, 240, 25.0)
    assert info["has_audio"] and info["sample_rate"] == 48000 and info["channels"] == 2
    assert abs(info["duration"] - 2.0) < 0.05


def test_probe_mp3_duration_excludes_encoder_padding(tmp_path):
    # Container metadata overshoots MP3 length by the encoder padding; decoded samples must not
    out = tmp_path / "a.mp3"
    _ffmpeg("-f", "lavfi", "-i", "sine=f=440:sample_rate=24000:duration=3",
            "-ac", "1", "-c:a", "libmp3lame", str(out))
    info = probe(out)
    assert info["has_audio"] and info["width"] == 0
    assert info["sample_rate"] == 24000 and info["channels"] == 1
    assert abs(info["duration"] - 3.0) < 0.01
