import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.narration import Narration
from app.models.project import Project
from app.models.storyboard import StoryboardItem
from app.schemas.storyboard import (
    NarrationDimensionScore,
    NarrationSegmentImprovement,
    StoryboardNarrationAnalysisResponse,
)
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.storyboard import clean_narration_for_tts

log = logging.getLogger(__name__)


NARRATION_ANALYSIS_SYSTEM_PROMPT = """You are an Elite YouTube Retention Director, Script Doctor, and Audience Retention Analyst (specializing in high-AVD documentary and explainer videos in the style of Veritasium, Kurzgesagt, Johnny Harris, Lemmino, Vox, and Big Think).

Your mission is to perform an uncompromising, professional evaluation of the provided YouTube video narration script and provide scores, analytical breakdown, and concrete script improvements.

=== YOUTUBE RETENTION SCORING RUBRIC (0–100) ===
1. HOOK & FIRST 30 SECONDS (Bobot Tinggi):
   - Apakah detik-detik awal langsung menyengat dengan paradoks, kejanggalan menarik (curiosity gap), atau tensi mendesak?
   - DILARANG KERAS basa-basi pembuka (misal: "Halo teman-teman", "Di video kali ini kita akan membahas..."). Detik pertama harus langsung masuk ke inti misteri/urgensi cerita.
2. RETENTION & PACING (AVD):
   - Ritme pergantian kalimat: kalimat pendek menghentak bergantian dengan kalimat deskriptif.
   - Alur linear bebas looping: tidak mengulang-ulang penjelasan atau adegan yang sama.
3. DRAMATURGI & TARUHAN EMOSIONAL:
   - Taruhan nyata (high stakes) bagi karakter/penonton, motif relatable, detail sensorik pekat (aroma, suara, sentuhan dingin/hangat).
4. KEJELASAN SUARA & KELANCARAN DELIVERY TTS:
   - Keluwesan dibacakan voiceover (18–25 kata per adegan), bebas anak kalimat bertingkat yang berbelit-belit, tanda baca natural.
5. RESOLUSI & PAYOFF AKHIR:
   - Konklusi filosofis yang menampar/bermakna mendalam, memicu penonton merenung dan berdiskusi di kolom komentar.

=== ATURAN PERBAIKAN SEGMEN (IMPROVED_SEGMENTS) ===
- Identifikasi segmen-segmen yang bisa ditingkatkan agar retensi video melonjak.
- Buat versi `improved_text` yang lebih tajam, berbobot, dan memikat untuk setiap segmen tersebut, sambil tetap menjaga kesinambungan karakter dan alur cerita.
- SINKRONISASI VISUAL PROMPT AI (WAJIB):
  Untuk setiap segmen yang diperbaiki, kamu WAJIB menghasilkan `improved_visual_prompt` dalam Bahasa Inggris sinematik yang secara tepat mendeskripsikan adegan visual yang selaras dengan `improved_text`.
  - Gunakan tag Story Continuity Bible yang relevan: `[char:<character_id>]` atau `[char:<character_id>:<variant_id>]` untuk karakter, dan `[loc:<location_id>]` untuk latar/lokasi jika karakter/lokasi tersebut muncul di adegan.
  - Deskripsikan aksi visual dinamis, ekspresi emosional karakter, pencahayaan dramatis, dan komposisi 16:9 widescreen (misal: "A medium close-up cinematic shot of [char:budi] gripping a weathered ancient parchment inside [loc:kios_pasar], dramatic warm rim lighting, dust motes in sunbeams").
  - Jangan gunakan teks abstrak, gambarkan visual nyata yang bisa digambar oleh model AI image generation.
- Untuk bahasa naskah: jika naskah berbahasa Indonesia, berikan analisis dan perbaikan dalam Bahasa Indonesia yang alami, sinematik, dan memikat penonton Indonesia. Jika naskah berbahasa Inggris, gunakan Bahasa Inggris.

=== FORMAT KELUARAN (WAJIB PURE JSON) ===
Kembalikan HANYA JSON valid tanpa markdown formatting dengan skema:
{
  "overall_score": 85,
  "grade": "A",
  "summary": "Ringkasan evaluasi kekuatan narasi untuk performa YouTube...",
  "hook_score": {
    "score": 90,
    "label": "Hook 30 Detik Pertama",
    "status": "excellent",
    "feedback": "Penjelasan detail..."
  },
  "retention_pacing_score": {
    "score": 82,
    "label": "Pacing & Retensi (AVD)",
    "status": "good",
    "feedback": "Penjelasan detail..."
  },
  "emotional_storytelling_score": {
    "score": 84,
    "label": "Dramaturgi & Emosi",
    "status": "good",
    "feedback": "Penjelasan detail..."
  },
  "clarity_delivery_score": {
    "score": 88,
    "label": "Kelancaran Suara TTS",
    "status": "excellent",
    "feedback": "Penjelasan detail..."
  },
  "call_to_action_score": {
    "score": 80,
    "label": "Resolusi & Payoff",
    "status": "good",
    "feedback": "Penjelasan detail..."
  },
  "strengths": [
    "Poin kelebihan 1",
    "Poin kelebihan 2"
  ],
  "weaknesses": [
    "Poin kelemahan 1",
    "Poin kelemahan 2"
  ],
  "actionable_recommendations": [
    "Rekomendasi tindakan 1",
    "Rekomendasi tindakan 2"
  ],
  "has_improvements": true,
  "improved_segments": [
    {
      "segment_id": "seg-1",
      "segment_index": 0,
      "chapter_title": "Babak 1...",
      "original_text": "Teks asli...",
      "improved_text": "Teks perbaikan yang lebih memikat...",
      "change_summary": "Apa yang diperbaiki...",
      "original_visual_prompt": "Prompt visual saat ini...",
      "improved_visual_prompt": "Prompt visual baru dalam Bahasa Inggris sinematik dengan tag [char:...] dan [loc:...]"
    }
  ]
}
"""


async def analyze_storyboard_narration(
    db: AsyncSession,
    project_id: str,
    focus_aspect: Optional[str] = "youtube_retention",
    custom_instructions: Optional[str] = None,
) -> StoryboardNarrationAnalysisResponse:
    """Analyze the project's storyboard narration for YouTube retention, pacing, and emotional payoff."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError("Project tidak ditemukan")

    # Fetch latest narration
    res_nar = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
        .limit(1)
    )
    narration = res_nar.scalar_one_or_none()
    if not narration or not narration.segments:
        raise ValueError("Naskah narasi belum dibuat. Silakan generate naskah terlebih dahulu di Langkah 1.")

    segments = list(narration.segments or [])
    if len(segments) == 0:
        raise ValueError("Naskah tidak memiliki segmen aktif untuk dianalisis.")

    # Fetch existing storyboard items to obtain current visual prompts
    res_items = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index.asc())
    )
    existing_items = res_items.scalars().all()
    seg_to_prompt: Dict[str, str] = {}
    for it in existing_items:
        if it.segment_id and str(it.segment_id) not in seg_to_prompt:
            seg_to_prompt[str(it.segment_id)] = it.image_prompt or ""

    # Continuity Bible Anchors summary for LLM context
    bible_anchors: List[str] = []
    if proj.characters and isinstance(proj.characters, list):
        char_tags = []
        for c in proj.characters:
            if isinstance(c, dict) and c.get("id"):
                c_id = c.get("id")
                c_name = c.get("name") or c_id
                char_tags.append(f"[char:{c_id}] ({c_name})")
                for v in c.get("variants") or []:
                    if isinstance(v, dict) and v.get("variant_id"):
                        char_tags.append(f"[char:{c_id}:{v.get('variant_id')}] ({v.get('label')})")
        if char_tags:
            bible_anchors.append("Karakter Terkunci: " + ", ".join(char_tags))

    if proj.locations and isinstance(proj.locations, list):
        loc_tags = [
            f"[loc:{l.get('id')}] ({l.get('name') or l.get('id')})"
            for l in proj.locations
            if isinstance(l, dict) and l.get("id")
        ]
        if loc_tags:
            bible_anchors.append("Lokasi Terkunci: " + ", ".join(loc_tags))

    if proj.world_setting and isinstance(proj.world_setting, dict):
        era = proj.world_setting.get("era") or proj.world_setting.get("time_setting")
        atmo = proj.world_setting.get("atmosphere")
        if era or atmo:
            bible_anchors.append(f"Setting Dunia & Era: {era or ''} | Suasana: {atmo or ''}")

    bible_context_str = "\n".join(bible_anchors) if bible_anchors else "Tidak ada karakter/lokasi terkunci khusus."

    # Format segments for LLM review
    segment_text_lines = []
    for idx, seg in enumerate(segments):
        s_id = str(seg.get("id") or seg.get("segment_id") or f"seg-{idx + 1}")
        c_title = seg.get("chapter") or seg.get("chapter_title") or f"Segmen {idx + 1}"
        txt = (seg.get("text") or "").strip()
        curr_prompt = seg_to_prompt.get(s_id) or (existing_items[idx].image_prompt if idx < len(existing_items) else "")
        segment_text_lines.append(
            f"[ID: {s_id} | Index: {idx} | Babak: {c_title}]\n"
            f"Narasi: \"{txt}\"\n"
            f"Visual Prompt Saat Ini: \"{curr_prompt}\""
        )

    segments_formatted = "\n\n".join(segment_text_lines)

    user_prompt = (
        f"Judul / Topik Video: {proj.name or 'YouTube Documentary'}\n"
        f"Nada Bicara (Tone): {narration.tone or 'dramatis'}\n"
        f"Bahasa Naskah: {narration.language or proj.language or 'id'}\n"
        f"Total Segmen: {len(segments)} segmen\n"
        f"Fokus Analisis: {focus_aspect or 'youtube_retention'}\n\n"
        f"=== STORY CONTINUITY BIBLE (GUNAKAN TAG INI DI IMPROVED_VISUAL_PROMPT) ===\n"
        f"{bible_context_str}\n"
    )
    if custom_instructions:
        user_prompt += f"\nInstruksi Tambahan Pengguna: {custom_instructions}\n"

    user_prompt += (
        f"\n=== NASKAH & VISUAL PROMPT LENGKAP PER SEGMEN ===\n"
        f"{segments_formatted}\n\n"
        "Lakukan analisis mendalam terhadap naskah di atas sesuai kriteria YouTube High Retention. "
        "Sediakan skor per dimensi, catatan kritis, perbaikan teks segmen konkret, dan SINKRONISASIKAN `improved_visual_prompt` "
        "untuk setiap segmen yang diperbaiki agar adegan visual selaras 100% dengan narasi baru dalam format JSON murni!"
    )

    llm_adapter = await get_active_llm_adapter(db)
    raw_res = await llm_adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=NARRATION_ANALYSIS_SYSTEM_PROMPT,
        json_mode=True,
        timeout=90.0,
        max_tokens=4000,
        temperature=0.3,
    )

    parsed = {}
    try:
        parsed = json.loads(raw_res.strip())
    except Exception:
        m = re.search(r"(\{.*\})", raw_res, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(1))
            except Exception:
                pass

    if not parsed or not isinstance(parsed, dict):
        raise RuntimeError("Gagal memproses hasil analisis naskah dari AI.")

    # Calculate overall score and grade if not given
    overall_score = int(parsed.get("overall_score") or 80)
    grade = parsed.get("grade")
    if not grade:
        if overall_score >= 95:
            grade = "S"
        elif overall_score >= 88:
            grade = "A+"
        elif overall_score >= 80:
            grade = "A"
        elif overall_score >= 70:
            grade = "B"
        else:
            grade = "C"

    def _parse_dim(data: Any, default_label: str) -> NarrationDimensionScore:
        if isinstance(data, dict):
            s = int(data.get("score") or overall_score)
            status = data.get("status")
            if not status:
                status = "excellent" if s >= 85 else ("good" if s >= 72 else "needs_improvement")
            return NarrationDimensionScore(
                score=s,
                label=data.get("label") or default_label,
                status=status,
                feedback=data.get("feedback") or "",
            )
        return NarrationDimensionScore(
            score=overall_score,
            label=default_label,
            status="good",
            feedback="",
        )

    hook_score = _parse_dim(parsed.get("hook_score"), "Hook 30 Detik Pertama")
    retention_score = _parse_dim(parsed.get("retention_pacing_score"), "Pacing & Retensi (AVD)")
    emotion_score = _parse_dim(parsed.get("emotional_storytelling_score"), "Dramaturgi & Emosi")
    clarity_score = _parse_dim(parsed.get("clarity_delivery_score"), "Kelancaran Suara TTS")
    cta_score = _parse_dim(parsed.get("call_to_action_score"), "Resolusi & Payoff")

    improved_segments_raw = parsed.get("improved_segments") or []
    improved_segments = []
    if isinstance(improved_segments_raw, list):
        for item in improved_segments_raw:
            if isinstance(item, dict) and item.get("segment_id") and item.get("improved_text"):
                s_id = str(item["segment_id"])
                orig_prompt = item.get("original_visual_prompt") or seg_to_prompt.get(s_id) or ""
                improved_prompt = item.get("improved_visual_prompt") or ""
                improved_segments.append(
                    NarrationSegmentImprovement(
                        segment_id=s_id,
                        segment_index=int(item.get("segment_index") or 0),
                        chapter_title=item.get("chapter_title"),
                        original_text=str(item.get("original_text") or ""),
                        improved_text=str(item.get("improved_text") or ""),
                        change_summary=str(item.get("change_summary") or ""),
                        original_visual_prompt=str(orig_prompt).strip() if orig_prompt else None,
                        improved_visual_prompt=str(improved_prompt).strip() if improved_prompt else None,
                    )
                )

    has_improvements = bool(parsed.get("has_improvements", len(improved_segments) > 0))

    return StoryboardNarrationAnalysisResponse(
        overall_score=overall_score,
        grade=grade,
        summary=parsed.get("summary") or "Analisis naskah narasi YouTube selesai.",
        hook_score=hook_score,
        retention_pacing_score=retention_score,
        emotional_storytelling_score=emotion_score,
        clarity_delivery_score=clarity_score,
        call_to_action_score=cta_score,
        strengths=parsed.get("strengths") or [],
        weaknesses=parsed.get("weaknesses") or [],
        actionable_recommendations=parsed.get("actionable_recommendations") or [],
        has_improvements=has_improvements,
        improved_segments=improved_segments,
    )


async def apply_narration_improvements_to_project(
    db: AsyncSession,
    project_id: str,
    improved_segments: List[NarrationSegmentImprovement],
    update_visual_prompts: bool = True,
) -> Dict[str, Any]:
    """Apply approved improved narration texts and synchronized visual prompts to the project."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError("Project tidak ditemukan")

    res_nar = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
        .limit(1)
    )
    narration = res_nar.scalar_one_or_none()
    if not narration:
        raise ValueError("Naskah narasi tidak ditemukan")

    updated_segments = list(narration.segments or [])
    if not updated_segments:
        raise ValueError("Tidak ada segmen aktif pada naskah proyek")

    # Map improved segments by segment_id and segment_index
    upd_by_id: Dict[str, NarrationSegmentImprovement] = {}
    upd_by_idx: Dict[int, NarrationSegmentImprovement] = {}
    for imp in improved_segments:
        upd_by_id[str(imp.segment_id)] = imp
        upd_by_idx[imp.segment_index] = imp

    res_items = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index.asc())
    )
    items = res_items.scalars().all()

    applied_count = 0
    updated_visual_count = 0
    for idx, seg in enumerate(updated_segments):
        s_id = str(seg.get("id") or seg.get("segment_id") or f"seg-{idx + 1}")
        imp = upd_by_id.get(s_id) or upd_by_idx.get(idx)
        if imp and imp.improved_text:
            cleaned = clean_narration_for_tts(
                imp.improved_text,
                characters=proj.characters,
                locations=proj.locations,
                world_setting=proj.world_setting,
            )
            seg_dict = dict(seg)
            seg_dict["text"] = cleaned
            if imp.chapter_title:
                seg_dict["chapter"] = imp.chapter_title
            updated_segments[idx] = seg_dict
            applied_count += 1

            # Update storyboard items matching this segment
            for it in items:
                if str(it.segment_id) == s_id or it.order_index // max(1, len(items) // max(1, len(updated_segments))) == idx:
                    it.script_text = cleaned
                    if imp.chapter_title:
                        it.chapter_title = imp.chapter_title
                    # Synchronize visual prompt if enabled and provided
                    if update_visual_prompts and imp.improved_visual_prompt:
                        it.image_prompt = imp.improved_visual_prompt.strip()
                        updated_visual_count += 1
                    it.updated_at = datetime.utcnow()

    narration.segments = updated_segments
    flag_modified(narration, "segments")
    narration.raw_text = "\n\n".join(
        s.get("text", "").strip() for s in updated_segments if s.get("text")
    )
    narration.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(narration)

    log.info(
        "Successfully applied %d improved segments (and %d updated visual prompts) to project %s",
        applied_count,
        updated_visual_count,
        project_id,
    )

    return {
        "success": True,
        "applied_count": applied_count,
        "updated_visual_count": updated_visual_count,
        "total_segments": len(updated_segments),
        "segments": updated_segments,
    }
