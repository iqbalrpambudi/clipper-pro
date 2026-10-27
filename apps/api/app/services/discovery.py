import asyncio
import json
import logging
import re
from typing import Dict, List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project, SourceVideo
from app.schemas.discovery import (
    PresetCategory,
    VideoCandidate,
    VideoSearchRequest,
    VideoSearchResponse,
)

log = logging.getLogger(__name__)

# Preset Kategori Video Sumber Unggulan
PRESET_CATEGORIES: List[PresetCategory] = [
    PresetCategory(
        id="farming",
        title="Pertanian Modern & Panen Raya",
        description="Teknologi panen padi/gandum masif, smart farming, dan greenhouse sayuran modern.",
        badge="🌾 Agrikultur Modern",
        search_query="modern farming machinery rice harvest documentary",
        icon_name="Sprout",
    ),
    PresetCategory(
        id="construction",
        title="Konstruksi Jalan & Alat Berat",
        description="Proses pengaspalan jalan, perataan aspal, dan mesin konstruksi infrastruktur mega.",
        badge="🚜 Alat Berat & Jalan",
        search_query="road construction asphalt paving machinery technology process",
        icon_name="HardHat",
    ),
    PresetCategory(
        id="factory",
        title="Pabrik & Manufaktur Industri",
        description="Lini perakitan otomatis, conveyor belt modern, dan proses manufaktur massal.",
        badge="⚙️ Pabrik Otomatis",
        search_query="modern factory production line mass manufacturing process",
        icon_name="Factory",
    ),
    PresetCategory(
        id="craftsmanship",
        title="Kerajinan & Craftsmanship Presisi",
        description="Woodworking memuaskan, restorasi mesin klasik, dan fabrikasi logam presisi tinggi.",
        badge="🔨 Craft & Restorasi",
        search_query="satisfying craftsmanship woodworking metal fabrication process",
        icon_name="Hammer",
    ),
    PresetCategory(
        id="mining_mega",
        title="Mega Proyek & Mesin Tambang",
        description="Ekskavator raksasa, mesin bor terowongan TBM, dan mega mesin tambang modern.",
        badge="⛰️ Mega Proyek",
        search_query="giant mining machinery tunnel boring machine mega construction",
        icon_name="Mountain",
    ),
]

# Regex Pengecualian Video Berbasis AI (Sora, Runway, Kling, AI animation, dll.)
AI_EXCLUSION_PATTERN = re.compile(
    r"\b("
    r"sora|openai\s*sora|kling|kling\s*ai|runway|runwayml|gen-?[23]|midjourney|"
    r"pika|pika\s*labs|luma|dream\s*machine|haiper|deepfake|synthetic|"
    r"ai\s*video|ai\s*generated|ai\s*animation|ai\s*film|ai\s*movie|ai\s*art|"
    r"text\s*to\s*video|text-to-video|deforum|comfyui|civitai|"
    r"stable\s*video|svd|animated\s*by\s*ai|generative\s*ai"
    r")\b",
    re.IGNORECASE,
)

# Regex Konten Non-B-Roll / Talking-Head (Podcast, Vlog, Reaksi)
NEGATIVE_CONTENT_PATTERN = re.compile(
    r"\b("
    r"podcast|interview|vlog|reaction|reacting|review|unboxing|"
    r"talk\s*show|asmr\s*chewing|news\s*live|livestream|live\s*stream"
    r")\b",
    re.IGNORECASE,
)


def _format_duration(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _format_views(views: int) -> str:
    if views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M"
    elif views >= 1_000:
        return f"{views / 1_000:.1f}K"
    return str(views)


def get_preset_categories() -> List[PresetCategory]:
    return PRESET_CATEGORIES


def is_ai_content(title: str, description: str = "", channel: str = "") -> bool:
    """Cek apakah video terindikasi video buatan AI."""
    search_text = f"{title} {description} {channel}"
    return bool(AI_EXCLUSION_PATTERN.search(search_text))


def is_talking_head_or_vlog(title: str, description: str = "") -> bool:
    """Cek apakah video mengandung unsur vlog, podcast, atau talk show yang minim aksi B-roll."""
    search_text = f"{title} {description}"
    return bool(NEGATIVE_CONTENT_PATTERN.search(search_text))


async def search_candidates(req: VideoSearchRequest, db: AsyncSession) -> VideoSearchResponse:
    """Cari kandidat video YouTube menggunakan yt-dlp dengan filter ketat."""
    # Tentukan query pencarian
    query_used = ""
    if req.preset_id:
        for p in PRESET_CATEGORIES:
            if p.id == req.preset_id:
                query_used = p.search_query
                break

    if not query_used and req.custom_query:
        query_used = req.custom_query.strip()

    if not query_used:
        # Default ke preset pertama jika tidak ada
        query_used = PRESET_CATEGORIES[0].search_query
        req.preset_id = PRESET_CATEGORIES[0].id

    # Ambil video yang sudah ada di database untuk deteksi duplikasi
    existing_stmt = (
        select(SourceVideo.youtube_url, SourceVideo.project_id, Project.name)
        .join(Project, SourceVideo.project_id == Project.id)
        .where(SourceVideo.youtube_url.isnot(None))
    )
    existing_res = await db.execute(existing_stmt)
    existing_map: Dict[str, Tuple[str, str]] = {}
    for y_url, p_id, p_name in existing_res.all():
        if y_url:
            existing_map[y_url.strip()] = (p_id, p_name)

    # Eksekusi yt-dlp secara async
    # Minta lebih banyak item agar setelah difilter (AI, durasi, views) sisa tetap cukup
    fetch_count = max(20, req.limit * 3)
    cmd = [
        "yt-dlp",
        f"ytsearch{fetch_count}:{query_used}",
        "--dump-json",
        "--flat-playlist",
        "--match-filter",
        f"duration >= {req.min_duration} & duration <= {req.max_duration} & !is_live",
    ]

    log.info("Mencari kandidat YouTube: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace").strip()
        log.warning("yt-dlp search stderr: %s", err_msg)

    candidates: List[VideoCandidate] = []
    seen_ids = set()

    for line in stdout.decode(errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        vid_id = data.get("id")
        if not vid_id or vid_id in seen_ids:
            continue
        seen_ids.add(vid_id)

        title = data.get("title", "")
        description = data.get("description", "")
        channel = data.get("channel") or data.get("uploader") or "YouTube Creator"
        channel_url = data.get("channel_url") or data.get("uploader_url")
        duration = float(data.get("duration") or 0.0)
        views = int(data.get("view_count") or 0)
        url = (
            data.get("url")
            or data.get("webpage_url")
            or f"https://www.youtube.com/watch?v={vid_id}"
        )

        # 1. Pengecualian AI Video (Jika opsi exclude_ai aktif)
        if req.exclude_ai and is_ai_content(title, description, channel):
            log.info("Melewatkan video AI: %s", title)
            continue

        # 2. Pengecualian Podcast / Vlog / Non-B-Roll
        if is_talking_head_or_vlog(title, description):
            log.info("Melewatkan video non-B-roll/vlog: %s", title)
            continue

        # 3. Filter minimum views (hanya jika ada metadata views)
        if views > 0 and views < req.min_views:
            continue

        # Ambil thumbnail resolusi terbaik yang tersedia
        thumbnail = None
        thumbnails = data.get("thumbnails", [])
        if thumbnails and isinstance(thumbnails, list):
            # Ambil thumbnail dengan resolusi layak
            sorted_thumbs = sorted(thumbnails, key=lambda x: x.get("width") or 0, reverse=True)
            if sorted_thumbs:
                thumbnail = sorted_thumbs[0].get("url")
        if not thumbnail:
            thumbnail = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"

        # Cek apakah sudah pernah diimport ke project Clipper Pro
        is_imported = False
        existing_pid = None
        existing_pname = None

        # Cek kesesuaian URL langsung atau via video ID
        for ex_url, (ex_id, ex_name) in existing_map.items():
            if vid_id in ex_url or url == ex_url:
                is_imported = True
                existing_pid = ex_id
                existing_pname = ex_name
                break

        candidates.append(
            VideoCandidate(
                id=vid_id,
                title=title,
                url=url,
                duration=duration,
                duration_str=_format_duration(duration),
                views=views,
                views_str=_format_views(views),
                channel=channel,
                channel_url=channel_url,
                thumbnail=thumbnail,
                is_already_imported=is_imported,
                existing_project_id=existing_pid,
                existing_project_name=existing_pname,
            )
        )

        if len(candidates) >= req.limit:
            break

    # Urutkan berdasarkan views terbanyak terlebih dahulu
    candidates.sort(key=lambda x: x.views, reverse=True)

    return VideoSearchResponse(
        query_used=query_used,
        preset_id=req.preset_id,
        exclude_ai=req.exclude_ai,
        candidates=candidates,
    )
