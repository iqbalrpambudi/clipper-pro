import json
from unittest.mock import AsyncMock

import pytest

from app.schemas.image_preset import StudioAnalyzeRequest, StudioTestGenerateRequest
from app.services import image_studio


@pytest.mark.asyncio
async def test_analyze_visual_style_from_text():
    result = await image_studio.analyze_visual_style(
        user_text="Minimalist stickman doodle ink sketch on parchment",
    )

    assert result["preset_type"] == "style"
    assert "stickman doodle" in result["master_prompt"].lower() or "doodle" in result["master_prompt"].lower()
    assert "Widescreen 16:9" not in result["master_prompt"]
    assert "Apply this visual treatment only" not in result["master_prompt"]
    assert "palette" in result["style_attributes"]


@pytest.mark.asyncio
async def test_analyze_visual_style_from_multiple_reference_images(monkeypatch, tmp_path):
    ref1 = tmp_path / "ref1.png"
    ref1.write_bytes(b"image1")
    ref2 = tmp_path / "ref2.jpg"
    ref2.write_bytes(b"image2")

    adapter = AsyncMock()
    adapter.analyze_multimodal.return_value = json.dumps(
        {
            "name": "Vintage Watercolor",
            "category": "watercolor",
            "preset_type": "style",
            "description": "Gaya cat air vintage dengan garis tinta lembut.",
            "master_prompt": "Vintage hand-painted watercolor illustration with delicate sepia ink outlines and soft paper washes.",
            "negative_prompt": "Photorealism, 3D CGI, glossy digital gradient.",
            "style_attributes": {
                "medium": "Watercolor and ink",
                "palette": ["Sepia (#704214)", "Ochre (#CC7722)"],
            },
        }
    )
    monkeypatch.setattr(
        image_studio, "get_active_vision_adapter", AsyncMock(return_value=adapter)
    )

    result = await image_studio.analyze_visual_style(
        user_text="Warm vintage feeling",
        reference_image_paths=[str(ref1), str(ref2)],
        db=object(),
    )

    assert adapter.analyze_multimodal.called
    kwargs = adapter.analyze_multimodal.await_args.kwargs
    assert kwargs["image_paths"] == [str(ref1), str(ref2)]
    assert "2 reference image(s) provided" in kwargs["prompt"]
    assert "Widescreen 16:9" not in result["master_prompt"]
    assert result["master_prompt"] == "Vintage hand-painted watercolor illustration with delicate sepia ink outlines and soft paper washes."
    assert result["name"] == "Vintage Watercolor"


@pytest.mark.asyncio
async def test_analyze_visual_style_empty_text_with_images(monkeypatch, tmp_path):
    ref = tmp_path / "ref.webp"
    ref.write_bytes(b"webpdata")

    adapter = AsyncMock()
    adapter.analyze_multimodal.return_value = json.dumps(
        {
            "name": "Anime Cel Style",
            "category": "anime",
            "preset_type": "style",
            "description": "Gaya cel shading anime klasik.",
            "master_prompt": "Classic 90s anime cel shading illustration style with bold black lineart.",
            "negative_prompt": "3D render, photorealistic.",
            "style_attributes": {},
        }
    )
    monkeypatch.setattr(
        image_studio, "get_active_vision_adapter", AsyncMock(return_value=adapter)
    )

    result = await image_studio.analyze_visual_style(
        user_text="",
        reference_image_paths=[str(ref)],
        db=object(),
    )

    assert result["name"] == "Anime Cel Style"
    assert "90s anime cel shading" in result["master_prompt"]


@pytest.mark.asyncio
async def test_generate_preset_test_image_forwards_negative_prompt(monkeypatch, tmp_path):
    generated = ("preview.png", "/storage/presets/preview.png")
    generate = AsyncMock(return_value=generated)
    monkeypatch.setattr(image_studio, "generate_image_to_path", generate)
    monkeypatch.setattr(image_studio.storage, "get_presets_dir", lambda: tmp_path)

    result = await image_studio.generate_preset_test_image(
        master_prompt="Ink illustration",
        negative_prompt="No photorealism",
        scene_prompt="A fox reading",
    )

    assert result == generated
    assert generate.await_args.kwargs["prompt"] == "A fox reading"
    assert generate.await_args.kwargs["style_prompt"] == "Ink illustration"
    assert generate.await_args.kwargs["negative_prompt"] == "No photorealism"
    assert generate.await_args.kwargs["size"] == "1792x1024"


def test_art_studio_api_schemas_support_multiple_images():
    analysis = StudioAnalyzeRequest(
        user_text="",
        reference_image_urls=["/storage/presets/1.png", "/storage/presets/2.png"],
    )
    assert len(analysis.reference_image_urls) == 2
    assert analysis.preset_type == "style"


def test_art_studio_api_schemas_requires_text_or_image():
    with pytest.raises(ValueError):
        StudioAnalyzeRequest(user_text="")
