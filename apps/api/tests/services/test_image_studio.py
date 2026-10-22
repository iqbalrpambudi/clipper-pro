import json
from unittest.mock import AsyncMock

import pytest

from app.schemas.image_preset import StudioAnalyzeRequest, StudioTestGenerateRequest
from app.services import image_studio


@pytest.mark.parametrize("preset_type", ["style", "character", "combined"])
@pytest.mark.asyncio
async def test_analyze_visual_style_preserves_preset_intent(preset_type):
    result = await image_studio.analyze_visual_style(
        user_text="A tiny fox explorer in a paper-cut style",
        preset_type=preset_type,
    )

    assert result["preset_type"] == preset_type
    assert result["style_attributes"]["preset_type"] == preset_type
    if preset_type == "character":
        assert "full-body character design" in result["master_prompt"]
    if preset_type == "combined":
        assert "combining a cohesive visual style" in result["master_prompt"]


@pytest.mark.asyncio
async def test_style_reference_only_informs_visual_treatment(monkeypatch, tmp_path):
    reference = tmp_path / "reference.png"
    reference.write_bytes(b"reference")
    adapter = AsyncMock()
    adapter.analyze_multimodal.return_value = json.dumps(
        {
            "master_prompt": "A clean ink-and-watercolor illustration style.",
            "negative_prompt": "No photorealism.",
            "style_attributes": {},
        }
    )
    monkeypatch.setattr(
        image_studio, "get_active_vision_adapter", AsyncMock(return_value=adapter)
    )

    result = await image_studio.analyze_visual_style(
        user_text="Clean ink outlines and warm watercolor",
        preset_type="style",
        reference_image_path=str(reference),
        db=object(),
    )

    analysis_prompt = adapter.analyze_multimodal.await_args.kwargs["prompt"]
    assert "style-only" in analysis_prompt
    assert "must not be copied from the reference" in analysis_prompt
    assert "background, and composition from the scene prompt" in result["master_prompt"]
    assert "clean contours" in result["master_prompt"]
    assert "film grain" in result["negative_prompt"]
    assert "random noise" in result["negative_prompt"]


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


def test_art_studio_api_schemas_keep_old_payloads_compatible():
    analysis = StudioAnalyzeRequest(user_text="A watercolor fox")
    test_generation = StudioTestGenerateRequest(master_prompt="Watercolor")

    assert analysis.preset_type == "style"
    assert test_generation.negative_prompt is None


def test_art_studio_api_schemas_reject_unknown_preset_types():
    with pytest.raises(ValueError):
        StudioAnalyzeRequest(user_text="A fox", preset_type="animal")
