from typing import Any, Dict, List, Tuple


FONT_METRIC_COMPENSATION: Dict[str, float] = {
    "Anton": 1.72,       # OpenType winAsc+Desc/unitsPerEm: 1.733 -> empirically verified ratio 1.72
    "Bebas Neue": 1.30,  # OpenType winAsc+Desc/unitsPerEm: 1.300 -> empirically verified ratio 1.30
    "Inter": 1.39,       # OpenType winAsc+Desc/unitsPerEm: 1.430 -> empirically verified ratio 1.39
    "Montserrat": 1.56,  # OpenType winAsc+Desc/unitsPerEm: 1.562 -> empirically verified ratio 1.56
    "Oswald": 1.70,      # OpenType winAsc+Desc/unitsPerEm: 1.702 -> empirically verified ratio 1.70
    "Poppins": 1.77,     # OpenType winAsc+Desc/unitsPerEm: 1.762 -> empirically verified ratio 1.77
    "Roboto": 1.20,      # OpenType winAsc+Desc/unitsPerEm: 1.200 -> empirically verified ratio 1.20
}

def hex_to_ass_color(hex_str: str, opacity: float = 1.0) -> str:
    """
    Convert #RRGGBB to ASS &HAABBGGRR hex format.
    In ASS: alpha 00 = completely opaque, FF = completely transparent.
    opacity ranges from 0.0 (transparent) to 1.0 (opaque).
    """
    clean = hex_str.lstrip("#")
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) != 6:
        clean = "FFFFFF"

    r = clean[0:2]
    g = clean[2:4]
    b = clean[4:6]

    # ASS alpha: 0 is opaque, 255 is transparent
    clamped_opacity = max(0.0, min(1.0, float(opacity)))
    a_val = int(round((1.0 - clamped_opacity) * 255))
    a_hex = f"{a_val:02X}"
    return f"&H{a_hex}{b}{g}{r}"


def ms_to_ass_time(ms: int) -> str:
    """Convert milliseconds to ASS timestamp H:MM:SS.cs."""
    total_sec, rem_ms = divmod(max(ms, 0), 1000)
    cs = rem_ms // 10  # centiseconds (0-99)
    mins, sec = divmod(total_sec, 60)
    hours, mins = divmod(mins, 60)
    return f"{hours}:{mins:02d}:{sec:02d}.{cs:02d}"


def ms_to_srt_time(ms: int) -> str:
    """Convert milliseconds to SRT timestamp HH:MM:SS,mmm."""
    total_sec, rem_ms = divmod(max(ms, 0), 1000)
    mins, sec = divmod(total_sec, 60)
    hours, mins = divmod(mins, 60)
    return f"{hours:02d}:{mins:02d}:{sec:02d},{rem_ms:03d}"


# One set of defaults for render, preview and export. Burst word groups, bold, uppercase,
# white text with black outline are fixed: that is the look of the target shorts.
STYLE_DEFAULTS: Dict[str, Any] = {
    "enabled": True,
    "preset_name": "pop_kuning",
    "font_family": "Montserrat",
    "font_size": 58,
    "highlight_color": "#FFE600",
    "position": "bottom",  # bottom | center
    "offset_y": 260,  # bottom: px up from base line, center: px down from middle
    "burst_word_count": 3,
    "highlight_animation": "scale",  # scale | none
}


def style_to_dict(style: Any) -> Dict[str, Any]:
    """SubtitleStyle row, dict or None -> complete style dict."""
    get = style.get if isinstance(style, dict) else (lambda k: getattr(style, k, None))
    return {k: (default if style is None or get(k) is None else get(k)) for k, default in STYLE_DEFAULTS.items()}


def subtitle_y(style: Dict[str, Any], play_res_y: int = 1920) -> Tuple[int, int]:
    """(ASS alignment, y) clamped to the band Shorts/Reels UI does not cover (16 % - 78 % of height)."""
    offset = int(style.get("offset_y") or 0)
    if style.get("position") in ("center", "top"):
        align, y = 5, play_res_y // 2 + offset
    else:
        align, y = 2, int(round(play_res_y * (1.0 - 0.1145))) - offset
    return align, max(int(play_res_y * 0.16), min(int(play_res_y * 0.78), y))


def generate_ass_subtitles(
    segments: List[Dict[str, Any]],
    style_config: Dict[str, Any],
    play_res_x: int = 1080,
    play_res_y: int = 1920,
) -> str:
    """Karaoke ASS: words shown in groups of 2-3, the spoken word highlighted (and popped)."""
    style = style_to_dict(style_config)
    font_name = style["font_family"]
    font_comp = next(
        (v for k, v in FONT_METRIC_COMPENSATION.items() if k.lower() in font_name.lower().replace("bebasneue", "bebas neue")),
        1.50,
    )
    font_size = max(16, int(round(int(style["font_size"]) * font_comp)))
    white = hex_to_ass_color("#FFFFFF")
    black = hex_to_ass_color("#000000")
    highlight = hex_to_ass_color(style["highlight_color"])
    align, pos_y = subtitle_y(style, play_res_y)
    pos_tag = f"{{\\an{align}\\pos({play_res_x // 2},{pos_y})}}"

    animate = style["highlight_animation"] != "none"
    pop = "{\\t(0,60,\\fscx116\\fscy116)\\t(60,120,\\fscx110\\fscy110)}" if animate else ""
    reset = "{\\fscx100\\fscy100}" if animate else ""
    burst = min(3, max(1, int(style["burst_word_count"])))

    header = f"""[Script Info]
Title: Cliper Pro Karaoke Subtitle
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KaraokeDefault,{font_name},{font_size},{white},{highlight},{black},{black},-1,0,0,0,100,100,0,0,1,2.5,0,{align},40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    lines = []
    for seg in segments:
        words = [w for w in seg.get("words", []) if w.get("word", "").strip()]
        for i in range(0, len(words), burst):
            group = words[i : i + burst]
            g_end = group[-1]["end_ms"]
            for j, word in enumerate(group):
                start = min(seg.get("start_ms", word["start_ms"]), word["start_ms"]) if i == j == 0 else word["start_ms"]
                end = min(group[j + 1]["start_ms"], g_end) if j < len(group) - 1 else max(word["end_ms"], g_end)
                if end <= start:
                    end = start + 200
                parts = []
                for m, w in enumerate(group):
                    text = w["word"].strip().upper()
                    if m == j and animate:
                        parts.append(f"{{\\c{highlight}}}{pop}{text}{reset}")
                    else:
                        parts.append(f"{{\\c{white}}}{text}")
                lines.append(
                    f"Dialogue: 0,{ms_to_ass_time(start)},{ms_to_ass_time(end)},KaraokeDefault,,0,0,0,,{pos_tag}{' '.join(parts)}"
                )
    return header + "\n".join(lines) + "\n"


def generate_srt_subtitles(segments: List[Dict[str, Any]]) -> str:
    """Generate standard SubRip (.srt) subtitle format."""
    entries = []
    index = 1
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text and seg.get("words"):
            text = " ".join(w["word"] for w in seg["words"])
        if not text:
            continue

        start_t = ms_to_srt_time(seg.get("start_ms", 0))
        end_t = ms_to_srt_time(seg.get("end_ms", seg.get("start_ms", 0) + 2000))

        entries.append(f"{index}\n{start_t} --> {end_t}\n{text}\n")
        index += 1

    return "\n".join(entries)
