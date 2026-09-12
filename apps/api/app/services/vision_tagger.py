import asyncio
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


async def analyze_scenes_batch(
    adapter: BaseLLMAdapter,
    items: List[Dict[str, Any]],
) -> List[Tuple[str, List[str], List[float]]]:
    """Analyze a batch of scenes using adapter's batch vision if available, with concurrent embedding."""
    if not items:
        return []

    batch_items = [(str(item["scene_index"]), item["thumbnail_path"]) for item in items]
    results_map: Dict[str, Dict[str, Any]] = {}

    if hasattr(adapter, "analyze_vision_batch"):
        try:
            batch_results = await adapter.analyze_vision_batch(batch_items)
            for r in batch_results:
                if "scene_id" in r:
                    results_map[str(r["scene_id"])] = r
        except Exception as exc:
            log.warning("analyze_vision_batch error: %s", exc)

    descriptions: List[str] = []
    tags_list: List[List[str]] = []
    texts_to_embed: List[str] = []

    for item in items:
        sc_id = str(item["scene_index"])
        r = results_map.get(sc_id)
        if r:
            desc = r.get("description") or "Cuplikan video aksi/aktivitas"
            tags = r.get("tags") or ["video", "scene"]
        else:
            try:
                kfs = item.get("keyframe_paths", [item["thumbnail_path"]])
                single_res = await adapter.analyze_vision(kfs, VISION_PROMPT)
                desc = single_res.get("description", "Cuplikan video aksi/aktivitas")
                tags = single_res.get("tags", ["video", "scene"])
            except Exception:
                desc = "Cuplikan video aksi/aktivitas"
                tags = ["video", "scene", "aktivitas"]

        descriptions.append(desc)
        tags_list.append(tags)
        texts_to_embed.append(f"{desc}. Kata kunci: {', '.join(tags)}")

    try:
        embedding_tasks = [adapter.generate_embedding(txt) for txt in texts_to_embed]
        embeddings = await asyncio.gather(*embedding_tasks)
    except Exception as exc:
        log.warning("Batch embedding generation error: %s", exc)
        embeddings = [[0.0] * 768 for _ in texts_to_embed]

    return list(zip(descriptions, tags_list, embeddings))
