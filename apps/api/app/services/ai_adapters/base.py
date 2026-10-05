import hashlib
import math
import re
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any, Tuple

EMBEDDING_DIM = 768


def hash_embedding(text: str, dim: int = EMBEDDING_DIM) -> List[float]:
    """Deterministic bag-of-words hash embedding — LAST-RESORT fallback only.

    ponytail: NOT semantic. Cosine similarity between two hash vectors is ~random,
    so scene<->narration matching degrades to duration-only. Any caller that falls
    back to this MUST set `adapter._embedding_degraded = True` and surface it.
    Upgrade path: real API embedding, or a local sentence-transformers model.
    """
    vec = [0.0] * dim
    tokens = re.findall(r"\w+", text.lower())
    if not tokens:
        return vec
    for i, token in enumerate(tokens):
        h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        vec[h % dim] += (1.0 if (h >> 16) % 2 == 0 else -1.0) / (1.0 + math.log1p(i))
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec] if norm > 0 else vec


class BaseLLMAdapter(ABC):
    @abstractmethod
    async def generate_chat(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_mode: bool = False,
    ) -> str:
        """Generate text from chat model."""
        pass

    @abstractmethod
    async def analyze_vision(
        self,
        image_paths: List[str],
        prompt: str,
    ) -> Dict[str, Any]:
        """Analyze 1-3 keyframe images and return description + tags."""
        pass

    async def analyze_vision_batch(
        self,
        batch_items: List[Tuple[str, str]],  # [(scene_id, thumbnail_path), ...]
    ) -> List[Dict[str, Any]]:
        """Analyze a batch of scene thumbnails."""
        return []

    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate 768-dim embedding vector for text."""
        pass
