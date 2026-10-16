import base64
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import httpx
from app.core.config import get_settings
from app.core.storage import storage

log = logging.getLogger(__name__)


def normalize_endpoint_url(url: Optional[str]) -> str:
    """Normalize endpoint URL, converting host localhost to host.docker.internal when inside Docker."""
    raw = (url or "").strip().rstrip("/")
    if not raw:
        return ""
    # In Docker containers, host localhost/127.0.0.1 must be reached via host.docker.internal
    normalized = re.sub(r"^(https?://)(localhost|127\.0\.0\.1)", r"\1host.docker.internal", raw)
    return normalized


def ensure_16_9_image(img_bytes: bytes) -> bytes:
    """
    Ensure the image is in 16:9 widescreen landscape format.
    If the image is square 1:1 or non-16:9, dynamically expand it to 16:9
    using the detected edge/background color with soft edge feathering,
    preventing any clipping or cropping when rendered in 16:9 video.
    """
    try:
        import cv2
        import numpy as np

        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return img_bytes

        h, w, _ = img.shape
        target_ar = 16.0 / 9.0
        current_ar = w / float(h)

        # If already approximately 16:9 (tolerance 0.04), keep untouched
        if abs(current_ar - target_ar) <= 0.04:
            return img_bytes

        # If image is narrower than 16:9 (e.g. 1:1 square or 4:3)
        if current_ar < target_ar:
            target_w = int(round(h * target_ar))
            if target_w % 2 != 0:
                target_w += 1
            pad_total = target_w - w
            pad_left = pad_total // 2
            pad_right = pad_total - pad_left

            # Detect background color from outer corners
            ch = min(15, h // 4)
            cw = min(15, w // 4)
            corner_patches = [
                img[:ch, :cw],
                img[:ch, -cw:],
                img[-ch:, :cw],
                img[-ch:, -cw:],
            ]
            bg_color = np.median(np.concatenate(corner_patches, axis=0), axis=(0, 1)).astype(np.uint8)

            canvas = np.full((h, target_w, 3), bg_color, dtype=np.uint8)
            canvas[:, pad_left:pad_left + w] = img

            # Feather left and right edges (up to 30px) to guarantee seamless transition
            feather_px = min(30, pad_left)
            if feather_px > 0:
                for i in range(feather_px):
                    alpha = (i + 1) / float(feather_px + 1)
                    l_idx = pad_left + i
                    canvas[:, l_idx] = (alpha * img[:, i].astype(float) + (1.0 - alpha) * bg_color.astype(float)).astype(np.uint8)
                    r_idx = pad_left + w - 1 - i
                    canvas[:, r_idx] = (alpha * img[:, -1 - i].astype(float) + (1.0 - alpha) * bg_color.astype(float)).astype(np.uint8)

            success, encoded = cv2.imencode(".png", canvas)
            if success:
                log.info("Auto-conformed image from %dx%d (ar=%.2f) to 16:9 canvas %dx%d", w, h, current_ar, target_w, h)
                return encoded.tobytes()

        # If image is wider than 16:9 (e.g. 21:9 ultrawide)
        elif current_ar > target_ar:
            target_h = int(round(w / target_ar))
            if target_h % 2 != 0:
                target_h += 1
            pad_total = target_h - h
            pad_top = pad_total // 2
            pad_bottom = pad_total - pad_top

            ch = min(15, h // 4)
            cw = min(15, w // 4)
            corner_patches = [
                img[:ch, :cw],
                img[:ch, -cw:],
                img[-ch:, :cw],
                img[-ch:, -cw:],
            ]
            bg_color = np.median(np.concatenate(corner_patches, axis=0), axis=(0, 1)).astype(np.uint8)

            canvas = np.full((target_h, w, 3), bg_color, dtype=np.uint8)
            canvas[pad_top:pad_top + h, :] = img

            # Feather top and bottom edges
            feather_px = min(30, pad_top)
            if feather_px > 0:
                for i in range(feather_px):
                    alpha = (i + 1) / float(feather_px + 1)
                    t_idx = pad_top + i
                    canvas[t_idx, :] = (alpha * img[i, :].astype(float) + (1.0 - alpha) * bg_color.astype(float)).astype(np.uint8)
                    b_idx = pad_top + h - 1 - i
                    canvas[b_idx, :] = (alpha * img[-1 - i, :].astype(float) + (1.0 - alpha) * bg_color.astype(float)).astype(np.uint8)

            success, encoded = cv2.imencode(".png", canvas)
            if success:
                log.info("Auto-conformed image from %dx%d (ar=%.2f) to 16:9 canvas %dx%d", w, h, current_ar, w, target_h)
                return encoded.tobytes()

    except Exception as e:
        log.warning("Failed to auto-conform image to 16:9: %s", e)

    return img_bytes


def build_full_image_prompt(user_prompt: str, style_prompt: Optional[str] = None) -> str:
    """Combine user/scene prompt with the consistent master hand-drawn style prompt, enforcing 16:9 widescreen landscape."""
    clean_user = (user_prompt or "").strip()
    clean_style = (style_prompt or "").strip()
    aspect_directive = "Widescreen 16:9 landscape aspect ratio (horizontal orientation, 16:9 ratio, wide composition, NOT square, NOT vertical)."

    if clean_style and clean_user:
        return f"{aspect_directive} {clean_style}. Visual scene: {clean_user}"
    elif clean_style:
        return f"{aspect_directive} {clean_style}"
    return f"{aspect_directive} Visual scene: {clean_user}"


def _extract_image_bytes_from_response(data: Dict[str, Any], client: Optional[httpx.Client] = None) -> Optional[bytes]:
    """
    Extract raw image bytes from either:
    1. Standard OpenAI `/images/generations` format (`data[0].b64_json` or `data[0].url`)
    2. Multimodal `/chat/completions` format (`choices[0].message.content[...].image_url.url`)
    3. Markdown or base64 data URI in text content
    """
    # 1. Standard OpenAI images/generations
    if "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
        item = data["data"][0]
        if "b64_json" in item and item["b64_json"]:
            return base64.b64decode(item["b64_json"])
        if "url" in item and item["url"]:
            img_url = item["url"]
            if img_url.startswith("data:image/"):
                parts = img_url.split(",", 1)
                if len(parts) == 2:
                    return base64.b64decode(parts[1])
            with httpx.Client(timeout=30.0) as dl_client:
                dl = dl_client.get(img_url)
                if dl.status_code == 200:
                    return dl.content

    # 2. Check candidates (native Gemini format if proxy returns raw Gemini candidate structure)
    candidates = data.get("candidates", [])
    if candidates and isinstance(candidates, list) and len(candidates) > 0:
        cand = candidates[0]
        content_obj = cand.get("content", {})
        cand_parts = content_obj.get("parts", []) if isinstance(content_obj, dict) else []
        for p in cand_parts:
            if isinstance(p, dict):
                inline = p.get("inline_data") or p.get("inlineData")
                if inline and isinstance(inline, dict):
                    b64 = inline.get("data")
                    if b64:
                        return base64.b64decode(b64)
                if "text" in p and isinstance(p["text"], str):
                    data_uri_match = re.search(r"data:image/[^;]+;base64,([A-Za-z0-9+/=]+)", p["text"])
                    if data_uri_match:
                        return base64.b64decode(data_uri_match.group(1))

    # 3. Multimodal chat/completions (e.g. Gemini, InferHub, Anthropic, or proxy chat image models)
    choices = data.get("choices", [])
    if choices and isinstance(choices, list):
        msg = choices[0].get("message", {})
        content = msg.get("content")

        # 3a. Message has parts directly (Gemini OpenAI proxies)
        parts = msg.get("parts")
        if isinstance(parts, list):
            for p in parts:
                if isinstance(p, dict):
                    inline = p.get("inline_data") or p.get("inlineData")
                    if inline and isinstance(inline, dict):
                        b64 = inline.get("data")
                        if b64:
                            return base64.b64decode(b64)

        # 3b. Content is a list of parts: [{"type": "image_url", "image_url": {"url": "..."}}]
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    inline = part.get("inline_data") or part.get("inlineData")
                    if inline and isinstance(inline, dict):
                        b64 = inline.get("data")
                        if b64:
                            return base64.b64decode(b64)

                    img_dict = part.get("image_url") or part.get("image") or {}
                    url_str = ""
                    if isinstance(img_dict, dict):
                        url_str = img_dict.get("url", "")
                    elif isinstance(img_dict, str):
                        url_str = img_dict
                    elif part.get("type") == "image":
                        url_str = part.get("url") or part.get("source", {}).get("data", "")

                    if url_str:
                        if url_str.startswith("data:image/"):
                            parts_split = url_str.split(",", 1)
                            if len(parts_split) == 2:
                                return base64.b64decode(parts_split[1])
                        elif url_str.startswith("http"):
                            with httpx.Client(timeout=30.0) as dl_client:
                                dl = dl_client.get(url_str)
                                if dl.status_code == 200:
                                    return dl.content

        # 3c. Content is a string with base64 data URI, markdown image, raw base64, or image URL
        elif isinstance(content, str):
            data_uri_match = re.search(r"data:image/[^;]+;base64,([A-Za-z0-9+/=]+)", content)
            if data_uri_match:
                return base64.b64decode(data_uri_match.group(1))

            markdown_match = re.search(r"!\[.*?\]\((https?://[^\s\)]+)\)", content)
            if markdown_match:
                img_url = markdown_match.group(1)
                with httpx.Client(timeout=30.0) as dl_client:
                    dl = dl_client.get(img_url)
                    if dl.status_code == 200:
                        return dl.content

            url_match = re.search(r"https?://[^\s\)\"\']+\.(?:png|jpg|jpeg|webp)", content)
            if url_match:
                with httpx.Client(timeout=30.0) as dl_client:
                    dl = dl_client.get(url_match.group(0))
                    if dl.status_code == 200:
                        return dl.content

            stripped_content = content.strip()
            if (stripped_content.startswith("iVBORw0KGgo") or stripped_content.startswith("/9j/")) and len(stripped_content) > 100:
                try:
                    return base64.b64decode(stripped_content)
                except Exception:
                    pass

    return None


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
    """Generate an image using OpenAI-compatible /v1/images/generations or multimodal /chat/completions fallback.
    
    Guarantees the output image is in 16:9 widescreen landscape aspect ratio to match video composition.
    Returns (abs_file_path, relative_url).
    """
    settings = get_settings()
    raw_endpoint = base_url or settings.IMAGE_BASE_URL or "https://api.openai.com/v1"
    endpoint_base = normalize_endpoint_url(raw_endpoint)

    # Strip /images/generations or /chat/completions for clean base
    clean_base = endpoint_base
    if clean_base.endswith("/images/generations"):
        clean_base = clean_base[:-len("/images/generations")]
    elif clean_base.endswith("/chat/completions"):
        clean_base = clean_base[:-len("/chat/completions")]

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

    # STRATEGY 0: Runware.ai Native API
    is_runware = (
        "runware.ai" in clean_base
        or chosen_model.startswith("runware:")
        or (chosen_model.lower() in ("flux-schnell", "flux.1-schnell", "flux_schnell") and "runware" in clean_base)
    )

    if is_runware:
        runware_url = "https://api.runware.ai/v1"
        if "runware" in clean_base and clean_base.startswith("http"):
            runware_url = clean_base.rstrip("/")
            if not runware_url.endswith("/v1"):
                runware_url = f"{runware_url}/v1"

        model_id = chosen_model
        if not model_id or model_id in ("dall-e-3", "default") or model_id.lower() in ("flux-schnell", "flux.1-schnell", "flux_schnell", "flux"):
            model_id = "runware:100@1"

        task_uuid = str(uuid.uuid4())
        # 1344x768 is a clean 16:9 widescreen resolution natively supported by FLUX Schnell
        runware_payload = [
            {
                "taskType": "imageInference",
                "taskUUID": task_uuid,
                "positivePrompt": full_prompt,
                "model": model_id,
                "width": 1344,
                "height": 768,
                "numberResults": 1,
                "outputFormat": "PNG",
                "steps": 4,
                "CFGScale": 1.0,
            }
        ]
        runware_headers = {
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            log.info("Requesting Runware.ai image generation (model=%s, task=%s) for item=%s...", model_id, task_uuid, item_id)
            resp = await client.post(runware_url, headers=runware_headers, json=runware_payload)
            if resp.status_code == 200:
                res_json = resp.json()
                if "errors" in res_json and res_json["errors"]:
                    err_msg = res_json["errors"][0].get("message") or str(res_json["errors"][0])
                    raise RuntimeError(f"Runware API error: {err_msg}")
                data_list = res_json.get("data", [])
                if data_list and isinstance(data_list, list):
                    item_data = data_list[0]
                    img_url = item_data.get("imageURL") or item_data.get("url")
                    if img_url:
                        dl = await client.get(img_url)
                        if dl.status_code == 200:
                            img_bytes = ensure_16_9_image(dl.content)
                            out_file.write_bytes(img_bytes)
                            log.info("Successfully generated and saved Runware 16:9 image to %s (%d bytes)", out_file, len(img_bytes))
                            return str(out_file), storage.to_relative_url(out_file) or ""
            raise RuntimeError(f"Runware HTTP {resp.status_code}: {resp.text[:300]}")

    last_error = ""

    async with httpx.AsyncClient(timeout=120.0) as client:
        # STRATEGY 1: Standard /images/generations
        img_gen_url = f"{clean_base}/images/generations"
        sizes_to_try = [size, "1024x1024"] if size != "1024x1024" else ["1024x1024"]

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
                    "Requesting AI image generation via /images/generations (model=%s, size=%s) for item=%s...",
                    chosen_model,
                    attempt_size,
                    item_id,
                )
                resp = await client.post(img_gen_url, headers=headers, json=payload)
                
                # If provider doesn't support b64_json, try without response_format (standard URL format)
                if resp.status_code == 400 and "response_format" in resp.text:
                    payload.pop("response_format", None)
                    resp = await client.post(img_gen_url, headers=headers, json=payload)

                if resp.status_code == 200:
                    data = resp.json()
                    img_bytes = _extract_image_bytes_from_response(data)
                    if img_bytes:
                        img_bytes = ensure_16_9_image(img_bytes)
                        out_file.write_bytes(img_bytes)
                        log.info("Successfully saved 16:9 image to %s (%d bytes)", out_file, len(img_bytes))
                        return str(out_file), storage.to_relative_url(out_file) or ""

                err_body = resp.text
                last_error = f"HTTP {resp.status_code}: {err_body}"
                log.warning("Image gen attempt with size %s returned HTTP %s: %s", attempt_size, resp.status_code, err_body[:200])

                # If proxy explicitly says provider does not support image generation endpoint,
                # break out to STRATEGY 2 (chat completions) immediately!
                if "does not support image generation" in err_body or resp.status_code in (400, 404, 405):
                    break

            except Exception as e:
                log.warning("Error during /images/generations attempt: %s", e)
                last_error = str(e)

        # STRATEGY 2: Multimodal Chat Completions fallback
        # Used for Gemini/Claude/custom image chat models that return images via chat completions
        chat_url = f"{clean_base}/chat/completions"
        try:
            log.info(
                "Attempting multimodal chat/completions fallback for image model %s (item=%s)...",
                chosen_model,
                item_id,
            )
            chat_payload = {
                "model": chosen_model,
                "messages": [
                    {
                        "role": "user",
                        "content": f"Generate a widescreen 16:9 landscape illustration with no text (horizontal layout, aspect ratio 16:9, width is greater than height, NOT square, NOT 1:1). Description: {full_prompt}",
                    }
                ],
                "aspect_ratio": "16:9",
                "size": "1792x1024",
            }
            chat_resp = await client.post(chat_url, headers=headers, json=chat_payload)
            if chat_resp.status_code in (400, 422):
                log.info("Chat completions returned HTTP %s with extended payload; retrying with standard strict payload...", chat_resp.status_code)
                strict_payload = {
                    "model": chosen_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": f"Generate a widescreen 16:9 landscape illustration with no text (horizontal layout, aspect ratio 16:9, width is greater than height, NOT square, NOT 1:1). Description: {full_prompt}",
                        }
                    ],
                }
                chat_resp = await client.post(chat_url, headers=headers, json=strict_payload)

            if chat_resp.status_code == 200:
                raw_text = chat_resp.text
                chat_data = None

                # Check if proxy returned multi-line SSE format
                for line in raw_text.splitlines():
                    line = line.strip()
                    if line.startswith("data:"):
                        line = line[5:].strip()
                    if not line or line == "[DONE]":
                        continue
                    try:
                        candidate = json.loads(line)
                        if _extract_image_bytes_from_response(candidate):
                            chat_data = candidate
                            break
                    except Exception:
                        pass

                if not chat_data:
                    clean_raw = re.sub(r"^data:\s*", "", raw_text.strip())
                    clean_raw = re.sub(r"\n\s*data:\s*\[DONE\]\s*$", "", clean_raw).strip()
                    try:
                        chat_data = json.loads(clean_raw)
                    except Exception:
                        chat_data = chat_resp.json()

                img_bytes = _extract_image_bytes_from_response(chat_data)
                if img_bytes:
                    img_bytes = ensure_16_9_image(img_bytes)
                    out_file.write_bytes(img_bytes)
                    log.info("Successfully saved 16:9 image via chat/completions to %s (%d bytes)", out_file, len(img_bytes))
                    return str(out_file), storage.to_relative_url(out_file) or ""

            last_error = f"Chat completions returned HTTP {chat_resp.status_code}: {chat_resp.text[:200]}"
        except Exception as ce:
            log.warning("Error during chat/completions image fallback: %s", ce)
            last_error = str(ce)

    raise RuntimeError(f"Gagal menghasilkan gambar AI: {last_error}")


async def test_image_connection(
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Test connection to the OpenAI-compatible image endpoint or proxy."""
    settings = get_settings()
    raw_endpoint = base_url or settings.IMAGE_BASE_URL or "https://api.openai.com/v1"
    endpoint_base = normalize_endpoint_url(raw_endpoint)

    secret_key = api_key or settings.IMAGE_API_KEY
    chosen_model = (model or settings.IMAGE_MODEL or "dall-e-3").strip()

    if not secret_key:
        return {
            "success": False,
            "image_model_status": "error",
            "latency_ms": 0,
            "message": "API Key belum diisi.",
        }

    is_runware = (
        "runware.ai" in endpoint_base
        or chosen_model.startswith("runware:")
        or (chosen_model.lower() in ("flux-schnell", "flux.1-schnell", "flux_schnell") and "runware" in endpoint_base)
    )

    if is_runware:
        runware_url = "https://api.runware.ai/v1"
        if "runware" in endpoint_base and endpoint_base.startswith("http"):
            runware_url = endpoint_base.rstrip("/")
            if not runware_url.endswith("/v1"):
                runware_url = f"{runware_url}/v1"

        headers = {
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        }
        auth_payload = [
            {
                "taskType": "authentication",
                "apiKey": secret_key,
            }
        ]
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(runware_url, headers=headers, json=auth_payload)
                latency = int((time.perf_counter() - start) * 1000)
                if resp.status_code == 200:
                    res_json = resp.json()
                    if "errors" in res_json and res_json["errors"]:
                        err_msg = res_json["errors"][0].get("message") or str(res_json["errors"][0])
                        return {
                            "success": False,
                            "image_model_status": "auth_error",
                            "latency_ms": latency,
                            "message": f"Runware Auth Error: {err_msg}",
                        }
                    return {
                        "success": True,
                        "image_model_status": f"connected (Runware: {chosen_model})",
                        "latency_ms": latency,
                        "message": f"Koneksi Runware.ai berhasil! Model: {chosen_model} ({latency}ms)",
                    }
                else:
                    return {
                        "success": False,
                        "image_model_status": f"http_{resp.status_code}",
                        "latency_ms": latency,
                        "message": f"Runware merespons HTTP {resp.status_code}: {resp.text[:150]}",
                    }
            except Exception as e:
                return {
                    "success": False,
                    "image_model_status": "connection_error",
                    "latency_ms": int((time.perf_counter() - start) * 1000),
                    "message": f"Gagal menghubungi Runware: {str(e)}",
                }

    clean_base = endpoint_base
    if clean_base.endswith("/images/generations"):
        clean_base = clean_base[:-len("/images/generations")]
    elif clean_base.endswith("/chat/completions"):
        clean_base = clean_base[:-len("/chat/completions")]

    models_url = f"{clean_base}/models"
    headers = {"Authorization": f"Bearer {secret_key}"}

    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(models_url, headers=headers)
            latency = int((time.perf_counter() - start) * 1000)

            if resp.status_code in (200, 201):
                try:
                    data = resp.json()
                    model_list = [m.get("id") for m in data.get("data", []) if isinstance(m, dict)]
                    if chosen_model in model_list:
                        return {
                            "success": True,
                            "image_model_status": f"connected ({chosen_model})",
                            "latency_ms": latency,
                            "message": f"Koneksi berhasil! Model '{chosen_model}' terdeteksi ({latency}ms).",
                        }
                except Exception:
                    pass

                return {
                    "success": True,
                    "image_model_status": f"connected ({chosen_model})",
                    "latency_ms": latency,
                    "message": f"Koneksi berhasil ke {endpoint_base} ({latency}ms).",
                }

            # If /models is not 200/201 (e.g. 404, 405, 400), probe chat/completions for proxies (InferHub / LiteLLM / Gemini proxy)
            try:
                probe_payload = {
                    "model": chosen_model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                }
                probe_resp = await client.post(
                    f"{clean_base}/chat/completions",
                    headers=headers,
                    json=probe_payload,
                    timeout=8.0,
                )
                latency = int((time.perf_counter() - start) * 1000)
                if probe_resp.status_code in (200, 201, 400, 422):
                    return {
                        "success": True,
                        "image_model_status": f"connected ({chosen_model})",
                        "latency_ms": latency,
                        "message": f"Koneksi berhasil ke {endpoint_base}! Endpoint merespons ({latency}ms).",
                    }
            except Exception:
                pass

            # Also check if base_url directly responds with non-500
            try:
                base_resp = await client.get(clean_base, headers=headers, timeout=5.0)
                latency = int((time.perf_counter() - start) * 1000)
                if base_resp.status_code < 500:
                    return {
                        "success": True,
                        "image_model_status": f"ready ({chosen_model})",
                        "latency_ms": latency,
                        "message": f"Endpoint aktif ({endpoint_base})",
                    }
            except Exception:
                pass

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
