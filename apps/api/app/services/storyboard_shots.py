"""Storyboard shot planning: beat classification, shot-variety planner and deterministic prompt compiler.

The Director agent fills structured fields per scene (beat type, visual action, subjects, ...).
This module (pure code, no LLM) then:
  1. enforces comic-style shot variety (`plan_shot_variety`),
  2. assembles the final tokenized `image_prompt` from the structured fields (`compile_scene_prompt`).

Keeping this in code makes the variety rules testable and guarantees every prompt carries a concrete
action + environment instead of an empty "intense expression, soft bokeh" portrait.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

# --------------------------------------------------------------------------------------
# Taxonomy
# --------------------------------------------------------------------------------------

FACE_SHOTS: Set[str] = {"medium_closeup", "close_up", "extreme_closeup"}
WIDE_OPENERS: Set[str] = {"establishing_wide", "wide", "full_shot", "aerial"}
ENV_OR_MULTI_SHOTS: Set[str] = {
    "establishing_wide",
    "wide",
    "full_shot",
    "aerial",
    "silhouette_wide",
    "group_shot",
    "two_shot",
    "over_the_shoulder",
}
MULTI_SUBJECT_SHOTS: Set[str] = {"two_shot", "over_the_shoulder", "group_shot"}

ALL_SHOT_TYPES: Set[str] = {
    "establishing_wide",
    "wide",
    "full_shot",
    "medium",
    "two_shot",
    "over_the_shoulder",
    "group_shot",
    "insert_detail",
    "pov",
    "aerial",
    "silhouette_wide",
    "medium_closeup",
    "close_up",
    "extreme_closeup",
}

SHOT_ALIASES: Dict[str, str] = {
    "closeup": "close_up",
    "extreme_close_up": "extreme_closeup",
    "medium_close_up": "medium_closeup",
    "ots": "over_the_shoulder",
    "over_shoulder": "over_the_shoulder",
    "establishing": "establishing_wide",
    "long_shot": "wide",
    "full": "full_shot",
    "detail": "insert_detail",
    "insert": "insert_detail",
    "cutaway": "insert_detail",
    "birds_eye": "aerial",
    "bird_eye": "aerial",
    "two": "two_shot",
    "group": "group_shot",
    "silhouette": "silhouette_wide",
    "medium_shot": "medium",
}

VALID_ANGLES: Set[str] = {"eye_level", "low_angle", "high_angle", "dutch_angle", "birds_eye"}
ANGLE_CYCLE: List[str] = ["eye_level", "low_angle", "high_angle"]

VALID_MOTIONS: Set[str] = {"zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down", "static"}

BEAT_TYPES = (
    "action",
    "dialogue",
    "reaction",
    "establishing",
    "general_explainer",
    "reveal_detail",
    "insight",
)

# Ordered by preference; the planner rotates the start index so consecutive beats of one type vary.
SHOT_PALETTE: Dict[str, List[str]] = {
    "action": ["wide", "full_shot", "medium", "pov", "group_shot"],
    "dialogue": ["two_shot", "over_the_shoulder", "medium", "medium_closeup"],
    "reaction": ["medium_closeup", "medium", "close_up"],
    "establishing": ["establishing_wide", "aerial", "wide"],
    "general_explainer": ["wide", "group_shot", "insert_detail", "aerial", "full_shot"],
    "reveal_detail": ["insert_detail", "wide", "medium"],
    "insight": ["silhouette_wide", "wide", "full_shot"],
}
GLOBAL_FALLBACK_ORDER: List[str] = [
    "wide",
    "medium",
    "full_shot",
    "two_shot",
    "group_shot",
    "insert_detail",
    "establishing_wide",
    "aerial",
]

SHOT_PHRASES: Dict[str, str] = {
    "establishing_wide": "establishing wide shot with small figures inside a vast, richly detailed setting",
    "wide": "wide shot showing full bodies and the surrounding environment",
    "full_shot": "full-body shot with the environment visible all around the subject",
    "medium": "medium shot (waist up) with the setting clearly visible behind",
    "two_shot": "two-shot framing both characters interacting, environment visible around them",
    "over_the_shoulder": "over-the-shoulder shot looking past one character at the other",
    "group_shot": "group shot with several figures at different depths in the scene",
    "insert_detail": "insert detail shot of the key object or hands in action, no face focus",
    "pov": "first-person point-of-view shot",
    "aerial": "high aerial view of the whole scene",
    "silhouette_wide": "wide shot with the subjects as dramatic silhouettes against the setting",
    "medium_closeup": "medium close-up (chest up) with the setting still readable behind the subject",
    "close_up": "close-up on a clearly expressive face with a hint of the setting",
    "extreme_closeup": "extreme close-up on the eyes or a key detail",
}

ANGLE_PHRASES: Dict[str, str] = {
    "eye_level": "",
    "low_angle": "low-angle perspective looking up",
    "high_angle": "high-angle perspective looking down",
    "dutch_angle": "tilted dutch-angle framing",
    "birds_eye": "bird's-eye view from directly above",
}

# --------------------------------------------------------------------------------------
# Normalisers
# --------------------------------------------------------------------------------------


def normalize_key(text: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(text or "").lower())


def normalize_shot_type(raw: Any) -> str:
    s = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    s = SHOT_ALIASES.get(s, s)
    return s if s in ALL_SHOT_TYPES else ""


def normalize_angle(raw: Any) -> str:
    s = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if s in ("birds_eye_view", "bird_s_eye", "aerial"):
        s = "birds_eye"
    return s if s in VALID_ANGLES else ""


def normalize_beat_type(raw: Any) -> str:
    s = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    return s if s in BEAT_TYPES else ""


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v).strip() for v in value if str(v).strip())
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_subjects(raw: Any, known_char_ids: Optional[Dict[str, str]] = None) -> List[Dict[str, str]]:
    """Normalize Director `subjects` into [{char_id|extra, variant, pose, expression}].

    If `known_char_ids` is provided, maps normalized-id -> canonical id. Unknown `char_id`s become free-text extras
    so we never emit a token that cannot be resolved (or silently substitute the protagonist).
    If `known_char_ids` is None, `char_id` is preserved directly.
    """
    out: List[Dict[str, str]] = []
    if isinstance(raw, dict):
        raw = [raw]
    if isinstance(raw, str):
        raw = [{"extra": raw}] if raw.strip() else []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, str):
            item = {"extra": item}
        if not isinstance(item, dict):
            continue
        char_id = _clean_text(item.get("char_id") or item.get("character_id") or item.get("id"))
        extra = _clean_text(item.get("extra") or item.get("description"))
        entry: Dict[str, str] = {}
        if char_id:
            if known_char_ids is not None:
                canon = known_char_ids.get(normalize_key(char_id))
                if canon:
                    entry["char_id"] = canon
                    variant = _clean_text(item.get("variant") or item.get("variant_id"))
                    if variant:
                        entry["variant"] = variant
                else:
                    extra = extra or char_id.replace("_", " ")
            else:
                entry["char_id"] = char_id
                variant = _clean_text(item.get("variant") or item.get("variant_id"))
                if variant:
                    entry["variant"] = variant
        if extra and "char_id" not in entry:
            entry["extra"] = extra
        if not entry:
            continue
        pose = _clean_text(item.get("pose") or item.get("action"))
        expression = _clean_text(item.get("expression") or item.get("emotion"))
        if pose:
            entry["pose"] = pose
        if expression:
            entry["expression"] = expression
        out.append(entry)
    return out


# --------------------------------------------------------------------------------------
# Beat classification (used by fallback only; the Director LLM labels beats itself)
# --------------------------------------------------------------------------------------

_DIALOGUE_KW = (
    "berkata", "kata ", "bertanya", "menjawab", "berbisik", "berseru", "seru", "bicara", "berbincang",
    "ucap", "ujar", "tanya", "jawab",
    "said", "asked", "replied", "whispered", "shouted", "told ", "spoke", "conversation",
)
_REACTION_KW = (
    "terdiam", "tercekat", "menangis", "tersenyum", "terkejut", "kaget", "gemetar", "air mata",
    "ragu", "takut", "sadar", "menyesal", "marah", "bimbang", "terpaku", "lega",
    "froze", "trembled", "wept", "tears", "gasped", "realized", "hesitated", "stunned",
)
_ACTION_KW = (
    "berlari", "mengangkat", "memanjat", "berlayar", "bertarung", "menyerang", "membangun", "membawa",
    "melompat", "mendayung", "menarik", "mendorong", "membuka", "menyusuri", "berjalan", "melangkah",
    "menaiki", "turun", "menebang", "menanam", "mengejar", "melarikan", "berenang",
    "ran ", "climbed", "sailed", "fought", "built", "carried", "jumped", "pulled", "pushed", "opened",
    "walked", "marched", "chased", "swam", "hauled", "struck",
)
_REVEAL_KW = (
    "menemukan", "terungkap", "ternyata", "rahasia", "tersingkap", "bukti", "peta", "naskah kuno",
    "discovered", "revealed", "secret", "evidence", "clue", "map ", "ancient",
)
_INSIGHT_KW = (
    "pelajaran", "akhirnya", "pada akhirnya", "selamanya", "mengajarkan", "hingga kini", "sampai hari ini",
    "lesson", "in the end", "forever", "reminds us", "to this day",
)


def classify_beat_type(
    narration: str,
    *,
    has_character: bool,
    is_first: bool = False,
    is_last: bool = False,
    location_changed: bool = False,
) -> str:
    low = f" {(narration or '').lower()} "
    if is_first or location_changed:
        return "establishing"
    if any(k in low for k in _REVEAL_KW):
        return "reveal_detail"
    if has_character and any(k in low for k in _DIALOGUE_KW):
        return "dialogue"
    if has_character and any(k in low for k in _REACTION_KW):
        return "reaction"
    if any(k in low for k in _ACTION_KW):
        return "action" if has_character else "general_explainer"
    if is_last and any(k in low for k in _INSIGHT_KW):
        return "insight"
    if is_last:
        return "insight"
    return "action" if has_character else "general_explainer"


FALLBACK_VISUAL_ACTION: Dict[str, str] = {
    "action": "caught mid-action, body leaning into the motion while props and surroundings react to it",
    "dialogue": "talking face to face, one gesturing expressively while the other listens, tension visible in their posture",
    "reaction": "reacting to what just happened, with a clear readable emotion in posture and expression",
    "establishing": "the whole location revealed at a glance with life moving through it",
    "general_explainer": "a lively illustrated scene of the story world showing everyday activity, crowds and objects that illustrate the idea being explained",
    "reveal_detail": "a key object or clue shown in detail, with the surroundings hinting at its importance",
    "insight": "a quiet, symbolic wide composition amid the setting, reflecting the weight of what has happened",
}

FALLBACK_ENVIRONMENT: Dict[str, str] = {
    "action": "movement and activity in the background, depth layers of foreground props, midground subjects and distant setting",
    "dialogue": "setting clearly visible around the speakers with a few background figures going about their business",
    "reaction": "the setting still readable behind the subject with atmospheric detail",
    "establishing": "rich architectural and natural detail, small background figures, atmospheric haze in the distance",
    "general_explainer": "bustling background figures, props and scenery that make the idea concrete",
    "reveal_detail": "surrounding clutter and textures framing the object",
    "insight": "atmospheric sky and horizon, long shadows, a sense of stillness",
}


# --------------------------------------------------------------------------------------
# Default camera motion
# --------------------------------------------------------------------------------------


def default_motion(shot_type: str, camera_angle: str, idx: int) -> str:
    if shot_type in FACE_SHOTS or shot_type == "insert_detail":
        return "zoom_in"
    if shot_type in ("establishing_wide", "aerial", "wide"):
        return ["pan_right", "zoom_out", "pan_left"][idx % 3]
    if camera_angle == "low_angle":
        return "pan_up"
    if camera_angle in ("high_angle", "birds_eye"):
        return "pan_down"
    return ["static", "pan_left", "pan_right", "zoom_in"][idx % 4]


# --------------------------------------------------------------------------------------
# Shot-variety planner
# --------------------------------------------------------------------------------------


def _closeup_quota(n_scenes: int, ratio: float) -> int:
    if n_scenes < 4:
        return 0
    return max(1, int(n_scenes * ratio))


def plan_shot_variety(
    scenes: List[Dict[str, Any]],
    *,
    closeup_ratio: float = 0.20,
    multi_env_ratio: float = 0.40,
    group_key: str = "scene_group_id",
    chapter_key: str = "_chapter",
) -> List[Dict[str, Any]]:
    """Enforce comic-style shot variety on an ordered flat list of structured scenes (mutated in place).

    Rules (see implementation plan):
      * face-focused shots <= `closeup_ratio` per chapter, never consecutive, never opening a scene group
      * the same shot_type at most twice in a row; (shot, angle) never repeated back to back
      * each new scene group opens with establishing_wide / wide / full_shot / aerial
      * >= `multi_env_ratio` of each chapter is environment-driven or multi-subject
      * face-focused shots require at least one registered character in the frame
    """
    totals = Counter(sc.get(chapter_key) for sc in scenes)
    closeups: Counter = Counter()

    prev_shot = ""
    prev2_shot = ""
    prev_angle = ""
    prev_group: Optional[str] = None

    for i, sc in enumerate(scenes):
        chap = sc.get(chapter_key)
        beat = normalize_beat_type(sc.get("beat_type")) or "action"
        sc["beat_type"] = beat
        subjects = sc.get("subjects") or []
        n_char = sum(1 for s in subjects if s.get("char_id"))
        grp = sc.get(group_key)
        first_in_group = i == 0 or grp != prev_group
        cap = _closeup_quota(totals[chap], closeup_ratio)

        def ok(candidate: str, *, _sc_subjects=subjects, _n_char=n_char, _first=first_in_group, _chap=chap, _cap=cap) -> bool:
            if candidate in FACE_SHOTS:
                if _n_char == 0 or _first or prev_shot in FACE_SHOTS or closeups[_chap] >= _cap:
                    return False
            if _first and candidate not in WIDE_OPENERS:
                return False
            if candidate in MULTI_SUBJECT_SHOTS and len(_sc_subjects) < 2:
                return False
            if candidate == prev_shot == prev2_shot:
                return False
            return True

        original = normalize_shot_type(sc.get("shot_type"))
        shot = original
        if not shot or not ok(shot):
            palette = SHOT_PALETTE.get(beat, SHOT_PALETTE["action"])
            if first_in_group:
                palette = (
                    ["establishing_wide", "aerial", "wide", "full_shot"]
                    if beat == "establishing"
                    else ["wide", "full_shot", "establishing_wide", "aerial"]
                )
            offset = i % len(palette)
            rotated = palette[offset:] + palette[:offset]
            candidates = rotated + [s for s in GLOBAL_FALLBACK_ORDER if s not in rotated]
            shot = ""
            for cand in candidates:
                if cand != prev_shot and ok(cand):
                    shot = cand
                    break
            if not shot:
                for cand in candidates:
                    if ok(cand):
                        shot = cand
                        break
            shot = shot or "wide"

        angle = normalize_angle(sc.get("camera_angle")) or "eye_level"
        if shot == prev_shot and angle == prev_angle:
            angle = next((a for a in ANGLE_CYCLE if a != prev_angle), "eye_level")
        if shot == "aerial" and angle not in ("high_angle", "birds_eye"):
            angle = "birds_eye"

        changed = shot != original or angle != (normalize_angle(sc.get("camera_angle")) or "eye_level")
        if shot != original:
            sc["original_shot_type"] = original or sc.get("shot_type") or ""
        sc["shot_type"] = shot
        sc["camera_angle"] = angle
        if changed:
            sc["_replanned"] = True
            sc["camera_motion"] = default_motion(shot, angle, i)

        if shot in FACE_SHOTS:
            closeups[chap] += 1
        prev2_shot, prev_shot, prev_angle, prev_group = prev_shot, shot, angle, grp

    _rebalance_env_multi(scenes, multi_env_ratio, group_key, chapter_key)
    return scenes


def _is_env_or_multi(sc: Dict[str, Any]) -> bool:
    return sc.get("shot_type") in ENV_OR_MULTI_SHOTS or len(sc.get("subjects") or []) >= 2


def _rebalance_env_multi(
    scenes: List[Dict[str, Any]], ratio: float, group_key: str, chapter_key: str
) -> None:
    by_chapter: Dict[Any, List[int]] = {}
    for idx, sc in enumerate(scenes):
        by_chapter.setdefault(sc.get(chapter_key), []).append(idx)

    for idxs in by_chapter.values():
        need = int(len(idxs) * ratio + 0.999)  # ceil
        have = sum(1 for i in idxs if _is_env_or_multi(scenes[i]))
        if have >= need:
            continue
        # Convert single-subject mediums first, then face shots, leaving reaction/dialogue beats for last.
        ordered = sorted(
            [i for i in idxs if scenes[i].get("shot_type") in ("medium", "medium_closeup", "close_up")],
            key=lambda i: (scenes[i].get("beat_type") in ("reaction", "dialogue"), i),
        )
        for i in ordered:
            if have >= need:
                break
            sc = scenes[i]
            prev_shot = scenes[i - 1].get("shot_type") if i > 0 else ""
            nxt_shot = scenes[i + 1].get("shot_type") if i + 1 < len(scenes) else ""
            for target in ("full_shot", "wide"):
                if target == prev_shot == nxt_shot:
                    continue
                sc["original_shot_type"] = sc.get("original_shot_type") or sc.get("shot_type")
                sc["shot_type"] = target
                sc["_replanned"] = True
                sc["camera_motion"] = default_motion(target, sc.get("camera_angle", "eye_level"), i)
                have += 1
                break


def storyboard_quality_metrics(
    scenes: Sequence[Dict[str, Any]], chapter_key: str = "_chapter"
) -> Dict[str, Any]:
    """Return simple metrics used for logging and tests."""
    n = len(scenes)
    if n == 0:
        return {"scenes": 0, "closeup_ratio": 0.0, "max_same_shot_run": 0, "env_multi_ratio": 0.0, "adjacent_face_shots": 0}
    face = sum(1 for s in scenes if s.get("shot_type") in FACE_SHOTS)
    run = best = 1
    for a, b in zip(scenes, scenes[1:]):
        run = run + 1 if a.get("shot_type") == b.get("shot_type") else 1
        best = max(best, run)
    adjacent_face = sum(
        1 for a, b in zip(scenes, scenes[1:]) if a.get("shot_type") in FACE_SHOTS and b.get("shot_type") in FACE_SHOTS
    )
    env = sum(1 for s in scenes if _is_env_or_multi(s))
    return {
        "scenes": n,
        "closeup_ratio": round(face / n, 3),
        "max_same_shot_run": best,
        "env_multi_ratio": round(env / n, 3),
        "adjacent_face_shots": adjacent_face,
    }


# --------------------------------------------------------------------------------------
# Prompt compiler
# --------------------------------------------------------------------------------------


def _sentence(text: str) -> str:
    t = _clean_text(text).rstrip(" ,;.")
    return f"{t}." if t else ""


def compile_scene_prompt_parts(
    scene: Dict[str, Any],
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[str, str]:
    """Return (head, body) of the compiled prompt. `head` = framing + style + location; `body` = staging."""
    shot = normalize_shot_type(scene.get("shot_type")) or "wide"
    angle = normalize_angle(scene.get("camera_angle")) or "eye_level"

    loc_id = _clean_text(scene.get("location_id"))
    if loc_id and locations is not None:
        known_locs = {normalize_key(l.get("id") or l.get("location_id") or l.get("name")): (l.get("id") or l.get("location_id")) for l in locations if isinstance(l, dict)}
        loc_id = known_locs.get(normalize_key(loc_id)) or ""
    loc_part = f" at [loc:{loc_id}]" if loc_id else ""

    shot_desc = SHOT_PHRASES[shot]
    if shot_desc:
        shot_desc = shot_desc[0].upper() + shot_desc[1:]
    head = f"[preset:style]. {shot_desc}{loc_part}."
    angle_phrase = ANGLE_PHRASES.get(angle, "")

    subject_bits: List[str] = []
    for s in scene.get("subjects") or []:
        if s.get("char_id"):
            token = f"[char:{s['char_id']}:{s['variant']}]" if s.get("variant") else f"[char:{s['char_id']}]"
        else:
            token = s.get("extra", "")
        if not token:
            continue
        desc = token
        if s.get("pose"):
            desc += f" {s['pose'].rstrip('.')}"
        expr = s.get("expression")
        if expr:
            desc += f", {expr}" if "expression" in expr.lower() else f", with a {expr} expression"
        subject_bits.append(desc)

    parts: List[str] = []
    if angle_phrase:
        parts.append(_sentence(angle_phrase[0].upper() + angle_phrase[1:]))
    if subject_bits:
        parts.append(_sentence("; ".join(subject_bits)))
    action = _clean_text(scene.get("visual_action"))
    if action:
        parts.append(_sentence(f"Action: {action[0].upper() + action[1:]}"))
    env = _clean_text(scene.get("environment_detail"))
    if env:
        parts.append(_sentence(f"Setting details: {env}"))
    comp = _clean_text(scene.get("composition"))
    if comp:
        parts.append(_sentence(f"Composition: {comp}"))
    light = _clean_text(scene.get("lighting_time"))
    if light:
        parts.append(_sentence(f"Lighting: {light}"))
    return head, " ".join(p for p in parts if p).strip()


def compile_scene_prompt(
    scene: Dict[str, Any],
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Assemble a tokenized image prompt from a structured scene.

    Output keeps `[preset:style]`, `[char:id(:variant)]`, `[loc:id]` tokens so it stays human-editable and is
    resolved against the Continuity Bible at generation time.
    """
    head, body = compile_scene_prompt_parts(scene, characters, locations)
    return f"{head} {body}".strip()


def is_face_shot(shot_type: str) -> bool:
    return normalize_shot_type(shot_type) in FACE_SHOTS
