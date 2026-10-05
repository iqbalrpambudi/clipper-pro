import asyncio
import base64
import json
import logging
import re
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
import httpx
from app.services.ai_adapters.base import BaseLLMAdapter, EMBEDDING_DIM, hash_embedding

log = logging.getLogger(__name__)



class OpenAICompatibleAdapter(BaseLLMAdapter):
    def __init__(
        self,
        base_url: Optional[str],
        api_key: Optional[str],
        chat_model: str = "gpt-4o-mini",
        vision_model: str = "gpt-4o-mini",
        embedding_model: str = "text-embedding-3-small",
    ):
        raw_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        # In Docker containers, localhost/127.0.0.1 on the host is reached via host.docker.internal
        raw_url = re.sub(r"^(https?://)(localhost|127\.0\.0\.1)", r"\1host.docker.internal", raw_url)
        if not raw_url.endswith("/v1") and "googleapis.com" not in raw_url:
            raw_url = f"{raw_url}/v1"
        self.base_url = raw_url
        self.api_key = api_key or ""
        self.chat_model = chat_model
        self.vision_model = vision_model or chat_model
        self.embedding_model = embedding_model
        self._service_unavailable = False
        self._embedding_degraded = False

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _extract_content_from_response(self, text: str) -> str:
        """
        Extract generated text from either standard JSON chat completion response
        or SSE (Server-Sent Events) formatted streaming chunks.
        """
        text = text.strip()
        if not text:
            raise ValueError("Model endpoint returned an empty response")

        # Strip trailing data: [DONE] if proxy appended it to response
        cleaned_text = re.sub(r"data:\s*\[DONE\]\s*$", "", text).strip()

        # Priority 1: Try regular JSON format first
        try:
            data = json.loads(cleaned_text)
            if "error" in data:
                err = data["error"]
                err_msg = err.get("message") if isinstance(err, dict) else str(err)
                raise RuntimeError(f"Model error: {err_msg}")

            choices = data.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                content = message.get("content") or choices[0].get("text") or ""
                if content:
                    return str(content).strip()
        except json.JSONDecodeError:
            pass

        # Priority 2: Check if response is SSE (Server-Sent Events) formatted streaming chunks
        if text.startswith("data:") or "\ndata:" in text:
            collected = []
            for line in text.split("\n"):
                line = line.strip()
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if data_str == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data_str)
                    choices = chunk.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        content = delta.get("content") or delta.get("text") or ""
                        if content:
                            collected.append(content)
                except Exception:
                    continue
            if collected:
                return "".join(collected).strip()

        # Priority 3: Fallback attempt on original text
        try:
            data = json.loads(text)
            choices = data.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                content = message.get("content") or choices[0].get("text") or ""
                return str(content).strip()
        except Exception:
            pass

        raise ValueError(f"Could not parse valid model completion from response: {text[:250]}")

    async def generate_chat(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_mode: bool = False,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: Dict[str, Any] = {
            "model": self.chat_model,
            "messages": messages,
            "temperature": 0.7,
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._get_headers(),
                json=payload,
            )
            if resp.status_code >= 400:
                err_text = resp.text.strip()
                try:
                    err_json = resp.json()
                    if "error" in err_json:
                        err_text = err_json["error"].get("message", err_text)
                except Exception:
                    pass
                raise RuntimeError(f"Model endpoint error (HTTP {resp.status_code}): {err_text[:300]}")

            return self._extract_content_from_response(resp.text)

    async def analyze_vision(
        self,
        image_paths: List[str],
        prompt: str,
    ) -> Dict[str, Any]:
        if getattr(self, "_service_unavailable", False):
            return {
                "description": "Cuplikan video aksi/aktivitas",
                "tags": ["video", "scene", "aktivitas"],
            }

        content_parts: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]

        for img_path in image_paths[:3]:
            p = Path(img_path)
            if not p.exists():
                continue

            # Downscale and compress thumbnail image to max 768px using cv2 to dramatically boost speed
            try:
                import cv2
                img = cv2.imread(str(p))
                if img is not None:
                    h, w = img.shape[:2]
                    max_dim = 768
                    if max(h, w) > max_dim:
                        scale = max_dim / max(h, w)
                        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                    _, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
                    b64 = base64.b64encode(buffer).decode('utf-8')
                    mime = "image/jpeg"
                else:
                    with open(p, "rb") as f:
                        b64 = base64.b64encode(f.read()).decode("utf-8")
                    ext = p.suffix.lower().replace(".", "")
                    mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
            except Exception:
                with open(p, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode("utf-8")
                ext = p.suffix.lower().replace(".", "")
                mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"

            content_parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            })

        payload = {
            "model": self.vision_model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a structured video scene analyzer. Output ONLY valid JSON with keys 'description' (string in Indonesian, 1 natural sentence), 'characters' (list of visible people/characters), 'action' (main activity, short phrase in Indonesian), 'location' (setting in Indonesian), 'objects' (list of important objects), 'state' (mood/time/weather in Indonesian), 'confidence' (float 0.0-1.0), and 'tags' (list of 3-6 relevant Indonesian keywords).",
                },
                {"role": "user", "content": content_parts},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
            "stream": False,
        }

        try:
            timeout_cfg = httpx.Timeout(30.0, connect=5.0)
            async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload,
                )
                if resp.status_code in (401, 403):
                    self._service_unavailable = True
                    log.error("AI vision authentication error (HTTP %d): %s. Disabling further calls.", resp.status_code, resp.text[:200])
                    raise RuntimeError(f"HTTP {resp.status_code} Auth error")
                elif resp.status_code == 429:
                    err_lower = resp.text.lower()
                    if "quota" in err_lower or "insufficient" in err_lower or "exceeded" in err_lower:
                        self._service_unavailable = True
                        log.error("AI vision quota exceeded: %s. Disabling further calls.", resp.text[:200])
                    raise RuntimeError(f"HTTP {resp.status_code} Quota error")
                elif resp.status_code == 404:
                    self._service_unavailable = True
                    log.error("AI vision model/endpoint not found (HTTP 404): %s. Disabling further calls.", resp.text[:200])
                    raise RuntimeError(f"HTTP 404 Not Found")
                elif resp.status_code >= 400:
                    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")

                raw_text = self._extract_content_from_response(resp.text)

                # Strip <think> reasoning tokens if present
                raw_text = re.sub(r"<think>[\s\S]*?</think>", "", raw_text).strip()

                # Clean markdown code fences if present
                raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
                raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)

                # Robust regex JSON object extractor
                json_match = re.search(r"\{[\s\S]*\}", raw_text)
                if json_match:
                    parsed = json.loads(json_match.group(0))
                else:
                    parsed = json.loads(raw_text)

                return {
                    "description": parsed.get("description", "Aktivitas visual dalam scene"),
                    "tags": parsed.get("tags", ["video", "klip"]),
                    "analysis": {
                        "characters": parsed.get("characters", []),
                        "action": parsed.get("action", ""),
                        "location": parsed.get("location", ""),
                        "objects": parsed.get("objects", []),
                        "state": parsed.get("state", ""),
                        "confidence": parsed.get("confidence", 0.5),
                    },
                }
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            self._service_unavailable = True
            log.warning("Could not connect to AI vision gateway at %s (%s). Falling back to default tags.", self.base_url, e)
            return {
                "description": "Cuplikan video aksi/aktivitas",
                "tags": ["video", "scene", "aktivitas"],
            }
        except Exception as e:
            log.warning("Vision analysis failed, using fallback tags: %s", e)
            return {
                "description": "Cuplikan video aksi/aktivitas",
                "tags": ["video", "scene", "aktivitas"],
            }

    async def analyze_vision_batch(
        self,
        batch_items: List[Tuple[str, str]],  # [(scene_id, thumbnail_path), ...]
    ) -> List[Dict[str, Any]]:
        """Analyze a batch of scene thumbnails concurrently with bounded concurrency and auto-retry."""
        if not batch_items:
            return []

        if getattr(self, "_service_unavailable", False):
            return [
                {
                    "scene_id": sc_id,
                    "description": "Cuplikan video aksi/aktivitas",
                    "tags": ["video", "scene", "aktivitas"],
                }
                for sc_id, _ in batch_items
            ]

        semaphore = asyncio.Semaphore(16)

        async def _analyze_single(sc_id: str, t_path: str) -> Dict[str, Any]:
            async with semaphore:
                for attempt in range(2):
                    try:
                        res = await self.analyze_vision([t_path], "Analisis frame video ini.")
                        desc = res.get("description")
                        tags = res.get("tags", ["video", "scene"])
                        if desc and desc != "Cuplikan video aksi/aktivitas":
                            return {
                                "scene_id": sc_id,
                                "description": desc,
                                "tags": tags,
                                "analysis": res.get("analysis"),
                            }
                        elif attempt == 0:
                            await asyncio.sleep(1.2)
                            continue
                        else:
                            return {
                                "scene_id": sc_id,
                                "description": desc or "Cuplikan video aksi/aktivitas",
                                "tags": tags,
                                "analysis": res.get("analysis"),
                            }
                    except Exception as exc:
                        if attempt == 0:
                            await asyncio.sleep(1.2)
                            continue
                        log.warning("Vision analysis failed for scene %s: %s", sc_id, exc)
                        return {
                            "scene_id": sc_id,
                            "description": "Cuplikan video aksi/aktivitas",
                            "tags": ["video", "scene", "aktivitas"],
                        }
                return {
                    "scene_id": sc_id,
                    "description": "Cuplikan video aksi/aktivitas",
                    "tags": ["video", "scene", "aktivitas"],
                }

        tasks = [_analyze_single(sc_id, t_path) for sc_id, t_path in batch_items]
        results = await asyncio.gather(*tasks)
        return list(results)

    async def generate_embedding(self, text: str) -> List[float]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/embeddings",
                    headers=self._get_headers(),
                    json={"model": self.embedding_model, "input": text},
                )
                if resp.status_code == 200:
                    vec = resp.json()["data"][0]["embedding"]
                    return (vec + [0.0] * EMBEDDING_DIM)[:EMBEDDING_DIM]
                log.warning(
                    "Embedding API returned HTTP %s; scene matching will be degraded",
                    resp.status_code,
                )
        except Exception as e:
            log.warning("Embedding API failed (%s); scene matching will be degraded", e)

        self._embedding_degraded = True
        return hash_embedding(text)
