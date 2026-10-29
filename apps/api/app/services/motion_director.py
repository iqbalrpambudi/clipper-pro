import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.frame_math import COMPOSITION_FPS, frame_to_sec, sec_to_frame
from app.models.motion import MotionScene
from app.models.narration import Narration
from app.models.project import Project
from app.prompts.motion import (
    MOTION_ARCHETYPES,
    MOTION_SCENE_CODE_SYSTEM_PROMPT,
    MOTION_SCRIPT_SYSTEM_PROMPT,
    MOTION_THEMES_META,
)
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.motion_qa import detect_static_layout_anti_patterns

log = logging.getLogger(__name__)


def estimate_spoken_duration_secs(text: str, language: str = "id") -> float:
    """Estimate natural spoken duration at ~2.4 words/sec (ID) or ~2.6 words/sec (EN)."""
    words = [w for w in re.split(r"\s+", (text or "").strip()) if w]
    wps = 2.55 if language == "en" else 2.35
    est = len(words) / wps + 0.45
    return round(max(3.0, min(14.0, est)), 2)


def build_synthetic_cues(script_text: str, duration_frames: int) -> List[Dict[str, Any]]:
    """Build realistic word-level frame cues proportional to word character length before Whisper sync."""
    raw_words = [w.strip() for w in re.split(r"\s+", (script_text or "").strip()) if w.strip()]
    if not raw_words:
        return []

    usable_start = 4
    usable_end = max(usable_start + len(raw_words) * 2, duration_frames - 12)
    span = max(1, usable_end - usable_start)

    weights = [max(2, len(re.sub(r"[^\w]", "", w))) for w in raw_words]
    total_weight = sum(weights) or 1

    cues: List[Dict[str, Any]] = []
    cursor = float(usable_start)
    for word, weight in zip(raw_words, weights, strict=False):
        w_frames = (weight / total_weight) * span
        s_frame = int(round(cursor))
        e_frame = max(s_frame + 3, int(round(cursor + w_frames)))
        clean = re.sub(r"^[^\w%+$-]+|[^\w%+$]+$", "", word)
        if clean:
            cues.append(
                {
                    "word": clean,
                    "start_frame": min(s_frame, max(0, duration_frames - 4)),
                    "end_frame": min(e_frame, duration_frames),
                    "start_ms": int(round((s_frame / COMPOSITION_FPS) * 1000)),
                    "end_ms": int(round((e_frame / COMPOSITION_FPS) * 1000)),
                }
            )
        cursor += w_frames
    return cues


def extract_json_payload(raw: str) -> Dict[str, Any]:
    """Robustly parse JSON object from LLM response."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group(0))
        raise


def extract_clean_tsx_code(raw: str) -> str:
    """Strip markdown code fences and normalize export default function Scene."""
    code = (raw or "").strip()
    fence_match = re.search(r"```(?:tsx|typescript|jsx|javascript|ts|js)?\s*([\s\S]*?)```", code)
    if fence_match:
        code = fence_match.group(1).strip()
    else:
        code = re.sub(r"^```(?:tsx|typescript|jsx|js)?\s*", "", code, flags=re.IGNORECASE)
        code = re.sub(r"\s*```$", "", code).strip()

    # Trim any leading prose before first import or export/function/const
    first_code_idx = re.search(r"^(?:import\s|export\s|const\s|function\s)", code, flags=re.MULTILINE)
    if first_code_idx and first_code_idx.start() > 0:
        code = code[first_code_idx.start() :].strip()

    # Ensure there is a default export if LLM wrote `export function Scene` or `function Scene`
    if "export default" not in code:
        if re.search(r"\bexport\s+function\s+Scene\b", code):
            code = re.sub(r"\bexport\s+function\s+Scene\b", "export default function Scene", code, count=1)
        elif re.search(r"\bfunction\s+Scene\b", code):
            code += "\n\nexport default Scene;\n"
        elif re.search(r"\bconst\s+Scene\b", code):
            code += "\n\nexport default Scene;\n"

    return code


def polish_motion_tsx_code(code: str, orientation: str = "portrait") -> str:
    """
    Auto-correct common LLM motion graphic visual defects:
    1. Upgrade tiny web font sizes (< 22px) to readable 1080p broadcast font sizes (22px).
    2. Auto-import missing React hooks (useMemo, useState, useRef, useCallback, useEffect) to prevent runtime ReferenceError.
    3. Ensure KineticWords in portrait has align="center".
    4. Inject fontVariantNumeric: "tabular-nums" for smooth metric counters.
    """
    if not code:
        return code

    res = code

    # 1. Upgrade tiny numeric font sizes in style objects: e.g. fontSize: 12..21 -> fontSize: 22
    def _upgrade_num_font(m: re.Match) -> str:
        val = int(m.group(1))
        if 8 <= val < 22:
            return "fontSize: 22"
        return m.group(0)

    res = re.sub(r"\bfontSize:\s*([89]|1[0-9]|2[01])\b", _upgrade_num_font, res)

    # Upgrade tiny string font sizes in SVG or styles: e.g. fontSize="12" -> fontSize="22"
    def _upgrade_str_font(m: re.Match) -> str:
        val = int(m.group(1))
        if 8 <= val < 22:
            return 'fontSize="22"'
        return m.group(0)

    res = re.sub(r'\bfontSize=["\']([89]|1[0-9]|2[01])["\']', _upgrade_str_font, res)

    # 2. Auto-import missing React hooks used in code
    candidate_hooks = ["useMemo", "useState", "useRef", "useCallback", "useEffect"]
    missing_hooks = [
        h for h in candidate_hooks
        if re.search(r"\b" + h + r"\s*\(", res) and not re.search(r"\b" + h + r"\b", res[:res.find("export default") if "export default" in res else 500])
    ]
    if missing_hooks:
        # Check if there is an existing `import React... from "react"`
        react_import = re.search(r'import\s+(?:React\s*,\s*)?\{([^}]+)\}\s+from\s+["\']react["\']', res)
        if react_import:
            existing = react_import.group(1)
            to_add = [h for h in missing_hooks if h not in existing]
            if to_add:
                new_import = f'import React, {{ {existing.strip()}, {", ".join(to_add)} }} from "react"'
                res = res[:react_import.start()] + new_import + res[react_import.end():]
        else:
            default_react = re.search(r'import\s+React\s+from\s+["\']react["\']', res)
            if default_react:
                new_import = f'import React, {{ {", ".join(missing_hooks)} }} from "react"'
                res = res[:default_react.start()] + new_import + res[default_react.end():]
            else:
                res = f'import React, {{ {", ".join(missing_hooks)} }} from "react";\n' + res

    # 3. In portrait mode, ensure KineticWords has align="center" if missing
    if orientation == "portrait":
        def _ensure_align_center(m: re.Match) -> str:
            tag = m.group(0)
            if "align=" not in tag:
                if tag.endswith("/>"):
                    return tag[:-2].rstrip() + ' align="center" />'
                elif tag.endswith(">"):
                    return tag[:-1].rstrip() + ' align="center">'
            return tag

        res = re.sub(r"<KineticWords\b[^>]*>", _ensure_align_center, res)

    return res


def is_structurally_valid_tsx(code: str) -> Tuple[bool, str]:
    """Fast static sanity check on generated TSX code before saving."""
    if not code or len(code) < 80:
        return False, "Kode TSX terlalu pendek atau kosong."
    if "export default" not in code:
        return False, "Tidak memiliki export default komponen Scene."
    if "return" not in code or "<" not in code:
        return False, "Komponen tidak mengembalikan elemen JSX."
    open_braces = code.count("{")
    close_braces = code.count("}")
    if abs(open_braces - close_braces) > 2:
        return False, f"Kurung kurawal tidak seimbang ({open_braces} '{{' vs {close_braces} '}}')."
    return True, ""


def build_archetype_fallback_tsx(
    title: str,
    archetype: str,
    script_text: str,
    key_facts: List[str],
) -> str:
    """
    Rich, multi-act generative Remotion TSX fallback tailored to the scene's archetype
    so every scene has genuine SVG geometry, spring choreography, and continuous micro-motion
    even if an LLM endpoint returns malformed output.
    """
    headline = (title or "Visual Insight").replace('"', '\\"')
    facts = [f.replace('"', '\\"') for f in (key_facts or [])[:4]]
    while len(facts) < 3:
        words = [w for w in script_text.split() if len(w) > 3]
        sample = " ".join(words[len(facts) * 2 : len(facts) * 2 + 2]) or f"Phase 0{len(facts) + 1}"
        facts.append(sample.replace('"', '\\"'))

    facts_js = json.dumps(facts, ensure_ascii=False)
    words_preview = " ".join((script_text or "").split()[:9]).replace('"', '\\"')

    return f'''import React from "react";
import {{ useCurrentFrame, useVideoConfig, AbsoluteFill, spring, interpolate }} from "remotion";
import {{ Cpu, Zap, Layers, ArrowRight, Sparkles, Activity }} from "lucide-react";
import {{
  AmbientCanvas,
  CameraRig,
  KineticWords,
  DrawSvgPath,
  AnimatedConnector,
  SpringCard,
  BadgePill,
  useCueFrame,
}} from "@motion/primitives";

export default function Scene({{
  width,
  height,
  durationInFrames,
  orientation,
  theme,
  cues,
  transitionType,
  sceneIndex,
}}: any) {{
  const frame = useCurrentFrame();
  const {{ fps }} = useVideoConfig();
  const isPortrait = orientation === "portrait";
  const facts: string[] = {facts_js};

  const beat1 = useCueFrame(cues, facts[0]?.split(" ")[0] || "", durationInFrames, 0.22);
  const beat2 = useCueFrame(cues, facts[1]?.split(" ")[0] || "", durationInFrames, 0.48);
  const beat3 = useCueFrame(cues, facts[2]?.split(" ")[0] || "", durationInFrames, 0.7);
  const beats = [beat1, beat2, beat3];

  const orbitAngle = frame * 0.55;
  const floatY = Math.sin(frame * 0.08) * 6;

  return (
    <AbsoluteFill style={{{{ backgroundColor: theme.bg, color: theme.text, fontFamily: theme.fontBody }}}}>
      <AmbientCanvas theme={{theme}} variant="architectural" intensity={{1}} />
      <CameraRig durationInFrames={{durationInFrames}} transition={{transitionType}} drift={{1}}>
        <div
          style={{{{
            width: "100%",
            height: "100%",
            padding: isPortrait ? "112px 68px 150px" : "76px 96px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}}}
        >
          <div style={{{{ display: "flex", flexDirection: "column", gap: 18, alignItems: isPortrait ? "center" : "flex-start" }}}}>
            <BadgePill
              text={{`SCENE 0${{sceneIndex + 1}} • {archetype.upper().replace("_", " ")}`}}
              icon={{Sparkles}}
              startFrame={{2}}
              color={{theme.accent}}
              theme={{theme}}
              pulse
            />
            <KineticWords
              text="{headline}"
              startFrame={{5}}
              stagger={{3}}
              highlightWords={{["{headline.split(" ")[0]}"]}}
              theme={{theme}}
              size={{isPortrait ? 56 : 64}}
              align={{isPortrait ? "center" : "left"}}
              maxWidth={{isPortrait ? 920 : 1200}}
            />
            <div
              style={{{{
                fontSize: isPortrait ? 24 : 26,
                color: theme.textMuted,
                maxWidth: 880,
                textAlign: isPortrait ? "center" : "left",
                opacity: interpolate(frame, [10, 24], [0, 1]),
              }}}}
            >
              "{words_preview}..."
            </div>
          </div>

          <div
            style={{{{
              position: "relative",
              flex: 1,
              display: "flex",
              flexDirection: isPortrait ? "column" : "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: isPortrait ? 26 : 36,
              marginTop: 28,
            }}}}
          >
            {{!isPortrait && (
              <svg
                viewBox="0 0 1200 320"
                style={{{{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}}}
              >
                <AnimatedConnector from={{[220, 160]}} to={{[580, 160]}} curve={{0.18}} startFrame={{beat1}} durationFrames={{22}} color={{theme.accent}} pulse />
                <AnimatedConnector from={{[620, 160]}} to={{[980, 160]}} curve={{-0.18}} startFrame={{beat2}} durationFrames={{22}} color={{theme.accent2}} pulse />
                <g transform={{`translate(600, 160) rotate(${{orbitAngle}})`}}>
                  <circle r="118" fill="none" stroke={{theme.accent}} strokeOpacity="0.22" strokeWidth="1.5" strokeDasharray="8 10" />
                </g>
              </svg>
            )}}

            {{facts.slice(0, 3).map((fact, idx) => {{
              const IconComp = idx === 0 ? Cpu : idx === 1 ? Zap : Activity;
              const accentCol = idx === 0 ? theme.accent : idx === 1 ? theme.accent2 : theme.accent3;
              const trigger = Math.max(8 + idx * 10, beats[idx] - 6);
              const pulse = spring({{ frame: frame - trigger, fps, config: {{ damping: 13, stiffness: 125 }} }});
              return (
                <SpringCard
                  key={{idx}}
                  startFrame={{trigger}}
                  theme={{theme}}
                  accent={{accentCol}}
                  glow={{idx === 1}}
                  style={{{{
                    flex: 1,
                    width: isPortrait ? "100%" : "auto",
                    padding: isPortrait ? "28px 30px" : "34px 32px",
                    transform: `translateY(${{floatY * (idx % 2 === 0 ? 1 : -1)}}px) scale(${{interpolate(pulse, [0, 1], [0.9, 1])}})`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    zIndex: 2,
                  }}}}
                >
                  <div style={{{{ display: "flex", alignItems: "center", justifyContent: "space-between" }}}}>
                    <div
                      style={{{{
                        width: 52,
                        height: 52,
                        borderRadius: 14,
                        backgroundColor: `${{accentCol}}1F`,
                        border: `1.5px solid ${{accentCol}}66`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: accentCol,
                      }}}}
                    >
                      <IconComp size={{26}} />
                    </div>
                    <span style={{{{ fontFamily: theme.fontMono, fontSize: 20, color: accentCol, fontWeight: 700 }}}}>
                      0{{idx + 1}}
                    </span>
                  </div>
                  <div style={{{{ fontFamily: theme.fontDisplay, fontSize: isPortrait ? 30 : 32, fontWeight: 700, lineHeight: 1.25 }}}}>
                    {{fact}}
                  </div>
                  <svg viewBox="0 0 240 24" style={{{{ width: "100%", height: 24 }}}}>
                    <DrawSvgPath
                      d="M 4 12 L 180 12 L 195 4 L 210 20 L 224 12 L 236 12"
                      startFrame={{trigger + 6}}
                      durationFrames={{24}}
                      stroke={{accentCol}}
                      strokeWidth={{2.5}}
                      pulseDot
                    />
                  </svg>
                </SpringCard>
              );
            }})}}
          </div>
        </div>
      </CameraRig>
    </AbsoluteFill>
  );
}}
'''


async def generate_motion_script_and_plan(
    db: AsyncSession,
    project_id: str,
    topic: str,
    target_duration_secs: int = 60,
    tone: str = "analytical",
    language: str = "id",
    theme_id: str = "claude_editorial",
    custom_instructions: Optional[str] = None,
) -> Tuple[Narration, List[MotionScene]]:
    """
    Generate voiceover narration + bespoke MotionScene choreography plan via LLM.
    """
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError("Project tidak ditemukan")

    adapter = await get_active_llm_adapter(db)

    target_secs = max(20, min(600, int(target_duration_secs or 60)))
    target_scene_count = max(4, min(32, round(target_secs / 4.8)))
    lang_name = "Bahasa Indonesia" if language == "id" else "English"
    theme_meta = MOTION_THEMES_META.get(theme_id, MOTION_THEMES_META["claude_editorial"])

    user_prompt = f"""Topic / Brief: {topic}
Language: {lang_name} (ALL `script_text`, `title`, and `key_facts` MUST be in {lang_name}!)
Target Total Duration: ~{target_secs} seconds ({target_scene_count} scenes, ~4 to 5.5 seconds per scene)
Aspect Ratio: {proj.aspect_ratio} ({'Vertical Portrait 9:16' if proj.aspect_ratio == '9:16' else 'Landscape Widescreen 16:9' if proj.aspect_ratio == '16:9' else 'Square 1:1'})
Narrative Tone: {tone}
Visual Art Direction World: {theme_meta['name']} — {theme_meta['vibe']}
{f'Additional Director Notes: {custom_instructions}' if custom_instructions else ''}

Design {target_scene_count} vivid, high-retention scenes with varied archetypes and rich 3-act motion mechanisms."""

    raw_resp = await adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=MOTION_SCRIPT_SYSTEM_PROMPT,
        json_mode=True,
        timeout=180.0,
    )
    parsed = extract_json_payload(raw_resp)
    raw_scenes = parsed.get("scenes") or []
    if not raw_scenes:
        raise RuntimeError("LLM tidak mengembalikan daftar scene motion yang valid.")

    # Update project language & theme setting
    proj.language = language
    world_cfg = dict(proj.world_setting or {})
    world_cfg["motion_theme"] = theme_id
    proj.world_setting = world_cfg

    # Build Narration segments + MotionScene rows
    segments: List[Dict[str, Any]] = []
    full_script_lines: List[str] = []

    # Remove old motion scenes for this project when regenerating full script
    await db.execute(delete(MotionScene).where(MotionScene.project_id == project_id))

    cursor_sec = 0.0
    scenes_to_create: List[MotionScene] = []

    for idx, sc in enumerate(raw_scenes):
        seg_id = f"seg-{idx + 1}"
        script_line = str(sc.get("script_text") or "").strip()
        if not script_line:
            continue

        dur_sec = estimate_spoken_duration_secs(script_line, language=language)
        dur_frames = max(60, sec_to_frame(dur_sec, COMPOSITION_FPS))
        actual_dur = frame_to_sec(dur_frames, COMPOSITION_FPS)
        start_sec = round(cursor_sec, 3)
        end_sec = round(cursor_sec + actual_dur, 3)
        cursor_sec = end_sec

        archetype = str(sc.get("archetype") or MOTION_ARCHETYPES[idx % len(MOTION_ARCHETYPES)]).strip()
        if archetype not in MOTION_ARCHETYPES:
            archetype = MOTION_ARCHETYPES[idx % len(MOTION_ARCHETYPES)]

        transition = str(sc.get("transition_type") or "camera_push").strip()
        if transition not in ("camera_push", "iris_wipe", "slide_morph", "cross_dissolve", "none"):
            transition = "camera_push"

        key_facts = [str(k).strip() for k in (sc.get("key_facts") or []) if str(k).strip()][:5]
        cues = build_synthetic_cues(script_line, dur_frames)

        full_script_lines.append(script_line)
        segments.append(
            {
                "id": seg_id,
                "index": idx,
                "text": script_line,
                "start_ms": int(round(start_sec * 1000)),
                "end_ms": int(round(end_sec * 1000)),
                "words": [
                    {
                        "word": c["word"],
                        "start_ms": int(round(start_sec * 1000)) + c["start_ms"],
                        "end_ms": int(round(start_sec * 1000)) + c["end_ms"],
                    }
                    for c in cues
                ],
            }
        )

        scenes_to_create.append(
            MotionScene(
                project_id=project_id,
                segment_id=seg_id,
                order_index=idx,
                title=str(sc.get("title") or f"Scene {idx + 1}").strip()[:250],
                archetype=archetype,
                script_text=script_line,
                visual_concept=str(sc.get("visual_concept") or "").strip(),
                key_facts=key_facts,
                cues=cues,
                transition_type=transition,
                start_time=start_sec,
                end_time=end_sec,
                duration=actual_dur,
                duration_frames=dur_frames,
                status="pending",
            )
        )

    narration = Narration(
        project_id=project_id,
        template_id="motion_director",
        topic=topic,
        tone=tone,
        target_duration=target_secs,
        raw_text="\n\n".join(full_script_lines),
        language=language,
        segments=segments,
        status="generated",
    )
    db.add(narration)
    await db.flush()

    for ms in scenes_to_create:
        ms.narration_id = narration.id
        db.add(ms)

    await db.commit()
    await db.refresh(narration)
    for ms in scenes_to_create:
        await db.refresh(ms)

    return narration, scenes_to_create


async def sync_motion_scenes_from_alignment(
    db: AsyncSession,
    project_id: str,
    aligned_segments: List[Dict[str, Any]],
    total_audio_duration: float = 0.0,
) -> List[MotionScene]:
    """
    Synchronize every MotionScene's exact frame duration and scene-relative word cues
    from Faster-Whisper word-level alignment timestamps.
    """
    res = await db.execute(
        select(MotionScene)
        .where(MotionScene.project_id == project_id)
        .order_by(MotionScene.order_index.asc())
    )
    scenes = list(res.scalars().all())
    if not scenes or not aligned_segments:
        return scenes

    seg_by_id = {str(s.get("id")): s for s in aligned_segments if s.get("id")}
    total_scenes = len(scenes)
    total_audio_frames = sec_to_frame(total_audio_duration, COMPOSITION_FPS) if total_audio_duration > 0 else 0

    current_frame = 0
    for idx, scene in enumerate(scenes):
        seg = seg_by_id.get(scene.segment_id)
        if seg is None and idx < len(aligned_segments):
            seg = aligned_segments[idx]

        if not seg:
            dur_f = max(45, scene.duration_frames or 120)
            scene.start_time = frame_to_sec(current_frame, COMPOSITION_FPS)
            current_frame += dur_f
            scene.end_time = frame_to_sec(current_frame, COMPOSITION_FPS)
            scene.duration = round(scene.end_time - scene.start_time, 3)
            scene.duration_frames = dur_f
            continue

        seg_start_sec = 0.0 if idx == 0 else float(seg.get("start_ms", 0)) / 1000.0
        if idx < total_scenes - 1:
            next_seg = seg_by_id.get(scenes[idx + 1].segment_id) or (
                aligned_segments[idx + 1] if (idx + 1) < len(aligned_segments) else None
            )
            if next_seg and next_seg.get("start_ms") is not None:
                seg_end_sec = max(seg_start_sec + 1.0, float(next_seg["start_ms"]) / 1000.0)
            else:
                seg_end_sec = max(seg_start_sec + 1.0, float(seg.get("end_ms", 0)) / 1000.0)
        else:
            raw_end = float(seg.get("end_ms", 0)) / 1000.0
            seg_end_sec = max(seg_start_sec + 1.2, total_audio_duration if total_audio_duration > 0 else raw_end)

        start_f = current_frame
        end_f = max(start_f + 45, sec_to_frame(seg_end_sec, COMPOSITION_FPS))
        if idx == total_scenes - 1 and total_audio_frames > start_f + 30:
            end_f = total_audio_frames

        slide_frames = max(45, end_f - start_f)
        actual_start_sec = frame_to_sec(start_f, COMPOSITION_FPS)
        actual_end_sec = frame_to_sec(start_f + slide_frames, COMPOSITION_FPS)

        # Convert word timestamps into scene-relative frames [0 .. slide_frames]
        words = seg.get("words") or []
        cues: List[Dict[str, Any]] = []
        scene_origin_ms = int(round(actual_start_sec * 1000))
        for w in words:
            w_text = re.sub(r"^[^\w%+$-]+|[^\w%+$]+$", "", str(w.get("word") or "").strip())
            if not w_text:
                continue
            rel_start_ms = max(0, int(w.get("start_ms", scene_origin_ms)) - scene_origin_ms)
            rel_end_ms = max(rel_start_ms + 100, int(w.get("end_ms", scene_origin_ms + 150)) - scene_origin_ms)
            s_frame = min(slide_frames - 3, max(0, int(round((rel_start_ms / 1000.0) * COMPOSITION_FPS))))
            e_frame = min(slide_frames, max(s_frame + 3, int(round((rel_end_ms / 1000.0) * COMPOSITION_FPS))))
            cues.append(
                {
                    "word": w_text,
                    "start_frame": s_frame,
                    "end_frame": e_frame,
                    "start_ms": rel_start_ms,
                    "end_ms": rel_end_ms,
                }
            )

        if not cues:
            cues = build_synthetic_cues(scene.script_text, slide_frames)

        scene.start_time = round(actual_start_sec, 3)
        scene.end_time = round(actual_end_sec, 3)
        scene.duration = round(actual_end_sec - actual_start_sec, 3)
        scene.duration_frames = slide_frames
        scene.cues = cues

        current_frame += slide_frames

    await db.commit()
    return scenes


async def generate_single_motion_scene_code(
    db: AsyncSession,
    project: Project,
    scene: MotionScene,
    total_scenes: int = 1,
    prev_archetype: Optional[str] = None,
    remix_prompt: Optional[str] = None,
    theme_id: Optional[str] = None,
    style_instructions: Optional[str] = None,
) -> str:
    """
    Synthesize bespoke executable React/Remotion TSX code for a single MotionScene.
    Includes validation, 1-shot LLM self-repair on syntax issues, and rich archetype fallback.
    """
    adapter = await get_active_llm_adapter(db)

    active_theme_id = (
        theme_id
        or (project.world_setting or {}).get("motion_theme")
        or "claude_editorial"
    )
    theme_meta = MOTION_THEMES_META.get(active_theme_id, MOTION_THEMES_META["claude_editorial"])

    if project.aspect_ratio == "9:16":
        width, height, orientation = 1080, 1920, "portrait"
    elif project.aspect_ratio == "1:1":
        width, height, orientation = 1080, 1080, "square"
    else:
        width, height, orientation = 1920, 1080, "landscape"

    cues_preview = json.dumps((scene.cues or [])[:24], ensure_ascii=False)
    facts_preview = json.dumps(scene.key_facts or [], ensure_ascii=False)
    lang_label = "Bahasa Indonesia" if (project.language or "id") == "id" else "English"

    user_prompt = f"""Write the complete React + Remotion TSX component `export default function Scene(props)` for Scene {scene.order_index + 1} of {total_scenes}.

SCENE SPECIFICATION:
- Canvas: {width}x{height} ({orientation}, 30 FPS)
- Duration: {scene.duration_frames} frames ({scene.duration:.2f} seconds)
- Language for ALL on-screen text/labels: {lang_label}
- Theme World: {theme_meta['name']} ({theme_meta['vibe']})
- Scene Title: {scene.title or f'Scene {scene.order_index + 1}'}
- Visual Archetype: {scene.archetype}{f' (Previous scene used {prev_archetype} — make this composition distinctly different!)' if prev_archetype else ''}
- Transition Type: {scene.transition_type}
- Spoken Voiceover (`scriptText`): "{scene.script_text}"
- Choreography & Visual Metaphor Blueprint: {scene.visual_concept or 'Create a dynamic multi-stage visual diagram illustrating the spoken concept with animated SVG paths, icons, and progressive beat reveals.'}
- Key Visual Tokens / Facts to showcase graphically: {facts_preview}
- Exact Word Cues (`cues` array with scene-relative `start_frame`): {cues_preview}
{f'- Style Instructions: {style_instructions}' if style_instructions else ''}
{f'- USER REMIX / EDIT REQUEST (HIGHEST PRIORITY): {remix_prompt}' if remix_prompt else ''}
{f'- Existing Scene Code to Remix/Improve:\\n```tsx\\n{scene.component_code}\\n```' if (remix_prompt and scene.component_code) else ''}

MANDATORY PRECISION DESIGN CONSTRAINTS (SKILL REMOTION - ZERO-OVERLAP QUALITY):
1. DETERMINISTIC ZERO-OVERLAP LAYOUT (<SceneGridLayout>):
   - Wrap the main scene layout in `<SceneGridLayout orientation="{orientation}" eyebrow={{...}} headline={{...}} stage={{...}} footer={{...}} subtitleSafeZone />`.
   - The `stage` slot is strictly isolated with `contain: "layout paint"` and `overflow: "hidden"` so the hero visual will NEVER collide with the header or footer!
   - In portrait (9:16), NEVER make a 50%|50% horizontal split (`flexDirection: "row"`) for cards! Always stack vertically using `<ComparisonDuelStage>` or vertical flex with cards `width: "100%", maxWidth: 920`.
2. HIGH-CRAFT SEMANTIC VISUAL PRIMITIVES (Prefer these over 300+ lines of raw freehand coordinates):
   - For orbital / ecosystem concepts: Use `<OrbitHubStage centerHub={{{{...}}}} nodes={{{{...}}}} radius={{{{280}}}} theme={{{{theme}}}} orientation="{orientation}" />` (guarantees safe bounds and zero collision with header!).
   - For versus / duel / before-after / comparison: Use `<ComparisonDuelStage left={{{{...}}}} right={{{{...}}}} vsBadge="VS" theme={{{{theme}}}} orientation="{orientation}" />` (automatically stacks Top-vs-Bottom in 9:16 and Left-vs-Right in 16:9).
   - For 3-4 step processes: Use `<ProcessStepperStage steps={{{{...}}}} activeStep={{{{...}}}} theme={{{{theme}}}} orientation="{orientation}" />`.
   - For browser / web mockups: Use `<BrowserMockupCard url="..."> ... </BrowserMockupCard>`.
   - For single-focus guidance: Use `<FocusSpotlight activeIndex={{{{...}}}}> ... </FocusSpotlight>`.
   - Use standard physics curves: `SPRING_PRESETS.editorial` (cards/stages), `SPRING_PRESETS.snappy` (badges/chips), `SPRING_PRESETS.impact` (stamps).
3. BROADCAST TYPOGRAPHY SCALE (1080p CANVAS):
   - Headline: 48-62px with `<KineticWords align="center" textWrap="balance" theme={{{{theme}}}} />`.
   - Section/Card Title: 28-36px, Body: 22-26px, Metric Numbers: 76-100px with `fontVariantNumeric: "tabular-nums"`.
   - NEVER use tiny fonts < 22px!
4. COORDINATE SPACE ISOLATION:
   - DO NOT mix HTML absolute positioning with guessed pixel math on top of an SVG viewBox!
5. Output ONLY valid TSX code."""

    raw_code = await adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=MOTION_SCENE_CODE_SYSTEM_PROMPT,
        json_mode=False,
        timeout=180.0,
        max_tokens=6144,
    )
    clean_code = extract_clean_tsx_code(raw_code)
    clean_code = polish_motion_tsx_code(clean_code, orientation=orientation)
    valid, reason = is_structurally_valid_tsx(clean_code)

    if not valid:
        log.warning("Initial TSX code for scene %s invalid (%s); attempting 1-shot repair...", scene.id, reason)
        repair_prompt = f"""Fix the following React + Remotion TSX component so it compiles cleanly and exports `export default function Scene(props)`.
Issue detected: {reason}

Broken code:
```tsx
{raw_code}
```

Output ONLY the fixed, complete TSX code."""
        repaired_raw = await adapter.generate_chat(
            prompt=repair_prompt,
            system_prompt=MOTION_SCENE_CODE_SYSTEM_PROMPT,
            json_mode=False,
            timeout=120.0,
            max_tokens=6144,
        )
        clean_code = extract_clean_tsx_code(repaired_raw)
        clean_code = polish_motion_tsx_code(clean_code, orientation=orientation)
        valid, reason = is_structurally_valid_tsx(clean_code)

    # Secondary Self-Healing Check: Static Layout Anti-Pattern & Collision Guard
    if valid:
        layout_issues = detect_static_layout_anti_patterns(clean_code, orientation=orientation)
        if layout_issues:
            log.info("Layout anti-pattern detected in scene %s: %s; running 1-shot layout self-repair...", scene.id, layout_issues)
            layout_repair_prompt = f"""Improve this React + Remotion TSX component to fix visual layout & collision defects:
Issues detected:
- {"\n- ".join(layout_issues)}

Instructions:
1. Wrap the entire layout in `<SceneGridLayout orientation="{orientation}" eyebrow={{...}} headline={{...}} stage={{...}} footer={{...}} subtitleSafeZone />`.
2. Replace fragile absolute coordinates or squished 50%|50% horizontal rows in 9:16 with high-level primitives:
   - `<ComparisonDuelStage>` for side-by-side or versus comparisons.
   - `<OrbitHubStage>` for central concepts with orbiting nodes.
   - `<ProcessStepperStage>` for multi-step pipelines.
3. Keep all fonts >= 22px and preserve word cue animations.

Existing code:
```tsx
{clean_code}
```

Output ONLY the fixed, complete TSX code."""
            try:
                layout_fixed_raw = await adapter.generate_chat(
                    prompt=layout_repair_prompt,
                    system_prompt=MOTION_SCENE_CODE_SYSTEM_PROMPT,
                    json_mode=False,
                    timeout=120.0,
                    max_tokens=6144,
                )
                fixed_code = extract_clean_tsx_code(layout_fixed_raw)
                fixed_code = polish_motion_tsx_code(fixed_code, orientation=orientation)
                fixed_valid, _ = is_structurally_valid_tsx(fixed_code)
                if fixed_valid:
                    clean_code = fixed_code
            except Exception as e:
                log.warning("Layout self-repair attempt failed (%s); proceeding with current code", e)

    if not valid:
        log.warning("Repair TSX still invalid (%s); using rich archetype fallback for scene %s", reason, scene.id)
        clean_code = build_archetype_fallback_tsx(
            title=scene.title or f"Scene {scene.order_index + 1}",
            archetype=scene.archetype,
            script_text=scene.script_text,
            key_facts=scene.key_facts or [],
        )

    clean_code = polish_motion_tsx_code(clean_code, orientation=orientation)
    return clean_code
