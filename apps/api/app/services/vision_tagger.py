import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from app.services.ai_adapters.base import BaseLLMAdapter, hash_embedding

log = logging.getLogger(__name__)

# Skema analisis terstruktur per scene. Timestamp TIDAK diminta ke model
# (diinject dari DB karena akurat), relationship dihitung rule-based.
VISION_PROMPT = (
    "Analisis frame video ini secara terstruktur dalam Bahasa Indonesia. Berikan:\n"
    "- description: ringkasan visual 2 kalimat; sebutkan warna dominan, gerakan kamera/subjek, "
    "dan mood adegan (tegang/hangat/melankolis dll) supaya mudah dicocokkan dengan narasi\n"
    "- characters: daftar orang/karakter/hewan yang terlihat (nama/deskripsi singkat, kosongkan jika tidak ada)\n"
    "- action: aksi/aktivitas utama yang sedang terjadi (frasa singkat)\n"
    "- location: tempat/latar scene\n"
    "- objects: objek penting yang terlihat\n"
    "- state: suasana/keadaan (emosi, waktu, cuaca, kondisi)\n"
    "- confidence: angka 0.0-1.0 seberapa yakin analisis ini akurat\n"
    "- tags: 5-8 kata kunci relevan, termasuk warna dominan, gerakan, dan mood\n"
    'Contoh format JSON: {"description": "Pria berbaju hitam menyeduh kopi di meja bar kayu. '
    'Cahaya kuning hangat dari lampu gantung, kamera statis, suasana santai.", '
    '"characters": ["pria berbaju hitam"], "action": "menyeduh kopi", '
    '"location": "kafe", "objects": ["cangkir", "mesin espresso"], '
    '"state": "siang, santai", "confidence": 0.85, '
    '"tags": ["kopi", "barista", "kafe", "kuning hangat", "kamera statis", "santai"]}'
)


def parse_scene_analysis(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalisasi hasil vision menjadi dict analisis terstruktur yang aman dipakai."""
    if not isinstance(raw, dict):
        raw = {}

    def _str_list(val) -> List[str]:
        if isinstance(val, list):
            return [str(v).strip() for v in val if str(v).strip()]
        if isinstance(val, str) and val.strip():
            return [val.strip()]
        return []

    try:
        confidence = float(raw.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    return {
        "characters": _str_list(raw.get("characters")),
        "action": str(raw.get("action") or "").strip(),
        "location": str(raw.get("location") or "").strip(),
        "objects": _str_list(raw.get("objects")),
        "state": str(raw.get("state") or "").strip(),
        "confidence": round(confidence, 2),
    }


def _fallback_analysis(description: str, tags: List[str]) -> Dict[str, Any]:
    return {
        "characters": [],
        "action": description or "Aktivitas dalam video",
        "location": "",
        "objects": list(tags or []),
        "state": "",
        "confidence": 0.3,
    }


def build_scene_embedding_text(
    description: str,
    tags: List[str],
    transcript: Optional[str] = None,
) -> str:
    """Embedding input: description + tags + dialog transcript (if available)."""
    parts = [f"{description}. Kata kunci: {', '.join(tags)}"]
    if transcript and transcript.strip():
        parts.append(f'Dialog: "{transcript.strip()}"')
    return " ".join(parts)

async def analyze_scene(
    adapter: BaseLLMAdapter,
    keyframe_paths: List[str],
    transcript: Optional[str] = None,
) -> Tuple[str, List[str], List[float], Dict[str, Any]]:
    """Analyze scene keyframes with vision model and compute semantic embedding vector."""
    vision_result = await adapter.analyze_vision(keyframe_paths, VISION_PROMPT)
    description = vision_result.get("description", "Aktivitas dalam video")
    tags = vision_result.get("tags", ["video", "clip"])
    analysis = parse_scene_analysis(vision_result.get("analysis") or vision_result)

    # Combine description and tags for rich semantic embedding
    text_to_embed = build_scene_embedding_text(description, tags, transcript)
    embedding = await adapter.generate_embedding(text_to_embed)

    return description, tags, embedding, analysis


async def analyze_scenes_batch(
    adapter: BaseLLMAdapter,
    items: List[Dict[str, Any]],
) -> List[Tuple[str, List[str], List[float], Dict[str, Any]]]:
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

    # Scene yang tidak tercakup batch: fallback ke analyze_vision tunggal, secara paralel
    missing = [item for item in items if str(item["scene_index"]) not in results_map]
    if missing:
        async def _single(item: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
            try:
                kfs = item.get("keyframe_paths", [item["thumbnail_path"]])
                res = await adapter.analyze_vision(kfs, VISION_PROMPT)
            except Exception:
                res = {}
            return str(item["scene_index"]), res

        singles = await asyncio.gather(*[_single(m) for m in missing])
        for sc_id, res in singles:
            if res:
                results_map[sc_id] = res

    descriptions: List[str] = []
    tags_list: List[List[str]] = []
    texts_to_embed: List[str] = []
    analyses: List[Dict[str, Any]] = []

    for item in items:
        sc_id = str(item["scene_index"])
        r = results_map.get(sc_id)
        if r:
            desc = r.get("description") or "Cuplikan video aksi/aktivitas"
            tags = r.get("tags") or ["video", "scene"]
            analysis = parse_scene_analysis(r.get("analysis") or r)
        else:
            desc = "Cuplikan video aksi/aktivitas"
            tags = ["video", "scene", "aktivitas"]
            analysis = _fallback_analysis(desc, tags)

        descriptions.append(desc)
        tags_list.append(tags)
        texts_to_embed.append(
            build_scene_embedding_text(desc, tags, item.get("transcript"))
        )
        analyses.append(analysis)

    try:
        embedding_tasks = [adapter.generate_embedding(txt) for txt in texts_to_embed]
        embeddings = await asyncio.gather(*embedding_tasks)
    except Exception as exc:
        log.warning("Batch embedding generation error (%s); using hash fallback (degraded)", exc)
        adapter._embedding_degraded = True
        embeddings = [hash_embedding(txt) for txt in texts_to_embed]

    return list(zip(descriptions, tags_list, embeddings, analyses))

def compute_relationship(prev: Optional[Dict[str, Any]], cur: Dict[str, Any]) -> str:
    """Rule-based relationship scene sekarang vs scene sebelumnya dari overlap entitas."""
    if not prev:
        return "adegan pembuka"

    def norm_set(vals: List[str]) -> set:
        return {v.lower() for v in (vals or [])}

    # Fallback: tanpa analysis, pakai tags
    prev_chars = norm_set(prev.get("characters") or prev.get("tags") or [])
    cur_chars = norm_set(cur.get("characters") or cur.get("tags") or [])
    prev_loc = (prev.get("location") or "").lower()
    cur_loc = (cur.get("location") or "").lower()

    same_chars = bool(prev_chars & cur_chars) if (prev_chars and cur_chars) else None
    same_loc = bool(prev_loc and cur_loc and prev_loc == cur_loc) if (prev_loc and cur_loc) else None

    if same_chars and same_loc:
        return "lanjutan adegan yang sama"
    if same_chars and same_loc is False:
        return "karakter sama berpindah lokasi"
    if same_chars is False and same_loc:
        return "adegan baru di lokasi sama"
    if same_chars:
        return "lanjutan dengan karakter sama"
    return "adegan baru"
