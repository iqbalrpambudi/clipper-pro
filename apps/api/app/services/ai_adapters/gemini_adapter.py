import asyncio
import base64
import json
import logging
import re
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
import httpx

from app.services.ai_adapters.base import EMBEDDING_DIM, hash_embedding

from app.services.ai_adapters.openai_adapter import OpenAICompatibleAdapter

log = logging.getLogger(__name__)


class GeminiAdapter(OpenAICompatibleAdapter):
    def __init__(
        self,
        api_key: Optional[str],
        chat_model: str = "gemini-2.5-flash-lite",
        vision_model: str = "gemini-2.5-flash-lite",
        embedding_model: str = "text-embedding-004",
        base_url: Optional[str] = None,
    ):
        target_base = base_url or "https://generativelanguage.googleapis.com/v1beta/openai"
        super().__init__(
            base_url=target_base,
            api_key=api_key,
            chat_model=chat_model,
            vision_model=vision_model,
            embedding_model=embedding_model,
        )
        self._quota_exhausted = False

    async def analyze_vision_batch(
        self,
        batch_items: List[Tuple[str, str]],  # [(scene_id, thumbnail_path), ...]
    ) -> List[Dict[str, Any]]:
        """Analyze a batch of scene thumbnails in a SINGLE API call for maximum speed and quota efficiency."""
        if not batch_items:
            return []

        if self._quota_exhausted or not self.api_key:
            return [
                {
                    "scene_id": sc_id,
                    "description": "Cuplikan video aksi/aktivitas",
                    "tags": ["video", "scene", "aktivitas"],
                }
                for sc_id, _ in batch_items
            ]

        instruction = (
            f"Analisis {len(batch_items)} gambar cuplikan video ini secara berurutan. "
            "Untuk setiap gambar, berikan analisis terstruktur dalam Bahasa Indonesia:\n"
            "- description: ringkasan visual 1 kalimat\n"
            "- characters: orang/karakter yang terlihat (kosongkan jika tidak ada)\n"
            "- action: aksi/aktivitas utama (frasa singkat)\n"
            "- location: tempat/latar scene\n"
            "- objects: objek penting yang terlihat\n"
            "- state: suasana/keadaan (emosi, waktu, cuaca)\n"
            "- confidence: 0.0-1.0 keyakinan analisis\n"
            "- tags: 3-5 kata kunci\n"
            'Output WAJIB berupa JSON array dengan format: [{"index": 0, "description": "...", '
            '"characters": ["..."], "action": "...", "location": "...", "objects": ["..."], '
            '"state": "...", "confidence": 0.8, "tags": ["..."]}]'
        )
        parts: List[Dict[str, Any]] = [{"text": instruction}]

        valid_items = []
        for idx, (sc_id, t_path) in enumerate(batch_items):
            p = Path(t_path)
            if not p.exists():
                continue
            with open(p, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            ext = p.suffix.lower().replace(".", "")
            mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
            parts.append({"text": f"Gambar #{idx}:"})
            parts.append({"inlineData": {"mimeType": mime, "data": b64}})
            valid_items.append((idx, sc_id))

        if not valid_items:
            return []

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
            },
        }

        # Priority model: user configured vision_model, with seamless failover
        models_to_try = [self.vision_model]
        for m in ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3-flash-preview"]:
            if m not in models_to_try:
                models_to_try.append(m)

        for model_name in models_to_try:
            if self._quota_exhausted:
                break
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(timeout=25.0) as client:
                        resp = await client.post(url, json=payload)
                        if resp.status_code == 429:
                            err_text = resp.text.lower()
                            if "quota" in err_text or "exceeded" in err_text or "resource_exhausted" in err_text:
                                log.warning("Gemini Quota Exceeded (RESOURCE_EXHAUSTED). Failing fast for all scenes.")
                                self._quota_exhausted = True
                                break
                            if attempt < 1:
                                log.warning("Batch vision model %s hit 429, waiting 2.0s before retry...", model_name)
                                await asyncio.sleep(2.0)
                                continue
                            else:
                                log.warning("Batch vision model %s hit 429, falling back to next model...", model_name)
                                break
                        if resp.status_code >= 400:
                            log.warning("Batch vision model %s returned %d: %s", model_name, resp.status_code, resp.text[:100])
                            break

                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            break
                        raw_text = candidates[0]["content"]["parts"][0]["text"]
                        raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
                        raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)
                        parsed = json.loads(raw_text.strip())

                        parsed_map = {item.get("index", i): item for i, item in enumerate(parsed)}
                        out = []
                        for idx, sc_id in valid_items:
                            item = parsed_map.get(idx) or {}
                            out.append({
                                "scene_id": sc_id,
                                "description": item.get("description", "Cuplikan video aksi/aktivitas"),
                                "tags": item.get("tags", ["video", "scene"]),
                                "analysis": {
                                    "characters": item.get("characters", []),
                                    "action": item.get("action", ""),
                                    "location": item.get("location", ""),
                                    "objects": item.get("objects", []),
                                    "state": item.get("state", ""),
                                    "confidence": item.get("confidence", 0.5),
                                },
                            })
                        return out
                except Exception as exc:
                    log.warning("Batch vision attempt failed for %s: %s", model_name, exc)
                    if self._quota_exhausted:
                        break
                    await asyncio.sleep(1.0)

        return [
            {
                "scene_id": sc_id,
                "description": "Cuplikan video aksi/aktivitas",
                "tags": ["video", "scene", "aktivitas"],
            }
            for _, sc_id in valid_items
        ]

    async def analyze_vision(
        self,
        image_paths: List[str],
        prompt: str,
    ) -> Dict[str, Any]:
        """Analyze single scene frame using Google AI Studio API with fail-fast on quota limits."""
        if self._quota_exhausted or not self.api_key:
            return await super().analyze_vision(image_paths, prompt)

        parts: List[Dict[str, Any]] = [
            {
                "text": (
                    f"{prompt}\n\n"
                    "PENTING: Jawab HANYA dalam format JSON valid dengan keys:\n"
                    "{\"description\": \"Deskripsi singkat scene dalam 1 kalimat Bahasa Indonesia\", "
                    "\"characters\": [\"...\"], \"action\": \"...\", \"location\": \"...\", "
                    "\"objects\": [\"...\"], \"state\": \"...\", \"confidence\": 0.8, "
                    "\"tags\": [\"tag1\", \"tag2\", \"tag3\"]}"
                )
            }
        ]

        for img_path in image_paths[:2]:
            p = Path(img_path)
            if not p.exists():
                continue
            with open(p, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            ext = p.suffix.lower().replace(".", "")
            mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
            parts.append({
                "inlineData": {
                    "mimeType": mime,
                    "data": b64,
                }
            })

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.3,
            },
        }

        models_to_try = [self.vision_model]
        if "gemini-2.5-flash-lite" not in models_to_try:
            models_to_try.append("gemini-2.5-flash-lite")

        for model_name in models_to_try:
            if self._quota_exhausted:
                break
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        resp = await client.post(url, json=payload)
                        if resp.status_code == 429:
                            err_text = resp.text.lower()
                            if "quota" in err_text or "exceeded" in err_text or "resource_exhausted" in err_text:
                                log.warning("Gemini Quota Exceeded (RESOURCE_EXHAUSTED). Failing fast to fallback.")
                                self._quota_exhausted = True
                                return await super().analyze_vision(image_paths, prompt)
                            wait_sec = 2.0 * (attempt + 1)
                            log.warning("Gemini Vision rate-limited (429), retrying in %.1fs...", wait_sec)
                            await asyncio.sleep(wait_sec)
                            continue

                        if resp.status_code >= 400:
                            raise RuntimeError(f"Gemini Vision HTTP {resp.status_code}: {resp.text[:200]}")

                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            raise RuntimeError("Empty candidates from Gemini Vision")

                        raw_text = candidates[0]["content"]["parts"][0]["text"]
                        raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
                        raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)

                        parsed = json.loads(raw_text.strip())
                        return {
                            "description": parsed.get("description", "Aktivitas visual dalam scene"),
                            "tags": parsed.get("tags", ["video", "scene"]),
                            "analysis": {
                                "characters": parsed.get("characters", []),
                                "action": parsed.get("action", ""),
                                "location": parsed.get("location", ""),
                                "objects": parsed.get("objects", []),
                                "state": parsed.get("state", ""),
                                "confidence": parsed.get("confidence", 0.5),
                            },
                        }
                except Exception as exc:
                    if self._quota_exhausted:
                        return await super().analyze_vision(image_paths, prompt)
                    if attempt == 1 and model_name == models_to_try[-1]:
                        log.warning("Gemini Vision analysis failed: %s", exc)
                        return await super().analyze_vision(image_paths, prompt)
                    await asyncio.sleep(1.0)

        return await super().analyze_vision(image_paths, prompt)

    async def generate_embedding(self, text: str) -> List[float]:
        """Real embedding via Gemini OpenAI-compat endpoint (text-embedding-004).

        Falls back to local semantic hash on quota exhaustion / API failure.
        """
        if not self._quota_exhausted and self.api_key:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        f"{self.base_url}/embeddings",
                        headers=self._get_headers(),
                        json={"model": self.embedding_model, "input": text},
                    )
                    if resp.status_code == 200:
                        vec = resp.json()["data"][0]["embedding"]
                        return (vec + [0.0] * EMBEDDING_DIM)[:EMBEDDING_DIM]
                    if resp.status_code == 429:
                        err_text = resp.text.lower()
                        if "quota" in err_text or "exceeded" in err_text or "resource_exhausted" in err_text:
                            log.warning("Gemini embedding quota exhausted; falling back to hash embeddings (degraded).")
                            self._quota_exhausted = True
                    else:
                        log.warning("Gemini embedding API returned %d; falling back to hash embeddings (degraded)", resp.status_code)
            except Exception as e:
                log.warning("Gemini embedding API failed (%s); falling back to hash embeddings (degraded)", e)

        self._embedding_degraded = True
        return hash_embedding(text)
