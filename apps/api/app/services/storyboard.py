import asyncio
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


def build_storyboard_outline_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    num_chapters: int = 5,
    custom_instructions: Optional[str] = None,
    existing_characters: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[str, str]:
    """Build prompts for Phase 1: High-level Master Storyboard Outline + Character Consistency Bible."""
    target_words = max(400, int(duration_mins * 135))
    words_per_chapter = int(round(target_words / max(1, num_chapters)))

    system_prompt = (
        "Anda adalah Master Storyteller & Produser Eksekutif naskah video YouTube explainer/dokumenter "
        "(gaya MinutePhysics, Kurzgesagt, Big Think, Vox, atau Veritasium).\n"
        "Tugas Anda adalah merancang Master Outline alur cerita video YouTube berdurasi panjang yang sangat terstruktur, "
        "memikat, dan memiliki ritme penceritaan dramatis yang kuat dari awal hingga akhir, "
        "SERTA menyusun 'Character Bible' (penguncian identitas visual karakter) agar penggambaran tokoh 100% konsisten di seluruh adegan.\n\n"
        "=== PANDUAN STRUKTUR OUTLINE ===\n"
        f"- Target Total Durasi Bicara: {duration_mins} Menit (~{target_words} kata total narasi).\n"
        f"- Jumlah Babak (Chapters): Tepat {num_chapters} babak, di mana setiap babak akan dikembangkan menjadi ~{words_per_chapter} kata narasi mendalam.\n"
        "- Alur Narasi Wajib Mengikuti Ritme Dramatis:\n"
        "  1. Babak Pembuka: Hook menarik, paradoks, atau pertanyaan besar yang memicu rasa ingin tahu penonton.\n"
        "  2. Babak Penjelajahan: Menyelami akar masalah, sejarah, data, atau mekanisme di balik fenomena.\n"
        "  3. Babak Puncak / Komplikasi: Menghadirkan konflik, krisis, tantangan kritis, atau plot twist tak terduga.\n"
        "  4. Babak Solusi / Terobosan: Menjelaskan jalan keluar, penemuan penting, atau pemahaman baru.\n"
        "  5. Babak Penutup: Refleksi filosofis, dampak masa depan, dan kesimpulan yang membekas di pikiran penonton.\n\n"
        "=== DETEKSI & PENGUNCIAN KONSISTENSI KARAKTER (CHARACTER BIBLE) ===\n"
        "Identifikasi semua karakter/tokoh kunci dalam topik cerita ini (misalnya: tokoh utama, keluarga/ibu, mentor, antagonis, atau figur sejarah).\n"
        "Untuk setiap karakter, buat deskripsi visual permanen ('visual_anchor') dalam Bahasa Inggris yang sangat spesifik dan konkret, mencakup:\n"
        "  - Ciri fisik & rambut (usia, bentuk wajah, warna kulit, gaya/warna rambut).\n"
        "  - Pakaian khas permanen (Signature Outfit): warna baju yang sangat spesifik (misal 'crimson red traditional shirt'), jenis potongan pakaian, celana/sarung/kain.\n"
        "  - Aksesoris tetap: ikat kepala, tudung kepala, topi, kacamata, selendang, atau properti khas yang selalu melekat.\n"
        "Contoh Kasus Malin Kundang:\n"
        "  • Malin Kundang (Tokoh Utama): 'a lean young Indonesian boy, sun-tanned skin, wearing a vibrant crimson red short-sleeved traditional shirt, woven brown fabric headband (ikat kepala udeng), rolled-up dark trousers, bare feet'\n"
        "  • Ibu Mande Rubayah (Ibu Malin): 'an elderly Indonesian mother with gentle wrinkled face, grey hair covered under a faded cream cotton headscarf (tudung kepala), wearing a dark indigo batik sarong and modest traditional kebaya'\n"
        "Jika topik berupa sains/teknologi abstrak tanpa tokoh cerita bernama, buat 1 karakter figur narator ilustrasi yang konsisten (misal 'a minimalist stickman researcher in loose earthy-toned draped robe').\n\n"
        "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
        "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup dengan skema berikut:\n"
        "{\n"
        '  "title": "Judul Menarik & Menggugah Rasa Ingin Tahu",\n'
        '  "overview": "Sinopsis singkat alur cerita keseluruhan 2-3 kalimat yang memikat",\n'
        '  "characters": [\n'
        "    {\n"
        '      "name": "Nama Karakter (mis. Malin Kundang)",\n'
        '      "role": "Tokoh Utama",\n'
        '      "visual_anchor": "Deskripsi visual spesifik Bahasa Inggris: ciri fisik, warna baju tetap, dan aksesoris khas (ikat kepala/tudung)"\n'
        "    }\n"
        "  ],\n"
        '  "chapters": [\n'
        "    {\n"
        '      "chapter_index": 1,\n'
        '      "chapter_title": "Babak 1: Hook & Paradoks Awal",\n'
        '      "synopsis": "Penjelasan fokus penceritaan pada babak ini, apa yang dibahas dan tensi apa yang dibangun.",\n'
        '      "key_points": [\n'
        '        "Poin penting 1 yang akan dibahas",\n'
        '        "Poin penting 2 yang akan dibahas",\n'
        '        "Poin penting 3 yang akan dibahas"\n'
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    user_prompt = (
        f"Topik Video: {topic}\n"
        f"Target Total Durasi: {duration_mins} Menit (~{target_words} kata total)\n"
        f"Jumlah Babak (Chapters): Tepat {num_chapters} babak (~{words_per_chapter} kata per babak)\n"
        f"Tone: {tone}\n"
    )
    if existing_characters:
        user_prompt += f"Karakter yang telah dikunci sebelumnya: {json.dumps(existing_characters, ensure_ascii=False)}\n"
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nBuatlah Master Outline dan Character Bible untuk tepat {num_chapters} babak sekarang dalam format JSON murni."
    )
    return system_prompt, user_prompt


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
) -> Tuple[str, str]:
    """Build prompts for Phase 2: Expanding a single chapter into full narration & visual scenes."""
    visual_guidelines, example_prompt_1, example_prompt_2, preset_label = _build_visual_guidelines(preset)
    min_chapter_words = int(round(target_chapter_words * 0.90))
    total_chapter_scenes = target_segments * images_per_segment

    char_bible_instruction = ""
    if characters and len(characters) > 0:
        char_lines = []
        for c in characters:
            c_name = c.get("name", "Karakter")
            c_role = f" ({c.get('role')})" if c.get("role") else ""
            c_anchor = c.get("visual_anchor", "")
            char_lines.append(f"   • {c_name}{c_role}: {c_anchor}")
        char_bible_instruction = (
            "2. PENGUNCIAN KONSISTENSI KARAKTER (CHARACTER BIBLE - WAJIB 100% KONSISTEN):\n"
            "   Daftar karakter dan deskripsi visual yang telah DIKUNCI untuk cerita ini:\n"
            + "\n".join(char_lines) + "\n\n"
            "   ATURAN KERAS PENGUNCIAN KARAKTER DI SETIAP SCENE:\n"
            "   - Setiap kali salah satu karakter di atas muncul atau bertindak dalam adegan (`image_prompt`), Anda WAJIB menyertakan deskripsi 'visual_anchor' mereka yang persis sama kata demi kata (warna baju khas, jenis pakaian, aksesoris seperti ikat kepala atau tudung kepala).\n"
            "   - DILARANG mengubah warna baju, gaya rambut, atau aksesoris mereka antar adegan agar karakter tampak 100% konsisten dan mudah dikenali penonton di seluruh video!\n\n"
        )

    system_prompt = (
        "Anda adalah Master Storyteller, Sutradara Visual & Scriptwriter kelas dunia untuk video dokumenter YouTube.\n"
        f"Tugas Anda adalah menulis naskah narasi LENGKAP untuk Babak {chapter_index} dari {total_chapters} babak video, "
        "terstruktur ke dalam segmen dan adegan visual (scenes) dengan kopling 1-to-1 antara kalimat narasi dan prompt gambar.\n\n"
        "=== ATURAN KUNCI NARASI & VISUAL ===\n"
        "1. KOPLING 1-TO-1 (1 Adegan = 1 Kalimat Narasi & 1 Prompt Visual):\n"
        f"   - Babak ini WAJIB berisi tepat {target_segments} segmen.\n"
        f"   - Setiap segmen WAJIB memiliki tepat {images_per_segment} adegan (scenes) -> Total tepat {total_chapter_scenes} scenes untuk babak ini.\n"
        "   - Setiap scene memiliki `narration_text` dan `image_prompt` yang berpasangan langsung.\n"
        "   - `narration_text`: 1–2 kalimat narasi utuh yang bernas, deskriptif, dan ekspresif (18–25 kata per scene). JANGAN membuat narasi terlalu pendek!\n"
        f"   - `image_prompt`: Prompt ilustrasi visual Bahasa Inggris (16:9 landscape) yang secara konkret merepresentasikan kalimat narasi tersebut dan MENGADOPSI GAYA PRESET '{preset_label}'.\n\n"
        f"{char_bible_instruction}"
        f"{visual_guidelines}"
        "4. TARGET PANJANG KATA & KESINAMBUNGAN (SANGAT PENTING):\n"
        f"   - Total kata narasi untuk Babak {chapter_index} ini WAJIB mencapai minimal {min_chapter_words} kata (target ideal ~{target_chapter_words} kata).\n"
        "   - DILARANG menyingkat atau memangkas penjelasan! Uraikan argumen, metafora, dan cerita dengan detail dan memikat.\n"
        "   - KESINAMBUNGAN CERITA: Naskah babak ini harus mengalir alami sebagai bagian dari keseluruhan video. "
        "Jembatani awal babak secara mulus dari babak sebelumnya tanpa mengulang kalimat pembuka/salam, dan jangan mendahului topik babak berikutnya.\n\n"
        "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
        "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup:\n"
        "{\n"
        f'  "chapter_title": "{chapter_title}",\n'
        '  "segments": [\n'
        "    {\n"
        f'      "segment_id": "seg-{chapter_index}_1",\n'
        '      "scenes": [\n'
        "        {\n"
        '          "scene_id": "scene-1",\n'
        '          "narration_text": "Kalimat narasi adegan pertama yang kaya detail dan mendalam...",\n'
        f'          "image_prompt": "{example_prompt_1}"\n'
        "        },\n"
        "        {\n"
        '          "scene_id": "scene-2",\n'
        '          "narration_text": "Kelanjutan narasi yang membangun keterhubungan logis atau visual progression...",\n'
        f'          "image_prompt": "{example_prompt_2}"\n'
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}"
    )

    roadmap_str = ""
    if chapters_roadmap:
        roadmap_lines = []
        for i, ch in enumerate(chapters_roadmap):
            c_idx = i + 1
            c_title = ch.get("chapter_title", f"Babak {c_idx}")
            c_syn = ch.get("synopsis", "")
            marker = " ➔ [FOKUS SAAT INI]" if c_idx == chapter_index else ""
            roadmap_lines.append(f"  {c_idx}. {c_title}{marker}: {c_syn}")
        roadmap_str = (
            "ROADMAP KESELURUHAN ALUR CERITA (AGAR CERITA TETAP KONSISTEN & NYAMBUNG):\n"
            + "\n".join(roadmap_lines)
            + "\n\n"
        )

    char_remind_str = ""
    if characters and len(characters) > 0:
        names = ", ".join(c.get("name", "") for c in characters if c.get("name"))
        char_remind_str = f"- Karakter Terkunci (Gunakan visual anchor mereka persis): {names}\n"

    kp_str = "\n".join(f"- {kp}" for kp in chapter_key_points) if chapter_key_points else "- Kembangkan sesuai sinopsis babak"
    user_prompt = (
        f"Konteks Video Keseluruhan:\n"
        f"- Judul Video: {video_title}\n"
        f"- Overview: {video_overview}\n\n"
        f"{roadmap_str}"
        f"FOKUS PENULISAN BABAK INI:\n"
        f"- Babak: {chapter_title} (Babak {chapter_index} dari {total_chapters})\n"
        f"- Sinopsis Babak: {chapter_synopsis}\n"
        f"- Poin Kunci yang Harus Dibahas:\n{kp_str}\n\n"
        f"TARGET TEKNIS:\n"
        f"- Target Kata Narasi Babak Ini: Minimal {min_chapter_words} kata (target ~{target_chapter_words} kata)\n"
        f"- Struktur Babak: Tepat {target_segments} segmen, masing-masing {images_per_segment} scenes (Total tepat {total_chapter_scenes} scenes)\n"
        f"- Tone: {tone}\n"
        f"- Gaya Visual Preset: {preset_label}\n"
        f"{char_remind_str}"
    )
    if custom_instructions:
        user_prompt += f"- Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nTuliskan naskah lengkap Babak {chapter_index} sekarang dalam format JSON murni.\n"
        f"PENTING: Pastikan alur cerita menyambung secara alami dengan roadmap di atas dan memenuhi minimal {min_chapter_words} kata!"
    )
    return system_prompt, user_prompt


def build_storyboard_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    images_per_segment: int = 2,
    preset: Optional[Any] = None,
    custom_instructions: Optional[str] = None,
    existing_characters: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[str, str]:
    """Build system and user prompts for single-shot long-form storyboard scriptwriting + Character Bible."""
    target_words = max(400, int(duration_mins * 135))
    min_words = int(target_words * 0.90)
    max_words = int(target_words * 1.10)

    # Visual pacing: 1 illustration per ~7.5-8.5 seconds (each scene ~16-22 spoken words)
    seconds_per_scene = 8.0
    total_scenes = max(10, int(round((duration_mins * 60) / seconds_per_scene)))
    target_segments = max(4, int(round(total_scenes / max(1, images_per_segment))))
    num_chapters = max(3, min(6, int(round(duration_mins * 0.7))))

    visual_guidelines, example_prompt_1, example_prompt_2, preset_label = _build_visual_guidelines(preset)

    system_prompt = (
        "Anda adalah Master Storyteller, Sutradara Visual & Scriptwriter kelas dunia untuk video dokumenter/explainer YouTube "
        "(gaya MinutePhysics, Kurzgesagt, Big Think, atau channel storytelling sejarah & sains populer).\n"
        "Tugas Anda adalah menulis naskah narasi video panjang (landscape 16:9) yang mendalam, memikat, dan terstruktur "
        "ke dalam adegan-adegan visual (scenes) dengan sinkronisasi 1-to-1 yang SEMPURNA antara kalimat narasi dan prompt gambar sketsa hand-drawn, "
        "SERTA mendeteksi dan mengunci karakter (Character Bible) agar konsisten 100% antar adegan.\n\n"
        "=== DETEKSI & PENGUNCIAN KONSISTENSI KARAKTER (CHARACTER BIBLE) ===\n"
        "Identifikasi semua karakter penting dalam topik cerita ini (misalnya: tokoh utama, keluarga/ibu, atau figur sejarah).\n"
        "Kunci deskripsi visual permanen ('visual_anchor') dalam Bahasa Inggris yang sangat spesifik untuk tiap karakter:\n"
        "- Ciri fisik & rambut (usia, warna kulit, gaya rambut).\n"
        "- Pakaian khas permanen (warna spesifik, potongan busana/baju).\n"
        "- Aksesoris tetap (ikat kepala, tudung kepala, dsb.).\n"
        "ATURAN KERAS: Setiap kali karakter tersebut muncul dalam `image_prompt`, Anda WAJIB menyertakan 'visual_anchor' mereka persis kata demi kata tanpa mengubah warna baju atau aksesoris mereka antar adegan!\n\n"
        "=== PRINSIP KEKUATAN AUDIO-VISUAL (SINKRON & TIDAK AMBIGU) ===\n"
        "1. KOPLING 1-TO-1 (1 Adegan = Tepat 1 Kalimat Narasi & 1 Prompt Visual):\n"
        f"   - Setiap segmen dipecah menjadi tepat sejumlah adegan (scenes) sesuai parameter `Jumlah Gambar per Segmen` ({images_per_segment} scene per segmen).\n"
        "   - Setiap adegan (scene) WAJIB memiliki `narration_text` dan `image_prompt` yang berpasangan secara langsung.\n"
        "   - `narration_text`: 1–2 kalimat narasi utuh yang tuntas, mendalam, dan alami (panjang 16–22 kata per scene, setara durasi bicara ideal 7–9 detik). JANGAN membuat kalimat terlalu pendek atau terputus-putus!\n"
        "   - `image_prompt`: Prompt ilustrasi visual (Bahasa Inggris) yang SECARA LITERAL DAN LANGSUNG merepresentasikan subjek konkret, aksi penceritaan, atau metafora visual yang dibicarakan dalam kalimat `narration_text` tersebut. JANGAN membuat gambar yang tidak nyambung, abstrak tanpa konteks, atau melompat ke topik lain!\n\n"
        "2. KESINAMBUNGAN BERCERITA (VISUAL PROGRESSION):\n"
        f"   - Dalam 1 segmen yang berisi {images_per_segment} adegan, bangun kesinambungan cerita sebab-akibat yang dinamis.\n"
        "   - Penonton harus merasakan keterhubungan visual yang mengalir mulus dari detik ke detik tanpa kebingungan.\n\n"
        f"{visual_guidelines}"
        "4. TARGET PANJANG KATA & STRUKTUR CERITA:\n"
        f"   - Target Total Durasi Bicara: {duration_mins} Menit.\n"
        f"   - Target Total Kata Narasi: Sekitar {target_words} kata (rentang ketat {min_words}–{max_words} kata). PENTING: Naskah narasi WAJIB memenuhi target panjang kata ini! Jangan membuat naskah terlalu pendek atau ringkas.\n"
        f"   - Struktur Keseluruhan: {num_chapters} Babak (Chapters), total sekitar {target_segments} Segmen (total tepat ~{total_scenes} adegan visual scenes).\n"
        f"   - Nada Bicara (Tone): {tone}. Bahasa Indonesia lisan yang hidup, cerdas, mengalir, dan bernyawa.\n"
        "   - Struktur Alur Cerita: Hook & Paradoks di awal ➔ Eksplorasi Berlapis ➔ Puncak Wawasan / Plot Twist ➔ Refleksi Penutup yang membekas.\n\n"
        "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
        "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup dengan struktur hierarkis berikut:\n"
        "{\n"
        '  "title": "Judul Menarik Video",\n'
        '  "overview": "Sinopsis singkat 1-2 kalimat",\n'
        '  "characters": [\n'
        "    {\n"
        '      "name": "Nama Karakter (mis. Malin Kundang)",\n'
        '      "role": "Tokoh Utama",\n'
        '      "visual_anchor": "Deskripsi visual spesifik Bahasa Inggris: ciri fisik, warna baju tetap, dan aksesoris khas (ikat kepala/tudung)"\n'
        "    }\n"
        "  ],\n"
        '  "chapters": [\n'
        "    {\n"
        '      "chapter_title": "Babak 1: Misteri di Lautan Lepas",\n'
        '      "segments": [\n'
        "        {\n"
        '          "segment_id": "seg-1",\n'
        '          "scenes": [\n'
        "            {\n"
        '              "scene_id": "scene-1",\n'
        '              "narration_text": "Di tengah samudra yang tampak tenang, para pelaut kuno mengarungi ombak hanya berpedoman pada rasi bintang yang berpijar di langit malam.",\n'
        f'              "image_prompt": "{example_prompt_1}"\n'
        "            },\n"
        "            {\n"
        '              "scene_id": "scene-2",\n'
        '              "narration_text": "Namun saat kabut pekat mendadak turun menyelimuti cakrawala, jarum kompas mereka tiba-tiba berputar liar dan kehilangan arah utara sejati.",\n'
        f'              "image_prompt": "{example_prompt_2}"\n'
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
        f"Target Durasi: {duration_mins} menit (~{target_words} kata, minimal {min_words} kata)\n"
        f"Gaya Visual Preset AI: {preset_label}\n"
        f"Struktur: {num_chapters} Babak, sekitar {target_segments} segmen, tepat {images_per_segment} scenes per segmen (total ~{total_scenes} adegan visual)\n"
        f"Tone: {tone}\n"
        f"Jumlah Gambar per Segmen: {images_per_segment} scene per segmen\n"
    )
    if existing_characters:
        user_prompt += f"Karakter yang telah dikunci sebelumnya: {json.dumps(existing_characters, ensure_ascii=False)}\n"
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nTuliskan naskah narasi lengkap dan Character Bible sekarang dalam format JSON murni.\n"
        f"PENTING SEKALI TENTANG PANJANG KATA & DURASI:\n"
        f"- Target durasi bicara adalah {duration_mins} menit penuh.\n"
        f"- Total kata narasi WAJIB mencapai minimal {min_words} kata (target ideal ~{target_words} kata).\n"
        f"- Kembangkan setiap scene menjadi 2 kalimat narasi yang padat, ekspresif, dan mendalam (18–25 kata per scene).\n"
        f"- Setiap segmen harus memiliki tepat {images_per_segment} scenes yang berpasangan secara 1-to-1 dengan prompt visual (Bahasa Inggris) yang MENGADOPSI GAYA PRESET '{preset_label}' dan MENYISIPKAN 'visual_anchor' karakter secara konsisten."
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
    preset_id: Optional[str] = None,
    custom_instructions: Optional[str] = None,
) -> Tuple[Narration, List[StoryboardItem]]:
    """Generate long-form storyboard script and save Narration + StoryboardItem records."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"Project {project_id} tidak ditemukan.")

    from app.services.image_studio import get_active_image_preset
    from app.models.image_preset import ImagePreset

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

    chapters: List[Dict[str, Any]] = []
    existing_characters = proj.characters if (isinstance(proj.characters, list) and len(proj.characters) > 0) else None
    detected_characters: List[Dict[str, Any]] = list(existing_characters) if existing_characters else []

    # TWO-PHASE CHUNKED GENERATION (for duration_mins >= 3)
    if duration_mins >= 3:
        try:
            # PHASE 1: Generate Master Outline + Character Bible
            outline_sys, outline_usr = build_storyboard_outline_prompt(
                topic=topic,
                duration_mins=duration_mins,
                tone=tone,
                num_chapters=num_chapters,
                custom_instructions=custom_instructions,
                existing_characters=existing_characters,
            )
            log.info(
                "Phase 1: Generating Master Outline & Character Bible for project %s (topic='%s', dur=%dm, chapters=%d, target=%d words)...",
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
            if not existing_characters and outline_data.get("characters"):
                detected_characters = outline_data.get("characters", []) or []
                log.info("Detected %d locked characters from outline: %s", len(detected_characters), [c.get("name") for c in detected_characters])

            if outline_chapters and len(outline_chapters) > 0:
                # PHASE 2: Expand each chapter concurrently with Semaphore
                sem = asyncio.Semaphore(2)

                async def _expand_single_chapter(ch_idx: int, ch_info: Dict[str, Any]) -> Dict[str, Any]:
                    async with sem:
                        ch_title = ch_info.get("chapter_title", f"Babak {ch_idx + 1}")
                        ch_synopsis = ch_info.get("synopsis", "")
                        ch_kp = ch_info.get("key_points", [])
                        log.info(
                            "Phase 2: Expanding chapter %d/%d ('%s') for project %s...",
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
                        )

                        last_err = None
                        for attempt in range(2):
                            try:
                                raw_ch = await llm_adapter.generate_chat(
                                    prompt=usr_p,
                                    system_prompt=sys_p,
                                    json_mode=True,
                                    timeout=120.0,
                                    max_tokens=4096,
                                )
                                ch_res = extract_json_payload(raw_ch)
                                if not ch_res.get("chapter_title"):
                                    ch_res["chapter_title"] = ch_title
                                return ch_res
                            except Exception as err:
                                last_err = err
                                log.warning("Attempt %d failed expanding chapter %d: %s", attempt + 1, ch_idx + 1, err)
                                if attempt == 0:
                                    await asyncio.sleep(1.0)
                        raise last_err or ValueError(f"Gagal generate babak {ch_idx + 1}")

                chapters_results = await asyncio.gather(*[
                    _expand_single_chapter(i, ch) for i, ch in enumerate(outline_chapters)
                ])
                chapters = list(chapters_results)
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
            existing_characters=existing_characters,
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
        if not existing_characters and data.get("characters"):
            detected_characters = data.get("characters", []) or []
            log.info("Detected %d locked characters from single-shot: %s", len(detected_characters), [c.get("name") for c in detected_characters])

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

    raw_script = "\n\n".join(full_script_lines)
    word_count = len(raw_script.split()) if raw_script else 0
    actual_duration_seconds = max(1, int(round((word_count / 135) * 60))) if word_count > 0 else (duration_mins * 60)

    log.info(
        "Storyboard script generated: %d words, ~%d seconds (~%.1f mins), %d segments, %d image slots",
        word_count, actual_duration_seconds, actual_duration_seconds / 60, len(all_segments), len(storyboard_items)
    )

    # Delete older narration and storyboard items for this project
    await db.execute(delete(StoryboardItem).where(StoryboardItem.project_id == project_id))
    await db.execute(delete(Narration).where(Narration.project_id == project_id))

    narration = Narration(
        project_id=project_id,
        topic=topic,
        tone=tone,
        target_duration=actual_duration_seconds,
        raw_text=raw_script,
        segments=all_segments,
        status="generated",
    )
    db.add(narration)
    await db.flush()

    for item in storyboard_items:
        item.narration_id = narration.id
        db.add(item)

    proj.characters = detected_characters
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
