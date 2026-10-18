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
) -> Dict[str, Any]:
    """Generate high-CTR YouTube video title, alternative titles, SEO description with chapters, tags, and thumbnail visual prompt."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError("Project tidak ditemukan")

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

    # Build Angle Instruction
    angle_instruction = ""
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
        "5. `thumbnail_concept`:\n"
        "   - Penjelasan konsep visual thumbnail dalam 1-2 kalimat Bahasa Indonesia (elemen visual hook, kontras warna, emosi subjek).\n\n"
        "6. `thumbnail_prompt`:\n"
        "   - Prompt visual detail dalam BAHASA INGGRIS untuk AI Image Generator (16:9 widescreen landscape).\n"
        "   - Fokus pada: subjek tunggal dramatis (Rule of Thirds), ekspresi kuat atau siluet misterius, cinematic atmospheric lighting, warna kontras tinggi yang mencolok di feed gelap YouTube.\n"
        f"   - Terapkan estetika preset visual '{preset_name}' ({preset_master[:80] if preset_master else ''}).\n"
        "   - DILARANG MEMUAT TEKS, TULISAN, KATA, HURUF, ANGKA, ATAU WATERMARK DI DALAM GAMBAR!\n\n"
        "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
        "Kembalikan HANYA JSON valid dengan kunci:\n"
        "{\n"
        '  "title": "Judul Utama Ringkas & Menarik",\n'
        '  "title_options": ["Judul 1", "Judul 2", "Judul 3", "Judul 4", "Judul 5"],\n'
        '  "description": "Deskripsi lengkap dengan hook, sinopsis, timestamps bab, CTA, dan hashtags...",\n'
        '  "tags": ["tag 1", "tag 2", "tag 3", "..."],\n'
        '  "thumbnail_concept": "Konsep visual thumbnail dalam Bahasa Indonesia...",\n'
        '  "thumbnail_prompt": "A cinematic dramatic 16:9 widescreen illustration of ... in style of ..."\n'
        "}"
    )

    truncated_narration = narration_text[:3500] if narration_text else "Video dokumenter eksploratif mendalam."
    user_prompt = (
        f"Topik Video / Judul Project: {proj.name}\n"
        f"Gaya Visual Aktif: {preset_name}\n"
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

    if not parsed or not isinstance(parsed, dict):
        parsed = {
            "title": proj.name,
            "title_options": [proj.name],
            "description": f"Video dokumenter menarik mengenai {proj.name}.\n\n{chapter_text_lines}\n\nJangan lupa Like & Subscribe!\n#Video #Dokumenter",
            "tags": [proj.name, "dokumenter", "cerita", "edukasi"],
            "thumbnail_concept": "Ilustrasi dramatis 16:9 yang menggambarkan subjek utama video dengan pencahayaan kontras tinggi.",
            "thumbnail_prompt": f"A cinematic widescreen 16:9 dramatic illustration depicting {proj.name}, highly detailed, compelling visual hook, cinematic lighting.",
        }

    # Merge into existing project youtube_metadata
    curr_meta = dict(proj.youtube_metadata or {})
    curr_meta["title"] = parsed.get("title") or proj.name
    curr_meta["title_options"] = parsed.get("title_options") or [curr_meta["title"]]
    curr_meta["description"] = parsed.get("description") or ""
    curr_meta["tags"] = parsed.get("tags") or []
    curr_meta["thumbnail_concept"] = parsed.get("thumbnail_concept") or ""
    curr_meta["thumbnail_prompt"] = parsed.get("thumbnail_prompt") or ""
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

    item_id = f"yt_{uuid.uuid4().hex[:6]}"
    file_path, _ = await generate_single_image(
        prompt=clean_prompt,
        project_id=project_id,
        item_id=item_id,
        base_url=base_url,
        api_key=api_key,
        model=model,
        style_prompt=effective_style,
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
