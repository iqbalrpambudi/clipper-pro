import json
import logging
import re
import uuid
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.project import Project
from app.models.narration import Narration
from app.models.storyboard import StoryboardItem
from app.services.ai_adapters.factory import get_active_llm_adapter

log = logging.getLogger(__name__)


def build_storyboard_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    images_per_segment: int = 2,
    custom_instructions: Optional[str] = None,
) -> Tuple[str, str]:
    """Build system and user prompts for long-form storyboard scriptwriting."""
    target_words = max(500, int(duration_mins * 135))
    min_words = int(target_words * 0.85)
    max_words = int(target_words * 1.15)
    target_segments = max(10, duration_mins * 4)  # ~3-4 segments per minute

    system_prompt = (
        "Anda adalah Master Storyteller & Scriptwriter kelas dunia untuk video dokumenter/explainer YouTube "
        "(gaya MinutePhysics, Kurzgesagt, Big Think, atau channel storytelling sejarah/filsafat).\n"
        "Tugas Anda adalah menulis naskah narasi video panjang (landscape 16:9) yang mendalam, mengalir memikat, "
        "dan membagi naskah menjadi segmen-segmen adegan yang dilengkapi prompt visual ilustrasi gambar hand-drawn.\n\n"
        "=== ATURAN UTAMA PENULISAN ===\n"
        f"1. Target Durasi Suara: ~{duration_mins} menit (~{target_words} kata, rentang {min_words}-{max_words} kata).\n"
        f"2. Nada Bicara (Tone): {tone}. Menggunakan Bahasa Indonesia lisan yang hidup, cerdas, mengalir, dan bernyawa.\n"
        "3. Struktur Alur Cerita:\n"
        "   - Hook & Paradoks Awal: Pertanyaan atau fenomena mengejutkan di detik pertama.\n"
        "   - Eksplorasi Berlapis: Menyelami akar masalah / konteks sejarah / logika penjelasan secara runtut.\n"
        "   - Puncak Wawasan / Plot Twist: Konklusi pemikiran mendalam yang mengubah cara pandang penonton.\n"
        "   - Refleksi Penutup: Pesan mendalam yang membekas tanpa ajakan klise murahan.\n"
        f"4. Pembagian Segmen & Ilustrasi Visual:\n"
        f"   - Pecah cerita menjadi sekitar {target_segments} segmen berurutan.\n"
        f"   - Setiap segmen WAJIB memiliki narasi teks dan tepat {images_per_segment} prompt visual ilustrasi gambar.\n"
        "   - Prompt visual harus mendeskripsikan subjek konkret, aksi, dan metafora visual (contoh: 'A lonely human silhouette standing beneath a colossal glowing clock, gears ticking').\n"
        "   - DILARANG menyertakan teks, huruf, atau watermark dalam prompt visual.\n\n"
        "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
        "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup dengan struktur berikut:\n"
        "{\n"
        '  "title": "Judul Menarik Video",\n'
        '  "overview": "Sinopsis singkat 1-2 kalimat",\n'
        '  "chapters": [\n'
        "    {\n"
        '      "chapter_title": "Judul Bab / Babak",\n'
        '      "segments": [\n'
        "        {\n"
        '          "segment_id": "seg-1",\n'
        '          "narration_text": "Kalimat narasi yang siap dibacakan oleh voiceover TTS...",\n'
        '          "image_prompts": [\n'
        '            "Deskripsi visual adegan 1...",\n'
        '            "Deskripsi visual adegan 2..."\n'
        "          ]\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    user_prompt = (
        f"Topik Video: {topic}\n"
        f"Target Durasi: {duration_mins} menit (~{target_words} kata)\n"
        f"Tone: {tone}\n"
        f"Jumlah Gambar per Segmen: {images_per_segment}\n"
    )
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += "\nTuliskan naskah narasi lengkap dan prompt ilustrasi sekarang dalam format JSON murni:"
    return system_prompt, user_prompt


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
        # Search for first { and last }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError as err:
                log.error("Failed to parse extracted JSON substring: %s", err)
        raise ValueError("Gagal mengurai respons AI ke dalam format JSON naskah storyboard.")


async def generate_storyboard_script(
    db: AsyncSession,
    project_id: str,
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    images_per_segment: int = 2,
    custom_instructions: Optional[str] = None,
) -> Tuple[Narration, List[StoryboardItem]]:
    """Generate long-form storyboard script and save Narration + StoryboardItem records."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"Project {project_id} tidak ditemukan.")

    llm_adapter = await get_active_llm_adapter(db)
    system_prompt, user_prompt = build_storyboard_prompt(
        topic=topic,
        duration_mins=duration_mins,
        tone=tone,
        images_per_segment=images_per_segment,
        custom_instructions=custom_instructions,
    )

    log.info("Generating long-form storyboard script for project %s (topic=%s, dur=%dm)...", project_id, topic, duration_mins)
    raw_response = await llm_adapter.generate_text(
        prompt=user_prompt,
        system_instruction=system_prompt,
        temperature=0.7,
        max_tokens=6000,
    )

    data = extract_json_payload(raw_response)
    chapters = data.get("chapters", [])
    if not chapters:
        raise ValueError("Respons AI tidak mengandung data chapters.")

    # Flatten segments for the Narration model
    all_segments: List[Dict[str, Any]] = []
    full_script_lines: List[str] = []
    storyboard_items: List[StoryboardItem] = []

    motion_cycle = ["zoom_in", "zoom_out", "pan_left", "pan_right"]
    global_img_order = 0
    seg_counter = 1

    for chap_idx, chapter in enumerate(chapters):
        chap_title = chapter.get("chapter_title", f"Babak {chap_idx + 1}")
        for seg in chapter.get("segments", []):
            seg_id = f"seg-{seg_counter}"
            seg_text = (seg.get("narration_text") or "").strip()
            if not seg_text:
                continue

            full_script_lines.append(seg_text)
            img_prompts = seg.get("image_prompts", [])
            if not isinstance(img_prompts, list) or len(img_prompts) == 0:
                img_prompts = [f"Illustration representing {seg_text[:80]}"]

            all_segments.append({
                "id": seg_id,
                "chapter": chap_title,
                "text": seg_text,
                "image_count": len(img_prompts),
                "start_ms": 0,
                "end_ms": 0,
            })

            # Create StoryboardItem per image prompt
            for img_idx, prompt in enumerate(img_prompts[:3]):  # max 3 per segment
                motion = motion_cycle[global_img_order % len(motion_cycle)]
                item = StoryboardItem(
                    project_id=project_id,
                    chapter_title=chap_title,
                    segment_id=seg_id,
                    order_index=global_img_order,
                    script_text=seg_text,
                    image_prompt=str(prompt).strip(),
                    motion_effect=motion,
                    status="pending",
                )
                storyboard_items.append(item)
                global_img_order += 1

            seg_counter += 1

    # Delete older narration and storyboard items for this project
    await db.execute(delete(StoryboardItem).where(StoryboardItem.project_id == project_id))
    await db.execute(delete(Narration).where(Narration.project_id == project_id))

    narration = Narration(
        project_id=project_id,
        topic=topic,
        tone=tone,
        target_duration=duration_mins * 60,
        raw_text="\n\n".join(full_script_lines),
        segments=all_segments,
        status="generated",
    )
    db.add(narration)
    await db.flush()

    for item in storyboard_items:
        item.narration_id = narration.id
        db.add(item)

    proj.status = "ready"
    await db.commit()
    await db.refresh(narration)

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

    # Group items by segment_id
    items_by_seg: Dict[str, List[StoryboardItem]] = {}
    for item in items:
        items_by_seg.setdefault(item.segment_id, []).append(item)

    # Distribute timing
    for seg in aligned_segments:
        seg_id = seg.get("id")
        if not seg_id or seg_id not in items_by_seg:
            continue

        seg_start_sec = float(seg.get("start_ms", 0)) / 1000.0
        seg_end_sec = float(seg.get("end_ms", 0)) / 1000.0
        seg_duration = max(seg_end_sec - seg_start_sec, 1.0)

        seg_items = items_by_seg[seg_id]
        count = len(seg_items)
        if count == 0:
            continue

        slot_dur = seg_duration / count
        for idx, item in enumerate(seg_items):
            item.start_time = round(seg_start_sec + (idx * slot_dur), 3)
            item.end_time = round(seg_start_sec + ((idx + 1) * slot_dur), 3)
            item.duration = round(slot_dur, 3)

    await db.commit()
    log.info("Synchronized timing for %d storyboard items in project %s.", len(items), project_id)
