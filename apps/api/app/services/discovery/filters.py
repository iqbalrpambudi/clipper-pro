import re
from urllib.parse import parse_qs, urlparse

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


def format_duration(seconds: float) -> str:
    m, s = divmod(max(0, int(seconds)), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def format_views(views: int) -> str:
    if views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M"
    if views >= 1_000:
        return f"{views / 1_000:.1f}K"
    return str(max(0, views))


def is_ai_content(title: str, description: str = "", channel: str = "") -> bool:
    """Cek apakah video terindikasi video buatan AI."""
    search_text = f"{title} {description} {channel}"
    return bool(AI_EXCLUSION_PATTERN.search(search_text))


def is_talking_head_or_vlog(title: str, description: str = "") -> bool:
    """Cek apakah video mengandung unsur vlog, podcast, atau talk show yang minim aksi B-roll."""
    search_text = f"{title} {description}"
    return bool(NEGATIVE_CONTENT_PATTERN.search(search_text))


def normalize_video_key(url: str) -> str:
    """Normalize a video URL into a stable platform+id key for deduplication."""
    raw = (url or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.rstrip("/")

    # YouTube watch?v= or youtu.be/
    if "youtube.com" in host:
        qs = parse_qs(parsed.query)
        if "v" in qs and qs["v"]:
            return f"youtube:{qs['v'][0]}"
    if "youtu.be" in host and path:
        return f"youtube:{path.lstrip('/').split('/')[0]}"

    # Dailymotion /video/<id>
    if "dailymotion.com" in host and "/video/" in path:
        vid = path.split("/video/")[-1].split("_")[0].split("/")[0]
        if vid:
            return f"dailymotion:{vid}"

    # Bilibili /video/<bvid>
    if "bilibili.com" in host and "/video/" in path:
        bvid = path.split("/video/")[-1].split("/")[0]
        if bvid:
            return f"bilibili:{bvid}"

    # Archive.org /details/<identifier>
    if "archive.org" in host and "/details/" in path:
        ident = path.split("/details/")[-1].split("/")[0]
        if ident:
            return f"archive_org:{ident}"

    return f"{host}{path}"
