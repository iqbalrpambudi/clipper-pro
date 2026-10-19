import asyncio
import json
import logging
import re
import time
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.storage import storage
from app.core.security import decrypt_secret
from app.models.project import Project
from app.models.narration import Narration
from app.models.storyboard import StoryboardItem
from app.models.config import ModelConfig
from app.models.image_preset import ImagePreset
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.image_gen import generate_single_image
from app.services.image_studio import get_active_image_preset

log = logging.getLogger(__name__)


def format_ms_to_timestamp(ms: float) -> str:
    """Format milliseconds into YouTube timestamp MM:SS or HH:MM:SS."""
    seconds = int(ms // 1000)
    minutes = seconds // 60
    secs = seconds % 60
    hours = minutes // 60
    if hours > 0:
        minutes = minutes % 60
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def format_seconds_to_timestamp(sec: float) -> str:
    """Format seconds into YouTube timestamp MM:SS or HH:MM:SS."""
    return format_ms_to_timestamp(sec * 1000)


async def generate_youtube_metadata(
    db: AsyncSession,
    project_id: str,
    focus_angle: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    language: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate high-CTR YouTube video title, alternative titles, SEO description with chapters, tags, and thumbnail visual prompt."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError("Project tidak ditemukan")

    target_lang = (language or proj.language or "id").strip().lower()

    # Fetch latest narration
    res_narration = await db.execute(
        select(Narration)
        .where(Narration.project_id == project_id)
        .order_by(Narration.created_at.desc())
        .limit(1)
    )
    narration = res_narration.scalar_one_or_none()

    # Fetch storyboard items
    res_items = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index.asc())
    )
    items = res_items.scalars().all()

    # Fetch active visual preset
    active_preset = await get_active_image_preset(db)
    preset_name = active_preset.name if active_preset else "Minimalist Storytelling Illustration"
    preset_master = (active_preset.master_prompt if active_preset else "").strip()

    # Prepare project summary / narration text
    narration_text = (narration.raw_text if narration and narration.raw_text else "").strip()
    if not narration_text and items:
        narration_text = " ".join(it.script_text for it in items if it.script_text).strip()

    # Extract or synthesize chapter milestones for timestamps
    chapter_milestones: List[Dict[str, str]] = []
    seen_chapters = set()

    if items:
        for it in items:
            c_title = (it.chapter_title or "").strip()
            if c_title and c_title not in seen_chapters:
                seen_chapters.add(c_title)
                ts = format_seconds_to_timestamp(it.start_time or 0.0)
                # Clean up title like "Babak 1: Misteri" -> "Misteri"
                clean_name = re.sub(r"^(babak|chapter)\s*\d+\s*:\s*", "", c_title, flags=re.IGNORECASE).strip()
                chapter_milestones.append({"timestamp": ts, "title": clean_name or c_title})

    # If no timed storyboard chapters found, check narration segments
    if not chapter_milestones and narration and narration.segments:
        for seg in narration.segments:
            st = seg.get("start_time") or (seg.get("start_ms", 0) / 1000.0)
            txt = (seg.get("text") or "").strip()
            if txt:
                words = txt.split()
                short_title = " ".join(words[:4]) + ("..." if len(words) > 4 else "")
                chapter_milestones.append({
                    "timestamp": format_seconds_to_timestamp(st),
                    "title": short_title,
                })
            if len(chapter_milestones) >= 6:
                break

    # If still empty, provide default chapter breakdown
    if not chapter_milestones:
        if target_lang == "en":
            chapter_milestones = [
                {"timestamp": "00:00", "title": "Hook & The Unsolved Mystery"},
                {"timestamp": "01:15", "title": "The Hidden Reality"},
                {"timestamp": "02:45", "title": "Turning Point & Breakthrough"},
                {"timestamp": "04:10", "title": "Conclusion & Final Thoughts"},
            ]
        else:
            chapter_milestones = [
                {"timestamp": "00:00", "title": "Pembuka & Misteri Awal"},
                {"timestamp": "01:15", "title": "Fakta Tersembunyi"},
                {"timestamp": "02:45", "title": "Titik Balik & Analisis"},
                {"timestamp": "04:10", "title": "Kesimpulan & Pelajaran"},
            ]
    elif chapter_milestones[0]["timestamp"] != "00:00":
        # YouTube requires first chapter to be 00:00
        chapter_milestones[0]["timestamp"] = "00:00"

    chapter_text_lines = "\n".join(f"{cm['timestamp']} - {cm['title']}" for cm in chapter_milestones[:8])

    # Extract Continuity Bible Sheets (Characters, Locations, World Setting)
    characters = proj.characters or []
    locations = proj.locations or []
    world_setting = proj.world_setting or {}

    main_char_token = ""
    main_char_name = ""
    main_char_desc = ""
    char_summary_lines: List[str] = []
    if characters:
        first_c = characters[0]
        main_char_name = first_c.get("name") or "Main Protagonist"
        first_v = (first_c.get("variants") or [{}])[0].get("id") or ""
        main_char_token = f"[char:{first_c.get('id')}:{first_v}]" if first_v else f"[char:{first_c.get('id')}]"
        main_char_desc = f"{first_c.get('name')} ({first_c.get('visual_anchor') or ''})"

        for c in characters:
            c_id = c.get("id", "")
            c_name = c.get("name", "")
            c_anchor = c.get("visual_anchor", "")
            variants = c.get("variants") or []
            v_desc = ", ".join(f"`[char:{c_id}:{v['id']}]` ({v.get('name', '')}: {v.get('description', '')})" for v in variants)
            char_summary_lines.append(f"- Character {c_name} (`[char:{c_id}]`): {c_anchor}. Variants: {v_desc or 'Standard'}")

    main_loc_token = ""
    loc_summary_lines: List[str] = []
    if locations:
        first_l = locations[0]
        main_loc_token = f"[loc:{first_l.get('id')}]"
        for l in locations:
            loc_summary_lines.append(f"- Location {l.get('name', '')} (`[loc:{l.get('id', '')}]`): {l.get('visual_anchor', '')}")

    era = world_setting.get("era") or ""
    atmo = world_setting.get("atmosphere") or ""

    bible_summary = ""
    if char_summary_lines or loc_summary_lines or era:
        bible_summary = "\n=== STORY CONTINUITY BIBLE (CHARACTERS, LOCATIONS, ERA) ===\n"
        if char_summary_lines:
            bible_summary += "Characters Sheet:\n" + "\n".join(char_summary_lines) + "\n"
        if loc_summary_lines:
            bible_summary += "Locations Sheet:\n" + "\n".join(loc_summary_lines) + "\n"
        if era or atmo:
            bible_summary += f"Story Era: {era}. Atmosphere: {atmo}.\n"
        bible_summary += "\n"

    # Build Angle Instruction
    angle_instruction = ""
    if target_lang == "en":
        if focus_angle == "curiosity_gap":
            angle_instruction = "PRIMARY FOCUS: Maximum Curiosity Gap — make viewers feel compelled to discover the answer immediately."
        elif focus_angle == "question":
            angle_instruction = "PRIMARY FOCUS: Provocative / paradoxical question that triggers debate and intense interest."
        elif focus_angle == "storytelling":
            angle_instruction = "PRIMARY FOCUS: Epic narrative arc & suspense — dramatic storytelling angle."
        elif focus_angle == "educational":
            angle_instruction = "PRIMARY FOCUS: Scientific explanation & deep insights — structured, authoritative, and fascinating."

        system_prompt = (
            "You are a world-class YouTube Strategist, Packaging Expert & Creative Director (specializing in viral high-CTR videos "
            "like Veritasium, Lemmino, Kurzgesagt, Big Think, Vox, and top storytelling documentary channels).\n"
            "Your task is to craft a comprehensive YouTube release package in ENGLISH that maximizes Click-Through Rate (CTR) and viewer retention.\n\n"
            "=== CRITICAL LANGUAGE INSTRUCTION ===\n"
            "All titles, descriptions, chapters, tags, and hook lines MUST be in natural, compelling ENGLISH.\n\n"
            "=== STRICT OUTPUT STANDARDS ===\n"
            "1. `title` (Main Title):\n"
            "   - Under 70 characters (avoids being cut off on YouTube mobile).\n"
            "   - Powerful, high Curiosity Gap, non-cliché, punchy, and algorithm-friendly.\n\n"
            "2. `title_options` (4-5 Alternative Title Variations in English):\n"
            "   - Option 1: Extreme Curiosity Gap angle.\n"
            "   - Option 2: Provocative question angle.\n"
            "   - Option 3: Plot twist / shocking revelation angle.\n"
            "   - Option 4: Epic storytelling / historical mystery angle.\n"
            "   - Option 5: Deep analysis / educational breakdown angle.\n\n"
            "3. `description` (Full YouTube Description in English):\n"
            "   - Lines 1-3: Compelling hook before the '...more' fold.\n"
            "   - Paragraph 2: Concise synopsis and the core value/revelation viewers will gain.\n"
            "   - Chapters / Timestamps section: Clean list using the provided milestones (e.g. 00:00 - ...).\n"
            "   - Call To Action (CTA): Engagement prompt, question for comments, subscribe/like invitation.\n"
            "   - Final line: 3-5 relevant English hashtags (#Science #History #Documentary #Explainer etc).\n\n"
            "4. `tags` (Array of 15-20 English search keywords):\n"
            "   - Mix of broad keywords and specific long-tail query tags.\n\n"
            "5. `thumbnail_hook_line1`:\n"
            "   - Line 1 Thumbnail Text (1-3 short words, ALL CAPS, bold impact, e.g. 'THE LOST EMPIRE', 'WHAT THEY HID', 'BEFORE THE FALL').\n\n"
            "6. `thumbnail_hook_line2`:\n"
            "   - Line 2 Hook Text (1-3 provocative words with punctuation, e.g. 'NEVER TOLD?!', 'WHY NOW?!', 'TOTALLY ERASED?!').\n\n"
            "7. `thumbnail_concept`:\n"
            "   - Thumbnail visual concept explanation in English (1-2 sentences on character emotion, contrast, visual hooks).\n\n"
            "8. `thumbnail_prompt`:\n"
            "   - Detailed visual prompt in ENGLISH for AI Image Generator (16:9 widescreen landscape).\n"
            "   - COMPOSITION & STORY CONTINUITY (CRITICAL - MUST FEATURE THE ACTUAL STORY CHARACTERS & SETTING):\n"
            f"     * In one foreground side (left or right 1/3 of frame), prominently feature the MAIN PROTAGONIST character from the Continuity Bible: {main_char_desc or 'the story protagonist'} using token `{main_char_token or '[char:protagonist]'}` with intense, captivating facial expression (shock, intense determination, astonishment, or holding a story relic) facing towards the viewer.\n"
            "     * NEVER depict a generic stickman, bald white head, or unrelated generic figure unless the character sheet specifically calls for it! The thumbnail character MUST match the hero of the video.\n"
            f"     * In the background, depict the iconic story setting {main_loc_token or 'the story setting'} reflecting the story timeline/era ({era or 'the story era'}).\n"
            "     * Leave clean, open negative space on the opposite side of the character for bold typography overlay.\n"
            f"     * Apply preset token `[preset:style]` ({preset_name}).\n"
            "     * STRICTLY NO TEXT, WORDS, OR LETTERS inside the image itself!\n\n"
            "=== OUTPUT FORMAT (PURE JSON ONLY) ===\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "title": "Punchy Main Title in English",\n'
            '  "title_options": ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],\n'
            '  "description": "Full description with hook, synopsis, timestamps, CTA, and hashtags...",\n'
            '  "tags": ["tag 1", "tag 2", "tag 3", "..."],\n'
            '  "thumbnail_hook_line1": "HOOK LINE 1",\n'
            '  "thumbnail_hook_line2": "HOOK LINE 2?!",\n'
            '  "thumbnail_concept": "Visual concept description...",\n'
            '  "thumbnail_prompt": "A high-CTR YouTube thumbnail illustration (16:9 widescreen). In the right foreground ..."\n'
            "}"
        )
    else:
        if focus_angle == "curiosity_gap":
            angle_instruction = "FOKUS UTAMA: Curiosity Gap maksimal — buat penonton merasa 'harus tahu jawabannya sekarang juga'."
        elif focus_angle == "question":
            angle_instruction = "FOKUS UTAMA: Pertanyaan provokatif / paradoks yang memancing perdebatan dan keingintahuan penonton."
        elif focus_angle == "storytelling":
            angle_instruction = "FOKUS UTAMA: Alur cerita & misteri epik — sudut pandang kisah nyata yang dramatis."
        elif focus_angle == "educational":
            angle_instruction = "FOKUS UTAMA: Penjelasan ilmiah & wawasan mendalam — terstruktur, informatif, dan otoritatif."

        system_prompt = (
            "Anda adalah YouTube Strategist, Packaging Expert & Creative Director kelas dunia (spesialis video viral ber-CTR tinggi "
            "seperti Veritasium, Lemmino, Kurzgesagt, Big Think, Vox, dan channel storytelling dokumenter Indonesia).\n"
            "Tugas Anda adalah merancang paket publikasi YouTube lengkap yang memaksimalkan Click-Through Rate (CTR) dan retensi penonton.\n\n"
            "=== STANDAR KELUARAN YANG WAJIB DIIKUTI ===\n"
            "1. `title` (Judul Utama):\n"
            "   - Panjang di bawah 70 karakter (agar tidak terpotong di YouTube mobile).\n"
            "   - Kuat, memicu rasa penasaran mendalam (Curiosity Gap), tidak klise, berbobot, dan ramah SEO algoritma.\n\n"
            "2. `title_options` (4-5 Variasi Judul Alternatif):\n"
            "   - Opsi 1: Sudut 'Curiosity Gap' ekstrim.\n"
            "   - Opsi 2: Sudut Pertanyaan Provokatif.\n"
            "   - Opsi 3: Sudut 'Plot Twist' / Fakta Mengejutkan.\n"
            "   - Opsi 4: Sudut Bercerita / Misteri Epik.\n"
            "   - Opsi 5: Sudut Edukatif / Analisis Tajam.\n\n"
            "3. `description` (Deskripsi Video YouTube Lengkap):\n"
            "   - Baris 1-3: Hook kuat yang memikat penonton sebelum tombol '...more' (Show More).\n"
            "   - Paragraf 2: Sinopsis ringkas isi video dan pelajaran berharga yang didapat.\n"
            "   - Bagian Timestamps / Chapters: Susun rapi menggunakan daftar bab yang diberikan (misal: 00:00 - ...).\n"
            "   - Bagian Call to Action: Ajak like, subscribe, share, dan pertanyaan pemantik untuk penonton berdiskusi di kolom komentar.\n"
            "   - Baris terakhir: 3-5 Hashtags relevan (misal: #Sains #Sejarah #Dokumenter).\n\n"
            "4. `tags` (Array 15-20 kata kunci):\n"
            "   - Campuran broad keywords (sejarah, sains, dokumenter) dan long-tail keywords spesifik topik.\n\n"
            "5. `thumbnail_hook_line1`:\n"
            "   - Teks Utama Baris 1 Thumbnail (1-3 kata pendek, huruf kapital, sangat memikat).\n\n"
            "6. `thumbnail_hook_line2`:\n"
            "   - Teks Hook Baris 2 Thumbnail (1-3 kata provokatif/pertanyaan dengan tanda tanya/seru).\n\n"
            "7. `thumbnail_concept`:\n"
            "   - Penjelasan konsep visual thumbnail dalam 1-2 kalimat Bahasa Indonesia (fokus emosi karakter, kontras warna, elemen visual hook).\n\n"
            "8. `thumbnail_prompt`:\n"
            "   - Prompt visual detail dalam BAHASA INGGRIS untuk AI Image Generator (16:9 widescreen landscape).\n"
            "   - KOMPOSISI & KONSISTENSI TOKOH BIBLE SHEET (SANGAT PENTING - WAJIB KONSISTEN DENGAN ISI VIDEO):\n"
            f"     * Di salah satu sisi foreground (kanan atau kiri 1/3 frame), tampilkan TOKOH UTAMA dari Character Bible Sheet: {main_char_desc or 'tokoh utama cerita'} menggunakan token `{main_char_token or '[char:id]'}` dengan ekspresi wajah dramatis dan memikat (kaget, heran, takjub, atau memegang benda pusaka/kunci cerita) menghadap penonton.\n"
            "     * DILARANG KERAS memunculkan karakter stickman botak atau kepala putih generik! Tokoh di thumbnail HARUS sama persis dengan tokoh utama di dalam naskah/storyboard.\n"
            f"     * Di latar belakang, hadirkan pemandangan ikonik dari Location Sheet: {main_loc_token or 'latar tempat utama cerita'} dengan atmosfer era ({era or 'era cerita'}).\n"
            "     * Sisakan ruang kosong (negative space) yang bersih di sisi berlawanan untuk penempatan teks tebal (bold typography overlay).\n"
            f"     * Sisipkan token gaya visual `[preset:style]` ({preset_name}).\n"
            "     * DILARANG MEMUAT TEKS, TULISAN, KATA, HURUF, ANGKA, ATAU WATERMARK DI DALAM GAMBAR KARENA TEKS AKAN DILAPISKAN SECARA TERPISAH!\n\n"
            "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
            "Kembalikan HANYA JSON valid dengan kunci:\n"
            "{\n"
            '  "title": "Judul Utama Ringkas & Menarik",\n'
            '  "title_options": ["Judul 1", "Judul 2", "Judul 3", "Judul 4", "Judul 5"],\n'
            '  "description": "Deskripsi lengkap dengan hook, sinopsis, timestamps bab, CTA, dan hashtags...",\n'
            '  "tags": ["tag 1", "tag 2", "tag 3", "..."],\n'
            '  "thumbnail_hook_line1": "TEKS BARIS 1",\n'
            '  "thumbnail_hook_line2": "TEKS BARIS 2?!",\n'
            '  "thumbnail_concept": "Konsep visual thumbnail dalam Bahasa Indonesia...",\n'
            '  "thumbnail_prompt": "A high-CTR YouTube thumbnail illustration (16:9 widescreen). In the right foreground ..."\n'
            "}"
        )

    truncated_narration = narration_text[:3500] if narration_text else ("In-depth documentary explainer video." if target_lang == "en" else "Video dokumenter eksploratif mendalam.")
    if target_lang == "en":
        user_prompt = (
            f"Video Topic / Project Title: {proj.name}\n"
            f"Active Visual Preset: {preset_name}\n"
            f"Target Language: ENGLISH\n"
            f"{bible_summary}"
        )
        if angle_instruction:
            user_prompt += f"{angle_instruction}\n"
        if custom_prompt:
            user_prompt += f"User Custom Instructions: {custom_prompt}\n"

        user_prompt += (
            f"\nNarration / Video Script Summary:\n\"\"\"{truncated_narration}\"\"\"\n\n"
            f"Milestones / Video Timestamps:\n{chapter_text_lines}\n\n"
            "Generate the complete YouTube metadata package & thumbnail prompt now in pure JSON format!"
        )
    else:
        user_prompt = (
            f"Topik Video / Judul Project: {proj.name}\n"
            f"Gaya Visual Aktif: {preset_name}\n"
            f"Bahasa Sasaran: BAHASA INDONESIA\n"
            f"{bible_summary}"
        )
        if angle_instruction:
            user_prompt += f"{angle_instruction}\n"
        if custom_prompt:
            user_prompt += f"Instruksi Khusus dari Pengguna: {custom_prompt}\n"

        user_prompt += (
            f"\nRingkasan / Naskah Narasi Video:\n\"\"\"{truncated_narration}\"\"\"\n\n"
            f"Daftar Milestone Bab / Timestamp Video:\n{chapter_text_lines}\n\n"
            "Buat paket metadata YouTube lengkap & thumbnail prompt sekarang dalam format JSON murni!"
        )

    llm_adapter = await get_active_llm_adapter(db)
    raw_res = await llm_adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=system_prompt,
        json_mode=True,
        timeout=60.0,
        max_tokens=2500,
    )

    # Parse JSON
    parsed = {}
    try:
        parsed = json.loads(raw_res.strip())
    except Exception:
        # Regex fallback
        m = re.search(r"(\{.*\})", raw_res, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(1))
            except Exception:
                pass

    char_token_fallback = main_char_token or "the main protagonist"
    loc_token_fallback = main_location_token or f"the scenic landscape of {proj.name}"
    era_fallback = f"in {era}" if era else "in the story era"

    if not parsed or not isinstance(parsed, dict):
        words = proj.name.upper().split()
        if target_lang == "en":
            hook1 = " ".join(words[:2]) if words else "REAL MYSTERY"
            hook2 = " ".join(words[2:]) + "?!" if len(words) > 2 else "WHAT HAPPENED?!"
            parsed = {
                "title": proj.name,
                "title_options": [proj.name],
                "description": f"Engaging documentary video exploring {proj.name}.\n\n{chapter_text_lines}\n\nDon't forget to Like & Subscribe!\n#Video #Documentary #Explainer",
                "tags": [proj.name, "documentary", "story", "explainer", "history"],
                "thumbnail_hook_line1": hook1,
                "thumbnail_hook_line2": hook2,
                "thumbnail_concept": f"Dramatic shot of {main_char_name or 'the main protagonist'} in the foreground facing viewer with scenic high-contrast background.",
                "thumbnail_prompt": f"A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right foreground, an intense dramatic shot of {char_token_fallback} with vivid facial expression looking at the viewer. In the background, breathtaking scenery of {loc_token_fallback} {era_fallback}, golden cinematic lighting, high contrast, clean negative space on left side for bold text overlay, rendered in [preset:style], no text in image.",
            }
        else:
            hook1 = " ".join(words[:2]) if words else "MISTERI NYATA"
            hook2 = " ".join(words[2:]) + "?!" if len(words) > 2 else "TERNYATA BEGINI?!"
            parsed = {
                "title": proj.name,
                "title_options": [proj.name],
                "description": f"Video dokumenter menarik mengenai {proj.name}.\n\n{chapter_text_lines}\n\nJangan lupa Like & Subscribe!\n#Video #Dokumenter",
                "tags": [proj.name, "dokumenter", "cerita", "edukasi"],
                "thumbnail_hook_line1": hook1,
                "thumbnail_hook_line2": hook2,
                "thumbnail_concept": f"Karakter utama {main_char_name or 'cerita'} di foreground kanan dengan ekspresi dramatis dan latar belakang pemandangan megah kontras tinggi.",
                "thumbnail_prompt": f"A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right foreground, an intense dramatic shot of {char_token_fallback} with vivid facial expression looking at the viewer. In the background, breathtaking scenery of {loc_token_fallback} {era_fallback}, golden cinematic lighting, high contrast, clean negative space on left side for bold text overlay, rendered in [preset:style], no text in image.",
            }

    # Merge into existing project youtube_metadata
    curr_meta = dict(proj.youtube_metadata or {})
    curr_meta["title"] = parsed.get("title") or proj.name
    curr_meta["title_options"] = parsed.get("title_options") or [curr_meta["title"]]
    curr_meta["description"] = parsed.get("description") or ""
    curr_meta["tags"] = parsed.get("tags") or []
    curr_meta["thumbnail_concept"] = parsed.get("thumbnail_concept") or ""
    curr_meta["thumbnail_prompt"] = parsed.get("thumbnail_prompt") or ""

    hook1 = (parsed.get("thumbnail_hook_line1") or "MISTERI BESAR").strip().upper()
    hook2 = (parsed.get("thumbnail_hook_line2") or "TERNYATA BEGINI?!").strip().upper()
    curr_meta["thumbnail_hook_line1"] = hook1
    curr_meta["thumbnail_hook_line2"] = hook2

    existing_overlay = curr_meta.get("thumbnail_overlay")
    if not existing_overlay or not isinstance(existing_overlay, dict):
        curr_meta["thumbnail_overlay"] = {
            "enabled": True,
            "line1": hook1,
            "line2": hook2,
            "color1": "#FFFFFF",
            "color2": "#FFE600",
            "position": "top-left",
            "pos_x": 6,
            "pos_y": 8,
            "text_align": "left",
            "font_family": "Anton",
            "font_size": 56,
            "rotation": -2,
            "outline_spread": 2.0,
            "outline_blur": 4,
            "outline_color": "#000000",
            "outline_enabled": True,
            "blur_enabled": True,
            "shadow_style": "subtle",
            "style_preset": "viral",
        }
    else:
        ov = dict(existing_overlay)
        ov["line1"] = hook1
        ov["line2"] = hook2
        curr_meta["thumbnail_overlay"] = ov

    curr_meta["updated_at"] = datetime.utcnow().isoformat()

    proj.youtube_metadata = curr_meta
    await db.commit()
    await db.refresh(proj)
    return curr_meta


async def generate_youtube_thumbnail(
    db: AsyncSession,
    project_id: str,
    prompt: str,
    style_prompt: Optional[str] = None,
    preset_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate 16:9 YouTube thumbnail using active image configuration and store in thumbnail history."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError("Project tidak ditemukan")

    clean_prompt = prompt.strip()
    if not clean_prompt:
        raise ValueError("Prompt thumbnail tidak boleh kosong")

    # Fetch active ModelConfig
    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()

    base_url = cfg.image_base_url if cfg else None
    model = cfg.image_model if cfg else "dall-e-3"
    api_key = decrypt_secret(cfg.image_api_key_encrypted) if (cfg and cfg.image_api_key_encrypted) else None

    # Fetch style prompt from specified preset or active preset
    preset = None
    if preset_id:
        preset = await db.get(ImagePreset, preset_id)
    if not preset:
        preset = await get_active_image_preset(db)

    effective_style = style_prompt or (preset.master_prompt if preset else (cfg.image_system_prompt if cfg else None))

    # 1. Sanitize any legacy doodle phrases if project has real characters
    chars = getattr(proj, "characters", None) or []
    locs = getattr(proj, "locations", None) or []
    world = getattr(proj, "world_setting", None) or {}

    active_prompt = clean_prompt
    if chars:
        main_c = chars[0]
        c_anchor = main_c.get("visual_anchor") or main_c.get("name") or "main protagonist"
        active_prompt = re.sub(
            r"(?:an?\s+)?expressive illustrated character with (?:clean )?white minimalist head(?:\s*,\s*large expressive dot eyes)?(?:\s*,\s*spiky hair)?",
            f"an expressive dramatic shot of {main_c.get('name', 'the protagonist')} ({c_anchor})",
            active_prompt,
            flags=re.IGNORECASE,
        )
        active_prompt = re.sub(
            r"minimalist stick-figure character with large,? smooth,? perfectly round bald white head",
            f"{main_c.get('name', 'the protagonist')} ({c_anchor})",
            active_prompt,
            flags=re.IGNORECASE,
        )
        active_prompt = re.sub(
            r"an? illustrated minimalist character",
            f"an expressive shot of {main_c.get('name', 'the protagonist')} ({c_anchor})",
            active_prompt,
            flags=re.IGNORECASE,
        )

    # 2. Resolve Continuity Bible Tokens ([char:aladin:muda], [loc:agrabah], [preset:style])
    from app.services.storyboard import resolve_prompt_variables
    resolved_prompt = resolve_prompt_variables(
        active_prompt,
        characters=chars,
        locations=locs,
        world_setting=world,
        preset_master_prompt=effective_style,
    )

    item_id = f"yt_{uuid.uuid4().hex[:6]}"
    file_path, _ = await generate_single_image(
        prompt=resolved_prompt,
        project_id=project_id,
        item_id=item_id,
        base_url=base_url,
        api_key=api_key,
        model=model,
        style_prompt=effective_style,
        negative_prompt=getattr(preset, "negative_prompt", None) if preset else None,
        size="1792x1024",
    )

    rel_url = storage.to_relative_url(file_path)
    if not rel_url:
        raise RuntimeError("Gagal memproses path hasil thumbnail")

    cache_busted_url = f"{rel_url}?v={int(time.time())}"

    curr_meta = dict(proj.youtube_metadata or {})
    history: List[Dict[str, Any]] = list(curr_meta.get("thumbnail_history") or [])

    new_entry = {
        "id": str(uuid.uuid4()),
        "url": cache_busted_url,
        "file_path": file_path,
        "prompt": clean_prompt,
        "created_at": datetime.utcnow().isoformat(),
    }
    history.insert(0, new_entry)
    # Keep last 15 history items
    history = history[:15]

    curr_meta["thumbnail_url"] = cache_busted_url
    curr_meta["thumbnail_prompt"] = clean_prompt
    curr_meta["thumbnail_history"] = history
    curr_meta["updated_at"] = datetime.utcnow().isoformat()

    proj.youtube_metadata = curr_meta
    await db.commit()
    await db.refresh(proj)

    return {
        "thumbnail_url": cache_busted_url,
        "prompt": clean_prompt,
        "history": history,
        "youtube_metadata": curr_meta,
    }
