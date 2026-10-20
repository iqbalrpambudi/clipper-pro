import cv2
import numpy as np

from app.services.image_gen import strip_bars_and_ensure_16_9


def test_strip_bars_and_ensure_16_9_letterbox():
    # Image with black letterbox bars top and bottom
    img = np.random.randint(60, 200, (1080, 1920, 3), dtype=np.uint8)
    img[:80, :] = 0
    img[-80:, :] = 0
    _, enc = cv2.imencode(".png", img)
    out_bytes = strip_bars_and_ensure_16_9(enc.tobytes())
    res = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    assert res.shape == (1080, 1920, 3)
    assert np.mean(res[:10, :]) > 40
    assert np.mean(res[-10:, :]) > 40


def test_strip_bars_and_ensure_16_9_white_bars():
    # Image with white bars top and bottom
    img = np.random.randint(60, 200, (1080, 1920, 3), dtype=np.uint8)
    img[:60, :] = 255
    img[-60:, :] = 255
    _, enc = cv2.imencode(".png", img)
    out_bytes = strip_bars_and_ensure_16_9(enc.tobytes())
    res = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    assert res.shape == (1080, 1920, 3)
    assert np.mean(res[:10, :]) < 220
    assert np.mean(res[-10:, :]) < 220


def test_strip_bars_and_ensure_16_9_square_crop():
    # Square image 1024x1024
    img = np.random.randint(60, 200, (1024, 1024, 3), dtype=np.uint8)
    _, enc = cv2.imencode(".png", img)
    out_bytes = strip_bars_and_ensure_16_9(enc.tobytes())
    res = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    assert res.shape == (1080, 1920, 3)
    assert np.mean(res[:10, :]) > 40
    assert np.mean(res[:, :10]) > 40


def test_strip_bars_and_ensure_16_9_pillarbox():
    # Pillarbox (black bars on left and right)
    img = np.random.randint(60, 200, (1080, 1920, 3), dtype=np.uint8)
    img[:, :120] = 0
    img[:, -120:] = 0
    _, enc = cv2.imencode(".png", img)
    out_bytes = strip_bars_and_ensure_16_9(enc.tobytes())
    res = cv2.imdecode(np.frombuffer(out_bytes, np.uint8), cv2.IMREAD_COLOR)
    assert res.shape == (1080, 1920, 3)
    assert np.mean(res[:, :10]) > 40
    assert np.mean(res[:, -10:]) > 40
