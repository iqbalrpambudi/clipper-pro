import logging
from typing import List, Dict, Any, Tuple
from app.services.ai_adapters.base import BaseLLMAdapter

log = logging.getLogger(__name__)

VISION_PROMPT = (
    "Analisis frame video ini. Berikan deskripsi singkat aktivitas/objek utama dalam Bahasa Indonesia (1 kalimat), "
    "serta 3-5 kata kunci/tag relevan. Contoh format JSON: "
    '{"description": "Pria sedang menyeduh kopi di meja bar kayu", "tags": ["kopi", "barista", "minuman", "kafe"]}'
)


async def analyze_scene(
    adapter: BaseLLMAdapter,
    keyframe_paths: List[str],
) -> Tuple[str, List[str], List[float]]:
    """Analyze scene keyframes with vision model and compute semantic embedding vector."""
    vision_result = await adapter.analyze_vision(keyframe_paths, VISION_PROMPT)
    description = vision_result.get("description", "Aktivitas dalam video")
    tags = vision_result.get("tags", ["video", "clip"])

    # Combine description and tags for rich semantic embedding
    text_to_embed = f"{description}. Kata kunci: {', '.join(tags)}"
    embedding = await adapter.generate_embedding(text_to_embed)

    return description, tags, embedding
