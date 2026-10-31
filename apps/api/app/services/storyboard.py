import asyncio
import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.narration import AudioTrack, Narration
from app.models.project import Project
from app.models.storyboard import StoryboardItem
from app.prompts.storyboard import (
    CHAPTER_EXPANSION_SYSTEM_PROMPT_EN_TEMPLATE,
    CHAPTER_EXPANSION_SYSTEM_PROMPT_ID_TEMPLATE,
    EXTRACT_CONTINUITY_BIBLE_SYSTEM_PROMPT,
    NARRATIVE_ARC_DEFAULT_EN,
    NARRATIVE_ARC_DEFAULT_ID,
    NARRATIVE_ARC_DRAMATIC_EN,
    NARRATIVE_ARC_DRAMATIC_ID,
    OUTLINE_SYSTEM_PROMPT_EN_TEMPLATE,
    OUTLINE_SYSTEM_PROMPT_ID_TEMPLATE,
    STORYBOARD_SYSTEM_PROMPT_EN_TEMPLATE,
    STORYBOARD_SYSTEM_PROMPT_ID_TEMPLATE,
    format_tone_storytelling_guidelines,
)
from app.services.ai_adapters.factory import get_active_llm_adapter

log = logging.getLogger(__name__)

CLOSEUP_SHOT_TYPES = {
    "close_up",
    "closeup",
    "extreme_closeup",
    "extreme_close_up",
    "medium_closeup",
    "medium_close_up",
    "cu",
    "ecu",
    "mcu",
}

VALID_SHOT_TYPES = {
    "establishing_wide",
    "wide",
    "medium",
    "over_the_shoulder",
    "medium_closeup",
    "close_up",
    "extreme_closeup",
}

VALID_CAMERA_ANGLES = {"eye_level", "low_angle", "high_angle", "dutch_angle"}
VALID_FOCAL_POINTS = {"center", "left", "right", "upper_center"}
VALID_CAMERA_MOTIONS = {
    "zoom_in",
    "zoom_out",
    "pan_left",
    "pan_right",
    "pan_up",
    "pan_down",
    "static",
}


def _normalize_key(text: str) -> str:
    """Normalize names/labels for fuzzy token matching: lowercase alphanumeric only."""
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def _normalize_continuity_bible(
    characters: Optional[List[Dict[str, Any]]],
    locations: Optional[List[Dict[str, Any]]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Normalize character and location entries so structured shot-scale fields and legacy anchors stay synced."""
    norm_chars: List[Dict[str, Any]] = []
    for c in characters or []:
        if not isinstance(c, dict):
            continue
        item = dict(c)
        face = (item.get("face_head_anchor") or "").strip()
        outfit = (item.get("outfit_body_anchor") or "").strip()
        visual = (item.get("visual_anchor") or item.get("description") or "").strip()
        if not visual and (face or outfit):
            visual = ", ".join(p for p in [face, outfit] if p)
        item["face_head_anchor"] = face
        item["outfit_body_anchor"] = outfit
        item["visual_anchor"] = visual

        raw_variants = item.get("variants")
        if isinstance(raw_variants, list):
            norm_variants: List[Dict[str, Any]] = []
            for v in raw_variants:
                if not isinstance(v, dict):
                    continue
                v_item = dict(v)
                v_face = (v_item.get("face_head_anchor") or "").strip()
                v_outfit = (v_item.get("outfit_body_anchor") or "").strip()
                v_vis = (v_item.get("visual_anchor") or v_item.get("description") or "").strip()
                if not v_vis and (v_face or v_outfit):
                    v_vis = ", ".join(p for p in [v_face, v_outfit] if p)
                v_item["face_head_anchor"] = v_face
                v_item["outfit_body_anchor"] = v_outfit
                v_item["visual_anchor"] = v_vis
                norm_variants.append(v_item)
            item["variants"] = norm_variants
        norm_chars.append(item)

    norm_locs: List[Dict[str, Any]] = []
    for loc in locations or []:
        if not isinstance(loc, dict):
            continue
        l_item = dict(loc)
        env = (l_item.get("environment_anchor") or l_item.get("description") or "").strip()
        closeup_bg = (l_item.get("closeup_background_anchor") or "").strip()
        props = (l_item.get("focal_props") or l_item.get("key_props") or "").strip()
        light = (l_item.get("lighting_direction") or "").strip()
        l_item["environment_anchor"] = env
        l_item["closeup_background_anchor"] = closeup_bg
        l_item["focal_props"] = props
        l_item["lighting_direction"] = light
        norm_locs.append(l_item)

    return norm_chars, norm_locs


def _is_closeup_shot(prompt_template: str, shot_metadata: Optional[Dict[str, Any]] = None) -> bool:
    """Detect whether the current shot is a close-up / medium-close-up shot."""
    if isinstance(shot_metadata, dict):
        st = (shot_metadata.get("shot_type") or "").strip().lower().replace("-", "_").replace(" ", "_")
        if st:
            return st in CLOSEUP_SHOT_TYPES

    lower_prompt = (prompt_template or "").lower()
    return bool(
        re.search(
            r"\b(extreme\s+close[- ]?up|tight\s+close[- ]?up|medium\s+close[- ]?up|close[- ]?up\s+shot|close[- ]?up\s+portrait|close[- ]?up\s+on|close[- ]?up\s+of)\b",
            lower_prompt,
        )
    )


def _compile_character_anchor(entity_dict: Dict[str, Any], closeup_mode: bool) -> str:
    """Compile character or variant anchor tailored to Close-Up vs Wide/Medium shot scale."""
    face = (entity_dict.get("face_head_anchor") or "").strip()
    outfit = (entity_dict.get("outfit_body_anchor") or "").strip()
    visual = (entity_dict.get("visual_anchor") or entity_dict.get("description") or "").strip()

    if closeup_mode:
        if face:
            return face
        return visual or outfit

    if face and outfit:
        return f"{face}, {outfit}"
    return visual or face or outfit


def _compile_location_anchor(loc_item: Dict[str, Any], closeup_mode: bool) -> str:
    """Compile location micro-set anchor tailored to Close-Up (bokeh behind subject) vs Wide/Medium architecture."""
    env_anchor = (loc_item.get("environment_anchor") or loc_item.get("description") or "").strip()
    closeup_bg = (loc_item.get("closeup_background_anchor") or "").strip()
    props = (loc_item.get("focal_props") or loc_item.get("key_props") or "").strip()
    lighting = (loc_item.get("lighting_direction") or "").strip()

    if closeup_mode:
        if closeup_bg:
            base = closeup_bg
        elif env_anchor:
            base = f"softly defocused close-up background of {env_anchor}"
        else:
            base = ""
    else:
        base = env_anchor or closeup_bg

    parts: List[str] = [base] if base else []
    if props and props.lower() not in base.lower():
        parts.append(f"key anchor elements: {props}")
    if lighting and lighting.lower() not in base.lower():
        parts.append(f"consistent lighting: {lighting}")

    return ", ".join(parts)


def resolve_prompt_variables(
    prompt_template: str,
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    preset_master_prompt: Optional[str] = None,
    shot_metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Resolve and compile variable tokens in a storyboard image prompt template,
    adapting character & location anchors to the active shot scale (Wide vs Close-Up)
    and enforcing 180-degree spatial continuity.

    Supported tokens:
    - [preset:style], [style], [Preset Style] -> preset master prompt
    - [era], [world:era] -> world_setting era
    - [char:<char_id_or_name>:<variant_id_or_label>] -> specific character variant
    - [char:<char_id_or_name>] -> default character anchor
    - [<char_name_or_id>:<variant>] -> shorthand character variant (e.g. [malinkundang:batu])
    - [loc:<loc_id_or_name>] or [location:<loc_id_or_name>] -> location anchor
    - [<loc_name_or_id>] -> shorthand location (e.g. [pesisirairmanis])
    - Optional trailing `:closeup` or `:wide` modifier on any char/loc token
    """
    if not prompt_template or not isinstance(prompt_template, str):
        return ""

    chars = characters or []
    locs = locations or []
    world = world_setting or {}
    style_text = (preset_master_prompt or "").strip()
    scene_is_closeup = _is_closeup_shot(prompt_template, shot_metadata)

    # Pre-index characters for rapid and fuzzy lookup
    char_map: Dict[str, Dict[str, Any]] = {}
    for c in chars:
        if not isinstance(c, dict):
            continue
        c_id = _normalize_key(c.get("id", ""))
        c_name = _normalize_key(c.get("name", ""))
        if c_id:
            char_map[c_id] = c
        if c_name:
            char_map[c_name] = c

    # Pre-index locations
    loc_map: Dict[str, Dict[str, Any]] = {}
    for loc in locs:
        if not isinstance(loc, dict):
            continue
        l_id = _normalize_key(loc.get("id", "") or loc.get("location_id", ""))
        l_name = _normalize_key(loc.get("name", ""))
        if l_id:
            loc_map[l_id] = loc
        if l_name:
            loc_map[l_name] = loc

    def _extract_inline_mode(raw_part: str) -> Tuple[str, bool]:
        """Strip optional trailing :closeup / :wide modifier and return (clean_query, is_closeup)."""
        if ":" in raw_part:
            head, tail = raw_part.rsplit(":", 1)
            t_low = tail.strip().lower().replace("-", "_")
            if t_low in ("closeup", "close_up", "cu", "mcu"):
                return head.strip(), True
            if t_low in ("wide", "medium", "full"):
                return head.strip(), False
        return raw_part.strip(), scene_is_closeup

    def _find_character(query: str) -> Optional[Dict[str, Any]]:
        norm_q = _normalize_key(query)
        if not norm_q:
            return None
        if norm_q in char_map:
            return char_map[norm_q]
        for k, c in char_map.items():
            if norm_q in k or k in norm_q:
                return c
        return None

    def _find_variant(char_dict: Dict[str, Any], variant_query: str, closeup_mode: bool) -> str:
        norm_v = _normalize_key(variant_query)
        variants = char_dict.get("variants")
        if norm_v and isinstance(variants, list) and len(variants) > 0:
            for v in variants:
                if not isinstance(v, dict):
                    continue
                v_id = _normalize_key(v.get("variant_id", ""))
                v_lbl = _normalize_key(v.get("label", "") or v.get("name", ""))
                if norm_v == v_id or norm_v == v_lbl or norm_v in v_lbl or (v_lbl and v_lbl in norm_v):
                    return _compile_character_anchor(v, closeup_mode)
            first_v = variants[0]
            if isinstance(first_v, dict):
                return _compile_character_anchor(first_v, closeup_mode)
        if not norm_v and isinstance(variants, list) and len(variants) > 0 and not (
            char_dict.get("visual_anchor") or char_dict.get("face_head_anchor")
        ):
            first_v = variants[0]
            if isinstance(first_v, dict):
                return _compile_character_anchor(first_v, closeup_mode)
        return _compile_character_anchor(char_dict, closeup_mode)

    def _find_location(query: str, closeup_mode: bool) -> Optional[str]:
        norm_q = _normalize_key(query)
        if not norm_q:
            return None
        if norm_q in loc_map:
            return _compile_location_anchor(loc_map[norm_q], closeup_mode)
        for k, loc_item in loc_map.items():
            if norm_q in k or k in norm_q:
                return _compile_location_anchor(loc_item, closeup_mode)
        return None

    def _token_replacer(match: re.Match) -> str:
        raw_inner = match.group(1).strip()
        lower_inner = raw_inner.lower()

        # 1. Preset Style
        if lower_inner in ["preset:style", "style", "preset style", "preset_style"]:
            return style_text

        # 2. Era & World Setting
        if lower_inner in ["era", "world:era", "world_setting:era"]:
            return (world.get("era") or "").strip()
        if lower_inner.startswith("time:") or lower_inner.startswith("mood:"):
            key = raw_inner.split(":", 1)[1].strip()
            return (world.get(key) or world.get("atmosphere") or "").strip()

        # 3. Explicit Character Token [char:name:variant] or [char:name] (+ optional :closeup/:wide)
        if lower_inner.startswith("char:") or lower_inner.startswith("character:"):
            body = raw_inner.split(":", 1)[1].strip()
            body_clean, closeup_mode = _extract_inline_mode(body)
            parts = body_clean.split(":", 1)
            c_name = parts[0].strip()
            v_name = parts[1].strip() if len(parts) > 1 else ""
            c_obj = _find_character(c_name)
            if c_obj:
                if v_name:
                    return _find_variant(c_obj, v_name, closeup_mode)
                return _compile_character_anchor(c_obj, closeup_mode)

        # 4. Explicit Location Token [loc:name] or [location:name] (+ optional :closeup/:wide)
        if lower_inner.startswith("loc:") or lower_inner.startswith("location:"):
            l_body = raw_inner.split(":", 1)[1].strip()
            l_name, closeup_mode = _extract_inline_mode(l_body)
            found_loc = _find_location(l_name, closeup_mode)
            if found_loc is not None:
                return found_loc

        # 5. Shorthand character variant [malinkundang:batu] or [pesisirpantai:closeup]
        if ":" in raw_inner and not lower_inner.startswith("http"):
            cleaned_shorthand, closeup_mode = _extract_inline_mode(raw_inner)
            if ":" in cleaned_shorthand:
                parts = cleaned_shorthand.split(":", 1)
                c_cand = _find_character(parts[0].strip())
                if c_cand:
                    return _find_variant(c_cand, parts[1].strip(), closeup_mode)
            else:
                c_cand = _find_character(cleaned_shorthand)
                if c_cand:
                    return _compile_character_anchor(c_cand, closeup_mode)
                l_cand = _find_location(cleaned_shorthand, closeup_mode)
                if l_cand is not None:
                    return l_cand

        # 6. Shorthand single token: check character or location
        c_cand = _find_character(raw_inner)
        if c_cand:
            return _find_variant(c_cand, "", scene_is_closeup)

        l_cand = _find_location(raw_inner, scene_is_closeup)
        if l_cand is not None:
            return l_cand

        # If not matched to any token pattern (e.g. aspect ratio [16:9]), leave original
        return match.group(0)

    # Replace bracketed tokens: matches [token] but avoids nested or mismatched
    resolved = re.sub(r"\[([a-zA-Z0-9_: -]+)\]", _token_replacer, prompt_template)

    # Inject spatial blocking & camera angle continuity from shot_metadata when present
    if isinstance(shot_metadata, dict) and shot_metadata:
        continuity_notes: List[str] = []
        camera_angle = (shot_metadata.get("camera_angle") or "").strip().lower().replace("_", " ")
        if camera_angle and camera_angle != "eye level" and camera_angle not in resolved.lower():
            continuity_notes.append(f"{camera_angle} camera perspective")

        blocking = (shot_metadata.get("spatial_blocking") or "").strip()
        if blocking and blocking.lower()[:32] not in resolved.lower():
            continuity_notes.append(f"180-degree spatial blocking: {blocking}")

        if continuity_notes:
            suffix = ". " if not resolved.rstrip().endswith((".", "!", "?")) else " "
            resolved = f"{resolved.rstrip()}{suffix}{'; '.join(continuity_notes)}."

    # Clean up whitespace and stray punctuation
    resolved = re.sub(r"\s+", " ", resolved)
    resolved = re.sub(r"\s+([,.;])", r"\1", resolved)
    resolved = re.sub(r"([,])\s*([,])", r",", resolved)
    return resolved.strip()


# Alias for backward and forward compatibility
resolve_prompt_tokens = resolve_prompt_variables


def clean_narration_for_tts(
    text: str,
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
) -> str:
    """Clean and sanitize voiceover narration text for optimal TTS delivery.

    1. Resolves leaked prompt tokens ([char:aladin:muda], [char:penyihir], [loc:pantai])
       into plain, natural spoken entity names ('Aladin', 'Penyihir', 'Pantai').
    2. Completely removes visual styling/preset tokens ([preset:style], [style], [era]).
    3. Eliminates semicolons (;) by turning them into commas (,) for smooth TTS pauses.
    4. Eliminates colons (:) by converting time formats (e.g. 10:00 -> 10.00) and replacing
       other colons with commas (,) so voice synthesis never stumbles.
    5. Normalizes consecutive commas, stray commas before sentence closers, and redundant whitespace.
    """
    if not text or not isinstance(text, str):
        return ""

    chars = characters or []
    locs = locations or []
    world = world_setting or {}

    # Pre-index characters
    char_map: Dict[str, str] = {}
    for c in chars:
        if not isinstance(c, dict):
            continue
        c_name = (c.get("name") or "").strip()
        c_id = _normalize_key(c.get("id") or "")
        c_norm_name = _normalize_key(c_name)
        if c_name:
            if c_id:
                char_map[c_id] = c_name
            if c_norm_name:
                char_map[c_norm_name] = c_name

    # Pre-index locations
    loc_map: Dict[str, str] = {}
    for loc in locs:
        if not isinstance(loc, dict):
            continue
        l_name = (loc.get("name") or "").strip()
        l_id = _normalize_key(loc.get("id") or loc.get("location_id") or "")
        l_norm_name = _normalize_key(l_name)
        if l_name:
            if l_id:
                loc_map[l_id] = l_name
            if l_norm_name:
                loc_map[l_norm_name] = l_name

    def _replace_narration_token(match: re.Match) -> str:
        raw = match.group(1).strip()
        lower = raw.lower()

        # 1. Preset style / style tokens -> remove completely
        if any(lower.startswith(p) for p in ["preset:", "style", "preset_style", "preset style"]):
            return ""

        # 2. Era / world setting tokens
        if lower in ["era", "world:era", "world_setting:era"]:
            return (world.get("era") or "").strip()
        if lower.startswith("time:") or lower.startswith("mood:"):
            return ""

        # 3. Explicit character tokens [char:<id>:<variant>] or [char:<id>]
        if lower.startswith("char:") or lower.startswith("character:"):
            parts = raw.split(":", 2)
            c_key = parts[1].strip()
            norm_k = _normalize_key(c_key)
            if norm_k in char_map:
                return char_map[norm_k]
            # Try partial matching in char_map
            for k, name in char_map.items():
                if norm_k in k or k in norm_k:
                    return name
            # Fallback to human readable name from the key itself
            return c_key.replace("_", " ").replace("-", " ").title()

        # 4. Explicit location tokens [loc:<id>] or [location:<id>]
        if lower.startswith("loc:") or lower.startswith("location:"):
            parts = raw.split(":", 1)
            l_key = parts[1].strip()
            norm_k = _normalize_key(l_key)
            if norm_k in loc_map:
                return loc_map[norm_k]
            for k, name in loc_map.items():
                if norm_k in k or k in norm_k:
                    return name
            return l_key.replace("_", " ").replace("-", " ").title()

        # 5. Shorthand character variant [malinkundang:batu]
        if ":" in raw and not lower.startswith("http"):
            parts = raw.split(":", 1)
            norm_cand = _normalize_key(parts[0].strip())
            if norm_cand in char_map:
                return char_map[norm_cand]

        # 6. Shorthand single token match
        norm_raw = _normalize_key(raw)
        if norm_raw in char_map:
            return char_map[norm_raw]
        if norm_raw in loc_map:
            return loc_map[norm_raw]

        # 7. Unknown bracket tags / SFX -> strip
        return ""

    # Replace bracketed tokens: matches [token]
    cleaned = re.sub(r"\[([a-zA-Z0-9_: -]+)\]", _replace_narration_token, text)

    # Also strip any leftover bracketed annotations e.g. [Musik Tegang], [Laughs], etc.
    cleaned = re.sub(r"\[.*?\]", "", cleaned)

    # Punctuation cleaning:
    # 1. Convert clock/timestamp formats (e.g. 10:00 -> 10.00, 14:30 -> 14.30)
    cleaned = re.sub(r"(\d+):(\d+)", r"\1.\2", cleaned)

    # 2. Replace semicolons (;) with commas (,)
    cleaned = re.sub(r"\s*;\s*", ", ", cleaned)

    # 3. Replace colons (:) with commas (,)
    cleaned = re.sub(r"\s*:\s*", ", ", cleaned)

    # 4. Clean up any resulting multiple commas, e.g. ",," or ", ," -> ","
    cleaned = re.sub(r",(\s*,)+", ",", cleaned)

    # 5. Clean up comma before period, exclamation, or question mark e.g. ",." -> "."
    cleaned = re.sub(r",\s*([.!?])", r"\1", cleaned)

    # 6. Replace comma at end of string or before closing quote with period
    cleaned = re.sub(r",\s*(['”\"’])$", r".\1", cleaned)
    cleaned = re.sub(r",\s*$", ".", cleaned)

    # 7. Clean up comma at start of sentence or after opening quote
    cleaned = re.sub(r'(^|["“\'‘])\s*,\s*', r'\1', cleaned)

    # 8. Clean up multiple spaces
    cleaned = re.sub(r"[ \t]+", " ", cleaned)

    return cleaned.strip()


def _build_visual_guidelines(preset: Optional[Any]) -> Tuple[str, str, str, str]:
    """Helper to extract consistent visual guidelines and example prompts from preset."""
    if preset:
        preset_name = preset.name
        preset_master = (preset.master_prompt or "").strip()
        attrs = getattr(preset, "style_attributes", {}) or {}
        art_style = attrs.get("art_style", "")
        char_style = attrs.get("character_style", "")
        lighting_style = attrs.get("lighting", "")
        bg_style = attrs.get("background", "")

        visual_guidelines = (
            f"3. GAYA VISUAL KONSISTEN PRESET AKTIF ({preset_name.upper()}):\n"
            f"   - Nama Preset: {preset_name}\n"
            f"   - Master Prompt & Estetika Visual: {preset_master}\n"
        )
        if art_style:
            visual_guidelines += f"   - Art Style: {art_style}\n"
        if char_style:
            visual_guidelines += f"   - Karakter & Sosok: {char_style}\n"
        if lighting_style or bg_style:
            visual_guidelines += f"   - Pencahayaan & Suasana: {lighting_style} {bg_style}\n"

        visual_guidelines += (
            "   - ATURAN KUNCI PEMBUATAN PROMPT GAMBAR (image_prompt):\n"
            f"     * Setiap adegan (scene) WAJIB memuat 1 `image_prompt` dalam Bahasa Inggris yang secara detail, hidup, dan konkret mendeskripsikan subjek visual, pose/ekspresi karakter, aksi kontekstual, dan komposisi 16:9 landscape.\n"
            f"     * Gaya seni, anatomi karakter, palet warna, dan pencahayaan WAJIB mengadopsi gaya visual '{preset_name}'.\n"
            "     * PENTING: JANGAN menyertakan gaya stickman doodle atau kertas perkamen antik jika preset aktif BUKAN gaya stickman!\n"
            "   - LARANGAN KERAS: DILARANG menyertakan teks, tulisan, huruf, label, speech bubbles, frame/bingkai tepi, atau watermark di dalam prompt visual.\n\n"
        )
        example_prompt_1 = f"A compelling widescreen 16:9 shot of an ancient wooden ship sailing across calm night ocean waters, a sailor looking through a brass spyglass at glowing constellations in the night sky, rendered in {preset_name} style ({preset_master[:70]})."
        example_prompt_2 = f"A dramatic close-up scene of the sailor holding a vintage brass compass in shock as thick swirling fog surrounds the ship deck, rendered in {preset_name} style ({preset_master[:70]})."
        preset_label = preset_name
    else:
        visual_guidelines = (
            "3. GAYA VISUAL STICKMAN PARCHMENT (WAJIB DIIKUTI KONSISTEN):\n"
            "   - Karakter: Karakter stickman / doodle minimalis khas (smooth round bald white head without hair, expressive black dot eyes, thin stick limbs, mengenakan jubah/kain longgar bertumpuk earthy-toned robes atau busana sederhana).\n"
            "- Aksi & Properti: Tindakan bercerita yang jelas dengan properti kontekstual esensial (mis. bejana tanah liat, gulungan naskah kuno, kompas kuno, diagram rasi bintang bergaris putus-putus).\n"
            "   - Latar: Kertas perkamen antik hangat (warm vintage tea-stained parchment paper background) dengan tekstur sapuan cat air gurun/terracotta/ochre yang lembut.\n"
            "   - LARANGAN KERAS: DILARANG menyertakan teks, tulisan, huruf, label, speech bubbles, frame/bingkai tepi, atau watermark di dalam prompt visual.\n\n"
        )
        example_prompt_1 = "A minimalist stickman sailor in a draped robe standing at the wooden bow of an ancient ship, looking up through a brass spyglass at constellations drawn with dotted lines, smooth round bald white head, dot eyes, warm vintage parchment background with desert watercolor washes."
        example_prompt_2 = "The stickman sailor holding a vintage brass compass in utter shock as the needle spins frantically with motion blur lines, thick swirling fog around, smooth round bald head, dot eyes, loose robe, warm parchment background."
        preset_label = "Doodle Ilustrasi Perkamen"

    return visual_guidelines, example_prompt_1, example_prompt_2, preset_label


def _format_tone_storytelling_guidelines(tone: str, language: str = "id") -> str:
    """Format high-AVD storytelling rules tailored to the selected tone.
    Enforces integrated world-building (anti-lecture), rich sensory immersion,
    strict linear chronology without time loops, high emotional stakes, and memorable philosophical punchlines.
    """
    return format_tone_storytelling_guidelines(tone, language)


def _build_preset_character_guidance(preset: Optional[Any], language: str = "id") -> str:
    """Build character-anatomy guidance aligned with the active ImagePreset so Bible descriptions never clash with art style."""
    if not preset:
        return ""

    preset_name = getattr(preset, "name", "") or "Active Preset"
    master_prompt = (getattr(preset, "master_prompt", "") or "").strip()
    attrs = getattr(preset, "style_attributes", {}) or {}
    char_style = (attrs.get("character_style") or "").strip()
    combined_low = f"{preset_name} {master_prompt} {char_style}".lower()
    is_stickman = any(k in combined_low for k in ("stickman", "doodle", "bald white head", "stick limbs", "dot eyes"))

    if is_stickman:
        if language == "en":
            return (
                f"=== ACTIVE VISUAL PRESET ANATOMY RULE ({preset_name.upper()}) ===\n"
                f"- Active Style: {master_prompt[:240]}\n"
                "- CRITICAL CHARACTER DESIGN RULE: Because the active preset uses minimalist stickman/doodle figures with smooth round bald white heads and black dot eyes, DO NOT invent realistic human hair, skin tones, or photorealistic facial wrinkles! Differentiate characters via headwear (udeng, turban, headscarf, hat, crown), distinctive eyebrow expressions, collars/scarves, and distinct garment colors/silhouettes.\n\n"
            )
        return (
            f"=== ATURAN ANATOMI GAYA VISUAL PRESET AKTIF ({preset_name.upper()}) ===\n"
            f"- Gaya Visual Aktif: {master_prompt[:240]}\n"
            "- PENTING UNTUK DESKRIPSI KARAKTER: Karena preset aktif menggunakan figur stickman/doodle minimalis berkepala bulat putih polos dan mata titik hitam, JANGAN mendeskripsikan rambut realistis, warna kulit manusia fotorealistik, atau pori-pori wajah! Bedakan setiap karakter lewat penutup kepala (udeng, kopiah, kerudung, sorban, topi), ekspresi alis/mata, kerah/selendang pada `face_head_anchor`, serta warna pakaian dan properti khas pada `outfit_body_anchor`.\n\n"
        )

    if language == "en":
        return (
            f"=== ACTIVE VISUAL PRESET ALIGNMENT ({preset_name.upper()}) ===\n"
            f"- Active Style: {master_prompt[:240]}"
            + (f" | Character Style: {char_style}" if char_style else "")
            + "\n- Design all `face_head_anchor`, `outfit_body_anchor`, and location anchors so their anatomy, textures, and color palette harmonize naturally with this visual style.\n\n"
        )
    return (
        f"=== KESELARASAN GAYA VISUAL PRESET AKTIF ({preset_name.upper()}) ===\n"
        f"- Gaya Visual Aktif: {master_prompt[:240]}"
        + (f" | Gaya Karakter: {char_style}" if char_style else "")
        + "\n- Rancang `face_head_anchor`, `outfit_body_anchor`, dan anchor lokasi agar anatomi wajah, tekstur pakaian, serta pencahayaan selaras penuh dengan gaya visual preset ini.\n\n"
    )


def build_storyboard_outline_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    num_chapters: int = 5,
    custom_instructions: Optional[str] = None,
    language: str = "id",
    preset: Optional[Any] = None,
) -> Tuple[str, str]:
    """Build prompts for Phase 1: High-level Master Storyboard Outline + Story Continuity Bible (Characters with variants, locations, world setting)."""
    target_words = max(400, int(duration_mins * 135))
    words_per_chapter = int(round(target_words / max(1, num_chapters)))
    tone_clean = (tone or "").strip().lower()
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)
    preset_character_guidance = _build_preset_character_guidance(preset, language)

    if language == "en":
        narrative_arc_en = (
            NARRATIVE_ARC_DRAMATIC_EN
            if tone_clean in ["dramatis", "dramatic", "misterius", "mysterious"]
            else NARRATIVE_ARC_DEFAULT_EN
        )

        system_prompt = OUTLINE_SYSTEM_PROMPT_EN_TEMPLATE.format(
            tone_guidelines=tone_guidelines,
            preset_character_guidance=preset_character_guidance,
            duration_mins=duration_mins,
            target_words=target_words,
            num_chapters=num_chapters,
            words_per_chapter=words_per_chapter,
            narrative_arc=narrative_arc_en,
        )

        user_prompt = (
            f"Video Topic: {topic}\n"
            f"Target Total Duration: {duration_mins} Minutes (~{target_words} words total)\n"
            f"Number of Chapters: Exactly {num_chapters} chapters (~{words_per_chapter} words per chapter)\n"
            f"Tone: {tone}\n"
            "Language: ENGLISH (Generate all outline text in English)\n"
        )
        if custom_instructions:
            user_prompt += f"Additional Instructions: {custom_instructions}\n"

        user_prompt += (
            f"\nGenerate the Master Outline and Story Continuity Bible for exactly {num_chapters} chapters now in pure JSON format."
        )
        return system_prompt, user_prompt

    narrative_arc_id = (
        NARRATIVE_ARC_DRAMATIC_ID
        if tone_clean in ["dramatis", "dramatic", "misterius", "mysterious"]
        else NARRATIVE_ARC_DEFAULT_ID
    )

    system_prompt = OUTLINE_SYSTEM_PROMPT_ID_TEMPLATE.format(
        tone_guidelines=tone_guidelines,
        preset_character_guidance=preset_character_guidance,
        duration_mins=duration_mins,
        target_words=target_words,
        num_chapters=num_chapters,
        words_per_chapter=words_per_chapter,
        narrative_arc=narrative_arc_id,
    )

    user_prompt = (
        f"Topik Video: {topic}\n"
        f"Target Total Durasi: {duration_mins} Menit (~{target_words} kata total)\n"
        f"Jumlah Babak (Chapters): Tepat {num_chapters} babak (~{words_per_chapter} kata per babak)\n"
        f"Tone: {tone}\n"
        "Bahasa: BAHASA INDONESIA (Buat outline dalam Bahasa Indonesia)\n"
    )
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nBuatlah Master Outline dan Story Continuity Bible untuk tepat {num_chapters} babak sekarang dalam format JSON murni."
    )
    return system_prompt, user_prompt


def _format_continuity_bible_instructions(
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    language: str = "id",
) -> str:
    """Format Character Variants, Locations, and World Setting into tokenized instructions."""
    lines: List[str] = []

    # 1. Characters and their variants
    if characters and len(characters) > 0:
        if language == "en":
            lines.append("1. CHARACTER CONSISTENCY & SHOT-SCALE TOKENS:")
        else:
            lines.append("1. PENGUNCIAN KONSISTENSI KARAKTER, SHOT-SCALE & VARIAN USIA/WUJUD:")

        for c in characters:
            c_name = c.get("name", "Character" if language == "en" else "Karakter")
            c_id = c.get("id") or _normalize_key(c_name)
            c_role = f" ({c.get('role')})" if c.get("role") else ""
            c_face = (c.get("face_head_anchor") or "").strip()
            c_outfit = (c.get("outfit_body_anchor") or "").strip()
            c_anchor = c.get("visual_anchor", "")
            variants = c.get("variants")

            if isinstance(variants, list) and len(variants) > 0:
                lines.append(f"   • {c_name}{c_role}:")
                for v in variants:
                    v_id = v.get("variant_id") or _normalize_key(v.get("label", ""))
                    v_lbl = v.get("label", v_id)
                    v_face = (v.get("face_head_anchor") or "").strip()
                    v_outfit = (v.get("outfit_body_anchor") or "").strip()
                    v_anchor = v.get("visual_anchor", "")
                    detail = f"Close-Up Face/Head: {v_face} | Outfit/Body: {v_outfit}" if (v_face or v_outfit) else f"Visual: {v_anchor}"
                    lines.append(f"     - Use token `[char:{c_id}:{v_id}]` for {v_lbl} ({detail})")
            else:
                detail = f"Close-Up Face/Head: {c_face} | Outfit/Body: {c_outfit}" if (c_face or c_outfit) else f"Visual: {c_anchor}"
                lines.append(f"   • {c_name}{c_role}: Use token `[char:{c_id}]` ({detail})")
        lines.append("")

    # 2. Locations
    if locations and len(locations) > 0:
        if language == "en":
            lines.append("2. KEY RECURRING LOCATION TOKENS (WIDE MICRO-SET & CLOSE-UP BOKEH ANCHORS):")
        else:
            lines.append("2. TOKEN LATAR TEMPAT & MICRO-SET (KONSISTEN ANTARA WIDE SHOT & CLOSE-UP):")

        for loc in locations:
            l_name = loc.get("name", "Location" if language == "en" else "Lokasi")
            l_id = loc.get("id") or loc.get("location_id") or _normalize_key(l_name)
            l_anchor = loc.get("environment_anchor", "")
            l_closeup = (loc.get("closeup_background_anchor") or "").strip()
            focal_props = (loc.get("focal_props") or loc.get("key_props") or "").strip()
            lighting = (loc.get("lighting_direction") or "").strip()
            extras: List[str] = [f"Wide Set: {l_anchor}"]
            if l_closeup:
                extras.append(f"Close-Up Background: {l_closeup}")
            if focal_props:
                extras.append(f"Anchor Props: {focal_props}")
            if lighting:
                extras.append(f"Lighting: {lighting}")
            lines.append(f"   • {l_name}: Use token `[loc:{l_id}]` ({' | '.join(extras)})")
        lines.append("")

    # 3. World Setting
    if world_setting and isinstance(world_setting, dict) and any(world_setting.values()):
        if language == "en":
            lines.append("3. WORLD SETTING & ERA CONTEXT:")
        else:
            lines.append("3. SETTING ERA & ATMOSFER DUNIA:")
        if world_setting.get("era"):
            lines.append(f"   • Era: {world_setting.get('era')}")
        if world_setting.get("time_setting"):
            lines.append(f"   • Time Timeline: {world_setting.get('time_setting')}")
        if world_setting.get("atmosphere"):
            lines.append(f"   • Visual Atmosphere/Lighting: {world_setting.get('atmosphere')}")
        lines.append("")

    # 4. Mandatory tokenized rule
    if language == "en":
        lines.append(
            "=== MANDATORY TOKENIZED IMAGE PROMPT RULES ===\n"
            "To keep prompts readable and 100% consistent across scenes, you MUST write every `image_prompt` using variable tokens:\n"
            "- Insert character variant token: `[char:<char_id>:<variant_id>]` (or `[char:<char_id>]`).\n"
            "- Insert location token: `[loc:<loc_id>]`.\n"
            "- Insert visual preset token: `[preset:style]`.\n"
            "- Describe specific character action, emotion, full-bleed 16:9 widescreen framing (edge-to-edge, NO letterbox, NO black bars, NO white border), and lighting vividly.\n"
            "- SEQUENTIAL SPATIAL CONTINUITY & ANTI-TELEPORTATION (MANDATORY):\n"
            "  * If two or more consecutive scenes take place within the same location/interaction (e.g. buying at a market stall, conversing in a room):\n"
            "    - Share the EXACT SAME `scene_group_id` and maintain the exact same stall architecture, counter materials, lighting direction, and anchor props.\n"
            "    - DO NOT randomly relocate characters (e.g. from a storefront to under an open tree) unless the script explicitly states they walked away.\n"
            "    - When cutting from a Wide Shot to a Close-Up Shot in the same `scene_group_id`, keep `[loc:<loc_id>]` in the prompt and explicitly describe the same defocused stall/room background behind the character.\n"
            "    - 180-Degree Rule: Maintain consistent left/right relational screen positions (`spatial_blocking`) across consecutive shots.\n\n"
            "=== CRITICAL RULES FOR NARRATION_TEXT (VOICEOVER / TTS) ===\n"
            "1. STRICTLY NO TOKENS IN NARRATION: Bracket tokens like `[char:...]`, `[loc:...]`, `[preset:...]` are EXCLUSIVELY for `image_prompt`!\n"
            "   In `narration_text`, NEVER include bracket tokens. Always write natural spoken character and location names. This narration will be read aloud by TTS.\n"
            "2. NO COLONS OR SEMICOLONS: NEVER use semicolons (;) or colons (:) in `narration_text` as TTS voice synthesis glitches or stumbles on them. Use commas (,) for breath pauses and periods (.) for full stops."
        )
    else:
        lines.append(
            "=== ATURAN WAJIB PENULISAN IMAGE PROMPT BERBASIS TOKEN (SANGAT PENTING) ===\n"
            "Agar prompt ringkas, sangat mudah dibaca/di-review manusia, dan 100% konsisten antar slide, Anda WAJIB menyusun setiap `image_prompt` menggunakan TOKEN VARIABEL:\n"
            "- Sisipkan token karakter & varian: `[char:<char_id>:<variant_id>]` (contoh: `[char:malin:muda]`, `[char:malin:dewasa]`).\n"
            "- Sisipkan token latar tempat: `[loc:<loc_id>]` (contoh: `[loc:kios_pasar_rempah]`, `[loc:pesisir_air_manis]`).\n"
            "- Sisipkan token gaya visual preset: `[preset:style]`.\n"
            "- Tuliskan aksi konkret tokoh, ekspresi emosi, framing 16:9 widescreen full-bleed (penuh layar edge-to-edge, TANPA letterbox, TANPA bar hitam/putih, TANPA bingkai), dan pencahayaan secara hidup.\n"
            "- KONTINUITAS SPASIAL & ANTI-TELEPORTASI WIDE -> CLOSE-UP (MUTLAK):\n"
            "  * Jika adegan berturut-turut berlangsung dalam satu interaksi/lokasi yang sama (misal di pasar, di kios pedagang, atau percakapan dua tokoh):\n"
            "    - Gunakan `scene_group_id` yang SAMA PERSIS serta pertahankan arsitektur latar, bentuk kios/meja, arah cahaya, dan objek patokan (props) yang identik.\n"
            "    - Saat beralih dari Wide Shot ke Close-Up di tempat yang sama, TETAP sertakan `[loc:<loc_id>]` dan gambarkan latar belakang kios/pasar yang sama dalam kondisi soft-focus/bokeh tepat di belakang kepala/bahu karakter.\n"
            "    - Aturan 180 Derajat: Jaga konsistensi posisi tokoh (`spatial_blocking`, misal Tokoh A tetap di kiri frame menghadap kanan, lawan bicara di kanan menghadap kiri).\n\n"
            "=== ATURAN MUTLAK NARRATION_TEXT (NASKAH PENYUARAAN TTS) ===\n"
            "1. DILARANG KERAS MENGGUNAKAN TOKEN PADA NARASI: Token variabel seperti `[char:...]`, `[loc:...]`, `[preset:...]` HANYA untuk `image_prompt`!\n"
            "   Pada `narration_text`, DILARANG menuliskan token kurung siku. Selalu tulis nama asli tokoh/tempat secara alami.\n"
            "2. HILANGKAN TANDA TITIK DUA (:) DAN TITIK KOMA (;): DILARANG menggunakan tanda baca titik dua (:) dan titik koma (;) pada `narration_text`."
        )

    return "\n".join(lines) + "\n\n"


def build_chapter_expansion_prompt(
    video_title: str,
    video_overview: str,
    chapter_index: int,
    total_chapters: int,
    chapter_title: str,
    chapter_synopsis: str,
    chapter_key_points: List[str],
    target_chapter_words: int,
    target_segments: int,
    images_per_segment: int,
    tone: str,
    preset: Optional[Any] = None,
    custom_instructions: Optional[str] = None,
    chapters_roadmap: Optional[List[Dict[str, Any]]] = None,
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    language: str = "id",
    previous_chapter_context: Optional[Dict[str, Any]] = None,
    opening_hook: Optional[str] = None,
    closing_rehook: Optional[str] = None,
) -> Tuple[str, str]:
    """Build prompts for Phase 2: Expanding a single chapter into full narration & visual scenes with rolling continuity."""
    visual_guidelines, example_prompt_1, example_prompt_2, preset_label = _build_visual_guidelines(preset)
    min_chapter_words = int(round(target_chapter_words * 0.90))
    total_chapter_scenes = target_segments * images_per_segment
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)

    continuity_instruction = _format_continuity_bible_instructions(
        characters=characters,
        locations=locations,
        world_setting=world_setting,
        language=language,
    )

    if language == "en":
        system_prompt = CHAPTER_EXPANSION_SYSTEM_PROMPT_EN_TEMPLATE.format(
            chapter_index=chapter_index,
            total_chapters=total_chapters,
            tone_guidelines=tone_guidelines,
            target_segments=target_segments,
            images_per_segment=images_per_segment,
            total_chapter_scenes=total_chapter_scenes,
            continuity_instruction=continuity_instruction,
            visual_guidelines=visual_guidelines,
            min_chapter_words=min_chapter_words,
            target_chapter_words=target_chapter_words,
            chapter_title=chapter_title,
        )
    else:
        system_prompt = CHAPTER_EXPANSION_SYSTEM_PROMPT_ID_TEMPLATE.format(
            chapter_index=chapter_index,
            total_chapters=total_chapters,
            tone_guidelines=tone_guidelines,
            target_segments=target_segments,
            images_per_segment=images_per_segment,
            total_chapter_scenes=total_chapter_scenes,
            continuity_instruction=continuity_instruction,
            visual_guidelines=visual_guidelines,
            min_chapter_words=min_chapter_words,
            target_chapter_words=target_chapter_words,
            chapter_title=chapter_title,
        )

    roadmap_str = ""
    if chapters_roadmap:
        roadmap_lines = []
        for i, ch in enumerate(chapters_roadmap):
            c_idx = i + 1
            c_title = ch.get("chapter_title", f"Babak {c_idx}" if language == "id" else f"Chapter {c_idx}")
            c_syn = ch.get("synopsis", "")
            marker = (" ➔ [CURRENT FOCUS]" if language == "en" else " ➔ [FOKUS SAAT INI]") if c_idx == chapter_index else ""
            roadmap_lines.append(f"  {c_idx}. {c_title}{marker}: {c_syn}")
        roadmap_header = "OVERALL STORY ROADMAP (FOR STORY CONTINUITY):\n" if language == "en" else "ROADMAP KESELURUHAN ALUR CERITA (AGAR CERITA TETAP KONSISTEN & NYAMBUNG):\n"
        roadmap_str = roadmap_header + "\n".join(roadmap_lines) + "\n\n"

    rolling_str = ""
    if isinstance(previous_chapter_context, dict) and previous_chapter_context:
        last_sents = (previous_chapter_context.get("last_sentences") or "").strip()
        last_group = (previous_chapter_context.get("last_scene_group") or "").strip()
        last_blocking = (previous_chapter_context.get("last_spatial_blocking") or "").strip()
        used_phrases = previous_chapter_context.get("used_phrases") or []
        if language == "en":
            rolling_lines = ["ROLLING CONTINUITY FROM PREVIOUS CHAPTER (BRIDGE SEAMLESSLY):"]
            if last_sents:
                rolling_lines.append(f"- Closing sentences of Chapter {chapter_index - 1}: \"{last_sents}\"")
            if last_group or last_blocking:
                rolling_lines.append(f"- Last visual state: group='{last_group}', blocking='{last_blocking}'")
            if used_phrases:
                rolling_lines.append(f"- Do NOT repeat these sensory phrases already used earlier: {', '.join(used_phrases[:12])}")
            rolling_str = "\n".join(rolling_lines) + "\n\n"
        else:
            rolling_lines = ["KONTEKS BERGULIR DARI BABAK SEBELUMNYA (SAMBUNG SECARA MULUS TANPA PENGULANGAN):"]
            if last_sents:
                rolling_lines.append(f"- Kalimat penutup Babak {chapter_index - 1}: \"{last_sents}\"")
            if last_group or last_blocking:
                rolling_lines.append(f"- Status kamera terakhir: scene_group='{last_group}', blocking='{last_blocking}'")
            if used_phrases:
                rolling_lines.append(f"- JANGAN mengulang frasa/metafora yang sudah dipakai di babak sebelumnya: {', '.join(used_phrases[:12])}")
            rolling_str = "\n".join(rolling_lines) + "\n\n"

    char_remind_str = ""
    if characters and len(characters) > 0:
        names = ", ".join(c.get("name", "") for c in characters if c.get("name"))
        char_remind_str = f"- Locked Characters (Use exact visual anchors): {names}\n" if language == "en" else f"- Karakter Terkunci (Gunakan visual anchor mereka persis): {names}\n"

    kp_str = "\n".join(f"- {kp}" for kp in chapter_key_points) if chapter_key_points else ("- Develop according to chapter synopsis" if language == "en" else "- Kembangkan sesuai sinopsis babak")
    hook_lines = ""
    if opening_hook:
        hook_lines += (f"- Chapter Opening Bridge/Hook: {opening_hook}\n" if language == "en" else f"- Arah Hook Pembuka Babak: {opening_hook}\n")
    if closing_rehook:
        hook_lines += (f"- Chapter Closing Re-Hook / Takeaway: {closing_rehook}\n" if language == "en" else f"- Arah Re-Hook / Penutup Babak: {closing_rehook}\n")

    if language == "en":
        user_prompt = (
            f"Overall Video Context:\n"
            f"- Video Title: {video_title}\n"
            f"- Overview: {video_overview}\n\n"
            f"{roadmap_str}"
            f"{rolling_str}"
            f"CHAPTER WRITING FOCUS:\n"
            f"- Chapter: {chapter_title} (Chapter {chapter_index} of {total_chapters})\n"
            f"- Chapter Synopsis: {chapter_synopsis}\n"
            f"{hook_lines}"
            f"- Key Points to Cover:\n{kp_str}\n\n"
            f"TECHNICAL TARGETS:\n"
            f"- Target Chapter Word Count: Minimum {min_chapter_words} words (target ~{target_chapter_words} words)\n"
            f"- Chapter Structure: Exactly {target_segments} segments, {images_per_segment} scenes each (Total exactly {total_chapter_scenes} scenes)\n"
            f"- Tone: {tone}\n"
            f"- Language: ENGLISH ONLY\n"
            f"- Visual Style Preset: {preset_label}\n"
            f"{char_remind_str}"
        )
        if custom_instructions:
            user_prompt += f"- Additional Instructions: {custom_instructions}\n"

        user_prompt += (
            f"\nWrite the complete script for Chapter {chapter_index} now in pure JSON format in ENGLISH.\n"
            f"CRITICAL: Ensure the narration connects fluidly with the roadmap above, meets the minimum {min_chapter_words} words, is FREE of bracket tokens (plain names only), and contains NO colons or semicolons!"
        )
    else:
        user_prompt = (
            f"Konteks Video Keseluruhan:\n"
            f"- Judul Video: {video_title}\n"
            f"- Overview: {video_overview}\n\n"
            f"{roadmap_str}"
            f"{rolling_str}"
            f"FOKUS PENULISAN BABAK INI:\n"
            f"- Babak: {chapter_title} (Babak {chapter_index} dari {total_chapters})\n"
            f"- Sinopsis Babak: {chapter_synopsis}\n"
            f"{hook_lines}"
            f"- Poin Kunci yang Harus Dibahas:\n{kp_str}\n\n"
            f"TARGET TEKNIS:\n"
            f"- Target Kata Narasi Babak Ini: Minimal {min_chapter_words} kata (target ~{target_chapter_words} kata)\n"
            f"- Struktur Babak: Tepat {target_segments} segmen, masing-masing {images_per_segment} scenes (Total tepat {total_chapter_scenes} scenes)\n"
            f"- Tone: {tone}\n"
            f"- Bahasa: BAHASA INDONESIA\n"
            f"- Gaya Visual Preset: {preset_label}\n"
            f"{char_remind_str}"
        )
        if custom_instructions:
            user_prompt += f"- Instruksi Tambahan: {custom_instructions}\n"

        user_prompt += (
            f"\nTuliskan naskah lengkap Babak {chapter_index} sekarang dalam format JSON murni.\n"
            f"PENTING: Pastikan alur cerita menyambung secara alami dengan roadmap di atas, memenuhi minimal {min_chapter_words} kata, BEBAS token variabel pada teks narasi (tulis nama asli tokoh biasa), dan TANPA tanda titik dua (:) atau titik koma (;)."
        )
    return system_prompt, user_prompt


def build_storyboard_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    images_per_segment: int = 2,
    preset: Optional[Any] = None,
    custom_instructions: Optional[str] = None,
    language: str = "id",
) -> Tuple[str, str]:
    """Build system and user prompts for single-shot long-form storyboard scriptwriting + Story Continuity Bible."""
    target_words = max(400, int(duration_mins * 135))
    min_words = int(target_words * 0.90)
    max_words = int(target_words * 1.10)

    # Visual pacing: 1 illustration per ~7.5-8.5 seconds (each scene ~16-22 spoken words)
    seconds_per_scene = 8.0
    total_scenes = max(10, int(round((duration_mins * 60) / seconds_per_scene)))
    target_segments = max(4, int(round(total_scenes / max(1, images_per_segment))))
    num_chapters = max(3, min(6, int(round(duration_mins * 0.7))))

    visual_guidelines, example_prompt_1, example_prompt_2, preset_label = _build_visual_guidelines(preset)
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)
    continuity_instruction = _format_continuity_bible_instructions(language=language)

    if language == "en":
        system_prompt = STORYBOARD_SYSTEM_PROMPT_EN_TEMPLATE.format(
            tone_guidelines=tone_guidelines,
            continuity_instruction=continuity_instruction,
            images_per_segment=images_per_segment,
            visual_guidelines=visual_guidelines,
            duration_mins=duration_mins,
            target_words=target_words,
            min_words=min_words,
            max_words=max_words,
            tone=tone,
        )

        user_prompt = (
            f"Video Topic: {topic}\n"
            f"Target Duration: {duration_mins} minutes (~{target_words} words, minimum {min_words} words)\n"
            f"AI Visual Style Preset: {preset_label}\n"
            f"Structure: {num_chapters} Chapters, ~{target_segments} segments, exactly {images_per_segment} scenes per segment (total ~{total_scenes} scenes)\n"
            f"Tone: {tone}\n"
            "Language: ENGLISH (Write all narration exclusively in English)\n"
        )
    else:
        system_prompt = STORYBOARD_SYSTEM_PROMPT_ID_TEMPLATE.format(
            tone_guidelines=tone_guidelines,
            continuity_instruction=continuity_instruction,
            images_per_segment=images_per_segment,
            visual_guidelines=visual_guidelines,
            duration_mins=duration_mins,
            target_words=target_words,
            min_words=min_words,
            max_words=max_words,
            num_chapters=num_chapters,
            target_segments=target_segments,
            total_scenes=total_scenes,
            tone=tone,
        )

        user_prompt = (
            f"Topik Video: {topic}\n"
            f"Target Durasi: {duration_mins} menit (~{target_words} kata, minimal {min_words} kata)\n"
            f"Gaya Visual Preset AI: {preset_label}\n"
            f"Struktur: {num_chapters} Babak, sekitar {target_segments} segmen, tepat {images_per_segment} scenes per segmen (total ~{total_scenes} adegan visual)\n"
            f"Tone: {tone}\n"
            f"Jumlah Gambar per Segmen: {images_per_segment} scene per segmen\n"
            "Bahasa: BAHASA INDONESIA\n"
        )
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nTuliskan naskah narasi lengkap dan Story Continuity Bible sekarang dalam format JSON murni.\n"
        f"PENTING SEKALI TENTANG PANJANG KATA & DURASI:\n"
        f"- Target durasi bicara adalah {duration_mins} menit penuh.\n"
        f"- Total kata narasi WAJIB mencapai minimal {min_words} kata (target ideal ~{target_words} kata).\n"
        f"- Kembangkan setiap scene menjadi 2 kalimat narasi yang padat, ekspresif, dan mendalam (18–25 kata per scene).\n"
        f"- Gunakan token variabel [preset:style], [char:id:variant], dan [loc:id] pada setiap image_prompt secara konsisten.\n"
        f"- DILARANG KERAS menyertakan token kurung siku (seperti [char:...]), titik dua (:), atau titik koma (;) pada narration_text!"
    )
    return system_prompt, user_prompt


def _split_text_into_subsegments(text: str, n_parts: int) -> List[str]:
    """Split segment text into n_parts subsegments aligned with visual cues (fallback)."""
    text = (text or "").strip()
    if n_parts <= 1 or not text:
        return [text] * max(1, n_parts)

    raw_sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    if len(sentences) == n_parts:
        return sentences

    if len(sentences) > n_parts:
        parts = []
        step = len(sentences) / n_parts
        for i in range(n_parts):
            start_idx = int(round(i * step))
            end_idx = int(round((i + 1) * step))
            chunk = " ".join(sentences[start_idx:end_idx]).strip()
            if chunk:
                parts.append(chunk)
        if len(parts) == n_parts:
            return parts

    # Fewer sentences than parts: Try splitting by natural clauses or conjunctions
    clause_delims = r"(?<=[,;:\—\-])\s+|(?<=\s)(?:namun|tetapi|sedangkan|sehingga|sementara|lalu|kemudian|di mana|ketika|saat)\s+"
    raw_clauses = re.split(clause_delims, text, flags=re.IGNORECASE)
    clauses = [c.strip() for c in raw_clauses if c.strip()]
    if len(clauses) >= n_parts:
        parts = []
        step = len(clauses) / n_parts
        for i in range(n_parts):
            start_idx = int(round(i * step))
            end_idx = int(round((i + 1) * step))
            chunk = " ".join(clauses[start_idx:end_idx]).strip()
            parts.append(chunk if chunk else text)
        if len(parts) == n_parts:
            return parts

    words = text.split()
    if len(words) >= n_parts * 2:
        step = len(words) / n_parts
        parts = []
        for i in range(n_parts):
            start_idx = int(round(i * step))
            end_idx = int(round((i + 1) * step))
            parts.append(" ".join(words[start_idx:end_idx]))
        return parts

    return [text] * n_parts


def extract_json_payload(raw_content: str) -> Dict[str, Any]:
    """Safely extract JSON from LLM output with fence and regex stripping."""
    text = raw_content.strip()

    # Remove markdown code fences
    fence_pattern = r"^```(?:json)?\s*\n?(.*?)\n?```$"
    match = re.search(fence_pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError as err:
                log.error("Failed to parse extracted JSON substring: %s", err)
        raise ValueError("Gagal mengurai respons AI ke dalam format JSON naskah storyboard.")


def _extract_rolling_context_from_chapter(
    ch_res: Dict[str, Any],
    prev_used_phrases: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Extract tail narration sentences, active camera state, and notable 3-word phrases for rolling chapter continuity."""
    all_texts: List[str] = []
    last_group = ""
    last_blocking = ""

    for seg in ch_res.get("segments", []) or []:
        scenes = seg.get("scenes")
        if isinstance(scenes, list) and scenes:
            for sc in scenes:
                txt = (sc.get("narration_text") or "").strip()
                if txt:
                    all_texts.append(txt)
                if sc.get("scene_group_id"):
                    last_group = str(sc.get("scene_group_id")).strip()
                if sc.get("spatial_blocking"):
                    last_blocking = str(sc.get("spatial_blocking")).strip()
        elif seg.get("narration_text"):
            all_texts.append(str(seg.get("narration_text")).strip())

    tail_sentences = " ".join(all_texts[-2:]) if all_texts else ""
    used = list(prev_used_phrases or [])
    # Capture a few distinctive bigrams/trigrams from opening clauses to prevent repetitive sensory clichés
    for txt in all_texts[:3]:
        words = [w.strip(".,!?\"'“”") for w in txt.split() if len(w.strip(".,!?\"'“”")) > 3]
        if len(words) >= 3:
            phrase = " ".join(words[:3]).lower()
            if phrase not in used:
                used.append(phrase)

    return {
        "last_sentences": tail_sentences[:340],
        "last_scene_group": last_group,
        "last_spatial_blocking": last_blocking,
        "used_phrases": used[-16:],
    }


def _extract_shot_metadata_and_motion(
    scene: Dict[str, Any],
    scene_prompt: str,
    chap_idx: int,
    seg_counter: int,
    scene_idx: int,
    global_img_order: int,
    prev_loc_token: str,
    prev_group_id: str,
) -> Tuple[Dict[str, Any], str, str, str]:
    """Extract/infer structured AI cinematography shot_metadata and purposeful camera motion."""
    lower_p = (scene_prompt or "").lower()

    # 1. Extract location token if present in prompt
    loc_match = re.search(r"\[loc(?:ation)?:([a-zA-Z0-9_-]+)", scene_prompt or "", re.IGNORECASE)
    cur_loc_token = _normalize_key(loc_match.group(1)) if loc_match else ""

    # 2. Scene group ID (groups consecutive shots at the same continuous micro-set)
    raw_group = (scene.get("scene_group_id") or "").strip()
    if raw_group:
        group_id = re.sub(r"[^a-zA-Z0-9_-]", "_", raw_group)[:48]
    elif cur_loc_token and cur_loc_token == prev_loc_token and prev_group_id:
        group_id = prev_group_id
    elif cur_loc_token:
        group_id = f"grp_{cur_loc_token}_{chap_idx + 1}_{seg_counter}"
    else:
        group_id = f"grp_c{chap_idx + 1}_s{seg_counter}"

    # 3. Shot type
    raw_shot = (scene.get("shot_type") or "").strip().lower().replace("-", "_").replace(" ", "_")
    if raw_shot == "closeup":
        raw_shot = "close_up"
    elif raw_shot == "extreme_close_up":
        raw_shot = "extreme_closeup"
    elif raw_shot == "medium_close_up":
        raw_shot = "medium_closeup"

    if raw_shot in VALID_SHOT_TYPES:
        shot_type = raw_shot
    elif "extreme close" in lower_p:
        shot_type = "extreme_closeup"
    elif "medium close" in lower_p:
        shot_type = "medium_closeup"
    elif "close-up" in lower_p or "closeup" in lower_p or "tight portrait" in lower_p:
        shot_type = "close_up"
    elif "over-the-shoulder" in lower_p or "over the shoulder" in lower_p or "reverse-angle" in lower_p:
        shot_type = "over_the_shoulder"
    elif "establishing" in lower_p:
        shot_type = "establishing_wide"
    elif "wide" in lower_p or "widescreen" in lower_p and group_id != prev_group_id:
        shot_type = "establishing_wide" if group_id != prev_group_id else "wide"
    else:
        shot_type = "establishing_wide" if group_id != prev_group_id else ("close_up" if scene_idx > 0 else "medium")

    # 4. Camera angle
    raw_angle = (scene.get("camera_angle") or "").strip().lower().replace("-", "_").replace(" ", "_")
    if raw_angle in VALID_CAMERA_ANGLES:
        camera_angle = raw_angle
    elif "low-angle" in lower_p or "low angle" in lower_p:
        camera_angle = "low_angle"
    elif "high-angle" in lower_p or "high angle" in lower_p or "aerial" in lower_p:
        camera_angle = "high_angle"
    elif "dutch" in lower_p:
        camera_angle = "dutch_angle"
    else:
        camera_angle = "eye_level"

    # 5. Spatial blocking & focal point
    spatial_blocking = (scene.get("spatial_blocking") or "").strip()
    raw_focal = (scene.get("focal_point") or "").strip().lower().replace("-", "_")
    if raw_focal in VALID_FOCAL_POINTS:
        focal_point = raw_focal
    elif "screen-left" in lower_p or "on the left" in lower_p:
        focal_point = "left"
    elif "screen-right" in lower_p or "on the right" in lower_p:
        focal_point = "right"
    else:
        focal_point = "center"

    # 6. Purposeful semantic camera motion (replacing blind modulo-4 cycling)
    raw_motion = (scene.get("camera_motion") or scene.get("motion_effect") or "").strip().lower().replace("-", "_")
    if raw_motion in VALID_CAMERA_MOTIONS:
        motion = raw_motion
    else:
        if shot_type in ("close_up", "extreme_closeup", "medium_closeup"):
            motion = "zoom_in"
        elif camera_angle == "low_angle":
            motion = "pan_up"
        elif camera_angle == "high_angle":
            motion = "pan_down"
        elif shot_type in ("establishing_wide", "wide"):
            wide_motions = ["pan_right", "zoom_out", "pan_left"]
            motion = wide_motions[global_img_order % len(wide_motions)]
        else:
            med_motions = ["zoom_in", "pan_left", "pan_right"]
            motion = med_motions[global_img_order % len(med_motions)]

    shot_meta: Dict[str, Any] = {
        "scene_group_id": group_id,
        "shot_type": shot_type,
        "camera_angle": camera_angle,
        "focal_point": focal_point,
    }
    if spatial_blocking:
        shot_meta["spatial_blocking"] = spatial_blocking
    if cur_loc_token:
        shot_meta["location_id"] = cur_loc_token

    return shot_meta, motion, cur_loc_token, group_id


async def generate_storyboard_script(
    db: AsyncSession,
    project_id: str,
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    images_per_segment: int = 2,
    preset_id: Optional[str] = None,
    custom_instructions: Optional[str] = None,
    language: str = "id",
) -> Tuple[Narration, List[StoryboardItem]]:
    """Generate long-form storyboard script and save Narration + StoryboardItem records."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"Project {project_id} tidak ditemukan.")

    proj.language = language

    from app.models.image_preset import ImagePreset
    from app.services.image_studio import get_active_image_preset

    preset = None
    if preset_id:
        preset = await db.get(ImagePreset, preset_id)
    if not preset:
        preset = await get_active_image_preset(db)

    llm_adapter = await get_active_llm_adapter(db)

    # Calculate target words and chapter counts
    target_total_words = max(400, int(duration_mins * 135))
    num_chapters = max(2, min(8, int(round(duration_mins * 0.75))))
    words_per_chapter = int(round(target_total_words / num_chapters))
    scenes_per_chapter = max(images_per_segment * 2, int(round(words_per_chapter / 19)))
    segments_per_chapter = max(2, int(round(scenes_per_chapter / max(1, images_per_segment))))

    # Every regeneration rebuilds the Continuity Bible from scratch.
    log.info("Resetting Continuity Bible for project %s", project_id)
    clean_topic = topic.strip()
    chapters: List[Dict[str, Any]] = []
    detected_characters: List[Dict[str, Any]] = []
    detected_locations: List[Dict[str, Any]] = []
    detected_world_setting: Dict[str, Any] = {}

    # TWO-PHASE CHUNKED GENERATION (for duration_mins >= 3)
    if duration_mins >= 3:
        try:
            # PHASE 1: Generate Master Outline + Preset-Aware Structured Continuity Bible
            outline_sys, outline_usr = build_storyboard_outline_prompt(
                topic=topic,
                duration_mins=duration_mins,
                tone=tone,
                num_chapters=num_chapters,
                custom_instructions=custom_instructions,
                language=language,
                preset=preset,
            )
            log.info(
                "Phase 1: Generating Master Outline & Continuity Bible for project %s (topic='%s', dur=%dm, chapters=%d, target=%d words)...",
                project_id, topic, duration_mins, num_chapters, target_total_words
            )
            raw_outline = await llm_adapter.generate_chat(
                prompt=outline_usr,
                system_prompt=outline_sys,
                json_mode=True,
                timeout=90.0,
                max_tokens=4096,
            )
            outline_data = extract_json_payload(raw_outline)
            outline_chapters = outline_data.get("chapters", [])
            video_title = outline_data.get("title", topic)
            video_overview = outline_data.get("overview", f"Video explainer mengenai {topic}")
            if outline_data.get("characters"):
                detected_characters = outline_data.get("characters", []) or []
            if outline_data.get("locations"):
                detected_locations = outline_data.get("locations", []) or []
            detected_characters, detected_locations = _normalize_continuity_bible(
                detected_characters, detected_locations
            )
            if detected_characters:
                log.info("Detected %d locked characters from outline: %s", len(detected_characters), [c.get("name") for c in detected_characters])
            if detected_locations:
                log.info("Detected %d locations from outline: %s", len(detected_locations), [loc.get("name") for loc in detected_locations])
            if outline_data.get("world_setting"):
                detected_world_setting = outline_data.get("world_setting", {}) or {}
                log.info("Detected world setting from outline: %s", detected_world_setting.get("era"))

            if outline_chapters and len(outline_chapters) > 0:
                # PHASE 2: Sequential Chapter Expansion with Rolling Continuity Context
                expanded_chapters: List[Dict[str, Any]] = []
                rolling_ctx: Optional[Dict[str, Any]] = None

                for ch_idx, ch_info in enumerate(outline_chapters):
                    ch_title = ch_info.get("chapter_title", f"Babak {ch_idx + 1}")
                    ch_synopsis = ch_info.get("synopsis", "")
                    ch_kp = ch_info.get("key_points", [])
                    ch_opening_hook = ch_info.get("opening_hook")
                    ch_closing_rehook = ch_info.get("closing_rehook")
                    log.info(
                        "Phase 2 (Sequential Rolling Continuity): Expanding chapter %d/%d ('%s') for project %s...",
                        ch_idx + 1, len(outline_chapters), ch_title, project_id
                    )

                    sys_p, usr_p = build_chapter_expansion_prompt(
                        video_title=video_title,
                        video_overview=video_overview,
                        chapter_index=ch_idx + 1,
                        total_chapters=len(outline_chapters),
                        chapter_title=ch_title,
                        chapter_synopsis=ch_synopsis,
                        chapter_key_points=ch_kp,
                        target_chapter_words=words_per_chapter,
                        target_segments=segments_per_chapter,
                        images_per_segment=images_per_segment,
                        tone=tone,
                        preset=preset,
                        custom_instructions=custom_instructions,
                        chapters_roadmap=outline_chapters,
                        characters=detected_characters,
                        locations=detected_locations,
                        world_setting=detected_world_setting,
                        language=language,
                        previous_chapter_context=rolling_ctx,
                        opening_hook=ch_opening_hook,
                        closing_rehook=ch_closing_rehook,
                    )

                    last_err = None
                    ch_res: Optional[Dict[str, Any]] = None
                    for attempt in range(2):
                        try:
                            raw_ch = await llm_adapter.generate_chat(
                                prompt=usr_p,
                                system_prompt=sys_p,
                                json_mode=True,
                                timeout=120.0,
                                max_tokens=4096,
                            )
                            parsed_ch = extract_json_payload(raw_ch)
                            if not parsed_ch.get("chapter_title"):
                                parsed_ch["chapter_title"] = ch_title
                            for s_seg in parsed_ch.get("segments", []):
                                if isinstance(s_seg.get("scenes"), list):
                                    for sc in s_seg["scenes"]:
                                        if sc.get("narration_text"):
                                            sc["narration_text"] = clean_narration_for_tts(
                                                sc["narration_text"],
                                                characters=detected_characters,
                                                locations=detected_locations,
                                                world_setting=detected_world_setting,
                                            )
                                elif s_seg.get("narration_text"):
                                    s_seg["narration_text"] = clean_narration_for_tts(
                                        s_seg["narration_text"],
                                        characters=detected_characters,
                                        locations=detected_locations,
                                        world_setting=detected_world_setting,
                                    )
                            ch_res = parsed_ch
                            break
                        except Exception as err:
                            last_err = err
                            log.warning("Attempt %d failed expanding chapter %d: %s", attempt + 1, ch_idx + 1, err)
                            if attempt == 0:
                                await asyncio.sleep(1.0)

                    if ch_res is None:
                        raise last_err or ValueError(f"Gagal generate babak {ch_idx + 1}")

                    expanded_chapters.append(ch_res)
                    rolling_ctx = _extract_rolling_context_from_chapter(
                        ch_res,
                        prev_used_phrases=(rolling_ctx or {}).get("used_phrases"),
                    )

                chapters = expanded_chapters
            else:
                log.warning("Master outline did not contain chapters, falling back to single-shot...")
        except Exception as e:
            log.warning("Two-phase storyboard generation encountered error: %s. Falling back to single-shot...", e)
            chapters = []

    # FALLBACK TO SINGLE-SHOT GENERATION (if duration < 3 or two-phase failed)
    if not chapters:
        log.info("Executing single-shot storyboard generation for project %s...", project_id)
        system_prompt, user_prompt = build_storyboard_prompt(
            topic=topic,
            duration_mins=duration_mins,
            tone=tone,
            images_per_segment=images_per_segment,
            preset=preset,
            custom_instructions=custom_instructions,
            language=language,
        )
        raw_response = await llm_adapter.generate_chat(
            prompt=user_prompt,
            system_prompt=system_prompt,
            json_mode=True,
            timeout=240.0,
            max_tokens=8192,
        )
        data = extract_json_payload(raw_response)
        chapters = data.get("chapters", [])
        if not chapters:
            raise ValueError("Respons AI tidak mengandung data chapters.")
        if data.get("characters"):
            detected_characters = data.get("characters", []) or []
        if data.get("locations"):
            detected_locations = data.get("locations", []) or []
        detected_characters, detected_locations = _normalize_continuity_bible(
            detected_characters, detected_locations
        )
        if detected_characters:
            log.info("Detected %d locked characters from single-shot: %s", len(detected_characters), [c.get("name") for c in detected_characters])
        if detected_locations:
            log.info("Detected %d locations from single-shot: %s", len(detected_locations), [loc.get("name") for loc in detected_locations])
        if data.get("world_setting"):
            detected_world_setting = data.get("world_setting", {}) or {}
            log.info("Detected world setting from single-shot: %s", detected_world_setting.get("era"))

        for ch in chapters:
            for s_seg in ch.get("segments", []):
                if isinstance(s_seg.get("scenes"), list):
                    for sc in s_seg["scenes"]:
                        if sc.get("narration_text"):
                            sc["narration_text"] = clean_narration_for_tts(
                                sc["narration_text"],
                                characters=detected_characters,
                                locations=detected_locations,
                                world_setting=detected_world_setting,
                            )
                elif s_seg.get("narration_text"):
                    s_seg["narration_text"] = clean_narration_for_tts(
                        s_seg["narration_text"],
                        characters=detected_characters,
                        locations=detected_locations,
                        world_setting=detected_world_setting,
                    )

    # Flatten segments for the Narration model and construct StoryboardItems with AI Cinematography metadata
    all_segments: List[Dict[str, Any]] = []
    full_script_lines: List[str] = []
    storyboard_items: List[StoryboardItem] = []

    global_img_order = 0
    seg_counter = 1
    prev_loc_token = ""
    prev_group_id = ""
    group_anchor_id_map: Dict[str, str] = {}

    for chap_idx, chapter in enumerate(chapters):
        chap_title = chapter.get("chapter_title", f"Babak {chap_idx + 1}")
        for seg in chapter.get("segments", []):
            scenes = seg.get("scenes")

            # PRIMARY FORMAT: 1-to-1 Discrete Scenes inside each segment
            if isinstance(scenes, list) and len(scenes) > 0:
                for scene_idx, scene in enumerate(scenes):
                    scene_text = clean_narration_for_tts(
                        scene.get("narration_text") or "",
                        characters=detected_characters,
                        locations=detected_locations,
                        world_setting=detected_world_setting,
                    ).strip()
                    scene_prompt = (scene.get("image_prompt") or "").strip()
                    if not scene_text and not scene_prompt:
                        continue
                    if not scene_text:
                        scene_text = "..."
                    if not scene_prompt:
                        if preset:
                            scene_prompt = f"Scene illustration in the visual style of {preset.name} representing {scene_text[:80]}"
                        else:
                            scene_prompt = f"Minimalist stickman illustration on warm vintage parchment representing {scene_text[:80]}"

                    sub_seg_id = f"seg-{seg_counter}_{scene_idx + 1}" if len(scenes) > 1 else f"seg-{seg_counter}"
                    all_segments.append({
                        "id": sub_seg_id,
                        "chapter": chap_title,
                        "text": scene_text,
                        "image_count": 1,
                        "start_ms": 0,
                        "end_ms": 0,
                    })
                    full_script_lines.append(scene_text)

                    shot_meta, motion, prev_loc_token, prev_group_id = _extract_shot_metadata_and_motion(
                        scene=scene,
                        scene_prompt=scene_prompt,
                        chap_idx=chap_idx,
                        seg_counter=seg_counter,
                        scene_idx=scene_idx,
                        global_img_order=global_img_order,
                        prev_loc_token=prev_loc_token,
                        prev_group_id=prev_group_id,
                    )
                    item_id = str(uuid.uuid4())
                    grp_id = shot_meta.get("scene_group_id", "")
                    if grp_id:
                        if grp_id not in group_anchor_id_map:
                            group_anchor_id_map[grp_id] = item_id
                        else:
                            shot_meta["reference_item_id"] = group_anchor_id_map[grp_id]

                    item = StoryboardItem(
                        id=item_id,
                        project_id=project_id,
                        chapter_title=chap_title,
                        segment_id=sub_seg_id,
                        order_index=global_img_order,
                        script_text=scene_text,
                        image_prompt=scene_prompt,
                        shot_metadata=shot_meta,
                        motion_effect=motion,
                        status="pending",
                    )
                    storyboard_items.append(item)
                    global_img_order += 1

                seg_counter += 1
                continue

            # SECONDARY / FALLBACK FORMAT: segment with narration_text and image_prompts list
            seg_text = clean_narration_for_tts(
                seg.get("narration_text") or "",
                characters=detected_characters,
                locations=detected_locations,
                world_setting=detected_world_setting,
            ).strip()
            if not seg_text:
                continue

            img_prompts = seg.get("image_prompts", [])
            if not isinstance(img_prompts, list) or len(img_prompts) == 0:
                img_prompts = [f"Illustration representing {seg_text[:80]}"]

            # If a segment has multiple images, split the segment into subsegments
            if len(img_prompts) > 1:
                sub_texts = _split_text_into_subsegments(seg_text, len(img_prompts))
                for sub_idx, (sub_text, prompt) in enumerate(zip(sub_texts, img_prompts, strict=False)):
                    clean_sub = clean_narration_for_tts(
                        sub_text,
                        characters=detected_characters,
                        locations=detected_locations,
                        world_setting=detected_world_setting,
                    ).strip()
                    clean_p = str(prompt).strip()
                    sub_seg_id = f"seg-{seg_counter}_{sub_idx + 1}"
                    all_segments.append({
                        "id": sub_seg_id,
                        "chapter": chap_title,
                        "text": clean_sub,
                        "image_count": 1,
                        "start_ms": 0,
                        "end_ms": 0,
                    })
                    full_script_lines.append(clean_sub)

                    shot_meta, motion, prev_loc_token, prev_group_id = _extract_shot_metadata_and_motion(
                        scene={},
                        scene_prompt=clean_p,
                        chap_idx=chap_idx,
                        seg_counter=seg_counter,
                        scene_idx=sub_idx,
                        global_img_order=global_img_order,
                        prev_loc_token=prev_loc_token,
                        prev_group_id=prev_group_id,
                    )
                    item_id = str(uuid.uuid4())
                    grp_id = shot_meta.get("scene_group_id", "")
                    if grp_id:
                        if grp_id not in group_anchor_id_map:
                            group_anchor_id_map[grp_id] = item_id
                        else:
                            shot_meta["reference_item_id"] = group_anchor_id_map[grp_id]

                    item = StoryboardItem(
                        id=item_id,
                        project_id=project_id,
                        chapter_title=chap_title,
                        segment_id=sub_seg_id,
                        order_index=global_img_order,
                        script_text=clean_sub,
                        image_prompt=clean_p,
                        shot_metadata=shot_meta,
                        motion_effect=motion,
                        status="pending",
                    )
                    storyboard_items.append(item)
                    global_img_order += 1
            else:
                single_seg_id = f"seg-{seg_counter}"
                clean_p = str(img_prompts[0]).strip()
                all_segments.append({
                    "id": single_seg_id,
                    "chapter": chap_title,
                    "text": seg_text,
                    "image_count": 1,
                    "start_ms": 0,
                    "end_ms": 0,
                })
                full_script_lines.append(seg_text)

                shot_meta, motion, prev_loc_token, prev_group_id = _extract_shot_metadata_and_motion(
                    scene={},
                    scene_prompt=clean_p,
                    chap_idx=chap_idx,
                    seg_counter=seg_counter,
                    scene_idx=0,
                    global_img_order=global_img_order,
                    prev_loc_token=prev_loc_token,
                    prev_group_id=prev_group_id,
                )
                item_id = str(uuid.uuid4())
                grp_id = shot_meta.get("scene_group_id", "")
                if grp_id:
                    if grp_id not in group_anchor_id_map:
                        group_anchor_id_map[grp_id] = item_id
                    else:
                        shot_meta["reference_item_id"] = group_anchor_id_map[grp_id]

                item = StoryboardItem(
                    id=item_id,
                    project_id=project_id,
                    chapter_title=chap_title,
                    segment_id=single_seg_id,
                    order_index=global_img_order,
                    script_text=seg_text,
                    image_prompt=clean_p,
                    shot_metadata=shot_meta,
                    motion_effect=motion,
                    status="pending",
                )
                storyboard_items.append(item)
                global_img_order += 1

            seg_counter += 1

    raw_script = "\n\n".join(full_script_lines)
    word_count = len(raw_script.split()) if raw_script else 0
    actual_duration_seconds = max(1, int(round((word_count / 135) * 60))) if word_count > 0 else (duration_mins * 60)

    log.info(
        "Storyboard script generated: %d words, ~%d seconds (~%.1f mins), %d segments, %d image slots",
        word_count, actual_duration_seconds, actual_duration_seconds / 60, len(all_segments), len(storyboard_items)
    )

    # Delete older narration, storyboard items, and audio tracks for this project
    await db.execute(delete(StoryboardItem).where(StoryboardItem.project_id == project_id))
    await db.execute(delete(AudioTrack).where(AudioTrack.project_id == project_id))
    await db.execute(delete(Narration).where(Narration.project_id == project_id))

    narration = Narration(
        project_id=project_id,
        topic=topic,
        tone=tone,
        target_duration=actual_duration_seconds,
        raw_text=raw_script,
        segments=all_segments,
        status="generated",
        language=language,
    )
    db.add(narration)
    await db.flush()

    for item in storyboard_items:
        item.narration_id = narration.id
        db.add(item)

    if clean_topic:
        proj.name = clean_topic
    # Clear stale YouTube metadata because script and story topic have been regenerated
    proj.youtube_metadata = {}

    proj.characters = detected_characters
    proj.locations = detected_locations
    proj.world_setting = detected_world_setting
    proj.status = "ready"
    await db.commit()
    await db.refresh(narration)
    await db.refresh(proj)

    log.info("Successfully created narration with %d segments and %d storyboard image slots.", len(all_segments), len(storyboard_items))
    return narration, storyboard_items


async def sync_storyboard_timing_from_alignment(
    db: AsyncSession,
    project_id: str,
    aligned_segments: List[Dict[str, Any]],
) -> None:
    """Sync start_time, end_time, and duration of StoryboardItems with Whisper audio alignment."""
    res = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index)
    )
    items = list(res.scalars().all())
    if not items or not aligned_segments:
        return

    aligned_map = {seg.get("id"): seg for seg in aligned_segments if seg.get("id")}

    # Group items by segment_id
    items_by_seg: Dict[str, List[StoryboardItem]] = {}
    for item in items:
        items_by_seg.setdefault(item.segment_id, []).append(item)

    # Distribute timing from Whisper alignment
    for seg_id, seg_items in items_by_seg.items():
        seg = aligned_map.get(seg_id)
        if not seg:
            continue

        seg_start_sec = float(seg.get("start_ms", 0)) / 1000.0
        seg_end_sec = float(seg.get("end_ms", 0)) / 1000.0
        seg_duration = max(seg_end_sec - seg_start_sec, 1.0)

        count = len(seg_items)
        if count == 1:
            item = seg_items[0]
            item.start_time = round(seg_start_sec, 3)
            item.end_time = round(seg_end_sec, 3)
            item.duration = round(seg_duration, 3)
        elif count > 1:
            # Distribute proportionally by word count
            word_counts = [max(1, len((it.script_text or "").split())) for it in seg_items]
            total_words = sum(word_counts)
            cur_time = seg_start_sec
            for idx, item in enumerate(seg_items):
                fraction = word_counts[idx] / total_words
                it_dur = round(seg_duration * fraction, 3)
                item.start_time = round(cur_time, 3)
                item.end_time = round(cur_time + it_dur, 3)
                item.duration = it_dur
                cur_time += it_dur

    # Continuity check: ensure monotonic timestamps and prevent unassigned gaps
    cur_t = 0.0
    for item in items:
        if item.end_time <= item.start_time or item.duration <= 0.0:
            w_count = len((item.script_text or "").split())
            calc_dur = max(3.0, round(w_count * 0.4, 2))
            item.start_time = round(cur_t, 3)
            item.duration = calc_dur
            item.end_time = round(cur_t + calc_dur, 3)
        cur_t = max(cur_t, item.end_time)

    await db.commit()
    log.info("Synchronized timing for %d storyboard items in project %s.", len(items), project_id)


async def extract_storyboard_continuity_bible_from_script(
    db: AsyncSession,
    project_id: str,
    custom_instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract Story Continuity Bible (characters & variants, locations, world setting)
    directly from the existing narration/script of the project using LLM.
    """
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"Project {project_id} tidak ditemukan.")

    from app.services.image_studio import get_active_image_preset

    active_preset = await get_active_image_preset(db)

    # 1. Gather all narration text from Narration or StoryboardItems
    narration_query = await db.execute(select(Narration).where(Narration.project_id == project_id))
    narrations = narration_query.scalars().all()
    narration = narrations[0] if narrations else None

    items_query = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index)
    )
    items = items_query.scalars().all()

    text_parts = []
    if narration and narration.raw_text:
        text_parts.append(narration.raw_text)
    elif narration and narration.segments:
        for seg in narration.segments:
            if isinstance(seg, dict) and seg.get("text"):
                text_parts.append(seg.get("text"))

    if not text_parts and items:
        for it in items:
            if it.script_text:
                text_parts.append(it.script_text)

    full_story_text = "\n\n".join(text_parts).strip()
    if not full_story_text:
        raise ValueError("Naskah cerita belum tersedia. Buat atau generate naskah terlebih dahulu sebelum mengekstrak karakter.")

    llm_adapter = await get_active_llm_adapter(db)

    preset_guidance = _build_preset_character_guidance(active_preset, language=getattr(proj, "language", "id") or "id")
    system_prompt = preset_guidance + EXTRACT_CONTINUITY_BIBLE_SYSTEM_PROMPT

    script_topic = (narration.topic if narration and narration.topic else proj.name) or "Story Script"

    user_prompt = (
        f"Topic / Story Title: {script_topic}\n\n"
        f"Naskah Cerita Lengkap:\n"
        f"\"\"\"\n{full_story_text}\n\"\"\"\n\n"
        + (f"Instruksi Tambahan Pengguna:\n{custom_instructions}\n\n" if custom_instructions else "")
        + "Ekstrak seluruh karakter, varian wujud, latar tempat (beserta closeup_background_anchor, focal_props, lighting_direction), dan era setting dari naskah di atas ke dalam format JSON Continuity Bible."
    )

    log.info("Extracting Continuity Bible from script for project %s (script length=%d chars)...", project_id, len(full_story_text))
    raw_response = await llm_adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=system_prompt,
        json_mode=True,
        timeout=90.0,
        max_tokens=4096,
    )

    data = extract_json_payload(raw_response)
    characters = data.get("characters", []) or []
    locations = data.get("locations", []) or []
    characters, locations = _normalize_continuity_bible(characters, locations)
    world_setting = data.get("world_setting", {}) or {}

    proj.characters = characters
    proj.locations = locations
    proj.world_setting = world_setting
    if narration and narration.topic and narration.topic.strip():
        proj.name = narration.topic.strip()
    # Reset stale YouTube metadata
    proj.youtube_metadata = {}

    await db.commit()
    await db.refresh(proj)
    log.info(
        "Successfully extracted %d characters, %d locations, era='%s' for project %s",
        len(characters), len(locations), world_setting.get("era"), project_id
    )

    return {
        "success": True,
        "characters": characters,
        "locations": locations,
        "world_setting": world_setting,
    }

