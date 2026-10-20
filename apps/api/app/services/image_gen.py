import base64
import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx

from app.core.config import get_settings
from app.core.storage import storage

log = logging.getLogger(__name__)


def normalize_endpoint_url(url: Optional[str]) -> str:
    """Normalize endpoint URL, converting host localhost to host.docker.internal when inside Docker and ensuring /v1 path."""
    raw = (url or "").strip().rstrip("/")
    if not raw:
        return ""
    # In Docker containers, host localhost/127.0.0.1 must be reached via host.docker.internal
    normalized = re.sub(r"^(https?://)(localhost|127\.0\.0\.1)", r"\1host.docker.internal", raw)

    # Strip subpaths if user accidentally pasted full endpoint
    for sub in ("/images/generations", "/chat/completions", "/images/generate", "/models"):
        if normalized.endswith(sub):
            normalized = normalized[:-len(sub)].rstrip("/")

    # Ensure /v1 for standard OpenAI-compatible and local proxy endpoints (e.g. InferHub, LocalAI, vLLM, Runware)
    # If the URL is already ending with /v1 (or /v2 etc), keep it. If not, and it does not contain googleapis, append /v1
    if not re.search(r"/v\d+$", normalized) and "googleapis.com" not in normalized:
        normalized = f"{normalized}/v1"

    return normalized



def format_image_error(status_code: int, raw_text: str, model_name: str) -> str:
    """Format and clean upstream API error messages for clear, actionable user display."""
    msg = raw_text.strip()
    try:
        data = json.loads(raw_text)
        if isinstance(data, dict):
            err = data.get("error", {})
            if isinstance(err, dict):
                inner = err.get("message", "")
                if inner:
                    msg = inner
            elif isinstance(err, str):
                msg = err
    except Exception:
        pass

    # Extract nested error message if proxy wrapped another JSON error (e.g. InferHub/One-API)
    m = re.search(r'\[\d+\]:\s*(\{.*\})', msg) or re.search(r'(\{"error":.*\})', msg)
    if m:
        try:
            nested = json.loads(m.group(1))
            if isinstance(nested, dict):
                nested_err = nested.get("error", {})
                if isinstance(nested_err, dict) and nested_err.get("message"):
                    msg = nested_err["message"]
                elif isinstance(nested_err, str):
                    msg = nested_err
        except Exception:
            pass

    if "unknown model" in msg.lower() or "model_not_found" in msg.lower():
        return f"Model '{model_name}' tidak ditemukan di provider endpoint ({msg}). Silakan pilih atau ubah model yang tersedia di Model Settings."
    return f"HTTP {status_code}: {msg}"


def strip_bars_from_cv2_image(img: Any) -> Any:
    """
    Remove letterbox (black bars top/bottom), pillarbox (black bars left/right),
    and white/flat borders from an image, then center-cover crop to exact 16:9 widescreen
    and standardize to 1920x1080 without adding any padding or margins.
    """
    import cv2
    import numpy as np

    if img is None:
        return img

    h, w = img.shape[:2]
    if h < 32 or w < 32:
        return img

    def is_bar_row(row_bgr: np.ndarray) -> bool:
        # row_bgr is (W, 3)
        row_gray = cv2.cvtColor(row_bgr.reshape(1, -1, 3), cv2.COLOR_BGR2GRAY).ravel()
        mean_v = float(np.mean(row_gray))
        std_v = float(np.std(row_gray))
        # Color difference across channels - bars are achromatic/neutral
        color_diff = float(np.mean(np.max(row_bgr, axis=-1) - np.min(row_bgr, axis=-1)))
        if color_diff > 14.0:
            return False

        # 1. Black letterbox bar (achromatic or near-achromatic, low brightness)
        if mean_v <= 28.0 and std_v <= 14.0 and float(np.max(row_gray)) <= 55.0:
            return True
        # 2. White border/letterbox bar (high brightness, achromatic)
        if mean_v >= 230.0 and std_v <= 14.0 and float(np.min(row_gray)) >= 205.0:
            return True
        # 3. Flat artificial solid border (extremely low variance across the row)
        if std_v <= 3.0 and (mean_v <= 40.0 or mean_v >= 220.0):
            return True
        return False

    def is_bar_col(col_bgr: np.ndarray) -> bool:
        # col_bgr is (H, 3)
        col_gray = cv2.cvtColor(col_bgr.reshape(1, -1, 3), cv2.COLOR_BGR2GRAY).ravel()
        mean_v = float(np.mean(col_gray))
        std_v = float(np.std(col_gray))
        color_diff = float(np.mean(np.max(col_bgr, axis=-1) - np.min(col_bgr, axis=-1)))
        if color_diff > 14.0:
            return False

        if mean_v <= 28.0 and std_v <= 14.0 and float(np.max(col_gray)) <= 55.0:
            return True
        if mean_v >= 230.0 and std_v <= 14.0 and float(np.min(col_gray)) >= 205.0:
            return True
        if std_v <= 3.0 and (mean_v <= 40.0 or mean_v >= 220.0):
            return True
        return False

    # 1. Detect and strip top/bottom letterbox bars (up to 25% of height from each edge)
    max_scan_y = int(round(h * 0.25))
    top_crop = 0
    for y in range(max_scan_y):
        if is_bar_row(img[y, :]):
            top_crop = y + 1
        else:
            break

    bottom_crop = h
    for y in range(h - 1, h - 1 - max_scan_y, -1):
        if is_bar_row(img[y, :]):
            bottom_crop = y
        else:
            break

    # 2. Detect and strip left/right pillarbox bars (up to 25% of width from each edge)
    max_scan_x = int(round(w * 0.25))
    left_crop = 0
    for x in range(max_scan_x):
        if is_bar_col(img[:, x]):
            left_crop = x + 1
        else:
            break

    right_crop = w
    for x in range(w - 1, w - 1 - max_scan_x, -1):
        if is_bar_col(img[:, x]):
            right_crop = x
        else:
            break

    # Safety check: ensure at least 40% of original dimensions remain
    stripped_w = right_crop - left_crop
    stripped_h = bottom_crop - top_crop
    if stripped_w >= int(w * 0.4) and stripped_h >= int(h * 0.4):
        if top_crop > 0 or bottom_crop < h or left_crop > 0 or right_crop < w:
            log.info(
                "Stripped bars from image (%dx%d): top=%d, bottom=%d, left=%d, right=%d",
                w, h, top_crop, h - bottom_crop, left_crop, w - right_crop
            )
            img = img[top_crop:bottom_crop, left_crop:right_crop]
            h, w = img.shape[:2]

    # 3. Always cover-crop to exact 16:9 (center crop) - NEVER add padding/bars!
    target_ar = 16.0 / 9.0
    cur_ar = w / float(h)

    if abs(cur_ar - target_ar) > 0.005:
        if cur_ar > target_ar:
            # Wider than 16:9: keep height, crop width centrally
            new_w = int(round(h * target_ar))
            offset_x = max(0, (w - new_w) // 2)
            img = img[:, offset_x:offset_x + new_w]
        else:
            # Taller than 16:9 (e.g. square 1:1, 4:3, or cinema crop): keep width, crop height centrally
            new_h = int(round(w / target_ar))
            offset_y = max(0, (h - new_h) // 2)
            img = img[offset_y:offset_y + new_h, :]

    # 4. Standardize to crisp 16:9 resolution (1920x1080) with high quality Lanczos4 interpolation
    final_h, final_w = img.shape[:2]
    if final_w != 1920 or final_h != 1080:
        interp = cv2.INTER_AREA if (final_w > 1920 or final_h > 1080) else cv2.INTER_LANCZOS4
        img = cv2.resize(img, (1920, 1080), interpolation=interp)

    return img


def strip_bars_and_ensure_16_9(img_bytes: bytes) -> bytes:
    """
    Ensure the image is 100% full-bleed 16:9 widescreen without any black or white letterbox/pillarbox bars.
    Detects and strips any baked-in bars, then center-cover crops and normalizes to 1920x1080.
    """
    try:
        import cv2
        import numpy as np

        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return img_bytes

        processed = strip_bars_from_cv2_image(img)
        success, encoded = cv2.imencode(".png", processed)
        if success:
            return encoded.tobytes()

    except Exception as e:
        log.warning("Failed to strip bars and ensure 16:9: %s", e)

    return img_bytes


def ensure_16_9_image(img_bytes: bytes) -> bytes:
    """Backward-compatible alias for strip_bars_and_ensure_16_9."""
    return strip_bars_and_ensure_16_9(img_bytes)


def build_full_image_prompt(user_prompt: str, style_prompt: Optional[str] = None) -> str:
    """Combine user/scene prompt with the consistent master style prompt, strictly enforcing full-bleed 16:9 widescreen without letterbox."""
    clean_user = (user_prompt or "").strip()
    clean_style = (style_prompt or "").strip()
    aspect_directive = (
        "Full bleed edge-to-edge widescreen 16:9 landscape aspect ratio (horizontal orientation, 16:9 ratio, "
        "completely filling the entire 16:9 frame without letterbox, without black bars, without white border, "
        "without framing, margins, or padding, NOT square, NOT vertical)."
    )

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


async def generate_image_to_path(
    prompt: str,
    out_file: Path,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    style_prompt: Optional[str] = None,
    negative_prompt: Optional[str] = None,
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

    default_negative = "black bars, letterbox, pillarbox, white borders, black borders, frame, border, margins, padding, split screen, dark vignette edges, blurry details, text watermark"
    active_negative = f"{negative_prompt}, {default_negative}" if negative_prompt else default_negative

    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
    }

    out_file.parent.mkdir(parents=True, exist_ok=True)

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
                "negativePrompt": active_negative,
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
            log.info("Requesting Runware.ai image generation (model=%s, task=%s) for item=%s...", model_id, task_uuid, out_file.stem)
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
                    out_file.stem,
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
                last_error = format_image_error(resp.status_code, err_body, chosen_model)
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
                out_file.stem,
            )
            chat_payload = {
                "model": chosen_model,
                "messages": [
                    {
                        "role": "user",
                        "content": f"Generate a full-bleed edge-to-edge widescreen 16:9 landscape illustration with no text, completely filling the 16:9 frame without letterbox, without black bars, and without white borders (horizontal layout, aspect ratio 16:9, width is greater than height, NOT square, NOT 1:1). Description: {full_prompt}",
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
                            "content": f"Generate a full-bleed edge-to-edge widescreen 16:9 landscape illustration with no text, completely filling the 16:9 frame without letterbox, without black bars, and without white borders (horizontal layout, aspect ratio 16:9, width is greater than height, NOT square, NOT 1:1). Description: {full_prompt}",
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

            last_error = format_image_error(chat_resp.status_code, chat_resp.text, chosen_model)
        except Exception as ce:
            log.warning("Error during chat/completions image fallback: %s", ce)
            last_error = str(ce)

    raise RuntimeError(f"Gagal menghasilkan gambar AI: {last_error}")


async def generate_single_image(
    prompt: str,
    project_id: str,
    item_id: str,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    style_prompt: Optional[str] = None,
    negative_prompt: Optional[str] = None,
    size: str = "1792x1024",
) -> Tuple[str, str]:
    """Generate a single storyboard image and save to project storyboard directory."""
    storyboard_dir = storage.get_storyboard_dir(project_id)
    # Clean up older images for this item to prevent storage bloat and stale cache
    for old_file in storyboard_dir.glob(f"img_{item_id}*"):
        try:
            old_file.unlink(missing_ok=True)
        except Exception:
            pass

    timestamp = int(time.time())
    out_file = storyboard_dir / f"img_{item_id}_{timestamp}.png"
    return await generate_image_to_path(
        prompt=prompt,
        out_file=out_file,
        base_url=base_url,
        api_key=api_key,
        model=model,
        style_prompt=style_prompt,
        negative_prompt=negative_prompt,
        size=size,
    )


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
