import base64
import logging
import os
import time
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import httpx
from app.core.config import get_settings
from app.core.storage import storage

log = logging.getLogger(__name__)


def build_full_image_prompt(user_prompt: str, style_prompt: Optional[str] = None) -> str:
    """Combine user/scene prompt with the consistent master hand-drawn style prompt."""
    clean_user = (user_prompt or "").strip()
    clean_style = (style_prompt or "").strip()

    if clean_style and clean_user:
        return f"{clean_style}. Visual scene: {clean_user}"
    elif clean_style:
        return clean_style
    return clean_user


async def generate_single_image(
    prompt: str,
    project_id: str,
    item_id: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    style_prompt: Optional[str] = None,
    size: str = "1792x1024",
) -> Tuple[str, str]:
    """Generate an image using an OpenAI-compatible /v1/images/generations endpoint.
    
    Returns (abs_file_path, relative_url).
    """
    settings = get_settings()
    endpoint_base = (base_url or settings.IMAGE_BASE_URL or "https://api.openai.com/v1").rstrip("/")
    if not endpoint_base.endswith("/images/generations"):
        api_url = f"{endpoint_base}/images/generations"
    else:
        api_url = endpoint_base

    secret_key = api_key or settings.IMAGE_API_KEY
    if not secret_key:
        raise ValueError("Image API Key belum dikonfigurasi. Silakan atur di Model Settings.")

    chosen_model = model or settings.IMAGE_MODEL or "dall-e-3"
    effective_style = style_prompt if style_prompt is not None else settings.IMAGE_SYSTEM_PROMPT
    full_prompt = build_full_image_prompt(prompt, effective_style)

    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
    }

    # Prepare storage output file
    storyboard_dir = storage.get_storyboard_dir(project_id)
    out_file = storyboard_dir / f"img_{item_id}.png"

    # Attempt generation with preferred size, fallback to 1024x1024 if size rejected
    sizes_to_try = [size, "1024x1024"] if size != "1024x1024" else ["1024x1024"]
    last_error = ""

    async with httpx.AsyncClient(timeout=90.0) as client:
        for attempt_size in sizes_to_try:
            payload: Dict[str, Any] = {
                "model": chosen_model,
                "prompt": full_prompt,
                "n": 1,
                "size": attempt_size,
                "response_format": "b64_json",
            }
            try:
                log.info(
                    "Requesting AI image generation (model=%s, size=%s) for item=%s...",
                    chosen_model,
                    attempt_size,
                    item_id,
                )
                resp = await client.post(api_url, headers=headers, json=payload)
                
                # If provider doesn't support b64_json, try with standard URL response format
                if resp.status_code == 400 and "response_format" in resp.text:
                    payload.pop("response_format", None)
                    resp = await client.post(api_url, headers=headers, json=payload)

                if resp.status_code == 200:
                    data = resp.json()
                    item_data = data.get("data", [{}])[0]

                    # 1. Base64 encoded image
                    if "b64_json" in item_data:
                        img_bytes = base64.b64decode(item_data["b64_json"])
                        out_file.write_bytes(img_bytes)
                        log.info("Successfully saved b64 image to %s", out_file)
                        return str(out_file), storage.to_relative_url(out_file) or ""

                    # 2. Image URL download
                    elif "url" in item_data:
                        img_url = item_data["url"]
                        dl_resp = await client.get(img_url, timeout=30.0)
                        if dl_resp.status_code == 200:
                            out_file.write_bytes(dl_resp.content)
                            log.info("Successfully downloaded image URL to %s", out_file)
                            return str(out_file), storage.to_relative_url(out_file) or ""
                        else:
                            raise RuntimeError(f"Gagal mendownload gambar dari URL: HTTP {dl_resp.status_code}")
                    else:
                        raise RuntimeError("Respons API image tidak memiliki data b64_json atau url.")

                err_body = resp.text
                log.warning("Image gen attempt with size %s failed (HTTP %s): %s", attempt_size, resp.status_code, err_body)
                last_error = f"HTTP {resp.status_code}: {err_body}"

            except Exception as e:
                log.exception("Error during image gen attempt: %s", e)
                last_error = str(e)

    raise RuntimeError(f"Gagal menghasilkan gambar AI: {last_error}")


async def test_image_connection(
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Test connection to the OpenAI-compatible image endpoint."""
    settings = get_settings()
    endpoint_base = (base_url or settings.IMAGE_BASE_URL or "https://api.openai.com/v1").rstrip("/")
    secret_key = api_key or settings.IMAGE_API_KEY
    chosen_model = model or settings.IMAGE_MODEL or "dall-e-3"

    if not secret_key:
        return {
            "success": False,
            "image_model_status": "error",
            "latency_ms": 0,
            "message": "API Key belum diisi.",
        }

    # We test by calling GET {base_url}/models or sending a minimal check
    clean_base = endpoint_base
    if clean_base.endswith("/images/generations"):
        clean_base = clean_base[:-len("/images/generations")]
    models_url = f"{clean_base}/models"
    headers = {"Authorization": f"Bearer {secret_key}"}

    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(models_url, headers=headers)
            latency = int((time.perf_counter() - start) * 1000)
            if resp.status_code in (200, 201):
                return {
                    "success": True,
                    "image_model_status": f"connected ({chosen_model})",
                    "latency_ms": latency,
                    "message": f"Koneksi berhasil ke {endpoint_base} (latency: {latency}ms)",
                }
            elif resp.status_code == 404:
                # Some proxies don't implement /models, check if base_url responds
                base_resp = await client.get(endpoint_base, headers=headers)
                latency = int((time.perf_counter() - start) * 1000)
                if base_resp.status_code < 500:
                    return {
                        "success": True,
                        "image_model_status": f"ready ({chosen_model})",
                        "latency_ms": latency,
                        "message": f"Endpoint aktif ({endpoint_base})",
                    }
            return {
                "success": False,
                "image_model_status": f"http_{resp.status_code}",
                "latency_ms": int((time.perf_counter() - start) * 1000),
                "message": f"Server merespons HTTP {resp.status_code}: {resp.text[:150]}",
            }
        except Exception as e:
            return {
                "success": False,
                "image_model_status": "connection_error",
                "latency_ms": int((time.perf_counter() - start) * 1000),
                "message": f"Gagal menghubungi server: {str(e)}",
            }
