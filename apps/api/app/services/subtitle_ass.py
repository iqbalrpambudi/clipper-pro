import re
from typing import List, Dict, Any, Optional

EMOJI_DICT = {
    "uang": "💰",
    "duit": "💵",
    "cuan": "💸",
    "kaya": "🤑",
    "api": "🔥",
    "panas": "🔥",
    "kaget": "😱",
    "misteri": "🕵️",
    "rahasia": "🤫",
    "otak": "🧠",
    "cerdas": "💡",
    "waktu": "⏱️",
    "cepat": "⚡",
    "juara": "🏆",
    "menang": "🥇",
    "bahaya": "⚠️",
    "awas": "🚨",
    "cinta": "❤️",
    "kopi": "☕",
    "makanan": "🍔",
    "dunia": "🌍",
    "bintang": "⭐",
    "target": "🎯",
    "sukses": "🚀",
}


def hex_to_ass_color(hex_str: str, alpha: float = 0.0) -> str:
    """Convert #RRGGBB to ASS &HAABBGGRR hex format."""
    clean = hex_str.lstrip("#")
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) != 6:
        clean = "FFFFFF"

    r = clean[0:2]
    g = clean[2:4]
    b = clean[4:6]
    # alpha in ASS: 00 = opaque, FF = transparent
    a_val = int(alpha * 255)
    a_hex = f"{a_val:02X}"
    return f"&H{a_hex}{b}{g}{r}"


def ms_to_ass_time(ms: int) -> str:
    """Convert milliseconds to ASS timestamp H:MM:SS.cs."""
    total_sec, rem_ms = divmod(max(ms, 0), 1000)
    cs = rem_ms // 10  # centiseconds (0-99)
    mins, sec = divmod(total_sec, 60)
    hours, mins = divmod(mins, 60)
    return f"{hours}:{mins:02d}:{sec:02d}.{cs:02d}"


def get_builtin_presets() -> List[Dict[str, Any]]:
    return [
        {
            "id": "viral_tiktok",
            "name": "Viral TikTok / Reels",
            "description": "Font tebal sans-serif, teks putih dengan outline hitam tebal, highlight kuning cerah, animasi scale-up.",
            "is_builtin": True,
            "font_family": "Montserrat",
            "font_size": 56,
            "font_weight": "Bold",
            "primary_color": "#FFFFFF",
            "highlight_color": "#FFE600",
            "outline_color": "#000000",
            "outline_width": 5,
            "box_color": "#000000",
            "box_opacity": 0.0,
            "position": "bottom",
            "offset_y": -120,
            "offset_x": 0,
            "display_mode": "per_word",
            "burst_word_count": 2,
            "highlight_animation": "scale",
            "emoji_enabled": True,
        },
        {
            "id": "hormozi_punch",
            "name": "Alex Hormozi Punch",
            "description": "Font sangat tebal huruf kapital di tengah layar, mode burst 2-3 kata dengan kotak latar belakang dan efek punch.",
            "is_builtin": True,
            "font_family": "Montserrat",
            "font_size": 68,
            "font_weight": "Bold",
            "primary_color": "#FFFFFF",
            "highlight_color": "#00FF66",
            "outline_color": "#000000",
            "outline_width": 6,
            "box_color": "#111111",
            "box_opacity": 0.8,
            "position": "center",
            "offset_y": 0,
            "offset_x": 0,
            "display_mode": "burst",
            "burst_word_count": 2,
            "highlight_animation": "scale",
            "emoji_enabled": True,
        },
        {
            "id": "minimalist",
            "name": "Minimalist Clean",
            "description": "Font modern elegan, tanpa outline tebal, highlight halus warna putih solid dengan bayangan lembut.",
            "is_builtin": True,
            "font_family": "Inter",
            "font_size": 44,
            "font_weight": "Normal",
            "primary_color": "#EEEEEE",
            "highlight_color": "#38BDF8",
            "outline_color": "#0F172A",
            "outline_width": 2,
            "box_color": "#000000",
            "box_opacity": 0.0,
            "position": "bottom",
            "offset_y": -90,
            "offset_x": 0,
            "display_mode": "full_sentence",
            "burst_word_count": 2,
            "highlight_animation": "color",
            "emoji_enabled": False,
        },
    ]


def generate_ass_subtitles(
    segments: List[Dict[str, Any]],
    style_config: Dict[str, Any],
    play_res_x: int = 1080,
    play_res_y: int = 1920,
) -> str:
    """Generate ASS format karaoke subtitle content."""
    font_name = style_config.get("font_family", "Montserrat")
    font_size = style_config.get("font_size", 56)
    bold = -1 if style_config.get("font_weight", "Bold").lower() == "bold" else 0

    primary_col = hex_to_ass_color(style_config.get("primary_color", "#FFFFFF"))
    highlight_col = hex_to_ass_color(style_config.get("highlight_color", "#FFE600"))
    outline_col = hex_to_ass_color(style_config.get("outline_color", "#000000"))
    box_col = hex_to_ass_color(style_config.get("box_color", "#000000"), alpha=style_config.get("box_opacity", 0.0))

    outline_w = style_config.get("outline_width", 4)
    position = style_config.get("position", "bottom")
    offset_y = style_config.get("offset_y", 0)

    # Alignment in ASS: 2 = bottom-center, 5 = center-center, 8 = top-center
    if position == "top":
        align = 8
        margin_v = 180 + offset_y
    elif position == "center":
        align = 5
        margin_v = 0 + offset_y
    else:
        align = 2
        margin_v = 220 - offset_y

    border_style = 3 if style_config.get("box_opacity", 0.0) > 0.1 else 1

    header = f"""[Script Info]
Title: Cliper Pro Karaoke Subtitle
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KaraokeDefault,{font_name},{font_size},{primary_col},{highlight_col},{outline_col},{box_col},{bold},0,0,0,100,100,0,0,{border_style},{outline_w},0,{align},60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    dialogue_lines = []
    display_mode = style_config.get("display_mode", "per_word")
    burst_count = max(style_config.get("burst_word_count", 2), 2)
    emoji_enabled = style_config.get("emoji_enabled", True)
    anim = style_config.get("highlight_animation", "scale")

    for seg in segments:
        words = seg.get("words", [])
        if not words:
            continue

        if display_mode == "per_word":
            # Per-word mode: each word shows for its exact spoken duration
            for w in words:
                w_text = w["word"].strip()
                if not w_text:
                    continue
                w_clean = re.sub(r"[^\w]", "", w_text.lower())
                emoji = f" {EMOJI_DICT[w_clean]}" if emoji_enabled and w_clean in EMOJI_DICT else ""
                start_t = ms_to_ass_time(w["start_ms"])
                end_t = ms_to_ass_time(w["end_ms"])

                scale_fx = "{\\t(0,80,\\fscx118\\fscy118)\\t(80,180,\\fscx100\\fscy100)}" if anim == "scale" else ""
                colored_text = f"{{\\c{highlight_col}}}{scale_fx}{w_text.upper()}{emoji}"
                dialogue_lines.append(
                    f"Dialogue: 0,{start_t},{end_t},KaraokeDefault,,0,0,0,,{colored_text}"
                )

        elif display_mode == "burst":
            # Hormozi style: burst of 2-3 words simultaneously
            for i in range(0, len(words), burst_count):
                group = words[i : i + burst_count]
                g_start = group[0]["start_ms"]
                g_end = group[-1]["end_ms"]
                start_t = ms_to_ass_time(g_start)
                end_t = ms_to_ass_time(g_end)

                # Format karaoke timing for words in this burst
                line_parts = []
                for w in group:
                    w_text = w["word"].strip()
                    w_clean = re.sub(r"[^\w]", "", w_text.lower())
                    emoji = f" {EMOJI_DICT[w_clean]}" if emoji_enabled and w_clean in EMOJI_DICT else ""
                    dur_cs = max((w["end_ms"] - w["start_ms"]) // 10, 5)
                    # \kf = smooth karaoke fill tag in ASS
                    line_parts.append(f"{{\\kf{dur_cs}}}{w_text.upper()}{emoji}")

                dialogue_lines.append(
                    f"Dialogue: 0,{start_t},{end_t},KaraokeDefault,,0,0,0,,{' '.join(line_parts)}"
                )

        else:
            # Full sentence with running karaoke highlight
            seg_start = ms_to_ass_time(seg.get("start_ms", words[0]["start_ms"]))
            seg_end = ms_to_ass_time(seg.get("end_ms", words[-1]["end_ms"]))

            karaoke_text_parts = []
            for w in words:
                w_text = w["word"].strip()
                dur_cs = max((w["end_ms"] - w["start_ms"]) // 10, 5)
                w_clean = re.sub(r"[^\w]", "", w_text.lower())
                emoji = f" {EMOJI_DICT[w_clean]}" if emoji_enabled and w_clean in EMOJI_DICT else ""
                karaoke_text_parts.append(f"{{\\kf{dur_cs}}}{w_text}{emoji}")

            dialogue_lines.append(
                f"Dialogue: 0,{seg_start},{seg_end},KaraokeDefault,,0,0,0,,{' '.join(karaoke_text_parts)}"
            )

    return header + "\n".join(dialogue_lines) + "\n"
