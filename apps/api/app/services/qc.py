import asyncio
import copy
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import publish_project_event
from app.models.narration import AudioTrack, Narration
from app.models.project import Project, Scene
from app.models.qc import QCRun
from app.models.timeline import Timeline
from app.schemas.qc import (
    QCAppliedFixSchema,
    QCConfigSchema,
    QCIssueSchema,
    QCRunResponse,
)
from app.services.ai_adapters.base import BaseLLMAdapter
from app.services.ai_adapters.factory import (
    _build_adapter,
    _resolve_config,
    get_active_llm_adapter,
)
from app.services.matching import (
    STATIC_BORING_KEYWORDS,
    _calc_lexical_overlap,
    _calc_visual_satisfaction_boost,
    _get_scene_usable_range,
    match_scenes_to_segments,
    verify_and_heal_timeline_clips,
)
from app.services.narrative import clean_spoken
from app.services.project_defaults import load_project_defaults

log = logging.getLogger("cliper-pro.qc")

LOW_QUALITY_FRAME_KEYWORDS = {
    "blur",
    "buram",
    "gelap",
    "dark",
    "black screen",
    "layar hitam",
    "layar kosong",
    "blank screen",
    "watermark",
    "subtitle bawaan",
    "hardsub",
    "letterbox",
    "low quality",
    "pecah",
}

ARTIFACT_PATTERN = re.compile(
    r"(\[[^\]]+\]|\*\*|(?:^|\s)(?:hook|narator|voiceover|scene|shot)\s*:)",
    re.IGNORECASE,
)


def resolve_project_qc_config(project: Optional[Project]) -> QCConfigSchema:
    """Resolve effective QCConfigSchema by merging global config.json defaults with project override."""
    defaults, _, _ = load_project_defaults()
    base = defaults.qc.model_dump()
    if project and isinstance(project.qc_config, dict):
        base.update({k: v for k, v in project.qc_config.items() if v is not None})
    return QCConfigSchema.model_validate(base)


def to_qc_run_response(run: QCRun) -> QCRunResponse:
    """Convert SQLAlchemy QCRun model into QCRunResponse schema."""
    can_revert = bool(
        run.pre_fix_snapshot
        and not run.reverted
        and isinstance(run.applied_fixes, list)
        and len(run.applied_fixes) > 0
    )
    return QCRunResponse(
        id=run.id,
        project_id=run.project_id,
        gate=run.gate,
        trigger=run.trigger,
        status=run.status,
        passed=bool(run.passed),
        overall_score=round(float(run.overall_score or 0.0), 2),
        threshold=round(float(run.threshold or 7.5), 2),
        rounds_used=int(run.rounds_used or 0),
        dimension_scores={
            str(k): round(float(v), 2) for k, v in (run.dimension_scores or {}).items()
        },
        issues=[QCIssueSchema.model_validate(i) for i in (run.issues or [])],
        applied_fixes=[QCAppliedFixSchema.model_validate(f) for f in (run.applied_fixes or [])],
        can_revert=can_revert,
        reverted=bool(run.reverted),
        summary=run.summary,
        error_message=run.error_message,
        created_at=run.created_at,
    )


async def _get_qc_adapter(
    db: AsyncSession, qc_cfg: QCConfigSchema
) -> Tuple[Optional[BaseLLMAdapter], bool]:
    """Return (adapter, has_credentials). Respects optional qc_cfg.qc_model override."""
    api_key, tts_key, base_url, chat_model, vision_model = await _resolve_config(db)
    has_creds = bool((api_key and api_key.strip()) or (base_url and base_url.strip()))
    if not has_creds:
        return None, False

    # A dedicated judge model (must be multimodal) reviews both text and frames,
    # so the model that wrote the script does not grade its own work.
    judge = (qc_cfg.qc_model or "").strip()
    target_chat = judge or chat_model
    adapter = _build_adapter(
        api_key=api_key,
        tts_key=tts_key,
        base_url=base_url,
        chat_model=target_chat,
        vision_model=judge or vision_model,
        trigger_model=target_chat,
    )
    return adapter, True


def _extract_json_object(raw_text: str) -> Optional[Dict[str, Any]]:
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        data = json.loads(cleaned[start : end + 1])
        return data if isinstance(data, dict) else None
    except Exception:
        return None


RULES_ONLY_NOTE = (
    "AI judge tidak aktif (belum ada API key). Skor hanya dari cek aturan teknis, "
    "bukan penilaian kualitas konten."
)


def _merge_judge_scores(scores: Dict[str, float], judge_scores: Any) -> None:
    """The judge sets the score; rule checks only cap it (a rule violation can't be out-voted)."""
    if not isinstance(judge_scores, dict):
        return
    for k in tuple(scores.keys()):
        try:
            val = max(1.0, min(10.0, float(judge_scores[k])))
        except (KeyError, TypeError, ValueError):
            continue
        scores[k] = round(min(scores[k], val), 2)


def _compute_pass_status(
    overall_score: float,
    threshold: float,
    issues: List[Dict[str, Any]],
) -> bool:
    has_blocking = any(i.get("severity") in ("blocker", "major") for i in issues)
    return bool(overall_score >= threshold and not has_blocking)


def _scene_to_dict(sc: Scene) -> Dict[str, Any]:
    return {
        "id": sc.id,
        "source_video_id": sc.source_video_id,
        "scene_index": sc.scene_index,
        "start_time": float(sc.start_time or 0.0),
        "end_time": float(sc.end_time or 0.0),
        "duration": float(sc.duration or max(0.0, (sc.end_time or 0.0) - (sc.start_time or 0.0))),
        "description": sc.description or "",
        "tags": list(sc.tags or []),
        "analysis": sc.analysis or {},
        "thumbnail_path": sc.thumbnail_path,
    }


async def _evaluate_script_gate(
    db: AsyncSession,
    project: Project,
    narration: Optional[Narration],
    scenes: List[Dict[str, Any]],
    qc_cfg: QCConfigSchema,
) -> Tuple[Dict[str, float], List[Dict[str, Any]], Dict[int, str], Optional[str], Optional[str]]:
    """Evaluate Gate 1 (Script before TTS).

    Returns (dimension_scores, issues, suggested_rewrites_by_idx, error_note, reviewer_verdict).
    """
    scores: Dict[str, float] = {
        "hook": 8.8,
        "flow_retention": 8.6,
        "shot_match": 8.5,
        "spoken_naturalness": 8.8,
    }
    issues: List[Dict[str, Any]] = []
    suggested_rewrites: Dict[int, str] = {}
    error_note: Optional[str] = None
    verdict: Optional[str] = None

    if not narration or not (narration.raw_text or "").strip():
        issues.append(
            {
                "id": "script-empty",
                "dimension": "flow_retention",
                "severity": "blocker",
                "message": "Naskah narasi masih kosong.",
                "auto_fixable": False,
            }
        )
        return dict.fromkeys(scores, 2.0), issues, suggested_rewrites, None, None

    segments = list(narration.segments or [])
    if not segments:
        issues.append(
            {
                "id": "script-no-segments",
                "dimension": "flow_retention",
                "severity": "blocker",
                "message": "Segmen kalimat narasi belum terbentuk.",
                "auto_fixable": True,
            }
        )
        scores["flow_retention"] = 4.0

    scene_by_id = {sc["id"]: sc for sc in scenes}
    total_words = 0

    for idx, seg in enumerate(segments):
        text = str(seg.get("text") or "").strip()
        words = text.split()
        w_count = len(words)
        total_words += w_count

        # 1. Non-spoken markdown/brackets/labels check
        if ARTIFACT_PATTERN.search(text):
            scores["spoken_naturalness"] = max(5.0, scores["spoken_naturalness"] - 1.8)
            issues.append(
                {
                    "id": f"script-artifact-{idx}",
                    "dimension": "spoken_naturalness",
                    "severity": "major",
                    "message": f"Segmen #{idx + 1} mengandung label/simbol non-lisan yang akan ikut terbaca TTS.",
                    "segment_index": idx,
                    "auto_fixable": True,
                }
            )

        # 2. Hook check on first segment
        if idx == 0:
            if w_count < 3:
                scores["hook"] = 5.2
                issues.append(
                    {
                        "id": "script-hook-too-short",
                        "dimension": "hook",
                        "severity": "major",
                        "message": "Kalimat pembuka (hook) terlalu pendek/kosong untuk menahan scroll 3 detik pertama.",
                        "segment_index": 0,
                        "auto_fixable": True,
                    }
                )
            elif w_count > 22:
                scores["hook"] = 6.5
                issues.append(
                    {
                        "id": "script-hook-too-long",
                        "dimension": "hook",
                        "severity": "major",
                        "message": f"Kalimat hook terlalu panjang ({w_count} kata); idealnya ≤ 18 kata agar padat di 3 detik awal.",
                        "segment_index": 0,
                        "auto_fixable": True,
                    }
                )

        # 3. Pacing / sentence length check
        if w_count > 28:
            scores["spoken_naturalness"] = max(5.5, scores["spoken_naturalness"] - 1.5)
            scores["flow_retention"] = max(6.0, scores["flow_retention"] - 1.0)
            issues.append(
                {
                    "id": f"script-long-sentence-{idx}",
                    "dimension": "spoken_naturalness",
                    "severity": "major",
                    "message": f"Segmen #{idx + 1} terlalu panjang ({w_count} kata) sehingga jeda napas TTS kurang natural.",
                    "segment_index": idx,
                    "auto_fixable": True,
                }
            )
        elif w_count < 2:
            scores["flow_retention"] = max(5.5, scores["flow_retention"] - 1.5)
            issues.append(
                {
                    "id": f"script-stub-sentence-{idx}",
                    "dimension": "flow_retention",
                    "severity": "major",
                    "message": f"Segmen #{idx + 1} terlalu pendek ({w_count} kata).",
                    "segment_index": idx,
                    "auto_fixable": True,
                }
            )

        # 4. Shot match check against available scenes
        if scenes:
            sc_id = seg.get("scene_id")
            if not sc_id or sc_id not in scene_by_id:
                scores["shot_match"] = max(6.0, scores["shot_match"] - 1.2)
                issues.append(
                    {
                        "id": f"script-missing-scene-{idx}",
                        "dimension": "shot_match",
                        "severity": "major",
                        "message": f"Segmen #{idx + 1} belum terhubung ke scene visual yang valid di Media Pool.",
                        "segment_index": idx,
                        "auto_fixable": True,
                    }
                )

    # 5. Total estimated spoken duration vs target duration (~2.4 words/sec)
    target_dur = float(getattr(narration, "target_duration", 45) or 45)
    est_dur = total_words / 2.4 if total_words > 0 else 0.0
    if target_dur >= 15 and total_words > 0:
        ratio = est_dur / target_dur
        if ratio < 0.42:
            scores["flow_retention"] = min(scores["flow_retention"], 6.6)
            issues.append(
                {
                    "id": "script-duration-short",
                    "dimension": "flow_retention",
                    "severity": "minor",
                    "message": f"Estimasi durasi baca (~{int(round(est_dur))}s) jauh di bawah target ({int(target_dur)}s).",
                    "auto_fixable": False,
                }
            )
        elif ratio > 1.65:
            scores["flow_retention"] = min(scores["flow_retention"], 6.2)
            issues.append(
                {
                    "id": "script-duration-long",
                    "dimension": "flow_retention",
                    "severity": "major",
                    "message": f"Naskah terlalu panjang (~{int(round(est_dur))}s vs target {int(target_dur)}s).",
                    "auto_fixable": False,
                }
            )

    # 6. Optional LLM Evaluation (Fail-open)
    adapter, has_creds = await _get_qc_adapter(db, qc_cfg)
    if adapter and has_creds and segments:
        try:
            seg_lines = []
            for idx, seg in enumerate(segments):
                sc = scene_by_id.get(seg.get("scene_id") or "")
                sc_desc = (sc.get("description") or "Tanpa deskripsi visual")[:120] if sc else "Belum ada scene"
                seg_lines.append(f"[{idx}] Teks: \"{seg.get('text', '')}\" | Visual: {sc_desc}")

            prompt = (
                f"Anda adalah reviewer & analis konten senior untuk video short-form vertikal ({qc_cfg.platform.upper()}).\n"
                "Tugas Anda: review jujur naskah narasi berikut sebelum dijadikan suara TTS, seperti editor yang menentukan video ini layak FYP atau tidak.\n"
                "RUBRIK SKOR (1-10, kalibrasi ketat):\n"
                "- hook: 3 detik pertama memancing rasa penasaran/konflik/janji jelas? Kalimat generik ('halo semuanya', 'di video ini') = maks 5.\n"
                "- flow_retention: tiap kalimat memberi alasan menonton kalimat berikutnya? Ada payoff di akhir? Bertele-tele = maks 6.\n"
                "- shot_match: kalimat cocok dengan deskripsi visual pasangannya?\n"
                "- spoken_naturalness: enak diucapkan, ritme lisan, tidak kaku seperti tulisan.\n"
                "Skor 9+ hanya untuk naskah yang benar-benar siap viral. Rata-rata konten biasa = 6-7.\n"
                "ATURAN:\n"
                "1. Jangan mengada-ada kesalahan; jika bagus, `issues: []`.\n"
                "2. Severity `major` HANYA jika merusak retensi/FYP atau tidak layak baca TTS. `minor` untuk saran halus.\n"
                "3. Untuk segmen `major`, beri `suggested_rewrites` per indeks (kalimat lisan bersih, tanpa tanda kurung/markdown, bahasa sama).\n"
                "4. `verdict`: 1-2 kalimat review — kekuatan utama, kelemahan utama, dan satu saran paling berdampak.\n\n"
                f"Bahasa: {project.language or 'id'} | Target Durasi: {int(target_dur)}s\n"
                "Segmen Naskah:\n" + "\n".join(seg_lines) + "\n\n"
                "Kembalikan HANYA JSON valid dengan format:\n"
                "{\n"
                '  "dimension_scores": {"hook": 7.0, "flow_retention": 7.0, "shot_match": 7.0, "spoken_naturalness": 7.0},\n'
                '  "issues": [{"dimension": "hook|flow_retention|shot_match|spoken_naturalness", "severity": "major|minor", "segment_index": 0, "message": "..."}],\n'
                '  "suggested_rewrites": {"0": "kalimat perbaikan bersih"},\n'
                '  "verdict": "..."\n'
                "}"
            )
            raw_resp = await asyncio.wait_for(
                adapter.generate_chat(
                    prompt=prompt,
                    json_mode=True,
                ),
                timeout=35.0,
            )
            parsed = _extract_json_object(raw_resp)
            if parsed:
                _merge_judge_scores(scores, parsed.get("dimension_scores"))
                verdict = str(parsed.get("verdict") or "").strip() or None

                for idx_str, new_txt in (parsed.get("suggested_rewrites") or {}).items():
                    try:
                        s_idx = int(idx_str)
                        cleaned_txt = clean_spoken(str(new_txt))
                        if 0 <= s_idx < len(segments) and len(cleaned_txt.split()) >= 3:
                            suggested_rewrites[s_idx] = cleaned_txt
                    except (TypeError, ValueError):
                        pass

                for raw_idx, item in enumerate(parsed.get("issues") or []):
                    if not isinstance(item, dict) or not item.get("message"):
                        continue
                    sev = str(item.get("severity") or "minor").lower()
                    if sev not in ("blocker", "major", "minor"):
                        sev = "minor"
                    dim = str(item.get("dimension") or "flow_retention")
                    if dim not in scores:
                        dim = "flow_retention"
                    seg_idx = item.get("segment_index")
                    seg_idx_int = int(seg_idx) if isinstance(seg_idx, int) and 0 <= seg_idx < len(segments) else None
                    issues.append(
                        {
                            "id": f"llm-script-{raw_idx}",
                            "dimension": dim,
                            "severity": sev,
                            "message": str(item["message"]).strip(),
                            "segment_index": seg_idx_int,
                            "auto_fixable": bool(seg_idx_int is not None and sev in ("blocker", "major")),
                        }
                    )
        except Exception as exc:
            log.warning("QC Gate 1 LLM evaluation skipped (fail-open): %s", exc)
            error_note = f"Evaluasi AI LLM dilewati (menggunakan pemeriksaan aturan cepat): {exc}"
    elif not has_creds:
        error_note = RULES_ONLY_NOTE

    return scores, issues, suggested_rewrites, error_note, verdict


CLAUSE_CONNECTORS = {"namun", "tetapi", "tapi", "sehingga", "bahkan", "sementara", "karena", "lalu"}


def _split_long_sentence(text: str, max_words: int = 20) -> List[str]:
    """Split an overlong spoken line at clause boundaries into several lines; never drops words."""
    chunks: List[List[str]] = []
    cur: List[str] = []
    for w in text.split():
        cur.append(w)
        if len(cur) <= max_words:
            continue
        # Last natural break: after a comma, or before a connector word
        cut = max((i + 1 for i, x in enumerate(cur[:-1]) if x.endswith(",")), default=0)
        cut = max(cut, max((i for i, x in enumerate(cur) if i > 0 and x.lower() in CLAUSE_CONNECTORS), default=0))
        if cut >= 4:
            chunks.append(cur[:cut])
            cur = cur[cut:]
    chunks.append(cur)
    if len(chunks) == 1:
        return [text]

    out = []
    for c in chunks:
        line = " ".join(c).rstrip(",")
        if line and line[-1] not in ".!?":
            line += "."
        out.append(line[:1].upper() + line[1:])
    return out


async def _apply_script_fixes(
    narration: Narration,
    scenes: List[Dict[str, Any]],
    issues: List[Dict[str, Any]],
    suggested_rewrites: Dict[int, str],
    round_num: int,
) -> List[Dict[str, Any]]:
    """Apply targeted fixes to narration segments for Gate 1."""
    applied: List[Dict[str, Any]] = []
    segments = copy.deepcopy(list(narration.segments or []))

    # If segments were missing but raw_text exists, rebuild segments
    if not segments and (narration.raw_text or "").strip():
        from app.services.narrative import split_into_sentence_segments

        segments = split_into_sentence_segments(narration.raw_text)
        applied.append(
            {
                "round": round_num,
                "action": "rebuild_segments",
                "target": "narration.segments",
                "summary": f"Membentuk ulang {len(segments)} segmen kalimat dari teks naskah.",
            }
        )

    if not segments:
        return applied

    scene_ids = {sc["id"] for sc in scenes}
    flagged_indices = {
        int(i["segment_index"])
        for i in issues
        if i.get("severity") in ("blocker", "major") and isinstance(i.get("segment_index"), int)
    }
    out_segments: List[Dict[str, Any]] = []
    for idx, seg in enumerate(segments):
        out_segments.append(seg)
        orig_text = str(seg.get("text") or "").strip()
        new_text = orig_text

        # 1. Clean non-spoken symbols on any flagged segment (or if artifact pattern matches)
        if idx in flagged_indices or ARTIFACT_PATTERN.search(orig_text):
            cleaned = clean_spoken(orig_text)
            if cleaned and cleaned != orig_text:
                new_text = cleaned

        # 2. Apply LLM suggested rewrite for flagged segment
        if idx in flagged_indices and idx in suggested_rewrites:
            candidate = clean_spoken(suggested_rewrites[idx])
            if len(candidate.split()) >= 3:
                new_text = candidate

        # 3. Deterministic fallback for overly long hook or sentence: split into lines, never cut words.
        # Duration overflow is not fixed here; dropping content needs a human or LLM rewrite.
        w_len = len(new_text.split())
        extra_lines: List[str] = []
        if (idx == 0 and w_len > 22) or w_len > 28:
            lines = _split_long_sentence(new_text, max_words=17 if idx == 0 else 20)
            new_text, extra_lines = lines[0], lines[1:]

        if new_text != orig_text and len(new_text.split()) >= 2:
            seg["text"] = new_text
            applied.append(
                {
                    "round": round_num,
                    "action": "split_segment" if extra_lines else "rewrite_segment",
                    "target": f"Segmen #{idx + 1}",
                    "summary": (
                        f"Memecah segmen #{idx + 1} jadi {len(extra_lines) + 1} kalimat agar napas TTS natural."
                        if extra_lines
                        else f"Merapikan kalimat segmen #{idx + 1} agar lebih padat & siap TTS."
                    ),
                    "before": orig_text,
                    "after": " / ".join([new_text, *extra_lines]),
                }
            )

        # 4. Repair missing or invalid scene_id
        if scenes and (not seg.get("scene_id") or seg.get("scene_id") not in scene_ids):
            best_sc = scenes[min(idx, len(scenes) - 1)]
            best_score = -1.0
            for sc in scenes:
                sc_text = f"{sc.get('description', '')} {' '.join(sc.get('tags') or [])}"
                overlap = _calc_lexical_overlap(seg.get("text", ""), sc_text)
                if overlap > best_score:
                    best_score = overlap
                    best_sc = sc
            old_sc = seg.get("scene_id")
            seg["scene_id"] = best_sc["id"]
            applied.append(
                {
                    "round": round_num,
                    "action": "assign_scene",
                    "target": f"Segmen #{idx + 1}",
                    "summary": f"Menautkan segmen #{idx + 1} ke Scene #{best_sc.get('scene_index', 0) + 1}.",
                    "before": old_sc,
                    "after": best_sc["id"],
                }
            )

        # Split lines inherit the (repaired) scene of their parent segment
        for n, line in enumerate(extra_lines, start=2):
            out_segments.append(
                {**seg, "id": f"{seg.get('id') or f'seg-{idx + 1}'}-{n}", "text": line, "words": []}
            )

    segments = out_segments
    # Remove empty stub segments (< 2 words) if more than 1 segment exists
    if len(segments) > 1:
        filtered = [s for s in segments if len(str(s.get("text") or "").split()) >= 2]
        if filtered and len(filtered) < len(segments):
            removed_count = len(segments) - len(filtered)
            segments = filtered
            applied.append(
                {
                    "round": round_num,
                    "action": "remove_stub_segments",
                    "target": "narration.segments",
                    "summary": f"Menghapus {removed_count} segmen kosong/terlalu pendek.",
                }
            )

    if applied:
        narration.segments = segments
        narration.raw_text = "\n\n".join(str(s.get("text") or "").strip() for s in segments if s.get("text"))

    return applied


async def _evaluate_timeline_gate(
    db: AsyncSession,
    project: Project,
    timeline: Optional[Timeline],
    narration: Optional[Narration],
    audio_track: Optional[AudioTrack],
    scenes: List[Dict[str, Any]],
    qc_cfg: QCConfigSchema,
) -> Tuple[Dict[str, float], List[Dict[str, Any]], Dict[int, str], Optional[str], Optional[str]]:
    """Evaluate Gate 2 (Timeline & Visual before Final Render).

    Returns (dimension_scores, issues, suggested_scene_swaps_by_clip_idx, error_note, reviewer_verdict).
    """
    scores: Dict[str, float] = {
        "clip_cuts": 9.0,
        "visual_relevance": 8.6,
        "frame_quality": 8.8,
        "audio_subtitle_sync": 9.0,
        "fyp_readiness": 8.8,
    }
    issues: List[Dict[str, Any]] = []
    suggested_swaps: Dict[int, str] = {}
    error_note: Optional[str] = None
    verdict: Optional[str] = None

    clips = list(timeline.clips or []) if timeline else []
    if not clips:
        can_auto_build = bool(scenes and narration and narration.segments)
        issues.append(
            {
                "id": "timeline-empty",
                "dimension": "clip_cuts",
                "severity": "blocker" if not can_auto_build else "major",
                "message": "Timeline belum memiliki klip video.",
                "auto_fixable": can_auto_build,
            }
        )
        return dict.fromkeys(scores, 3.0), issues, suggested_swaps, None, None

    scene_by_id = {sc["id"]: sc for sc in scenes}
    segments = list(narration.segments or []) if narration else []
    scene_usage_count: Dict[str, int] = {}

    prev_end = 0.0
    for idx, clip in enumerate(clips):
        t_start = float(clip.get("timeline_start", 0.0) or 0.0)
        t_end = float(clip.get("timeline_end", 0.0) or 0.0)
        dur = round(t_end - t_start, 3)
        sc_id = str(clip.get("scene_id") or "")
        scene_usage_count[sc_id] = scene_usage_count.get(sc_id, 0) + 1
        sc = scene_by_id.get(sc_id)

        # 1. Continuity / gap check
        if idx == 0 and abs(t_start) > 0.08:
            scores["clip_cuts"] = max(5.5, scores["clip_cuts"] - 1.5)
            issues.append(
                {
                    "id": "timeline-start-gap",
                    "dimension": "clip_cuts",
                    "severity": "major",
                    "message": f"Klip pertama tidak dimulai di 0.0s (mulai di {t_start:.2f}s).",
                    "clip_index": 0,
                    "timestamp_sec": t_start,
                    "auto_fixable": True,
                }
            )
        elif idx > 0 and abs(t_start - prev_end) > 0.08:
            scores["clip_cuts"] = max(5.5, scores["clip_cuts"] - 1.5)
            issues.append(
                {
                    "id": f"timeline-gap-{idx}",
                    "dimension": "clip_cuts",
                    "severity": "major",
                    "message": f"Ada celah/tumpang tindih waktu antara Klip #{idx} dan Klip #{idx + 1} ({prev_end:.2f}s → {t_start:.2f}s).",
                    "clip_index": idx,
                    "timestamp_sec": t_start,
                    "auto_fixable": True,
                }
            )
        prev_end = t_end

        # 2. Flash cut / overly short clip (< 0.8s) or static long clip (> 6.5s)
        if dur < 0.8 and len(clips) > 1:
            scores["clip_cuts"] = max(5.0, scores["clip_cuts"] - 1.6)
            issues.append(
                {
                    "id": f"clip-too-short-{idx}",
                    "dimension": "clip_cuts",
                    "severity": "major",
                    "message": f"Klip #{idx + 1} terlalu singkat ({dur:.2f}s < 0.8s) dan memicu jump cut kasar.",
                    "clip_index": idx,
                    "timestamp_sec": t_start,
                    "auto_fixable": True,
                }
            )
        elif dur > 6.5 and len(scenes) > len(clips):
            scores["clip_cuts"] = max(6.8, scores["clip_cuts"] - 0.6)
            issues.append(
                {
                    "id": f"clip-long-{idx}",
                    "dimension": "clip_cuts",
                    "severity": "minor",
                    "message": f"Klip #{idx + 1} cukup panjang ({dur:.1f}s); pertimbangkan variasi shot agar retensi terjaga.",
                    "clip_index": idx,
                    "timestamp_sec": t_start,
                    "auto_fixable": False,
                }
            )

        # 3. Consecutive duplicate scene check
        if idx > 0 and sc_id and sc_id == clips[idx - 1].get("scene_id") and len(scenes) > 1:
            scores["clip_cuts"] = max(5.5, scores["clip_cuts"] - 1.5)
            scores["visual_relevance"] = max(6.0, scores["visual_relevance"] - 1.0)
            issues.append(
                {
                    "id": f"clip-duplicate-adj-{idx}",
                    "dimension": "clip_cuts",
                    "severity": "major",
                    "message": f"Klip #{idx + 1} memakai scene yang sama persis dengan Klip #{idx} secara berurutan.",
                    "clip_index": idx,
                    "timestamp_sec": t_start,
                    "auto_fixable": True,
                }
            )

        # 4. Frame quality check from scene metadata/description
        if not sc and scenes:
            scores["frame_quality"] = max(5.5, scores["frame_quality"] - 1.8)
            issues.append(
                {
                    "id": f"clip-missing-scene-{idx}",
                    "dimension": "frame_quality",
                    "severity": "major",
                    "message": f"Klip #{idx + 1} mengacu pada scene yang tidak ditemukan.",
                    "clip_index": idx,
                    "timestamp_sec": t_start,
                    "auto_fixable": True,
                }
            )
        elif sc:
            desc_lower = f"{sc.get('description', '')} {' '.join(sc.get('tags') or [])}".lower()
            bad_kw = next((kw for kw in LOW_QUALITY_FRAME_KEYWORDS if kw in desc_lower), None)
            static_kw = next((kw for kw in STATIC_BORING_KEYWORDS if kw in desc_lower), None)
            if bad_kw and len(scenes) > len(clips):
                scores["frame_quality"] = max(5.8, scores["frame_quality"] - 1.5)
                issues.append(
                    {
                        "id": f"clip-frame-quality-{idx}",
                        "dimension": "frame_quality",
                        "severity": "major",
                        "message": f"Visual Klip #{idx + 1} terindikasi kurang optimal ('{bad_kw}').",
                        "clip_index": idx,
                        "timestamp_sec": t_start,
                        "auto_fixable": True,
                    }
                )
            elif static_kw and len(scenes) > len(clips):
                scores["visual_relevance"] = max(6.8, scores["visual_relevance"] - 0.8)
                issues.append(
                    {
                        "id": f"clip-static-{idx}",
                        "dimension": "visual_relevance",
                        "severity": "minor",
                        "message": f"Klip #{idx + 1} menampilkan shot pasif ('{static_kw}').",
                        "clip_index": idx,
                        "timestamp_sec": t_start,
                        "auto_fixable": False,
                    }
                )

    # 5. Audio & Subtitle Sync check
    tl_dur = float(prev_end or (timeline.total_duration if timeline else 0.0) or 0.0)
    if audio_track and audio_track.duration and timeline and timeline.has_audio is not False:
        audio_dur = float(audio_track.duration)
        drift = abs(tl_dur - audio_dur)
        if drift > 1.5:
            scores["audio_subtitle_sync"] = max(5.5, scores["audio_subtitle_sync"] - 2.0)
            issues.append(
                {
                    "id": "sync-audio-timeline-drift",
                    "dimension": "audio_subtitle_sync",
                    "severity": "major",
                    "message": f"Durasi visual timeline ({tl_dur:.1f}s) tidak sinkron dengan durasi audio narasi ({audio_dur:.1f}s).",
                    "timestamp_sec": min(tl_dur, audio_dur),
                    "auto_fixable": True,
                }
            )

    if segments and tl_dur > 0 and (not timeline or timeline.has_subtitles is not False):
        max_end_ms = max((int(s.get("end_ms") or 0) for s in segments), default=0)
        if max_end_ms > int(tl_dur * 1000) + 1600:
            scores["audio_subtitle_sync"] = max(6.0, scores["audio_subtitle_sync"] - 1.5)
            issues.append(
                {
                    "id": "sync-subtitle-overflow",
                    "dimension": "audio_subtitle_sync",
                    "severity": "major",
                    "message": f"Timestamp subtitle berakhir di {max_end_ms / 1000:.1f}s, melewati durasi video ({tl_dur:.1f}s).",
                    "timestamp_sec": tl_dur,
                    "auto_fixable": True,
                }
            )

    # 6. Optional LLM Judge for visual relevance & FYP readiness (Fail-open)
    adapter, has_creds = await _get_qc_adapter(db, qc_cfg)
    if adapter and has_creds and clips and scenes:
        try:
            clip_Summaries = []
            image_paths: List[str] = []
            for idx, c in enumerate(clips[:18]):
                sc = scene_by_id.get(str(c.get("scene_id") or ""))
                sc_desc = (sc.get("description") or "Tanpa deskripsi")[:100] if sc else "Scene hilang"
                t0 = float(c.get("timeline_start", 0.0) or 0.0)
                t1 = float(c.get("timeline_end", 0.0) or 0.0)
                thumb = sc.get("thumbnail_path") if sc else None
                img_tag = ""
                if thumb and Path(thumb).is_file():
                    image_paths.append(str(thumb))
                    img_tag = f" [Gambar ke-{len(image_paths)}]"
                clip_Summaries.append(
                    f"Klip #{idx} ({t0:.1f}s-{t1:.1f}s, scene_id={c.get('scene_id')}){img_tag}: {sc_desc}"
                )

            avail_scenes = [
                f"id={sc['id']} (Scene #{sc['scene_index'] + 1}): {(sc.get('description') or '')[:90]}"
                for sc in scenes[:25]
            ]
            nar_preview = (narration.raw_text or "")[:600] if narration else "(Tanpa narasi)"

            prompt = (
                f"Anda adalah reviewer & analis konten senior untuk video short-form vertikal ({qc_cfg.platform.upper()}).\n"
                "Review rangkaian visual timeline terhadap narasi sebelum dirender, seperti editor yang memutuskan video ini layak FYP.\n"
                + (
                    "Gambar terlampir adalah frame asli tiap klip (urut sesuai label [Gambar ke-N]). "
                    "Nilai frame dari GAMBAR, bukan dari deskripsi: buram, gelap, layar hitam, watermark/hardsub, letterbox, komposisi jelek untuk 9:16.\n"
                    if image_paths
                    else "Tidak ada gambar; nilai dari deskripsi scene saja dan beri catatan bahwa frame belum terlihat.\n"
                )
                + "RUBRIK SKOR (1-10, kalibrasi ketat; konten biasa = 6-7, 9+ hanya jika benar-benar siap viral):\n"
                "- clip_cuts: tempo potongan pas untuk retensi (tidak monoton, tidak terlalu kasar).\n"
                "- visual_relevance: tiap klip mendukung kalimat narasi yang sedang diucapkan.\n"
                "- frame_quality: ketajaman, pencahayaan, kebersihan frame, cocok untuk layar vertikal.\n"
                "- audio_subtitle_sync: urutan visual mengikuti alur narasi.\n"
                "- fyp_readiness: secara keseluruhan, apakah penonton akan berhenti scroll dan menonton sampai habis?\n"
                "ATURAN:\n"
                "1. Jangan mengada-ada kekurangan; jika bagus, `issues: []`.\n"
                "2. Anda HANYA menilai/memperbaiki sisi visual/timeline (tidak mengubah audio/naskah).\n"
                "3. Untuk klip yang visualnya tidak relevan atau jelek (`major`), sarankan `suggested_swaps` ke `scene_id` lain dari Scene Tersedia.\n"
                "4. `verdict`: 1-2 kalimat review — kekuatan utama, kelemahan utama, dan satu saran paling berdampak.\n\n"
                f"Narasi:\n{nar_preview}\n\n"
                "Rangkaian Klip Timeline:\n" + "\n".join(clip_Summaries) + "\n\n"
                "Scene Tersedia di Pool:\n" + "\n".join(avail_scenes) + "\n\n"
                "Kembalikan HANYA JSON valid:\n"
                "{\n"
                '  "dimension_scores": {"clip_cuts": 7.0, "visual_relevance": 7.0, "frame_quality": 7.0, "audio_subtitle_sync": 7.0, "fyp_readiness": 7.0},\n'
                '  "issues": [{"dimension": "visual_relevance|clip_cuts|frame_quality|fyp_readiness", "severity": "major|minor", "clip_index": 0, "message": "..."}],\n'
                '  "suggested_swaps": {"0": "scene_id_pengganti"},\n'
                '  "verdict": "..."\n'
                "}"
            )
            raw_resp = await asyncio.wait_for(
                adapter.analyze_multimodal(prompt=prompt, image_paths=image_paths, json_mode=True)
                if image_paths
                else adapter.generate_chat(prompt=prompt, json_mode=True),
                timeout=70.0,
            )
            parsed = _extract_json_object(raw_resp)
            if parsed:
                _merge_judge_scores(scores, parsed.get("dimension_scores"))
                verdict = str(parsed.get("verdict") or "").strip() or None

                for c_idx_str, new_sc_id in (parsed.get("suggested_swaps") or {}).items():
                    try:
                        c_idx = int(c_idx_str)
                        if 0 <= c_idx < len(clips) and str(new_sc_id) in scene_by_id:
                            suggested_swaps[c_idx] = str(new_sc_id)
                    except (TypeError, ValueError):
                        pass

                for raw_idx, item in enumerate(parsed.get("issues") or []):
                    if not isinstance(item, dict) or not item.get("message"):
                        continue
                    sev = str(item.get("severity") or "minor").lower()
                    if sev not in ("blocker", "major", "minor"):
                        sev = "minor"
                    dim = str(item.get("dimension") or "visual_relevance")
                    if dim not in scores:
                        dim = "visual_relevance"
                    c_idx = item.get("clip_index")
                    c_idx_int = int(c_idx) if isinstance(c_idx, int) and 0 <= c_idx < len(clips) else None
                    ts_sec = float(clips[c_idx_int].get("timeline_start", 0.0)) if c_idx_int is not None else None
                    issues.append(
                        {
                            "id": f"llm-timeline-{raw_idx}",
                            "dimension": dim,
                            "severity": sev,
                            "message": str(item["message"]).strip(),
                            "clip_index": c_idx_int,
                            "timestamp_sec": ts_sec,
                            # Only visual problems are fixable by swapping the clip's scene
                            "auto_fixable": bool(
                                c_idx_int is not None
                                and sev in ("blocker", "major")
                                and dim in ("visual_relevance", "frame_quality")
                            ),
                        }
                    )
        except Exception as exc:
            log.warning("QC Gate 2 LLM evaluation skipped (fail-open): %s", exc)
            error_note = f"Evaluasi AI LLM dilewati (menggunakan pemeriksaan aturan cepat): {exc}"
    elif not has_creds:
        error_note = RULES_ONLY_NOTE

    # Overall FYP readiness reflects the other 4 pillars if any dropped low
    pillar_avg = (
        scores["clip_cuts"]
        + scores["visual_relevance"]
        + scores["frame_quality"]
        + scores["audio_subtitle_sync"]
    ) / 4.0
    scores["fyp_readiness"] = round(min(scores["fyp_readiness"], pillar_avg + 0.3), 2)

    return scores, issues, suggested_swaps, error_note, verdict


def _pick_replacement_scene(
    clip_idx: int,
    clips: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    segments: List[Dict[str, Any]],
    suggested_swaps: Dict[int, str],
) -> Optional[Dict[str, Any]]:
    """Pick the best alternative scene from the pool for clip_idx without creating adjacent duplicates."""
    if not scenes:
        return None
    scene_by_id = {sc["id"]: sc for sc in scenes}
    curr_id = str(clips[clip_idx].get("scene_id") or "")
    prev_id = str(clips[clip_idx - 1].get("scene_id") or "") if clip_idx > 0 else ""
    next_id = str(clips[clip_idx + 1].get("scene_id") or "") if clip_idx + 1 < len(clips) else ""
    forbidden = {curr_id, prev_id, next_id} - {""}

    if clip_idx in suggested_swaps:
        cand_id = suggested_swaps[clip_idx]
        if cand_id in scene_by_id and cand_id not in forbidden:
            return scene_by_id[cand_id]

    used_counts: Dict[str, int] = {}
    for c in clips:
        sid = str(c.get("scene_id") or "")
        used_counts[sid] = used_counts.get(sid, 0) + 1

    seg_text = ""
    if segments:
        # Match by time: one segment often spans several clips, so clip index != segment index
        clip = clips[clip_idx]
        mid_ms = 500 * (float(clip.get("timeline_start", 0.0) or 0.0) + float(clip.get("timeline_end", 0.0) or 0.0))
        seg = next(
            (s for s in segments if int(s.get("start_ms") or 0) <= mid_ms < int(s.get("end_ms") or 0)),
            segments[min(clip_idx, len(segments) - 1)],
        )
        seg_text = str(seg.get("text") or "")

    best_sc: Optional[Dict[str, Any]] = None
    best_score = -999.0
    for sc in scenes:
        sid = sc["id"]
        if sid in forbidden and len(scenes) > len(forbidden):
            continue
        desc = f"{sc.get('description', '')} {' '.join(sc.get('tags') or [])}".lower()
        has_bad_frame = any(kw in desc for kw in LOW_QUALITY_FRAME_KEYWORDS)
        score = _calc_lexical_overlap(seg_text, desc) * 2.0 + _calc_visual_satisfaction_boost(sc)
        score -= used_counts.get(sid, 0) * 0.6
        if has_bad_frame:
            score -= 2.5
        if score > best_score:
            best_score = score
            best_sc = sc
    return best_sc


async def _apply_timeline_fixes(
    db: AsyncSession,
    project: Project,
    timeline: Timeline,
    narration: Optional[Narration],
    audio_track: Optional[AudioTrack],
    scenes: List[Dict[str, Any]],
    issues: List[Dict[str, Any]],
    suggested_swaps: Dict[int, str],
    round_num: int,
) -> List[Dict[str, Any]]:
    """Apply targeted visual/timeline & subtitle sync fixes for Gate 2 (never regenerates TTS audio)."""
    applied: List[Dict[str, Any]] = []
    clips = copy.deepcopy(list(timeline.clips or []))
    segments = copy.deepcopy(list(narration.segments or [])) if narration else []

    # 1. Auto-populate timeline if empty
    if not clips and scenes and segments:
        adapter = await get_active_llm_adapter(db)
        audio_dur = float(audio_track.duration) if (audio_track and audio_track.duration) else None
        clips = await match_scenes_to_segments(
            adapter=adapter,
            segments=segments,
            scenes=scenes,
            default_bg_fill=project.background_fill,
            total_audio_duration_sec=audio_dur,
        )
        if clips:
            applied.append(
                {
                    "round": round_num,
                    "action": "auto_match_empty_timeline",
                    "target": "timeline.clips",
                    "summary": f"Menyusun otomatis {len(clips)} klip visual ke timeline.",
                }
            )

    if not clips:
        return applied

    # 2. Swap scenes on clips flagged for duplicate adjacent scene, missing scene, or frame quality/relevance
    swap_clip_indices = {
        int(i["clip_index"])
        for i in issues
        if i.get("severity") in ("blocker", "major")
        and isinstance(i.get("clip_index"), int)
        and (
            str(i.get("id", "")).startswith("clip-duplicate-adj-")
            or str(i.get("id", "")).startswith("clip-missing-scene-")
            or str(i.get("id", "")).startswith("clip-frame-quality-")
            or (str(i.get("id", "")).startswith("llm-timeline-") and i.get("auto_fixable"))
        )
    }
    for c_idx in sorted(swap_clip_indices):
        if 0 <= c_idx < len(clips):
            replacement = _pick_replacement_scene(c_idx, clips, scenes, segments, suggested_swaps)
            if replacement and replacement["id"] != clips[c_idx].get("scene_id"):
                old_scene_id = clips[c_idx].get("scene_id")
                slot_dur = max(
                    1.0,
                    float(clips[c_idx].get("timeline_end", 0.0))
                    - float(clips[c_idx].get("timeline_start", 0.0)),
                )
                u_start, u_end, _, _ = _get_scene_usable_range(replacement, slot_dur)
                c_end = min(u_end, round(u_start + slot_dur, 3))
                clips[c_idx]["scene_id"] = replacement["id"]
                clips[c_idx]["source_video_id"] = replacement["source_video_id"]
                clips[c_idx]["clip_start"] = round(u_start, 3)
                clips[c_idx]["clip_end"] = round(max(u_start + 0.5, c_end), 3)
                applied.append(
                    {
                        "round": round_num,
                        "action": "swap_clip_scene",
                        "target": f"Klip #{c_idx + 1}",
                        "summary": f"Mengganti visual Klip #{c_idx + 1} ke Scene #{replacement.get('scene_index', 0) + 1}.",
                        "before": old_scene_id,
                        "after": replacement["id"],
                    }
                )

    # 3. Heal flash cuts (< 0.8s) and timeline gaps
    needs_heal = any(
        i.get("severity") in ("blocker", "major")
        and (
            str(i.get("id", "")).startswith("clip-too-short-")
            or str(i.get("id", "")).startswith("timeline-gap-")
            or i.get("id") == "timeline-start-gap"
        )
        for i in issues
    )
    if needs_heal:
        before_len = len(clips)
        clips = verify_and_heal_timeline_clips(clips, min_clip_dur=1.0, scenes=scenes)
        applied.append(
            {
                "round": round_num,
                "action": "heal_timeline_cuts",
                "target": "timeline.clips",
                "summary": f"Merapikan kesinambungan waktu & menggabungkan potongan kasar ({before_len} → {len(clips)} klip).",
            }
        )

    # 4. Sync total timeline duration with audio track duration if drifted
    has_audio_drift = any(i.get("id") == "sync-audio-timeline-drift" for i in issues)
    if has_audio_drift and clips and audio_track and audio_track.duration:
        target_audio_dur = round(float(audio_track.duration), 3)
        curr_total = float(clips[-1].get("timeline_end", 0.0) or 0.0)
        if curr_total > 0 and abs(curr_total - target_audio_dur) > 1.5:
            scale = target_audio_dur / curr_total
            scene_by_id = {sc["id"]: sc for sc in scenes}
            cursor = 0.0
            for idx, c in enumerate(clips):
                old_dur = max(0.5, float(c["timeline_end"]) - float(c["timeline_start"]))
                new_dur = round(old_dur * scale, 3)
                c["timeline_start"] = round(cursor, 3)
                cursor = target_audio_dur if idx == len(clips) - 1 else round(cursor + new_dur, 3)
                c["timeline_end"] = cursor
                # Renderer reads at most clip_end - clip_start of source, so the source range must follow
                # the slot, capped at the scene end to avoid bleeding into the next shot.
                src_start = float(c.get("clip_start", 0.0) or 0.0)
                want_end = src_start + (cursor - c["timeline_start"]) * float(c.get("speed", 1.0) or 1.0)
                sc = scene_by_id.get(str(c.get("scene_id") or ""))
                if sc and sc.get("end_time"):
                    want_end = min(want_end, float(sc["end_time"]))
                c["clip_end"] = round(max(src_start + 0.5, want_end), 3)
            applied.append(
                {
                    "round": round_num,
                    "action": "sync_timeline_to_audio",
                    "target": "timeline.total_duration",
                    "summary": f"Menyelaraskan durasi klip timeline ({curr_total:.1f}s → {target_audio_dur:.1f}s) mengikuti audio narasi.",
                    "before": round(curr_total, 2),
                    "after": round(target_audio_dur, 2),
                }
            )

    # Update timeline total_duration
    new_total_dur = float(clips[-1].get("timeline_end", 0.0) or 0.0) if clips else 0.0
    timeline.clips = clips
    timeline.total_duration = round(new_total_dur, 3)

    # 5. Clamp overflowing subtitle timestamps
    has_sub_overflow = any(i.get("id") == "sync-subtitle-overflow" for i in issues)
    if has_sub_overflow and narration and segments and new_total_dur > 0:
        max_ms = int(round(new_total_dur * 1000))
        changed_subs = 0
        for s in segments:
            end_ms = int(s.get("end_ms") or 0)
            start_ms = int(s.get("start_ms") or 0)
            if end_ms > max_ms:
                s["end_ms"] = max_ms
                s["start_ms"] = min(start_ms, max(0, max_ms - 400))
                if isinstance(s.get("words"), list):
                    for w in s["words"]:
                        if int(w.get("end_ms") or 0) > max_ms:
                            w["end_ms"] = max_ms
                        if int(w.get("start_ms") or 0) > max_ms:
                            w["start_ms"] = max(0, max_ms - 150)
                changed_subs += 1
        if changed_subs > 0:
            narration.segments = segments
            applied.append(
                {
                    "round": round_num,
                    "action": "clamp_subtitles",
                    "target": "narration.segments",
                    "summary": f"Menyesuaikan {changed_subs} timestamp subtitle agar tidak melewati akhir video ({new_total_dur:.1f}s).",
                }
            )

    return applied


async def run_project_qc(
    db: AsyncSession,
    project_id: str,
    gate: Literal["script", "timeline"],
    *,
    auto_fix: bool = False,
    trigger: Literal["auto", "manual"] = "manual",
    narration_id: Optional[str] = None,
) -> QCRun:
    """Review a project (auto_fix=False) or review + self-fix loop (up to max_fix_rounds), fail-open.

    Only runs on the user's "Cek QC" click. narration_id pins a narration; defaults to the latest one.
    """
    project = await db.get(Project, project_id)
    if not project:
        raise ValueError("Project tidak ditemukan")

    qc_cfg = resolve_project_qc_config(project)
    max_rounds = int(qc_cfg.max_fix_rounds) if auto_fix else 0
    threshold = float(qc_cfg.threshold)

    gate_label = "Naskah (Pre-TTS)" if gate == "script" else "Timeline & Visual (Pre-Render)"
    await publish_project_event(
        project_id,
        task_type="qc",
        status="progress",
        progress=20,
        stage="qc_evaluating",
        message=f"Menjalankan AI QC {gate_label}...",
        data={"gate": gate, "trigger": trigger},
    )

    applied_fixes: List[Dict[str, Any]] = []
    pre_fix_snapshot: Optional[Dict[str, Any]] = None
    try:
        # Load project artifacts
        narration = await db.get(Narration, narration_id) if narration_id else None
        if not narration:
            n_res = await db.execute(
                select(Narration)
                .where(Narration.project_id == project_id)
                .order_by(Narration.created_at.desc())
            )
            narration = n_res.scalars().first()

        a_res = await db.execute(
            select(AudioTrack)
            .where(AudioTrack.project_id == project_id)
            .order_by(AudioTrack.created_at.desc())
        )
        audio_track = a_res.scalars().first()

        t_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
        timeline = t_res.scalar_one_or_none()

        s_res = await db.execute(
            select(Scene)
            .where(Scene.project_id == project_id)
            .order_by(Scene.scene_index.asc())
        )
        scenes = [_scene_to_dict(sc) for sc in s_res.scalars().all()]

        rounds_used = 0
        error_note: Optional[str] = None

        # Round 0..max_rounds loop
        while True:
            if gate == "script":
                dim_scores, issues, suggestions, err, verdict = await _evaluate_script_gate(
                    db, project, narration, scenes, qc_cfg
                )
            else:
                dim_scores, issues, suggestions, err, verdict = await _evaluate_timeline_gate(
                    db, project, timeline, narration, audio_track, scenes, qc_cfg
                )

            error_note = err

            overall_score = (
                round(sum(dim_scores.values()) / len(dim_scores), 2) if dim_scores else 0.0
            )
            passed = _compute_pass_status(overall_score, threshold, issues)
            has_fixable = any(
                i.get("severity") in ("blocker", "major") and i.get("auto_fixable") for i in issues
            )

            if passed or rounds_used >= max_rounds or not has_fixable:
                break

            # Capture snapshot once before first auto-fix
            if pre_fix_snapshot is None:
                if gate == "script" and narration:
                    pre_fix_snapshot = {
                        "gate": "script",
                        "narration_id": narration.id,
                        "raw_text": narration.raw_text,
                        "segments": copy.deepcopy(list(narration.segments or [])),
                    }
                elif gate == "timeline" and timeline:
                    pre_fix_snapshot = {
                        "gate": "timeline",
                        "timeline_id": timeline.id,
                        "clips": copy.deepcopy(list(timeline.clips or [])),
                        "total_duration": float(timeline.total_duration or 0.0),
                        "narration_id": narration.id if narration else None,
                        "segments": copy.deepcopy(list(narration.segments or []))
                        if narration
                        else None,
                    }

            rounds_used += 1
            await publish_project_event(
                project_id,
                task_type="qc",
                status="progress",
                progress=55,
                stage="qc_fixing",
                message=f"AI QC memperbaiki {gate_label} (putaran {rounds_used}/{max_rounds})...",
                data={"gate": gate, "round": rounds_used},
            )

            if gate == "script" and narration:
                round_fixes = await _apply_script_fixes(
                    narration, scenes, issues, suggestions, rounds_used
                )
            elif gate == "timeline" and timeline:
                round_fixes = await _apply_timeline_fixes(
                    db,
                    project,
                    timeline,
                    narration,
                    audio_track,
                    scenes,
                    issues,
                    suggestions,
                    rounds_used,
                )
            else:
                round_fixes = []

            if not round_fixes:
                break

            applied_fixes.extend(round_fixes)
            await db.commit()

        # Determine final status & summary
        if passed and applied_fixes:
            status_val = "fixed"
            summary = (
                f"Lolos QC setelah {len(applied_fixes)} perbaikan otomatis "
                f"(skor {overall_score:.1f}/{threshold:.1f})."
            )
        elif passed:
            status_val = "passed"
            summary = f"Lolos QC tanpa kendala berarti (skor {overall_score:.1f}/{threshold:.1f})."
        else:
            status_val = "warning"
            major_cnt = sum(1 for i in issues if i.get("severity") in ("blocker", "major"))
            summary = (
                f"Skor QC {overall_score:.1f}/{threshold:.1f} ({major_cnt} catatan utama)."
            )
        if verdict:
            summary = f"{summary} Review AI: {verdict}"
        if gate == "script" and applied_fixes and audio_track and audio_track.narration_id == (
            narration.id if narration else None
        ):
            summary = f"{summary} Naskah berubah: generate ulang audio TTS agar suara & subtitle sesuai."

        qc_run = QCRun(
            project_id=project_id,
            gate=gate,
            trigger=trigger,
            status=status_val,
            passed=passed,
            overall_score=overall_score,
            threshold=threshold,
            rounds_used=rounds_used,
            dimension_scores=dim_scores,
            issues=issues,
            applied_fixes=applied_fixes,
            pre_fix_snapshot=pre_fix_snapshot if applied_fixes else None,
            reverted=False,
            summary=summary,
            error_message=error_note,
        )
        db.add(qc_run)
        await db.commit()
        await db.refresh(qc_run)

        await publish_project_event(
            project_id,
            task_type="qc",
            status="completed",
            progress=100,
            stage="qc_done",
            message=summary,
            data={
                "run_id": qc_run.id,
                "gate": gate,
                "status": status_val,
                "overall_score": overall_score,
                "passed": passed,
            },
        )
        return qc_run

    except Exception as exc:
        log.warning("QC Gate %s failed unexpectedly (fail-open): %s", gate, exc)
        await db.rollback()
        # Fixes from earlier rounds may already be committed: keep the snapshot so they stay revertable
        qc_run = QCRun(
            project_id=project_id,
            gate=gate,
            trigger=trigger,
            status="skipped",
            passed=True,
            overall_score=threshold,
            threshold=threshold,
            rounds_used=0,
            dimension_scores={},
            issues=[],
            applied_fixes=applied_fixes,
            pre_fix_snapshot=pre_fix_snapshot if applied_fixes else None,
            reverted=False,
            summary="QC dilewati karena kendala teknis (fail-open).",
            error_message=str(exc),
        )
        db.add(qc_run)
        await db.commit()
        await db.refresh(qc_run)
        return qc_run


async def revert_qc_run(
    db: AsyncSession,
    project_id: str,
    run_id: str,
) -> QCRun:
    """Restore narration or timeline state from qc_run.pre_fix_snapshot."""
    qc_run = await db.get(QCRun, run_id)
    if not qc_run or qc_run.project_id != project_id:
        raise ValueError("Data riwayat QC tidak ditemukan")
    if qc_run.reverted:
        raise ValueError("Perbaikan QC ini sudah pernah dikembalikan sebelumnya")
    snap = qc_run.pre_fix_snapshot
    if not isinstance(snap, dict):
        raise ValueError("Snapshot sebelum perbaikan tidak tersedia untuk riwayat QC ini")

    if qc_run.gate == "script":
        nar_id = snap.get("narration_id")
        newer_audio = await db.execute(
            select(AudioTrack.id)
            .where(AudioTrack.narration_id == nar_id, AudioTrack.created_at >= qc_run.created_at)
            .limit(1)
        )
        if newer_audio.scalar_one_or_none():
            raise ValueError(
                "Audio TTS sudah dibuat dari naskah hasil QC. Revert akan bikin teks & subtitle "
                "tidak cocok dengan suara. Edit naskah manual lalu generate ulang TTS."
            )
        narration = await db.get(Narration, nar_id) if nar_id else None
        if not narration:
            res = await db.execute(
                select(Narration)
                .where(Narration.project_id == project_id)
                .order_by(Narration.created_at.desc())
            )
            narration = res.scalars().first()
        if narration:
            narration.raw_text = str(snap.get("raw_text") or "")
            narration.segments = copy.deepcopy(list(snap.get("segments") or []))
    elif qc_run.gate == "timeline":
        tl_id = snap.get("timeline_id")
        timeline = await db.get(Timeline, tl_id) if tl_id else None
        if not timeline:
            res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
            timeline = res.scalar_one_or_none()
        if timeline:
            timeline.clips = copy.deepcopy(list(snap.get("clips") or []))
            timeline.total_duration = float(snap.get("total_duration") or 0.0)
        if snap.get("narration_id") and snap.get("segments") is not None:
            nar = await db.get(Narration, snap["narration_id"])
            if nar:
                nar.segments = copy.deepcopy(list(snap["segments"]))

    qc_run.reverted = True
    qc_run.summary = f"{qc_run.summary or ''} (Perbaikan telah dikembalikan ke versi sebelumnya)".strip()
    await db.commit()
    await db.refresh(qc_run)
    return qc_run
