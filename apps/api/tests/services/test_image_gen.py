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


def test_build_full_image_prompt_strips_meta_and_frontloads_style():
    from app.services.image_gen import build_full_image_prompt

    verbose_preset_prompt = (
        "Widescreen 16:9 landscape aspect ratio. "
        "A storyboard illustration combining a cohesive visual style with a recognizable character based on Doodle stickman vintage parchment watercolor. "
        "Preserve the defined character traits, proportions, face, clothing, palette, and signature details within the described artistic medium. "
        "Use a clear storytelling composition with balanced negative space. No text artifacts, no blurry details."
    )
    user_scene = (
        "Full-bleed 16:9 wide high-angle shot at [loc:dapur_rumah]. "
        "Three heavy plates sliding across a dining table, cook silhouette flipping steak at stove with steam."
    )

    final = build_full_image_prompt(user_scene, verbose_preset_prompt)

    # 1. Meta-instructions must be stripped
    assert "A storyboard illustration combining" not in final
    assert "Preserve the defined character traits" not in final
    assert "balanced negative space" not in final

    # 2. Art style must be front-loaded in the first 60 chars
    assert final.lower().startswith("doodle stickman vintage parchment watercolor")

    # 3. 40-word verbose aspect ratio boilerplate must NOT be prepended
    assert "completely filling the entire 16:9 frame without letterbox" not in final
    assert "full-bleed" not in final.lower()
    assert "16:9" not in final

    # 4. Cook silhouette should be reinforced as minimalist stickman cook silhouette
    assert "stickman cook" in final.lower()

