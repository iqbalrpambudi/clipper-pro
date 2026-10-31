import pytest
from app.models.config import ModelConfig
from app.services.image_gen import resolve_image_credentials
from app.core.security import encrypt_secret, decrypt_secret


def test_resolve_image_credentials_runware():
    cfg = ModelConfig(
        image_provider="runware",
        image_model="runware:100@1",
        runware_api_key_encrypted=encrypt_secret("runware-secret-key-123"),
        image_api_key_encrypted=encrypt_secret("custom-secret-key-456"),
    )
    base_url, api_key, model = resolve_image_credentials(cfg)
    assert base_url == "https://api.runware.ai/v1"
    assert api_key == "runware-secret-key-123"
    assert model == "runware:100@1"


def test_resolve_image_credentials_custom_endpoint():
    cfg = ModelConfig(
        image_provider="custom",
        image_base_url="https://api.openai.com/v1",
        image_model="dall-e-3",
        runware_api_key_encrypted=encrypt_secret("runware-secret-key-123"),
        image_api_key_encrypted=encrypt_secret("custom-secret-key-456"),
    )
    base_url, api_key, model = resolve_image_credentials(cfg)
    assert base_url == "https://api.openai.com/v1"
    assert api_key == "custom-secret-key-456"
    assert model == "dall-e-3"


def test_keys_independent_preservation():
    cfg = ModelConfig(
        image_provider="runware",
        runware_api_key_encrypted=encrypt_secret("key-runware"),
        image_api_key_encrypted=encrypt_secret("key-custom"),
    )
    assert decrypt_secret(cfg.runware_api_key_encrypted) == "key-runware"
    assert decrypt_secret(cfg.image_api_key_encrypted) == "key-custom"


def test_flux_schnell_sampling_and_guidance_defaults():
    cfg = ModelConfig(
        image_provider="runware",
        image_model="runware:100@1",
        image_steps=5,
        image_cfg_scale=3.5,
    )
    assert cfg.image_steps == 5
    assert cfg.image_cfg_scale == 3.5


@pytest.mark.asyncio
async def test_generate_image_to_path_uses_configured_steps(tmp_path, monkeypatch):
    from unittest.mock import AsyncMock, patch
    from app.services import image_gen

    captured_payload = []

    async def mock_post(url, headers=None, json=None):
        captured_payload.extend(json)
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: {
            "data": [{"imageURL": "https://example.com/fake.png"}]
        }
        return mock_resp

    async def mock_get(url):
        mock_dl = AsyncMock()
        mock_dl.status_code = 200
        # 16:9 16x9 png dummy or 1x1 png
        import base64
        # 1x1 png
        mock_dl.content = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        return mock_dl

    out_file = tmp_path / "test.png"

    with patch("httpx.AsyncClient.post", side_effect=mock_post), \
         patch("httpx.AsyncClient.get", side_effect=mock_get):
        await image_gen.generate_image_to_path(
            prompt="A dramatic scene",
            out_file=out_file,
            base_url="https://api.runware.ai/v1",
            api_key="fake-key",
            model="runware:101@1",
            steps=10,
            guidance_scale=3.5,
        )

    assert len(captured_payload) == 1
    task = captured_payload[0]
    assert task["steps"] == 10
    assert task["CFGScale"] == 3.5
    assert task["model"] == "runware:101@1"
    assert task["includeCost"] is True
    assert task["outputFormat"] == "WEBP"


def test_resolve_image_credentials_default_runware_model():
    cfg = ModelConfig(
        image_provider="runware",
        image_model="runware:400@2",
    )
    base_url, api_key, model = resolve_image_credentials(cfg)
    assert model == "runware:400@2"


@pytest.mark.asyncio
async def test_resolution_defaults_and_landscape_16_9(tmp_path):
    from unittest.mock import AsyncMock, patch
    import base64
    from app.services import image_gen

    captured = []

    async def mock_post(url, headers=None, json=None):
        captured.append(json)
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: {
            "data": [{"imageURL": "https://example.com/fake.png", "cost": 0.001}]
        }
        return mock_resp

    async def mock_get(url):
        mock_dl = AsyncMock()
        mock_dl.status_code = 200
        mock_dl.content = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        return mock_dl

    out_file1 = tmp_path / "square.png"
    out_file2 = tmp_path / "landscape.png"

    with patch("httpx.AsyncClient.post", side_effect=mock_post), \
         patch("httpx.AsyncClient.get", side_effect=mock_get):
        # 1. Default non-16:9 -> 1024x1024
        await image_gen.generate_image_to_path(
            prompt="Square test",
            out_file=out_file1,
            base_url="https://api.runware.ai/v1",
            api_key="fake-key",
            model="runware:400@2",
            size="1024x1024",
        )
        # 2. 16:9 Landscape -> 1366x768
        await image_gen.generate_image_to_path(
            prompt="Landscape 16:9 test",
            out_file=out_file2,
            base_url="https://api.runware.ai/v1",
            api_key="fake-key",
            model="runware:400@2",
            size="1366x768",
        )

    assert len(captured) == 2
    task1 = captured[0][0]
    assert task1["width"] == 1024
    assert task1["height"] == 1024
    assert task1["includeCost"] is True
    assert task1["outputFormat"] == "WEBP"

    task2 = captured[1][0]
    assert task2["width"] == 1366
    assert task2["height"] == 768
    assert task2["includeCost"] is True
    assert task2["outputFormat"] == "WEBP"



@pytest.mark.asyncio
async def test_recraft_omits_unsupported_parameters(tmp_path):
    from unittest.mock import AsyncMock, patch
    import base64
    from app.services import image_gen

    captured_payload = []

    async def mock_post(url, headers=None, json=None):
        captured_payload.append(json)
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: {
            "data": [{"imageURL": "https://example.com/fake.png"}]
        }
        return mock_resp

    async def mock_get(url):
        mock_dl = AsyncMock()
        mock_dl.status_code = 200
        mock_dl.content = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        return mock_dl

    out_file = tmp_path / "recraft_test.png"

    with patch("httpx.AsyncClient.post", side_effect=mock_post), \
         patch("httpx.AsyncClient.get", side_effect=mock_get):
        await image_gen.generate_image_to_path(
            prompt="Clean vector explainer",
            negative_prompt="blurry, text, ugly",
            out_file=out_file,
            base_url="https://api.runware.ai/v1",
            api_key="fake-key",
            model="recraft:v4.1@flash",
            steps=10,
            guidance_scale=3.5,
        )

    assert len(captured_payload) == 1
    task = captured_payload[0][0]
    assert task["model"] == "recraft:v4.1@flash"
    assert "negativePrompt" not in task
    assert "steps" not in task
    assert "CFGScale" not in task


@pytest.mark.asyncio
async def test_auto_heal_unsupported_parameters_on_400(tmp_path):
    from unittest.mock import AsyncMock, patch
    import base64
    from app.services import image_gen

    import copy
    post_calls = []

    async def mock_post(url, headers=None, json=None):
        post_calls.append(copy.deepcopy(json))
        mock_resp = AsyncMock()
        if len(post_calls) == 1:
            # First attempt returns Runware 400 unsupportedParameter for seed
            mock_resp.status_code = 400
            mock_resp.json = lambda: {
                "errors": [
                    {
                        "code": "unsupportedParameter",
                        "message": "Unsupported use of 'seed' parameter.",
                        "parameter": "seed",
                    }
                ]
            }
        else:
            mock_resp.status_code = 200
            mock_resp.json = lambda: {
                "data": [{"imageURL": "https://example.com/healed.png"}]
            }
        return mock_resp

    async def mock_get(url):
        mock_dl = AsyncMock()
        mock_dl.status_code = 200
        mock_dl.content = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        return mock_dl

    out_file = tmp_path / "healed.png"

    with patch("httpx.AsyncClient.post", side_effect=mock_post), \
         patch("httpx.AsyncClient.get", side_effect=mock_get):
        await image_gen.generate_image_to_path(
            prompt="Auto heal test",
            out_file=out_file,
            base_url="https://api.runware.ai/v1",
            api_key="fake-key",
            model="custom:model@1",
            seed=12345,
        )

    # Must have retried and stripped 'seed'
    assert len(post_calls) == 2
    assert "seed" in post_calls[0][0]
    assert "seed" not in post_calls[1][0]


@pytest.mark.asyncio
async def test_bfl_flux_omits_unsupported_parameters(tmp_path):
    from unittest.mock import AsyncMock, patch
    import base64
    from app.services import image_gen

    captured_payload = []

    async def mock_post(url, headers=None, json=None):
        captured_payload.append(json)
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: {
            "data": [{"imageURL": "https://example.com/bfl_fake.png"}]
        }
        return mock_resp

    async def mock_get(url):
        mock_dl = AsyncMock()
        mock_dl.status_code = 200
        mock_dl.content = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        return mock_dl

    out_file = tmp_path / "bfl_test.png"

    with patch("httpx.AsyncClient.post", side_effect=mock_post), \
         patch("httpx.AsyncClient.get", side_effect=mock_get):
        await image_gen.generate_image_to_path(
            prompt="BFL flux scene",
            negative_prompt="blurry, text, ugly",
            out_file=out_file,
            base_url="https://api.runware.ai/v1",
            api_key="fake-key",
            model="bfl:flux@3-image-klein",
            steps=10,
            guidance_scale=3.5,
        )

    assert len(captured_payload) == 1
    task = captured_payload[0][0]
    assert task["model"] == "bfl:flux@3-image-klein"
    assert "negativePrompt" not in task
    assert "steps" not in task
    assert "CFGScale" not in task


@pytest.mark.asyncio
async def test_auto_heal_multi_step_unsupported_parameters(tmp_path):
    """Test sequential rejection of CFGScale then negativePrompt, healing both across 3 attempts."""
    from unittest.mock import AsyncMock, patch
    import copy
    import base64
    from app.services import image_gen

    post_calls = []

    async def mock_post(url, headers=None, json=None):
        post_calls.append(copy.deepcopy(json))
        mock_resp = AsyncMock()
        if len(post_calls) == 1:
            # First attempt: rejected for CFGScale
            mock_resp.status_code = 400
            mock_resp.json = lambda: {
                "errors": [
                    {
                        "code": "unsupportedParameter",
                        "message": "Unsupported use of 'CFGScale' parameter.",
                        "parameter": "CFGScale",
                    }
                ]
            }
        elif len(post_calls) == 2:
            # Second attempt: rejected for negativePrompt
            mock_resp.status_code = 400
            mock_resp.json = lambda: {
                "errors": [
                    {
                        "code": "unsupportedParameter",
                        "message": "Unsupported use of 'negativePrompt' parameter.",
                        "parameter": "negativePrompt",
                    }
                ]
            }
        else:
            # Third attempt: success
            mock_resp.status_code = 200
            mock_resp.json = lambda: {
                "data": [{"imageURL": "https://example.com/multi_healed.png"}]
            }
        return mock_resp

    async def mock_get(url):
        mock_dl = AsyncMock()
        mock_dl.status_code = 200
        mock_dl.content = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        return mock_dl

    out_file = tmp_path / "multi_healed.png"

    with patch("httpx.AsyncClient.post", side_effect=mock_post), \
         patch("httpx.AsyncClient.get", side_effect=mock_get):
        await image_gen.generate_image_to_path(
            prompt="Multi heal test",
            negative_prompt="no borders",
            out_file=out_file,
            base_url="https://api.runware.ai/v1",
            api_key="fake-key",
            model="unknown:strict-model@1",
            steps=10,
            guidance_scale=3.5,
        )

    # Must have completed on attempt 3 after sequentially peeling off CFGScale and negativePrompt
    assert len(post_calls) == 3
    assert "CFGScale" in post_calls[0][0]
    assert "CFGScale" not in post_calls[1][0]
    assert "negativePrompt" in post_calls[1][0]
    assert "negativePrompt" not in post_calls[2][0]






