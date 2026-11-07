import asyncio
import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import publish_project_event
from app.models.narration import AudioTrack, Narration
from app.models.project import Project
from app.models.storyboard import StoryboardItem
from app.prompts.storyboard import (
    CHARACTER_AGENT_SYSTEM_PROMPT_EN,
    CHARACTER_AGENT_SYSTEM_PROMPT_ID,
    DIRECTOR_CHAPTER_EN_TEMPLATE,
    DIRECTOR_CHAPTER_ID_TEMPLATE,
    EXTRACT_CONTINUITY_BIBLE_SYSTEM_PROMPT,
    NARRATIVE_ARC_DEFAULT_EN,
    NARRATIVE_ARC_DEFAULT_ID,
    NARRATIVE_ARC_DRAMATIC_EN,
    NARRATIVE_ARC_DRAMATIC_ID,
    SCRIPTWRITER_CHAPTER_EN_TEMPLATE,
    SCRIPTWRITER_CHAPTER_ID_TEMPLATE,
    SCRIPTWRITER_OUTLINE_EN_TEMPLATE,
    SCRIPTWRITER_OUTLINE_ID_TEMPLATE,
    format_tone_storytelling_guidelines,
)
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.storyboard_shots import (
    ALL_SHOT_TYPES,
    FALLBACK_ENVIRONMENT,
    FALLBACK_VISUAL_ACTION,
    SHOT_PALETTE,
    classify_beat_type,
    compile_scene_prompt,
    compile_scene_prompt_parts,
    default_motion,
    normalize_angle,
    normalize_beat_type,
    normalize_shot_type,
    normalize_subjects,
    plan_shot_variety,
    storyboard_quality_metrics,
)

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

VALID_SHOT_TYPES = set(ALL_SHOT_TYPES)

VALID_CAMERA_ANGLES = {"eye_level", "low_angle", "high_angle", "dutch_angle", "birds_eye"}
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


def _normalize_key_views(raw: Any) -> List[Dict[str, str]]:
    """Normalize a location's `key_views` into [{view_id, description}] (accepts list[str|dict] or a multi-line str)."""
    if isinstance(raw, str):
        raw = [ln for ln in re.split(r"[\n;]+", raw) if ln.strip()]
    if not isinstance(raw, (list, tuple)):
        return []
    views: List[Dict[str, str]] = []
    for idx, v in enumerate(raw):
        if isinstance(v, dict):
            vid = str(v.get("view_id") or v.get("id") or "").strip()
            desc = str(v.get("description") or v.get("desc") or "").strip()
        else:
            text = str(v).strip()
            vid, _, desc = text.partition(":")
            if not desc:
                vid, desc = "", text
            vid, desc = vid.strip(), desc.strip()
        if not desc:
            continue
        if not vid:
            vid = f"view_{idx + 1}"
        views.append({"view_id": re.sub(r"[^a-zA-Z0-9_-]", "_", vid)[:40], "description": desc})
    return views


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
        for extra_key in ("expression_range", "signature_gesture", "silhouette_note"):
            raw_extra = item.get(extra_key)
            if isinstance(raw_extra, (list, tuple)):
                raw_extra = ", ".join(str(x).strip() for x in raw_extra if str(x).strip())
            item[extra_key] = (str(raw_extra).strip() if raw_extra else "")

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
        l_item["key_views"] = _normalize_key_views(l_item.get("key_views"))
        raw_ambient = l_item.get("ambient_life")
        if isinstance(raw_ambient, (list, tuple)):
            raw_ambient = ", ".join(str(x).strip() for x in raw_ambient if str(x).strip())
        l_item["ambient_life"] = (str(raw_ambient).strip() if raw_ambient else "")
        norm_locs.append(l_item)

    return norm_chars, norm_locs


def _is_closeup_shot(prompt_template: str, shot_metadata: Optional[Dict[str, Any]] = None) -> bool:
    """Detect whether the current shot is a close-up / medium-close-up shot."""
    if isinstance(shot_metadata, dict):
        st = (shot_metadata.get("shot_type") or "").strip().lower().replace("-", "_").replace(" ", "_")
        if st in CLOSEUP_SHOT_TYPES:
            return True

    lower_prompt = (prompt_template or "").lower()
    return bool(
        re.search(
            r"\b(extreme[-_ ]?close[-_ ]?up|tight[-_ ]?close[-_ ]?up|medium[-_ ]?close[-_ ]?up|close[-_ ]?up|closeup|macro[-_ ]?shot|portrait[-_ ]?shot)\b",
            lower_prompt,
        )
    )


def _compile_character_anchor(entity_dict: Dict[str, Any], closeup_mode: Any) -> str:
    """Compile character or variant anchor tailored to shot scale.

    `closeup_mode` accepts a bool (True = face only, False = face + outfit) or a scale string
    (`"face"`, `"upper"`, `"full"`). Full-body scale also appends the silhouette note when present.
    """
    face = (entity_dict.get("face_head_anchor") or "").strip()
    outfit = (entity_dict.get("outfit_body_anchor") or "").strip()
    visual = (entity_dict.get("visual_anchor") or entity_dict.get("description") or "").strip()
    silhouette = (entity_dict.get("silhouette_note") or "").strip()

    if isinstance(closeup_mode, str):
        scale = closeup_mode.strip().lower()
    else:
        scale = "face" if closeup_mode else "full"

    if scale == "face":
        if face:
            return face
        return visual or outfit

    if face and outfit:
        base = f"{face}, {outfit}"
    else:
        base = visual or face or outfit
    if scale == "full" and silhouette and base and silhouette.lower() not in base.lower():
        base = f"{base}, {silhouette}"
    return base


def _pick_location_view(loc_item: Dict[str, Any], view_id: Optional[str]) -> str:
    """Return the description of the requested `key_views` entry (empty when absent)."""
    if not view_id:
        return ""
    norm = _normalize_key(view_id)
    for v in loc_item.get("key_views") or []:
        if isinstance(v, dict) and _normalize_key(v.get("view_id", "")) == norm:
            return (v.get("description") or "").strip()
    return ""


def _compile_location_anchor(loc_item: Dict[str, Any], closeup_mode: bool, view_id: Optional[str] = None) -> str:
    """Compile a location anchor for the shot scale and (optionally) a specific viewpoint.

    Wide/medium shots use the layout + the selected viewpoint + ambient life, so shots at the same place can
    look at it from different directions. Close shots keep the setting readable behind the subject.
    """
    env_anchor = (loc_item.get("environment_anchor") or loc_item.get("description") or "").strip()
    closeup_bg = (loc_item.get("closeup_background_anchor") or "").strip()
    props = (loc_item.get("focal_props") or loc_item.get("key_props") or "").strip()
    lighting = (loc_item.get("lighting_direction") or "").strip()
    ambient = (loc_item.get("ambient_life") or "").strip()
    view_desc = _pick_location_view(loc_item, view_id)

    if closeup_mode:
        if view_desc:
            base = f"{view_desc}, setting still clearly readable behind the subject"
        elif closeup_bg:
            base = f"{closeup_bg}, setting still clearly readable behind the subject"
        elif env_anchor:
            base = f"{env_anchor}, seen close behind the subject and still clearly readable"
        else:
            base = ""
    else:
        if env_anchor and view_desc:
            base = f"{env_anchor}, viewed from: {view_desc}"
        else:
            base = view_desc or env_anchor or closeup_bg

    # Keep setting base concise (max ~16 words) to avoid exhausting diffusion token window
    if base and len(base.split()) > 18:
        first_clause = re.split(r"[,;.]\s*(?:with|featuring|equipped with|key anchor elements|ambient life)\b", base, flags=re.IGNORECASE)[0].strip()
        words = first_clause.split()
        if len(words) > 16:
            base = " ".join(words[:16]).rstrip(" ,;.")
        else:
            base = first_clause.rstrip(" ,;.")

    parts: List[str] = [base] if base else []
    if props:
        prop_items = [p.strip() for p in props.split(",") if p.strip()]
        new_props = [p for p in prop_items if p.lower() not in base.lower()]
        if new_props:
            parts.append(f"key anchor elements: {', '.join(new_props[:3])}")
    if ambient and not closeup_mode:
        clean_amb = ambient.strip()
        if clean_amb.lower() not in base.lower() and len(clean_amb) < 40:
            parts.append(f"ambient life: {clean_amb}")
    if lighting and lighting.lower() not in base.lower() and len(lighting) < 40:
        parts.append(f"lighting: {lighting}")

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

    # Strip any technical aspect ratio / full-bleed / 16:9 boilerplates
    prompt_template = re.sub(
        r"\b(?:full[\s-]bleed\s+(?:edge-to-edge\s+)?(?:widescreen\s+)?(?:16:9\s+)?|16:9\s+(?:widescreen\s+)?|full[\s-]bleed\s+16:9\s*|full[\s-]bleed\s*)\b",
        "",
        prompt_template,
        flags=re.IGNORECASE,
    ).strip(" ,.")

    chars = characters or []
    locs = locations or []
    world = world_setting or {}
    style_text = (preset_master_prompt or "").strip()
    scene_is_closeup = _is_closeup_shot(prompt_template, shot_metadata)
    scene_view_id = (
        (shot_metadata.get("location_view") or "").strip() if isinstance(shot_metadata, dict) else ""
    )

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
            return _compile_location_anchor(loc_map[norm_q], closeup_mode, scene_view_id)
        for k, loc_item in loc_map.items():
            if norm_q in k or k in norm_q:
                return _compile_location_anchor(loc_item, closeup_mode, scene_view_id)
        return None

    def _token_replacer(match: re.Match) -> str:
        raw_inner = match.group(1).strip()
        lower_inner = raw_inner.lower()

        # 1. Preset Style
        if lower_inner in ["preset:style", "style", "preset style", "preset_style"]:
            clean_style = re.sub(
                r"^(?:full[\s-]bleed\s+(?:edge-to-edge\s+)?(?:widescreen\s+)?(?:16:9\s+)?|widescreen\s+16:9[^\.]*\.\s*|16:9\s+landscape\s+aspect\s+ratio[^\.]*\.\s*|16:9\s+widescreen[^\.]*\.\s*|full[\s-]bleed\s+16:9\s*)",
                "",
                style_text,
                flags=re.IGNORECASE,
            ).strip()
            return clean_style if clean_style else style_text

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
        if (
            camera_angle
            and camera_angle != "eye level"
            and camera_angle.replace("birds eye", "bird's eye") not in resolved.lower().replace("-", " ")
            and camera_angle not in resolved.lower().replace("-", " ").replace("bird's", "birds")
        ):
            continuity_notes.append(f"{camera_angle} camera perspective")

        blocking = (shot_metadata.get("spatial_blocking") or "").strip()
        has_staging_kw = any(k in blocking.lower() for k in ("screen-left", "screen-right", "left of frame", "right of frame", "center of frame", "foreground", "stands", "facing", "seated", "positioned", "behind", "across", "side"))
        indoor_kw = ("kitchen", "dapur", "room", "kamar", "ruang", "indoor", "interior", "office", "bedroom", "dining")
        is_indoor = any(k in resolved.lower() for k in indoor_kw)
        is_landscape_hallucination = any(k in blocking.lower() for k in ("expansive landscape", "atmospheric haze", "mountain", "valley", "panoramic outdoor"))
        if (is_indoor and is_landscape_hallucination) or not has_staging_kw:
            blocking = ""

        if blocking and blocking.lower()[:32] not in resolved.lower():
            continuity_notes.append(f"180-degree spatial blocking: {blocking}")

        # Character identity stays consistent through the Bible anchors already resolved above.
        # We deliberately do NOT ask the model to copy environment/lighting from a reference frame:
        # that froze backgrounds and made consecutive shots near-identical.
        if (
            "consistent" not in resolved.lower()
            and re.search(r"\[(?:char|character):", prompt_template, re.IGNORECASE)
        ):
            continuity_notes.append("keep character designs and outfit colors consistent with the story bible")

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
    else:
        if language == "en":
            lines.append("1. CHARACTER CONSISTENCY: DISABLED (NO FIXED CHARACTER BIBLE / EXPLAINER MODE)")
            lines.append("   • DO NOT output `[char:...]` tokens. Direct each shot purely and dynamically based on the beat narration.")
            lines.append("   • If people appear (e.g. historical figures, crowd, scientists), describe them freely as anonymous situational elements or in `visual_action`.")
            lines.append("   • Focus on visual metaphors, artifacts, diagrams, and lively environmental illustrations that match the narration.")
        else:
            lines.append("1. KONSISTENSI KARAKTER: NON-AKTIF (MODE EXPLAINER / TANPA CHARACTER BIBLE)")
            lines.append("   • JANGAN gunakan token `[char:...]` sama sekali. Sutradarai adegan murni dan dinamis langsung dari isi narasi per segmen.")
            lines.append("   • Jika narasi membutuhkan manusia (misal: pekerja kuno, ilmuwan, pedagang, kerumunan), deskripsikan secara bebas sebagai figuran situasional di `visual_action`.")
            lines.append("   • Fokuskan pada metafora visual, artefak, diagram/peta, dan ilustrasi latar yang hidup sesuai isi narasi.")
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
            "- Start prompt with '[preset:style].'. Describe specific character action, emotion, scene composition, and lighting vividly. DO NOT include technical boilerplate like 'Full-bleed 16:9' or aspect ratio labels.\n"
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
            "- Awali prompt dengan '[preset:style].'. Tuliskan aksi konkret tokoh, ekspresi emosi, komposisi adegan, dan pencahayaan secara hidup. DILARANG memasukkan boilerplate teknis seperti 'Full-bleed 16:9' atau keterangan rasio layar.\n"
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


def build_scriptwriter_outline_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    num_chapters: int = 5,
    custom_instructions: Optional[str] = None,
    language: str = "id",
) -> Tuple[str, str]:
    """Agent 1 (Scriptwriter Agent): Build Master Narrative Outline prompt focusing strictly on storytelling."""
    target_words = max(400, int(duration_mins * 135))
    words_per_chapter = int(round(target_words / max(1, num_chapters)))
    beats_per_chapter = max(4, int(round(words_per_chapter / 19)))
    tone_clean = (tone or "").strip().lower()
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)

    if language == "en":
        narrative_arc_en = (
            NARRATIVE_ARC_DRAMATIC_EN
            if tone_clean in ["dramatis", "dramatic", "misterius", "mysterious"]
            else NARRATIVE_ARC_DEFAULT_EN
        )
        system_prompt = SCRIPTWRITER_OUTLINE_EN_TEMPLATE.format(
            tone_guidelines=tone_guidelines,
            duration_mins=duration_mins,
            target_words=target_words,
            num_chapters=num_chapters,
            words_per_chapter=words_per_chapter,
            beats_per_chapter=beats_per_chapter,
            narrative_arc=narrative_arc_en,
        )
        user_prompt = (
            f"Topic: {topic}\n"
            f"Target Total Duration: {duration_mins} Minutes (~{target_words} words total across {num_chapters} chapters)\n"
            f"Beats per chapter: ~{beats_per_chapter} beats (~{words_per_chapter} words/chapter)\n"
            f"Tone: {tone}\n"
        )
        if custom_instructions:
            user_prompt += f"Custom Instructions: {custom_instructions}\n"
        user_prompt += f"\nGenerate the Master Narrative Outline for exactly {num_chapters} chapters now in pure JSON format."
        return system_prompt, user_prompt

    narrative_arc_id = (
        NARRATIVE_ARC_DRAMATIC_ID
        if tone_clean in ["dramatis", "dramatic", "misterius", "mysterious"]
        else NARRATIVE_ARC_DEFAULT_ID
    )
    system_prompt = SCRIPTWRITER_OUTLINE_ID_TEMPLATE.format(
        tone_guidelines=tone_guidelines,
        duration_mins=duration_mins,
        target_words=target_words,
        num_chapters=num_chapters,
        words_per_chapter=words_per_chapter,
        beats_per_chapter=beats_per_chapter,
        narrative_arc=narrative_arc_id,
    )
    user_prompt = (
        f"Topik Cerita: {topic}\n"
        f"Target Total Durasi: {duration_mins} Menit (~{target_words} kata total dalam {num_chapters} babak)\n"
        f"Target Beat per Babak: ~{beats_per_chapter} beat (~{words_per_chapter} kata per babak)\n"
        f"Tone: {tone}\n"
    )
    if custom_instructions:
        user_prompt += f"Instruksi Khusus: {custom_instructions}\n"
    user_prompt += f"\nBuatlah Master Narrative Outline untuk tepat {num_chapters} babak sekarang dalam format JSON murni."
    return system_prompt, user_prompt


def build_scriptwriter_chapter_prompt(
    video_title: str,
    video_overview: str,
    chapter_index: int,
    total_chapters: int,
    chapter_title: str,
    chapter_synopsis: str,
    opening_hook: Optional[str],
    closing_rehook: Optional[str],
    target_beats: int,
    target_chapter_words: int,
    tone: str = "santai",
    language: str = "id",
    custom_instructions: Optional[str] = None,
    previous_chapter_ending: Optional[str] = None,
) -> Tuple[str, str]:
    """Agent 1 (Scriptwriter Agent): Build Chapter Pure Narration Beats prompt."""
    min_chapter_words = max(80, int(target_chapter_words * 0.85))
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)

    if language == "en":
        system_prompt = SCRIPTWRITER_CHAPTER_EN_TEMPLATE.format(
            chapter_index=chapter_index,
            total_chapters=total_chapters,
            chapter_title=chapter_title,
            tone_guidelines=tone_guidelines,
            target_beats=target_beats,
            min_chapter_words=min_chapter_words,
            target_chapter_words=target_chapter_words,
        )
        user_prompt = (
            f"Story Title: {video_title}\n"
            f"Story Arc Overview: {video_overview}\n"
            f"Current Chapter: {chapter_index} of {total_chapters} ('{chapter_title}')\n"
            f"Chapter Synopsis: {chapter_synopsis}\n"
            f"Target Word Count: Minimum {min_chapter_words} words (ideal ~{target_chapter_words} words)\n"
            f"Number of Beats: Exactly {target_beats} narrative beats\n"
        )
        if opening_hook:
            user_prompt += f"Opening Hook / Transition Guidance: {opening_hook}\n"
        if closing_rehook:
            user_prompt += f"Closing Re-hook Guidance: {closing_rehook}\n"
        if previous_chapter_ending:
            user_prompt += f"Previous Chapter Ending Sentence: '{previous_chapter_ending}'\n"
        if custom_instructions:
            user_prompt += f"Additional Directives: {custom_instructions}\n"
        user_prompt += f"\nWrite the complete narrative beats for Chapter {chapter_index} now in pure JSON format."
        return system_prompt, user_prompt

    system_prompt = SCRIPTWRITER_CHAPTER_ID_TEMPLATE.format(
        chapter_index=chapter_index,
        total_chapters=total_chapters,
        chapter_title=chapter_title,
        tone_guidelines=tone_guidelines,
        target_beats=target_beats,
        min_chapter_words=min_chapter_words,
        target_chapter_words=target_chapter_words,
    )
    user_prompt = (
        f"Judul Cerita: {video_title}\n"
        f"Gambaran Cerita Keseluruhan: {video_overview}\n"
        f"Babak Saat Ini: {chapter_index} dari {total_chapters} ('{chapter_title}')\n"
        f"Sinopsis Babak: {chapter_synopsis}\n"
        f"Target Panjang Kata: Minimal {min_chapter_words} kata (target ideal ~{target_chapter_words} kata)\n"
        f"Jumlah Beat Narasi: Tepat {target_beats} beat\n"
    )
    if opening_hook:
        user_prompt += f"Panduan Opening Hook / Jembatan: {opening_hook}\n"
    if closing_rehook:
        user_prompt += f"Panduan Closing Re-hook: {closing_rehook}\n"
    if previous_chapter_ending:
        user_prompt += f"Kalimat Terakhir Babak Sebelumnya: '{previous_chapter_ending}'\n"
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"
    user_prompt += f"\nTuliskan naskah narasi lengkap untuk Babak {chapter_index} sekarang dalam format JSON murni."
    return system_prompt, user_prompt


def build_character_agent_prompt(
    full_script_text: str,
    topic: str,
    tone: str = "santai",
    preset: Optional[Any] = None,
    language: str = "id",
) -> Tuple[str, str]:
    """Agent 2 (Character & World Designer): Build prompt to extract Continuity Bible from complete script."""
    preset_guidance = _build_preset_character_guidance(preset, language)
    if language == "en":
        system_prompt = CHARACTER_AGENT_SYSTEM_PROMPT_EN.format(preset_guidance=preset_guidance)
        user_prompt = (
            f"Topic: {topic}\nTone: {tone}\n\n"
            f"=== COMPLETE STORY SCRIPT WRITTEN BY SCRIPTWRITER AGENT ===\n"
            f"{full_script_text}\n\n"
            "Extract the complete Story World & Spatial Continuity Bible (characters with close-up & wide anchors, micro-set locations, world setting) in pure JSON format."
        )
        return system_prompt, user_prompt

    system_prompt = CHARACTER_AGENT_SYSTEM_PROMPT_ID.format(preset_guidance=preset_guidance)
    user_prompt = (
        f"Topik: {topic}\nTone: {tone}\n\n"
        f"=== NASKAH CERITA LENGKAP HASIL SCRIPTWRITER AGENT ===\n"
        f"{full_script_text}\n\n"
        "Ekstrak Story World & Spatial Continuity Bible lengkap (karakter dengan close-up & wide anchors, micro-set lokasi, world setting) sekarang dalam format JSON murni."
    )
    return system_prompt, user_prompt


def build_director_chapter_prompt(
    chapter_index: int,
    chapter_title: str,
    beats: List[Dict[str, Any]],
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    preset: Optional[Any] = None,
    language: str = "id",
    video_overview: Optional[str] = None,
    chapter_synopsis: Optional[str] = None,
) -> Tuple[str, str]:
    """Agent 3 (Director / Sutradara): Build prompt to map narrative beats to comic cinematography shots & prompts."""
    continuity_instruction = _format_continuity_bible_instructions(
        characters=characters,
        locations=locations,
        world_setting=world_setting,
        language=language,
    )
    visual_guidelines, _, _, _ = _build_visual_guidelines(preset)

    context_lines = []
    if video_overview:
        context_lines.append(f"Story Overview: {video_overview}")
    if chapter_synopsis:
        context_lines.append(f"Chapter Synopsis: {chapter_synopsis}")
    context_block = ("=== STORY CONTEXT ===\n" + "\n".join(context_lines) + "\n\n") if context_lines else ""

    if language == "en":
        system_prompt = DIRECTOR_CHAPTER_EN_TEMPLATE.format(
            chapter_index=chapter_index,
            chapter_title=chapter_title,
            continuity_instruction=continuity_instruction,
            visual_guidelines=visual_guidelines,
        )
        beats_json = json.dumps(beats, ensure_ascii=False, indent=2)
        user_prompt = (
            f"Chapter {chapter_index}: {chapter_title}\n\n"
            f"{context_block}"
            f"=== NARRATIVE BEATS TO DIRECT (EXACTLY {len(beats)} BEATS) ===\n"
            f"{beats_json}\n\n"
            f"Act as Master 2D Comic Storyboard Artist & Director. For each beat above, design the corresponding 16:9 dynamic comic panel scene in pure JSON format."
        )
        return system_prompt, user_prompt

    system_prompt = DIRECTOR_CHAPTER_ID_TEMPLATE.format(
        chapter_index=chapter_index,
        chapter_title=chapter_title,
        continuity_instruction=continuity_instruction,
        visual_guidelines=visual_guidelines,
    )
    beats_json = json.dumps(beats, ensure_ascii=False, indent=2)
    user_prompt = (
        f"Babak {chapter_index}: {chapter_title}\n\n"
        f"{context_block}"
        f"=== BEAT NARASI YANG HARUS DIARAHKAN (TEPAT {len(beats)} BEAT) ===\n"
        f"{beats_json}\n\n"
        f"Bertindaklah sebagai Sutradara Storyboard Komik 2D & Sinematografi Visual. Untuk SETIAP beat di atas, rancang tata adegan visual 16:9 yang dinamis dan ekspresif sekarang dalam format JSON murni."
    )
    return system_prompt, user_prompt


def _synthesize_fallback_beats(
    topic: str,
    chapter_index: int,
    chapter_title: str,
    target_beats: int,
    target_words: int,
    language: str = "id",
) -> List[Dict[str, Any]]:
    """Synthesize high-quality fallback narrative beats if LLM call experiences an unrecoverable failure, preserving target duration."""
    beats: List[Dict[str, Any]] = []
    num_beats = max(2, target_beats)

    if language == "en":
        for b_idx in range(1, num_beats + 1):
            if b_idx == 1:
                text = f"The compelling exploration of {topic} opens here with profound intrigue, directly framing the conflict of {chapter_title}."
            elif b_idx == num_beats:
                text = f"As the tensions of {chapter_title} draw to a decisive turning point, a lingering mystery unfolds, setting up the consequential chapter ahead."
            else:
                text = f"Within this pivotal beat of {chapter_title}, critical dimensions of {topic} reveal unexpected realities and heighten the stakes for everyone involved."
            beats.append({"beat_index": b_idx, "narration_text": text})
    else:
        for b_idx in range(1, num_beats + 1):
            if b_idx == 1:
                text = f"Penjelajahan mendalam mengenai {topic} bermula di sini dengan pertanyaan besar yang mengawali babak {chapter_title}."
            elif b_idx == num_beats:
                text = f"Ketika babak {chapter_title} mencapai titik baliknya, sebuah teka-teki baru mulai terkuak dan memicu rasa penasaran menuju perjalanan berikutnya."
            else:
                text = f"Di tengah ketegangan {chapter_title}, fakta tersembunyi mengenai {topic} perlahan tersingkap dan mengubah pemahaman yang ada sebelumnya."
            beats.append({"beat_index": b_idx, "narration_text": text})

    return beats


COMMON_TITLES = {
    "dewi", "raden", "prabu", "raja", "ratu", "patih", "sultan", "putri", "pangeran",
    "sang", "si", "kapten", "komandan", "jenderal", "profesor", "dr", "guru", "mbah",
    "kyai", "pak", "bu", "ibu", "bapak", "tuan", "nyonya", "king", "queen", "prince",
    "princess", "captain", "commander", "doctor", "general", "lord", "lady", "sir",
    "mr", "mrs", "miss", "master",
}

COMMON_LOC_NOISE = {
    "di", "ke", "dari", "pada", "yang", "dan", "the", "in", "at", "on", "of", "to", "from",
    "tempat", "daerah", "area", "lokasi", "suasana", "latar", "scene", "view",
}


def _match_characters_from_text(narr: str, characters: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Match characters using whole-word token scoring against Indonesian & English titles and names."""
    if not characters:
        return []
    narr_lower = (narr or "").lower()
    narr_words = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", narr_lower))

    scored_matches = []
    for c in characters:
        if not isinstance(c, dict):
            continue
        score = 0
        c_id = (c.get("id") or "").lower().strip()
        c_name = (c.get("name") or "").lower().strip()

        if c_name and c_name in narr_lower:
            score += 10
        if c_id and c_id in narr_words:
            score += 8

        for tok in re.split(r"[\s_-]+", c_name):
            if len(tok) >= 3 and tok in narr_words:
                score += 3 if tok in COMMON_TITLES else 7

        for tok in re.split(r"[\s_-]+", c_id):
            if len(tok) >= 3 and tok in narr_words:
                score += 3 if tok in COMMON_TITLES else 6

        if score > 0:
            scored_matches.append((score, c))

    scored_matches.sort(key=lambda x: x[0], reverse=True)
    return [c for score, c in scored_matches]


def _match_location_from_text(narr: str, locations: Optional[List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """Match location using token scoring across name, id, props, and environment description."""
    if not locations:
        return None
    narr_lower = (narr or "").lower()
    narr_words = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", narr_lower))

    scored_matches = []
    for loc in locations:
        if not isinstance(loc, dict):
            continue
        score = 0
        l_id = (loc.get("id") or loc.get("location_id") or "").lower().strip()
        l_name = (loc.get("name") or "").lower().strip()
        props = (loc.get("focal_props") or loc.get("key_props") or "").lower().strip()
        env = (loc.get("environment_anchor") or loc.get("description") or "").lower().strip()

        if l_name and l_name in narr_lower:
            score += 10
        if l_id and l_id in narr_words:
            score += 8

        for tok in re.split(r"[\s_-]+", l_name):
            if len(tok) >= 3 and tok not in COMMON_LOC_NOISE and tok in narr_words:
                score += 6

        for tok in re.split(r"[\s_-]+", l_id):
            if len(tok) >= 3 and tok not in COMMON_LOC_NOISE and tok in narr_words:
                score += 5

        for tok in re.findall(r"\b[a-zA-Z0-9_-]{4,}\b", f"{props} {env}"):
            if tok not in COMMON_LOC_NOISE and tok in narr_words:
                score += 3

        if score > 0:
            scored_matches.append((score, loc))

    scored_matches.sort(key=lambda x: x[0], reverse=True)
    return scored_matches[0][1] if scored_matches else None


def _detect_extra_subject_role(narr: str) -> str:
    """Identify extra or minor characters present in narration when not registered in Continuity Bible."""
    narr_lower = (narr or "").lower()
    role_map = [
        (("penjaga gerbang", "gatekeeper", "gate guard", "penjaga pintu"), "the stern gatekeeper sentry on guard duty"),
        (("penjaga", "pengawal", "guard", "sentry", "warden"), "an alert guard sentry standing watch"),
        (("prajurit", "pasukan", "tentara", "soldier", "warrior"), "a disciplined armed soldier"),
        (("saudagar", "pedagang", "merchant", "vendor", "penjual"), "a merchant attending to trade"),
        (("nelayan", "fisherman"), "a weathered fisherman"),
        (("petani", "farmer"), "a hardworking farmer"),
        (("sosok", "bayangan", "silhouette", "figure"), "a shadowy enigmatic silhouette"),
        (("raksasa", "ogre", "giant"), "a towering ogre sentinel"),
        (("tahanan", "tawanan", "prisoner", "captive"), "a captive prisoner in restrained posture"),
    ]
    for keys, desc in role_map:
        if any(k in narr_lower for k in keys):
            return desc
    return ""


def _detect_narration_leak(img_prompt: str, narration: str) -> bool:
    """Check if image prompt leaks raw narration or illustration clauses."""
    if not img_prompt:
        return False
    if re.search(r"\b(illustrating|representing|depicting|menampilkan)\b", img_prompt, re.IGNORECASE):
        return True
    if narration:
        n_clean = re.sub(r"[^\w\s]", "", narration.lower()).strip()
        p_clean = re.sub(r"[^\w\s]", "", img_prompt.lower()).strip()
        if len(n_clean) >= 20:
            for i in range(0, max(1, len(n_clean) - 20), 6):
                chunk = n_clean[i : i + 20]
                if chunk in p_clean:
                    return True
    return False


def _synthesize_director_fallback_scene(
    beat: Dict[str, Any],
    b_i: int,
    total_beats: int,
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    preset: Optional[Any] = None,
    prev_scene: Optional[Dict[str, Any]] = None,
    ch_idx: int = 1,
    default_character_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Synthesize a rich, comic-style visual scene for a narrative beat when LLM output fails, times out, or misses prompts."""
    narration = (beat.get("narration_text") or "").strip()
    narr_lower = narration.lower()

    # 1. Match character(s) from narration text
    matched_chars = _match_characters_from_text(narration, characters)

    active_char_id = ""
    subjects: List[Dict[str, str]] = []
    if matched_chars:
        active_char_id = matched_chars[0].get("id") or ""
        subjects.append({
            "char_id": active_char_id,
            "pose": "actively engaged in the scene with expressive body language",
            "expression": "focused and emotionally present",
        })
        if len(matched_chars) > 1:
            second_char_id = matched_chars[1].get("id") or ""
            if second_char_id:
                subjects.append({
                    "char_id": second_char_id,
                    "pose": "facing and interacting within the environment",
                    "expression": "alert",
                })
    else:
        # Check pronouns bridging to previous scene character
        pronoun_found = any(p in narr_lower.split() for p in ("ia", "dia", "mereka", "sang", "si", "beliau", "he", "she", "they"))
        if prev_scene and pronoun_found and prev_scene.get("character_id"):
            active_char_id = prev_scene["character_id"]
            subjects.append({
                "char_id": active_char_id,
                "pose": "moving with clear dramatic purpose through the setting",
                "expression": "determined",
            })
        else:
            # Check for extra/minor subject role without forcing characters[0]
            extra_role = _detect_extra_subject_role(narration)
            if extra_role:
                active_char_id = ""
                subjects.append({
                    "extra": extra_role,
                    "pose": "alert and grounded in the environment",
                    "expression": "stern",
                })
            elif default_character_id:
                active_char_id = default_character_id
                subjects.append({
                    "char_id": active_char_id,
                    "pose": "moving with purpose within the scene",
                    "expression": "focused",
                })
            else:
                active_char_id = ""
                subjects = []

    # 2. Match location from narration text or inherit from prev_scene
    matched_loc = _match_location_from_text(narration, locations)
    if matched_loc:
        active_loc_id = matched_loc.get("id") or matched_loc.get("location_id") or "cinematic_setting"
    elif prev_scene and prev_scene.get("location_id"):
        active_loc_id = prev_scene["location_id"]
    elif locations and len(locations) > 0:
        active_loc_id = locations[0].get("id") or locations[0].get("location_id") or "cinematic_setting"
    else:
        active_loc_id = "cinematic_setting"

    # 3. Scene group ID
    if prev_scene and prev_scene.get("location_id") == active_loc_id and prev_scene.get("scene_group_id"):
        scene_grp = prev_scene["scene_group_id"]
    else:
        scene_grp = f"grp_ch{ch_idx}_{b_i // 3}"

    # 4. Classify beat type
    has_char = bool(subjects)
    is_first = (b_i == 0)
    is_last = (b_i == total_beats - 1)
    loc_changed = (prev_scene is not None and prev_scene.get("location_id") != active_loc_id)
    beat_type = classify_beat_type(
        narration,
        has_character=has_char,
        is_first=is_first,
        is_last=is_last,
        location_changed=loc_changed,
    )

    # 5. Shot type and camera angle
    if is_first or loc_changed:
        shot_type = "establishing_wide" if is_first else "wide"
        camera_angle = "eye_level"
    elif len(subjects) >= 2:
        shot_type = "two_shot" if b_i % 2 == 0 else "medium"
        camera_angle = "eye_level"
    elif beat_type == "reaction" and has_char:
        shot_type = "medium_closeup" if b_i % 2 == 0 else "close_up"
        camera_angle = "eye_level"
    elif beat_type == "general_explainer":
        shot_type = "wide" if b_i % 2 == 0 else "full_shot"
        camera_angle = "high_angle" if b_i % 2 == 1 else "eye_level"
    else:
        palette = SHOT_PALETTE.get(beat_type, ["wide", "full_shot", "medium"])
        shot_type = palette[b_i % len(palette)]
        camera_angle = ["eye_level", "low_angle", "eye_level", "high_angle"][b_i % 4]

    # 6. Concrete visual action and environment detail
    action_tmpl = FALLBACK_VISUAL_ACTION.get(beat_type, FALLBACK_VISUAL_ACTION["action"])
    visual_action = action_tmpl
    environment_detail = FALLBACK_ENVIRONMENT.get(beat_type, FALLBACK_ENVIRONMENT["action"])

    # Spatial blocking & focal point
    if len(subjects) >= 2:
        spatial_blocking = "Dynamic two-figure staging across screen-left and screen-right with deep perspective"
        focal_point = "center"
    elif subjects:
        spatial_blocking = "Subject positioned dynamically within the frame interacting with environment"
        focal_point = "left" if b_i % 2 == 1 else "center"
    else:
        spatial_blocking = "Expansive landscape composition with depth layers and atmospheric haze"
        focal_point = "center"

    scene_data = {
        "beat_index": beat.get("beat_index", b_i + 1),
        "beat_type": beat_type,
        "scene_group_id": scene_grp,
        "shot_type": shot_type,
        "camera_angle": camera_angle,
        "spatial_blocking": spatial_blocking,
        "focal_point": focal_point,
        "camera_motion": default_motion(shot_type, camera_angle, b_i),
        "location_id": active_loc_id,
        "subjects": subjects,
        "visual_action": visual_action,
        "environment_detail": environment_detail,
        "composition": "dynamic 16:9 comic panel composition with clear depth",
        "lighting_time": "atmospheric directional lighting",
        "narration_text": narration,
        "character_id": active_char_id,
    }

    scene_data["image_prompt"] = compile_scene_prompt(
        scene_data,
        characters=characters,
        locations=locations,
    )

    return scene_data


def _sanitize_director_image_prompt(
    img_prompt: str,
    beat: Dict[str, Any],
    b_i: int = 0,
    shot_type: str = "wide",
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    preset: Optional[Any] = None,
) -> str:
    """Sanitize director image prompt: remove copied narration snippets or 'illustrating ...' clauses and elevate to rich comic staging."""
    clean = (img_prompt or "").strip()
    # Strip any technical aspect ratio / full-bleed / 16:9 boilerplates
    clean = re.sub(
        r"\b(?:full[\s-]bleed\s+(?:edge-to-edge\s+)?(?:widescreen\s+)?(?:16:9\s+)?|16:9\s+(?:widescreen\s+)?|full[\s-]bleed\s+16:9\s*|full[\s-]bleed\s*)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    ).strip(" ,.")
    if not clean:
        fallback = _synthesize_director_fallback_scene(
            beat=beat,
            b_i=b_i,
            total_beats=1,
            characters=characters,
            locations=locations,
            preset=preset,
        )
        return fallback["image_prompt"]

    narration = (beat.get("narration_text") or "").strip()
    leak_detected = _detect_narration_leak(clean, narration)

    if leak_detected:
        fallback = _synthesize_director_fallback_scene(
            beat=beat,
            b_i=b_i,
            total_beats=1,
            characters=characters,
            locations=locations,
            preset=preset,
        )
        fb_prompt = fallback["image_prompt"]
        fb_char_id = fallback.get("character_id")
        fb_loc_id = fallback.get("location_id")

        # Check for explicit "illustrating ..." or "representing ..." pattern
        ill_match = re.search(r"\b(illustrating|representing|depicting|menampilkan)\s+(.+)$", clean, re.IGNORECASE)
        prefix = clean[:ill_match.start()].rstrip(" ,;.") if ill_match else ""

        _, staging_part = compile_scene_prompt_parts(fallback, characters=characters, locations=locations)
        if not staging_part:
            staging_part = "Action: caught in a vivid narrative moment with rich environmental depth."

        if prefix:
            # If prefix contains a character token [char:X]
            char_match = re.search(r",?\s*(?:featuring\s+)?\[char:([^\]]+)\]", prefix, re.IGNORECASE)
            if char_match:
                pref_char_id = char_match.group(1).split(":")[0].strip().lower()
                if not fb_char_id or pref_char_id != fb_char_id.lower() or "[char:" in staging_part.lower():
                    # Strip character token from prefix to prevent duplication with staging_part
                    prefix = re.sub(r",?\s*(?:featuring\s+)?\[char:[^\]]+\]", "", prefix, flags=re.IGNORECASE).rstrip(" ,;.")

            # If prefix contains a location token [loc:Y]
            loc_match = re.search(r"\[loc:([^\]]+)\]", prefix, re.IGNORECASE)
            if loc_match and fb_loc_id:
                pref_loc_id = loc_match.group(1).split(":")[0].strip().lower()
                if pref_loc_id != fb_loc_id.lower() and _match_location_from_text(narration, locations):
                    prefix = re.sub(r"\[loc:[^\]]+\]", f"[loc:{fb_loc_id}]", prefix, flags=re.IGNORECASE)

            clean = f"{prefix}, {staging_part}"
        else:
            clean = fb_prompt

    # Strip any remaining Full-bleed 16:9 / 16:9 boilerplate
    clean = re.sub(
        r"\b(?:full[\s-]bleed\s+(?:edge-to-edge\s+)?(?:widescreen\s+)?(?:16:9\s+)?|16:9\s+(?:widescreen\s+)?|full[\s-]bleed\s+16:9\s*|full[\s-]bleed\s*)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    ).strip(" ,.")

    # Front-load [preset:style] if embedded as 'in [preset:style]'
    if re.search(r"\b(?:shot|composition|framing|scene)\s+in\s+\[(?:preset:)?style\]", clean, re.IGNORECASE):
        clean = re.sub(r"\b(shot|composition|framing|scene)\s+in\s+\[(?:preset:)?style\]", r"\1", clean, flags=re.IGNORECASE).strip(" ,.")
        if not clean.lower().startswith("[preset:style]"):
            clean = f"[preset:style]. {clean[0].upper() + clean[1:] if clean else ''}"
    elif "[preset:style]" not in clean.lower():
        clean = f"[preset:style]. {clean[0].upper() + clean[1:] if clean else ''}"

    # Strip any dangling partial words at the end caused by truncated text
    clean = re.sub(r"[,\s;]+$", "", clean).strip()
    if not clean.endswith((".", "!", "?")):
        clean += "."

    return clean


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


def repair_json_string(json_str: str) -> str:
    """Repair truncated or malformed JSON string generated by LLMs by closing strings and delimiter stacks."""
    if not json_str or not isinstance(json_str, str):
        return "{}"

    text = json_str.strip()
    fence_pattern = r"^```(?:json)?\s*\n?(.*?)\n?```$"
    match = re.search(fence_pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()

    start_brace = text.find("{")
    start_bracket = text.find("[")
    if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
        text = text[start_brace:]
    elif start_bracket != -1:
        text = text[start_bracket:]

    try:
        json.loads(text)
        return text
    except Exception:
        pass

    in_string = False
    escape = False
    stack: List[str] = []

    for char in text:
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
        else:
            if char == '"':
                in_string = True
            elif char in ("{", "["):
                stack.append(char)
            elif char in ("}", "]"):
                if stack:
                    if (char == "}" and stack[-1] == "{") or (char == "]" and stack[-1] == "["):
                        stack.pop()

    repaired = text
    if in_string:
        repaired += '"'

    repaired = re.sub(r',\s*"[^"]*"\s*:\s*$', "", repaired)
    repaired = re.sub(r",\s*$", "", repaired)

    stack = []
    in_str = False
    esc = False
    for char in repaired:
        if in_str:
            if esc:
                esc = False
            elif char == "\\":
                esc = True
            elif char == '"':
                in_str = False
        else:
            if char == '"':
                in_str = True
            elif char in ("{", "["):
                stack.append(char)
            elif char in ("}", "]"):
                if stack:
                    if (char == "}" and stack[-1] == "{") or (char == "]" and stack[-1] == "["):
                        stack.pop()

    for opener in reversed(stack):
        if opener == "{":
            repaired += "}"
        elif opener == "[":
            repaired += "]"

    return repaired


def extract_json_payload(raw_content: str) -> Dict[str, Any]:
    """Safely extract JSON from LLM output with fence and regex stripping, repairing truncated JSON when necessary."""
    text = (raw_content or "").strip()

    # Remove markdown code fences
    fence_pattern = r"^```(?:json)?\s*\n?(.*?)\n?```$"
    match = re.search(fence_pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()

    # 1. Direct parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # 2. Substring between first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    # 3. Truncated repair attempt using repair_json_string
    try:
        repaired = repair_json_string(text)
        return json.loads(repaired)
    except Exception as err:
        log.warning("JSON repair failed on LLM output: %s", err)

    raise ValueError("Gagal mengurai respons AI ke dalam format JSON naskah storyboard.")


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
    raw_shot = normalize_shot_type(scene.get("shot_type"))
    if raw_shot:
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
    elif "two-shot" in lower_p or "two shot" in lower_p:
        shot_type = "two_shot"
    elif "full" in lower_p or "full-body" in lower_p:
        shot_type = "full_shot"
    elif "wide" in lower_p or "widescreen" in lower_p:
        shot_type = "establishing_wide" if group_id != prev_group_id else "wide"
    else:
        shot_type = "establishing_wide" if group_id != prev_group_id else ("wide" if scene_idx == 0 else "medium")

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
    elif scene.get("location_id"):
        shot_meta["location_id"] = str(scene["location_id"]).strip()
    if scene.get("location_view"):
        shot_meta["location_view"] = str(scene["location_view"]).strip()
    if scene.get("beat_type"):
        shot_meta["beat_type"] = str(scene["beat_type"]).strip()
    if scene.get("visual_action"):
        shot_meta["visual_action"] = str(scene["visual_action"]).strip()
    if scene.get("subjects"):
        shot_meta["subjects"] = scene["subjects"]

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
    use_character_bible: bool = True,
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

    # =========================================================================
    # MULTI-AGENT STORYBOARD PIPELINE:
    # Agent 1: Scriptwriter Agent (Narrative lead, pure beats, 18-25 words each)
    # Agent 2: Character & World Agent (Concept Artist & Spatial Continuity Supervisor)
    # Agent 3: Director Agent (Sutradara: Camera framing, shot types, angles, image prompts)
    # =========================================================================

    # STEP 1: SCRIPTWRITER AGENT - OUTLINE & CHAPTER BEATS
    await publish_project_event(
        project_id=project_id,
        task_type="storyboard_generate",
        status="progress",
        progress=5,
        stage="scriptwriter",
        message=f"Scriptwriter Agent: Merancang outline alur cerita ({duration_mins} menit, ~{target_total_words} kata)...",
        data={
            "agent": "scriptwriter",
            "agent_name": "Scriptwriter Agent",
            "agent_progress": 10,
            "step": "outline",
            "duration_mins": duration_mins,
        },
    )

    outline_sys, outline_usr = build_scriptwriter_outline_prompt(
        topic=topic,
        duration_mins=duration_mins,
        tone=tone,
        num_chapters=num_chapters,
        custom_instructions=custom_instructions,
        language=language,
    )

    try:
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
        video_overview = outline_data.get("overview", f"Video cerita mendalam mengenai {topic}")
    except Exception as e:
        log.warning("Outline generation error: %s. Using default chapter roadmap.", e)
        video_title = topic
        video_overview = f"Video cerita mendalam mengenai {topic}"
        outline_chapters = []

    if not outline_chapters or not isinstance(outline_chapters, list):
        outline_chapters = [
            {
                "chapter_index": i + 1,
                "chapter_title": f"Babak {i + 1}",
                "synopsis": f"Perjalanan dan konflik babak {i + 1} cerita {topic}",
                "target_beats": scenes_per_chapter,
                "target_words": words_per_chapter,
            }
            for i in range(num_chapters)
        ]

    # Scriptwriter Agent: Write pure narrative beats per chapter
    script_chapters: List[Dict[str, Any]] = []
    prev_chapter_ending: Optional[str] = None

    for ch_idx, ch_info in enumerate(outline_chapters):
        ch_title = ch_info.get("chapter_title", f"Babak {ch_idx + 1}")
        ch_synopsis = ch_info.get("synopsis", "")
        ch_opening = ch_info.get("opening_hook")
        ch_closing = ch_info.get("closing_rehook")
        ch_beats_target = ch_info.get("target_beats") or scenes_per_chapter
        ch_words_target = ch_info.get("target_words") or words_per_chapter

        agent1_progress = int(10 + (32 * (ch_idx + 1) / len(outline_chapters)))
        await publish_project_event(
            project_id=project_id,
            task_type="storyboard_generate",
            status="progress",
            progress=agent1_progress,
            stage="scriptwriter",
            message=f"Scriptwriter Agent: Menulis naskah narasi Babak {ch_idx + 1}/{len(outline_chapters)} ('{ch_title[:30]}')...",
            data={
                "agent": "scriptwriter",
                "agent_name": "Scriptwriter Agent",
                "agent_progress": int(100 * (ch_idx + 1) / len(outline_chapters)),
                "chapter": ch_idx + 1,
                "total_chapters": len(outline_chapters),
            },
        )

        sys_p, usr_p = build_scriptwriter_chapter_prompt(
            video_title=video_title,
            video_overview=video_overview,
            chapter_index=ch_idx + 1,
            total_chapters=len(outline_chapters),
            chapter_title=ch_title,
            chapter_synopsis=ch_synopsis,
            opening_hook=ch_opening,
            closing_rehook=ch_closing,
            target_beats=ch_beats_target,
            target_chapter_words=ch_words_target,
            tone=tone,
            language=language,
            custom_instructions=custom_instructions,
            previous_chapter_ending=prev_chapter_ending,
        )

        ch_beats: List[Dict[str, Any]] = []
        for attempt in range(2):
            try:
                raw_ch = await llm_adapter.generate_chat(
                    prompt=usr_p,
                    system_prompt=sys_p,
                    json_mode=True,
                    timeout=90.0,
                    max_tokens=4096,
                )
                parsed_ch = extract_json_payload(raw_ch)
                raw_beats = parsed_ch.get("beats") or parsed_ch.get("scenes") or []
                if isinstance(raw_beats, list) and len(raw_beats) > 0:
                    for b_i, b in enumerate(raw_beats):
                        t = clean_narration_for_tts(b.get("narration_text") or b.get("text") or "").strip()
                        if t:
                            ch_beats.append({"beat_index": b_i + 1, "narration_text": t})
                if ch_beats:
                    break
            except Exception as err:
                log.warning("Attempt %d failed writing chapter %d: %s", attempt + 1, ch_idx + 1, err)
                if attempt == 0:
                    await asyncio.sleep(1.0)

        if not ch_beats:
            log.warning("Using fallback beats synthesis for chapter %d...", ch_idx + 1)
            ch_beats = _synthesize_fallback_beats(
                topic=topic,
                chapter_index=ch_idx + 1,
                chapter_title=ch_title,
                target_beats=ch_beats_target,
                target_words=ch_words_target,
                language=language,
            )

        if ch_beats:
            prev_chapter_ending = ch_beats[-1].get("narration_text")

        script_chapters.append({
            "chapter_index": ch_idx + 1,
            "chapter_title": ch_title,
            "beats": ch_beats,
        })

    # Assemble full script text
    full_script_lines_raw = [
        b["narration_text"] for ch in script_chapters for b in ch["beats"]
    ]
    full_script_text = "\n\n".join(full_script_lines_raw)
    total_script_words = len(full_script_text.split())
    log.info("Scriptwriter Agent completed: %d chapters, %d total words", len(script_chapters), total_script_words)

    await publish_project_event(
        project_id=project_id,
        task_type="storyboard_generate",
        status="progress",
        progress=45,
        stage="scriptwriter",
        message=f"Scriptwriter Agent: Naskah selesai ({total_script_words} kata, ~{round(total_script_words / 135, 1)} mnt)!",
        data={
            "agent": "scriptwriter",
            "agent_name": "Scriptwriter Agent",
            "agent_progress": 100,
            "word_count": total_script_words,
        },
    )

    # STEP 2: CHARACTER & WORLD AGENT
    if use_character_bible:
        await publish_project_event(
            project_id=project_id,
            task_type="storyboard_generate",
            status="progress",
            progress=48,
            stage="character_designer",
            message="Character & World Agent: Menganalisis naskah & merancang Story Continuity Bible...",
            data={
                "agent": "character_designer",
                "agent_name": "Character & World Agent",
                "agent_progress": 25,
                "step": "analyzing",
            },
        )

        char_sys, char_usr = build_character_agent_prompt(
            full_script_text=full_script_text,
            topic=topic,
            tone=tone,
            preset=preset,
            language=language,
        )

        try:
            raw_bible = await llm_adapter.generate_chat(
                prompt=char_usr,
                system_prompt=char_sys,
                json_mode=True,
                timeout=120.0,
                max_tokens=4096,
            )
            bible_data = extract_json_payload(raw_bible)
            detected_characters = bible_data.get("characters", []) or []
            detected_locations = bible_data.get("locations", []) or []
            detected_world_setting = bible_data.get("world_setting", {}) or {}
        except Exception as e:
            log.warning("Character Agent extraction failed: %s. Using default entities.", e)
            detected_characters = [
                {
                    "id": "protagonist",
                    "name": "Tokoh Utama",
                    "role": "Protagonist",
                    "face_head_anchor": "expressive eyes, distinctive hairstyle, focused gaze",
                    "outfit_body_anchor": "cinematic tailored attire authentic to the setting",
                    "visual_anchor": "protagonist figure with expressive eyes and cinematic attire",
                    "variants": [],
                }
            ]
            detected_locations = [
                {
                    "id": "main_set",
                    "name": "Latar Utama",
                    "environment_anchor": f"cinematic detailed setting representing {topic}",
                    "closeup_background_anchor": f"softly defocused background of {topic} environment",
                    "focal_props": "central props, atmospheric textures",
                    "lighting_direction": "warm directional morning sunlight streaming from screen-left",
                }
            ]
            detected_world_setting = {
                "era": "Contemporary",
                "time_setting": "Present",
                "atmosphere": "Cinematic warm palette with dynamic contrast",
            }

        detected_characters, detected_locations = _normalize_continuity_bible(
            detected_characters, detected_locations
        )

        await publish_project_event(
            project_id=project_id,
            task_type="storyboard_generate",
            status="progress",
            progress=65,
            stage="character_designer",
            message=f"Character & World Agent: {len(detected_characters)} Tokoh & {len(detected_locations)} Micro-set berhasil dikunci!",
            data={
                "agent": "character_designer",
                "agent_name": "Character & World Agent",
                "agent_progress": 100,
                "characters_count": len(detected_characters),
                "locations_count": len(detected_locations),
            },
        )
    else:
        log.info("Mode Tanpa Karakter Aktif (use_character_bible=False) untuk proyek %s", project_id)
        await publish_project_event(
            project_id=project_id,
            task_type="storyboard_generate",
            status="progress",
            progress=55,
            stage="character_designer",
            message="Mode Tanpa Karakter Aktif: Melewati Character Bible, menyiapkan latar & dunia cerita...",
            data={
                "agent": "character_designer",
                "agent_name": "Character & World Agent",
                "agent_progress": 100,
                "step": "skipped_character_bible",
            },
        )
        detected_characters = []
        try:
            char_sys, char_usr = build_character_agent_prompt(
                full_script_text=full_script_text,
                topic=topic,
                tone=tone,
                preset=preset,
                language=language,
            )
            char_usr += (
                "\n\nCATATAN KHUSUS: Mode eksplainer/tanpa karakter spesifik aktif! "
                "JANGAN mengekstrak karakter (kembalikan `\"characters\": []`). "
                "Hanya ekstrak latar tempat (`locations`) dan konteks era/dunia (`world_setting`)."
            )
            raw_bible = await llm_adapter.generate_chat(
                prompt=char_usr,
                system_prompt=char_sys,
                json_mode=True,
                timeout=90.0,
                max_tokens=4096,
            )
            bible_data = extract_json_payload(raw_bible)
            detected_characters = []
            detected_locations = bible_data.get("locations", []) or []
            detected_world_setting = bible_data.get("world_setting", {}) or {}
        except Exception as e:
            log.warning("Location/world extraction failed: %s", e)
            detected_characters = []
            detected_locations = []
            detected_world_setting = {
                "era": "Contemporary",
                "time_setting": "Present",
                "atmosphere": "Cinematic warm palette with dynamic contrast",
            }
        _, detected_locations = _normalize_continuity_bible([], detected_locations)

        await publish_project_event(
            project_id=project_id,
            task_type="storyboard_generate",
            status="progress",
            progress=65,
            stage="character_designer",
            message=f"World Context Siap: {len(detected_locations)} Latar diekstrak (Tanpa Character Bible).",
            data={
                "agent": "character_designer",
                "agent_name": "Character & World Agent",
                "agent_progress": 100,
                "characters_count": 0,
                "locations_count": len(detected_locations),
            },
        )

    # STEP 3: DIRECTOR AGENT (SUTRADARA & AI CINEMATOGRAPHY)
    await publish_project_event(
        project_id=project_id,
        task_type="storyboard_generate",
        status="progress",
        progress=68,
        stage="director",
        message="Director Agent: Merancang sudut kamera, framing & prompt visual 16:9...",
        data={
            "agent": "director",
            "agent_name": "Director Agent",
            "agent_progress": 10,
            "step": "director_prep",
        },
    )

    sem = asyncio.Semaphore(2)
    completed_directors = 0

    async def _direct_single_chapter(ch: Dict[str, Any]) -> Dict[str, Any]:
        nonlocal completed_directors
        ch_idx = ch["chapter_index"]
        ch_title = ch["chapter_title"]
        ch_beats = ch["beats"]

        ch_synopsis = ""
        if ch_idx - 1 < len(outline_chapters):
            ch_synopsis = outline_chapters[ch_idx - 1].get("synopsis", "")

        try:
            d_sys, d_usr = build_director_chapter_prompt(
                chapter_index=ch_idx,
                chapter_title=ch_title,
                beats=ch_beats,
                characters=detected_characters,
                locations=detected_locations,
                world_setting=detected_world_setting,
                preset=preset,
                language=language,
                video_overview=video_overview,
                chapter_synopsis=ch_synopsis,
            )
        except Exception as e:
            log.warning("Failed building director prompt for chapter %d: %s", ch_idx, e)
            d_sys, d_usr = "", ""

        directed_scenes: List[Dict[str, Any]] = []
        if d_sys and d_usr:
            async with sem:
                for attempt in range(2):
                    try:
                        raw_dir = await llm_adapter.generate_chat(
                            prompt=d_usr,
                            system_prompt=d_sys,
                            json_mode=True,
                            timeout=90.0,
                            max_tokens=6144,
                        )
                        dir_data = extract_json_payload(raw_dir)
                        directed_scenes = dir_data.get("scenes") or []
                        if directed_scenes:
                            break
                    except Exception as err:
                        log.warning("Attempt %d failed directing chapter %d: %s", attempt + 1, ch_idx, err)
                        if attempt == 0:
                            await asyncio.sleep(0.5)

        # Pre-index known character slugs
        known_chars = {_normalize_key(c.get("id") or c.get("name")): (c.get("id") or "") for c in (detected_characters or []) if isinstance(c, dict)}

        # Map 1-to-1: beat narration + director shot metadata & image prompt
        scenes_map = {s.get("beat_index", idx + 1): s for idx, s in enumerate(directed_scenes)}
        merged_scenes: List[Dict[str, Any]] = []
        for b_i, beat in enumerate(ch_beats):
            b_num = beat.get("beat_index", b_i + 1)
            dir_scene = scenes_map.get(b_num) or (directed_scenes[b_i] if b_i < len(directed_scenes) else {})
            prev_sc = merged_scenes[-1] if merged_scenes else None
            fallback_sc = _synthesize_director_fallback_scene(
                beat=beat,
                b_i=b_i,
                total_beats=len(ch_beats),
                characters=detected_characters,
                locations=detected_locations,
                world_setting=detected_world_setting,
                preset=preset,
                prev_scene=prev_sc,
                ch_idx=ch_idx,
            )

            beat_type = normalize_beat_type(dir_scene.get("beat_type")) or fallback_sc.get("beat_type", "action")
            shot_type = normalize_shot_type(dir_scene.get("shot_type")) or fallback_sc["shot_type"]
            camera_angle = normalize_angle(dir_scene.get("camera_angle")) or fallback_sc["camera_angle"]
            spatial_blocking = (dir_scene.get("spatial_blocking") or fallback_sc.get("spatial_blocking", "")).strip()
            focal_point = (dir_scene.get("focal_point") or fallback_sc.get("focal_point", "center")).strip()
            camera_motion = (
                dir_scene.get("camera_motion") or fallback_sc["camera_motion"]
            ).strip()
            scene_grp = (dir_scene.get("scene_group_id") or fallback_sc["scene_group_id"]).strip()
            loc_id = (dir_scene.get("location_id") or fallback_sc.get("location_id", "")).strip()
            loc_view = (dir_scene.get("location_view") or "").strip()

            subjects = normalize_subjects(dir_scene.get("subjects"), known_chars) or fallback_sc.get("subjects", [])
            visual_action = (dir_scene.get("visual_action") or fallback_sc.get("visual_action", "")).strip()
            env_detail = (dir_scene.get("environment_detail") or fallback_sc.get("environment_detail", "")).strip()
            comp = (dir_scene.get("composition") or "").strip()
            light_time = (dir_scene.get("lighting_time") or "").strip()

            raw_img_prompt = (dir_scene.get("image_prompt") or "").strip()
            if raw_img_prompt:
                img_prompt = _sanitize_director_image_prompt(
                    img_prompt=raw_img_prompt,
                    beat=beat,
                    b_i=b_i,
                    shot_type=shot_type,
                    characters=detected_characters,
                    locations=detected_locations,
                    preset=preset,
                )
            else:
                img_prompt = compile_scene_prompt(
                    {
                        "shot_type": shot_type,
                        "camera_angle": camera_angle,
                        "location_id": loc_id,
                        "location_view": loc_view,
                        "subjects": subjects,
                        "visual_action": visual_action,
                        "environment_detail": env_detail,
                        "composition": comp,
                        "lighting_time": light_time,
                    },
                    characters=detected_characters,
                    locations=detected_locations,
                )

            char_id = ""
            for s in subjects:
                if s.get("char_id"):
                    char_id = s["char_id"]
                    break

            merged_scenes.append({
                "_chapter": ch_idx,
                "scene_id": f"scene-{b_i + 1}",
                "beat_index": b_num,
                "beat_type": beat_type,
                "scene_group_id": scene_grp,
                "shot_type": shot_type,
                "camera_angle": camera_angle,
                "spatial_blocking": spatial_blocking,
                "focal_point": focal_point,
                "camera_motion": camera_motion,
                "narration_text": beat["narration_text"],
                "image_prompt": img_prompt,
                "character_id": char_id or fallback_sc.get("character_id", ""),
                "location_id": loc_id,
                "location_view": loc_view,
                "subjects": subjects,
                "visual_action": visual_action,
                "environment_detail": env_detail,
                "composition": comp,
                "lighting_time": light_time,
            })

        # Apply Comic Shot Variety Planner across the chapter
        merged_scenes = plan_shot_variety(merged_scenes, group_key="scene_group_id", chapter_key="_chapter")
        for sc in merged_scenes:
            if sc.get("_replanned"):
                sc["image_prompt"] = compile_scene_prompt(sc, characters=detected_characters, locations=detected_locations)

        # Quality metrics logging
        metrics = storyboard_quality_metrics(merged_scenes)
        log.info(
            "Chapter %d Directed: %d scenes (closeup_ratio=%.2f, max_run=%d, env_multi=%.2f)",
            ch_idx, len(merged_scenes), metrics.get("closeup_ratio", 0), metrics.get("max_same_shot_run", 0), metrics.get("env_multi_ratio", 0)
        )

        completed_directors += 1
        cur_progress = int(68 + (28 * completed_directors / max(1, len(script_chapters))))
        await publish_project_event(
            project_id=project_id,
            task_type="storyboard_generate",
            status="progress",
            progress=cur_progress,
            stage="director",
            message=f"Director Agent: Menyusun tata visual Babak {completed_directors}/{len(script_chapters)} ('{ch_title[:25]}')...",
            data={
                "agent": "director",
                "agent_name": "Director Agent",
                "agent_progress": int(100 * completed_directors / max(1, len(script_chapters))),
                "completed_chapters": completed_directors,
                "total_chapters": len(script_chapters),
            },
        )

        # Structure into segments
        segs: List[Dict[str, Any]] = []
        chunk_size = max(1, images_per_segment)
        for seg_idx in range(0, len(merged_scenes), chunk_size):
            sub_scenes = merged_scenes[seg_idx : seg_idx + chunk_size]
            segs.append({
                "segment_id": f"seg-{ch_idx}_{len(segs) + 1}",
                "scenes": sub_scenes,
            })

        return {
            "chapter_index": ch_idx,
            "chapter_title": ch_title,
            "segments": segs,
        }

    director_tasks = [_direct_single_chapter(ch) for ch in script_chapters]
    chapters = await asyncio.gather(*director_tasks)

    # Flatten segments for the Narration model and construct StoryboardItems with AI Cinematography metadata
    all_segments: List[Dict[str, Any]] = []
    full_script_lines: List[str] = []
    storyboard_items: List[StoryboardItem] = []

    global_img_order = 0
    seg_counter = 1
    prev_loc_token = ""
    prev_group_id = ""
    
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
                        prev_sc = storyboard_items[-1] if storyboard_items else None
                        prev_sc_dict = (
                            {
                                "character_id": getattr(prev_sc, "shot_metadata", {}).get("character_id"),
                                "location_id": getattr(prev_sc, "shot_metadata", {}).get("location_id"),
                                "scene_group_id": getattr(prev_sc, "shot_metadata", {}).get("scene_group_id"),
                            }
                            if prev_sc and getattr(prev_sc, "shot_metadata", None)
                            else None
                        )
                        fb_sc = _synthesize_director_fallback_scene(
                            beat={"narration_text": scene_text, "beat_index": scene_idx + 1},
                            b_i=scene_idx,
                            total_beats=len(scenes),
                            characters=detected_characters,
                            locations=detected_locations,
                            world_setting=detected_world_setting,
                            preset=preset,
                            prev_scene=prev_sc_dict,
                            ch_idx=chap_idx + 1,
                        )
                        scene_prompt = fb_sc["image_prompt"]

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
                prev_sc = storyboard_items[-1] if storyboard_items else None
                prev_sc_dict = (
                    {
                        "character_id": getattr(prev_sc, "shot_metadata", {}).get("character_id"),
                        "location_id": getattr(prev_sc, "shot_metadata", {}).get("location_id"),
                        "scene_group_id": getattr(prev_sc, "shot_metadata", {}).get("scene_group_id"),
                    }
                    if prev_sc and getattr(prev_sc, "shot_metadata", None)
                    else None
                )
                fb_sc = _synthesize_director_fallback_scene(
                    beat={"narration_text": seg_text, "beat_index": 1},
                    b_i=0,
                    total_beats=1,
                    characters=detected_characters,
                    locations=detected_locations,
                    world_setting=detected_world_setting,
                    preset=preset,
                    prev_scene=prev_sc_dict,
                    ch_idx=chap_idx + 1,
                )
                img_prompts = [fb_sc["image_prompt"]]

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
    if not isinstance(detected_world_setting, dict):
        detected_world_setting = {}
    detected_world_setting["use_character_bible"] = bool(use_character_bible)
    proj.world_setting = detected_world_setting
    proj.status = "ready"
    await db.commit()
    await db.refresh(narration)
    await db.refresh(proj)

    log.info("Successfully created narration with %d segments and %d storyboard image slots.", len(all_segments), len(storyboard_items))

    await publish_project_event(
        project_id=project_id,
        task_type="storyboard_generate",
        status="success",
        progress=100,
        stage="completed",
        message=f"Naskah ({word_count} kata, ~{round(actual_duration_seconds / 60, 1)} mnt) & {len(storyboard_items)} adegan visual selesai dibuat oleh 3 Agent!",
        data={
            "agent": "completed",
            "agent_name": "Multi-Agent System",
            "agent_progress": 100,
            "total_words": word_count,
            "actual_duration_seconds": actual_duration_seconds,
            "total_scenes": len(storyboard_items),
            "characters_count": len(detected_characters),
            "locations_count": len(detected_locations),
        },
    )

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


async def redirect_storyboard_visuals(
    db: AsyncSession,
    project_id: str,
    preset_id: Optional[str] = None,
    custom_instructions: Optional[str] = None,
    use_character_bible: Optional[bool] = None,
) -> List[StoryboardItem]:
    """Re-direct cinematography and visual prompts for an existing project's storyboard items.

    Leaves narration text, audio, and timings untouched while refreshing shot_metadata and image_prompt
    with the comic Director v2 + Shot Variety Planner.
    """
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"Project {project_id} tidak ditemukan.")

    from app.models.image_preset import ImagePreset
    from app.services.image_studio import get_active_image_preset
    from collections import OrderedDict
    from datetime import datetime

    preset = None
    if preset_id:
        preset = await db.get(ImagePreset, preset_id)
    if not preset:
        preset = await get_active_image_preset(db)

    items_stmt = (
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index.asc())
    )
    res = await db.execute(items_stmt)
    items = list(res.scalars().all())
    if not items:
        return []

    llm_adapter = await get_active_llm_adapter(db)
    detected_world_setting = getattr(proj, "world_setting", {}) or {}
    if use_character_bible is None:
        effective_use_char = detected_world_setting.get("use_character_bible", True)
    else:
        effective_use_char = use_character_bible

    detected_characters = (getattr(proj, "characters", []) or []) if effective_use_char else []
    detected_locations = getattr(proj, "locations", []) or []
    language = proj.language or "id"

    chapters_dict: Dict[str, List[StoryboardItem]] = OrderedDict()
    for it in items:
        ch_name = it.chapter_title or "Babak 1"
        chapters_dict.setdefault(ch_name, []).append(it)

    sem = asyncio.Semaphore(2)

    async def _redirect_chapter(ch_title: str, ch_items: List[StoryboardItem], ch_idx: int):
        beats = [
            {"beat_index": idx + 1, "narration_text": it.script_text}
            for idx, it in enumerate(ch_items)
        ]
        d_sys, d_usr = build_director_chapter_prompt(
            chapter_index=ch_idx,
            chapter_title=ch_title,
            beats=beats,
            characters=detected_characters,
            locations=detected_locations,
            world_setting=detected_world_setting,
            preset=preset,
            language=language,
        )
        directed_scenes: List[Dict[str, Any]] = []
        async with sem:
            for attempt in range(2):
                try:
                    raw_dir = await llm_adapter.generate_chat(
                        prompt=d_usr,
                        system_prompt=d_sys,
                        json_mode=True,
                        timeout=90.0,
                        max_tokens=6144,
                    )
                    dir_data = extract_json_payload(raw_dir)
                    directed_scenes = dir_data.get("scenes") or []
                    if directed_scenes:
                        break
                except Exception as err:
                    log.warning("Redirect attempt %d failed for chapter %s: %s", attempt + 1, ch_title, err)

        known_chars = {_normalize_key(c.get("id") or c.get("name")): (c.get("id") or "") for c in detected_characters if isinstance(c, dict)}
        scenes_map = {s.get("beat_index", idx + 1): s for idx, s in enumerate(directed_scenes)}
        merged: List[Dict[str, Any]] = []
        for b_i, it in enumerate(ch_items):
            beat = {"beat_index": b_i + 1, "narration_text": it.script_text}
            dir_scene = scenes_map.get(b_i + 1) or (directed_scenes[b_i] if b_i < len(directed_scenes) else {})
            prev_sc = merged[-1] if merged else None
            fb_sc = _synthesize_director_fallback_scene(
                beat=beat,
                b_i=b_i,
                total_beats=len(ch_items),
                characters=detected_characters,
                locations=detected_locations,
                world_setting=detected_world_setting,
                preset=preset,
                prev_scene=prev_sc,
                ch_idx=ch_idx,
            )

            beat_type = normalize_beat_type(dir_scene.get("beat_type")) or fb_sc.get("beat_type", "action")
            shot_type = normalize_shot_type(dir_scene.get("shot_type")) or fb_sc["shot_type"]
            camera_angle = normalize_angle(dir_scene.get("camera_angle")) or fb_sc["camera_angle"]
            spatial_blocking = (dir_scene.get("spatial_blocking") or fb_sc.get("spatial_blocking", "")).strip()
            focal_point = (dir_scene.get("focal_point") or fb_sc.get("focal_point", "center")).strip()
            camera_motion = (dir_scene.get("camera_motion") or fb_sc.get("camera_motion", "static")).strip()
            scene_grp = (dir_scene.get("scene_group_id") or fb_sc["scene_group_id"]).strip()
            loc_id = (dir_scene.get("location_id") or fb_sc.get("location_id", "")).strip()
            loc_view = (dir_scene.get("location_view") or "").strip()

            subjects = normalize_subjects(dir_scene.get("subjects"), known_chars) or fb_sc.get("subjects", [])
            visual_action = (dir_scene.get("visual_action") or fb_sc.get("visual_action", "")).strip()
            env_detail = (dir_scene.get("environment_detail") or fb_sc.get("environment_detail", "")).strip()
            comp = (dir_scene.get("composition") or "").strip()
            light_time = (dir_scene.get("lighting_time") or "").strip()

            raw_prompt = (dir_scene.get("image_prompt") or "").strip()
            if raw_prompt:
                img_prompt = _sanitize_director_image_prompt(
                    img_prompt=raw_prompt,
                    beat=beat,
                    b_i=b_i,
                    shot_type=shot_type,
                    characters=detected_characters,
                    locations=detected_locations,
                    preset=preset,
                )
            else:
                img_prompt = compile_scene_prompt(
                    {
                        "shot_type": shot_type,
                        "camera_angle": camera_angle,
                        "location_id": loc_id,
                        "location_view": loc_view,
                        "subjects": subjects,
                        "visual_action": visual_action,
                        "environment_detail": env_detail,
                        "composition": comp,
                        "lighting_time": light_time,
                    },
                    characters=detected_characters,
                    locations=detected_locations,
                )

            char_id = ""
            for s in subjects:
                if s.get("char_id"):
                    char_id = s["char_id"]
                    break

            merged.append({
                "_chapter": ch_idx,
                "item_ref": it,
                "beat_type": beat_type,
                "scene_group_id": scene_grp,
                "shot_type": shot_type,
                "camera_angle": camera_angle,
                "spatial_blocking": spatial_blocking,
                "focal_point": focal_point,
                "camera_motion": camera_motion,
                "image_prompt": img_prompt,
                "character_id": char_id or fb_sc.get("character_id", ""),
                "location_id": loc_id,
                "location_view": loc_view,
                "subjects": subjects,
                "visual_action": visual_action,
                "environment_detail": env_detail,
                "composition": comp,
                "lighting_time": light_time,
            })

        merged = plan_shot_variety(merged, group_key="scene_group_id", chapter_key="_chapter")
        for sc in merged:
            if sc.get("_replanned"):
                sc["image_prompt"] = compile_scene_prompt(sc, characters=detected_characters, locations=detected_locations)
            it = sc["item_ref"]
            it.image_prompt = sc["image_prompt"]
            it.motion_effect = sc["camera_motion"]
            shot_meta = it.shot_metadata if isinstance(it.shot_metadata, dict) else {}
            shot_meta.update({
                "scene_group_id": sc["scene_group_id"],
                "shot_type": sc["shot_type"],
                "camera_angle": sc["camera_angle"],
                "focal_point": sc["focal_point"],
                "spatial_blocking": sc["spatial_blocking"],
                "location_id": sc["location_id"],
                "location_view": sc["location_view"],
                "beat_type": sc["beat_type"],
                "visual_action": sc["visual_action"],
                "subjects": sc["subjects"],
            })
            it.shot_metadata = shot_meta
            it.updated_at = datetime.utcnow()

    tasks = [
        _redirect_chapter(ch_title, ch_items, ch_idx + 1)
        for ch_idx, (ch_title, ch_items) in enumerate(chapters_dict.items())
    ]
    await asyncio.gather(*tasks)
    await db.commit()
    for it in items:
        await db.refresh(it)
    return items
