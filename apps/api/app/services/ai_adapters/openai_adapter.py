import base64
import json
import logging
import re
from pathlib import Path
from typing import List, Optional, Dict, Any
import httpx
from app.services.ai_adapters.base import BaseLLMAdapter

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

        # Check if response is SSE (Server-Sent Events) formatted
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

        # Regular JSON format
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON returned from model endpoint: {text[:250]}") from e

        if "error" in data:
            err = data["error"]
            err_msg = err.get("message") if isinstance(err, dict) else str(err)
            raise RuntimeError(f"Model error: {err_msg}")

        choices = data.get("choices", [])
        if not choices:
            raise ValueError(f"No choices in model response: {text[:250]}")

        message = choices[0].get("message", {})
        content = message.get("content") or choices[0].get("text") or ""
        return str(content).strip()

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
        content_parts: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]

        for img_path in image_paths[:3]:
            p = Path(img_path)
            if not p.exists():
                continue
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
                    "content": "You are a concise video scene analyzer. Output ONLY valid JSON with keys 'description' (string in Indonesian) and 'tags' (list of 3-6 strings in Indonesian).",
                },
                {"role": "user", "content": content_parts},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.4,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload,
                )
                if resp.status_code >= 400:
                    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
                raw_text = self._extract_content_from_response(resp.text)

                # Clean markdown code fences if present
                raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
                raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)

                parsed = json.loads(raw_text)
                return {
                    "description": parsed.get("description", "Aktivitas visual dalam scene"),
                    "tags": parsed.get("tags", ["video", "klip"]),
                }
        except Exception as e:
            log.warning("Vision analysis failed, using fallback tags: %s", e)
            return {
                "description": "Cuplikan video aksi/aktivitas",
                "tags": ["video", "scene", "aktivitas"],
            }

    async def generate_embedding(self, text: str) -> List[float]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/embeddings",
                    headers=self._get_headers(),
                    json={"model": self.embedding_model, "input": text},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    vec = data["data"][0]["embedding"]
                    # Pad or truncate to 768 dim if necessary
                    if len(vec) > 768:
                        return vec[:768]
                    elif len(vec) < 768:
                        return vec + [0.0] * (768 - len(vec))
                    return vec
        except Exception as e:
            log.debug("Remote embedding failed, using local semantic hash embedding: %s", e)

        # Robust local semantic hashing embedding fallback (768 dimensions)
        import hashlib
        import numpy as np

        words = re.findall(r"\w+", text.lower())
        vec = np.zeros(768, dtype=np.float32)
        for i, word in enumerate(words):
            h = int(hashlib.md5(word.encode()).hexdigest(), 16)
            idx = h % 768
            sign = 1.0 if (h >> 10) % 2 == 0 else -1.0
            vec[idx] += sign * (1.0 / (i + 1) ** 0.5)

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()
