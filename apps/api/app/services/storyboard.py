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

    # 4 to 5 seconds per image (~10-14 spoken words per scene)
    total_scenes = max(12, int((duration_mins * 60) / 4.5))
    target_segments = max(6, int(total_scenes / max(1, images_per_segment)))

    system_prompt = (
        "Anda adalah Master Storyteller, Sutradara Visual & Scriptwriter kelas dunia untuk video dokumenter/explainer YouTube "
        "(gaya MinutePhysics, Kurzgesagt, Big Think, atau channel storytelling sejarah & sains populer).\n"
        "Tugas Anda adalah menulis naskah narasi video panjang (landscape 16:9) yang mendalam, memikat, dan terstruktur "
        "ke dalam adegan-adegan visual (scenes) dengan sinkronisasi 1-to-1 yang SEMPURNA antara kalimat narasi dan prompt gambar sketsa hand-drawn.\n\n"
        "=== PRINSIP KEKUATAN AUDIO-VISUAL (SINKRON & TIDAK AMBIGU) ===\n"
        "1. KOPLING 1-TO-1 (1 Adegan = Tepat 1 Kalimat Narasi & 1 Prompt Visual):\n"
        f"   - Setiap segmen dipecah menjadi tepat sejumlah adegan (scenes) sesuai parameter `Jumlah Gambar per Segmen` ({images_per_segment} scene).\n"
        "   - Setiap adegan (scene) WAJIB memiliki `narration_text` dan `image_prompt` yang berpasangan secara langsung.\n"
        "   - `narration_text`: Tepat 1 kalimat utuh, tuntas, dan alami (panjang 8–14 kata, setara durasi bicara ideal 4–5 detik). JANGAN membuat paragraf panjang atau menggabungkan banyak ide dalam satu adegan.\n"
        "   - `image_prompt`: Prompt ilustrasi visual (Bahasa Inggris) yang SECARA LITERAL DAN LANGSUNG merepresentasikan subjek konkret, aksi penceritaan, atau metafora visual yang dibicarakan dalam kalimat `narration_text` tersebut. JANGAN membuat gambar yang tidak nyambung, abstrak tanpa konteks, atau melompat ke topik lain!\n\n"
        "2. KESINAMBUNGAN BERCERITA (VISUAL PROGRESSION):\n"
        f"   - Dalam 1 segmen yang berisi {images_per_segment} adegan, bangun kesinambungan cerita sebab-akibat yang dinamis:\n"
        "     * Adegan 1: Menampilkan aksi awal / premis / observasi (mis. karakter stickman mengamati fenomena atau memegang instrumen kuno).\n"
        "     * Adegan 2: Menampilkan reaksi / konsekuensi logis / perubahan situasi dramatis (mis. jarum instrumen berputar liar atau badai mendadak datang).\n"
        "   - Penonton harus merasakan keterhubungan visual yang mengalir mulus dari detik ke detik tanpa kebingungan.\n\n"
        "3. GAYA VISUAL STICKMAN PARCHMENT (WAJIB DIIKUTI KONSISTEN):\n"
        "   - Karakter: Karakter stickman / doodle minimalis khas (smooth round bald white head without hair, expressive black dot eyes, thin stick limbs, mengenakan jubah/kain longgar bertumpuk earthy-toned robes atau busana sederhana).\n"
        "   - Aksi & Properti: Tindakan bercerita yang jelas dengan properti kontekstual esensial (mis. bejana tanah liat, gulungan naskah kuno, kompas kuno, diagram rasi bintang bergaris putus-putus).\n"
        "   - Latar: Kertas perkamen antik hangat (warm vintage tea-stained parchment paper background) dengan tekstur sapuan cat air gurun/terracotta/ochre yang lembut.\n"
        "   - LARANGAN KERAS: DILARANG menyertakan teks, tulisan, huruf, label, speech bubbles, frame/bingkai tepi, atau watermark di dalam prompt visual.\n\n"
        "4. TARGET PANJANG & TONE:\n"
        f"   - Target Total Durasi: ~{duration_mins} menit (~{target_words} kata, rentang {min_words}–{max_words} kata).\n"
        f"   - Nada Bicara (Tone): {tone}. Bahasa Indonesia lisan yang hidup, cerdas, mengalir, dan bernyawa.\n"
        "   - Struktur Alur Cerita: Hook & Paradoks di awal ➔ Eksplorasi Berlapis ➔ Puncak Wawasan / Plot Twist ➔ Refleksi Penutup yang membekas.\n\n"
        "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
        "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup dengan struktur hierarkis berikut:\n"
        "{\n"
        '  "title": "Judul Menarik Video",\n'
        '  "overview": "Sinopsis singkat 1-2 kalimat",\n'
        '  "chapters": [\n'
        "    {\n"
        '      "chapter_title": "Babak 1: Misteri di Lautan Lepas",\n'
        '      "segments": [\n'
        "        {\n"
        '          "segment_id": "seg-1",\n'
        '          "scenes": [\n'
        "            {\n"
        '              "scene_id": "scene-1",\n'
        '              "narration_text": "Di tengah samudra yang tampak tenang, para pelaut kuno mengarungi ombak hanya berpedoman pada rasi bintang.",\n'
        '              "image_prompt": "A minimalist stickman sailor in a draped robe standing at the wooden bow of an ancient ship, looking up through a brass spyglass at constellations drawn with dotted lines, smooth round bald white head, dot eyes, warm vintage parchment background with desert watercolor washes."\n'
        "            },\n"
        "            {\n"
        '              "scene_id": "scene-2",\n'
        '              "narration_text": "Namun saat kabut pekat mendadak turun, jarum kompas mereka tiba-tiba berputar liar dan kehilangan arah utara.",\n'
        '              "image_prompt": "The stickman sailor holding a vintage brass compass in utter shock as the needle spins frantically with motion blur lines, thick swirling fog around, smooth round bald head, dot eyes, loose robe, warm parchment background."\n'
        "            }\n"
        "          ]\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    user_prompt = (
        f"Topik Video: {topic}\n"
        f"Target Durasi: {duration_mins} menit (~{target_words} kata, sekitar {target_segments} segmen)\n"
        f"Tone: {tone}\n"
        f"Jumlah Gambar per Segmen: {images_per_segment} adegan per segmen (tepat {images_per_segment} scene per segmen)\n"
    )
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nTuliskan naskah narasi lengkap sekarang dalam format JSON murni. "
        f"Pastikan setiap segmen memiliki tepat {images_per_segment} scenes, di mana setiap scene berisi 1 kalimat narasi utuh (8–14 kata) "
        f"dan 1 prompt visual Bahasa Inggris yang 100% cocok secara literal tanpa ambiguitas."
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
            scenes = seg.get("scenes")

            # PRIMARY FORMAT: 1-to-1 Discrete Scenes inside each segment
            if isinstance(scenes, list) and len(scenes) > 0:
                for scene_idx, scene in enumerate(scenes):
                    scene_text = (scene.get("narration_text") or "").strip()
                    scene_prompt = (scene.get("image_prompt") or "").strip()
                    if not scene_text and not scene_prompt:
                        continue
                    if not scene_text:
                        scene_text = "..."
                    if not scene_prompt:
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

                    motion = motion_cycle[global_img_order % len(motion_cycle)]
                    item = StoryboardItem(
                        project_id=project_id,
                        chapter_title=chap_title,
                        segment_id=sub_seg_id,
                        order_index=global_img_order,
                        script_text=scene_text,
                        image_prompt=scene_prompt,
                        motion_effect=motion,
                        status="pending",
                    )
                    storyboard_items.append(item)
                    global_img_order += 1

                seg_counter += 1
                continue

            # SECONDARY / FALLBACK FORMAT: segment with narration_text and image_prompts list
            seg_text = (seg.get("narration_text") or "").strip()
            if not seg_text:
                continue

            img_prompts = seg.get("image_prompts", [])
            if not isinstance(img_prompts, list) or len(img_prompts) == 0:
                img_prompts = [f"Illustration representing {seg_text[:80]}"]

            # If a segment has multiple images, split the segment into subsegments
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
