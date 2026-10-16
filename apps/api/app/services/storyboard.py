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
        "   - GAYA PROMPT VISUAL (WAJIB): Tulis prompt dalam Bahasa Inggris ringkas. Gambarkan karakter doodle minimalis yang ekspresif (kepala bulat, mata titik kecil hitam, rambut hitam santai) atau metafora visual yang bersih dengan 1-2 properti esensial, banyak ruang kosong (ample negative space), dan aksen warna cat air lembut di atas latar belakang putih bersih. Contoh: 'A small minimalist doodle character sitting thoughtfully on a wooden stool, holding an old compass, with a single potted plant nearby on plain white background'.\n"
        "   - DILARANG menyertakan teks, tulisan, huruf, frame, atau watermark dalam prompt visual.\n\n"
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


def _split_text_into_subsegments(text: str, n_parts: int) -> List[str]:
    """Split segment text into n_parts subsegments aligned with visual cues."""
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
            parts.append(" ".join(sentences[start_idx:end_idx]))
        return parts

    # Fewer sentences than parts: Try splitting by clauses
    clause_delims = r"(?<=[,;:\—\-])\s+|(?<=\s)(?:namun|tetapi|sedangkan|sehingga|sementara|lalu|kemudian)\s+"
    raw_clauses = re.split(clause_delims, text, flags=re.IGNORECASE)
    clauses = [c.strip() for c in raw_clauses if c.strip()]
    if len(clauses) >= n_parts:
        parts = []
        step = len(clauses) / n_parts
        for i in range(n_parts):
            start_idx = int(round(i * step))
            end_idx = int(round((i + 1) * step))
            parts.append(" ".join(clauses[start_idx:end_idx]))
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
    raw_response = await llm_adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=system_prompt,
        json_mode=True,
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
            seg_text = (seg.get("narration_text") or "").strip()
            if not seg_text:
                continue

            img_prompts = seg.get("image_prompts", [])
            if not isinstance(img_prompts, list) or len(img_prompts) == 0:
                img_prompts = [f"Illustration representing {seg_text[:80]}"]

            # Every segment narration must represent its visual image 1-to-1.
            # If a segment has multiple images, split the segment into subsegments.
            if len(img_prompts) > 1:
                sub_texts = _split_text_into_subsegments(seg_text, len(img_prompts))
                for sub_idx, (sub_text, prompt) in enumerate(zip(sub_texts, img_prompts)):
                    sub_seg_id = f"seg-{seg_counter}_{sub_idx + 1}"
                    all_segments.append({
                        "id": sub_seg_id,
                        "chapter": chap_title,
                        "text": sub_text,
                        "image_count": 1,
                        "start_ms": 0,
                        "end_ms": 0,
                    })
                    full_script_lines.append(sub_text)

                    motion = motion_cycle[global_img_order % len(motion_cycle)]
                    item = StoryboardItem(
                        project_id=project_id,
                        chapter_title=chap_title,
                        segment_id=sub_seg_id,
                        order_index=global_img_order,
                        script_text=sub_text,
                        image_prompt=str(prompt).strip(),
                        motion_effect=motion,
                        status="pending",
                    )
                    storyboard_items.append(item)
                    global_img_order += 1
            else:
                single_seg_id = f"seg-{seg_counter}"
                all_segments.append({
                    "id": single_seg_id,
                    "chapter": chap_title,
                    "text": seg_text,
                    "image_count": 1,
                    "start_ms": 0,
                    "end_ms": 0,
                })
                full_script_lines.append(seg_text)

                motion = motion_cycle[global_img_order % len(motion_cycle)]
                item = StoryboardItem(
                    project_id=project_id,
                    chapter_title=chap_title,
                    segment_id=single_seg_id,
                    order_index=global_img_order,
                    script_text=seg_text,
                    image_prompt=str(img_prompts[0]).strip(),
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

    aligned_map = {seg.get("id"): seg for seg in aligned_segments if seg.get("id")}

    # Group items by segment_id
    items_by_seg: Dict[str, List[StoryboardItem]] = {}
    for item in items:
        items_by_seg.setdefault(item.segment_id, []).append(item)

    # Distribute timing
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

    await db.commit()
    log.info("Synchronized timing for %d storyboard items in project %s.", len(items), project_id)
