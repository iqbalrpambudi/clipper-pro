import re
import uuid
from typing import List, Dict, Any, Optional
from app.services.ai_adapters.base import BaseLLMAdapter

DEFAULT_TEMPLATES = [
    {
        "id": "fakta_unik",
        "name": "Fakta Unik & Menarik",
        "description": "Naskah gaya misteri dan trivia viral dengan hook mematikan, 3 poin fakta mengejutkan, dan penutup interaktif.",
        "category": "builtin",
        "system_prompt": (
            "Anda adalah narasumber short video viral di TikTok, Instagram Reels, dan YouTube Shorts spesialis konten Fakta Unik dalam Bahasa Indonesia.\n"
            "Aturan wajib:\n"
            "1. HANYA gunakan Bahasa Indonesia yang mengalir, natural, dan persuasif (gaya lisan, bukan tulisan buku kaku).\n"
            "2. Kalimat pertama HARUS hook kuat yang menghentikan scroll (maksimal 10 kata).\n"
            "3. Isi terdiri dari 2-4 poin fakta mengejutkan yang ringkas dan padat.\n"
            "4. Kalimat penutup berupa pertanyaan pemicu komentar penonton.\n"
            "5. Jangan gunakan tanda kurung panduan panggung seperti [Musik] atau [Suara keras]."
        ),
        "user_prompt_template": (
            "Topik: {topic}\n"
            "Tone: {tone}\n"
            "Target Durasi: {target_duration} detik (sekitar {word_count} kata)\n"
            "Konteks visual materi video yang tersedia:\n{scene_context}\n\n"
            "Tuliskan naskah narasi lengkap yang memukau:"
        ),
        "default_tone": "santai",
        "default_voice": "Puck",
        "is_builtin": True,
    },
    {
        "id": "konten_viral",
        "name": "Konten Viral & Storytelling",
        "description": "Cerita dramatis dengan tensi tinggi, rasa penasaran yang memuncak, dan pesan yang membekas.",
        "category": "builtin",
        "system_prompt": (
            "Anda adalah kreator konten viral spesialis storytelling dramatis di platform video vertikal (TikTok/Reels) dalam Bahasa Indonesia.\n"
            "Aturan wajib:\n"
            "1. Tulis narasi dalam Bahasa Indonesia percakapan yang penuh emosi dan tensi.\n"
            "2. Mulai dengan kalimat pembuka dramatis (misal: 'Banyak orang mengira hal ini mustahil, sampai akhirnya...').\n"
            "3. Bangun rasa penasaran secara bertahap sampai klimaks.\n"
            "4. Akhiri dengan pesan bermakna dan ajakan interaksi.\n"
            "5. Hindari teks instruksi atau bracket."
        ),
        "user_prompt_template": (
            "Topik cerita: {topic}\n"
            "Tone: {tone}\n"
            "Target Durasi: {target_duration} detik (sekitar {word_count} kata)\n"
            "Konteks visual materi video yang tersedia:\n{scene_context}\n\n"
            "Tuliskan naskah storytelling:"
        ),
        "default_tone": "dramatis",
        "default_voice": "Charon",
        "is_builtin": True,
    },
    {
        "id": "edukasi_singkat",
        "name": "Edukasi Singkat / Tips Praktis",
        "description": "Tips actionable 3 langkah mudah yang langsung bisa diterapkan oleh penonton.",
        "category": "builtin",
        "system_prompt": (
            "Anda adalah edukator dan mentor digital dalam Bahasa Indonesia.\n"
            "Aturan wajib:\n"
            "1. Gunakan Bahasa Indonesia yang lugas, jelas, dan percaya diri.\n"
            "2. Hook: sebutkan masalah umum yang sering dihadapi audiens.\n"
            "3. Sajikan 3 langkah/tips praktis tanpa bertele-tele.\n"
            "4. Closing: ajak audiens simpan/share video ini.\n"
            "5. Jangan masukkan tanda kurung skrip atau arahan panggung."
        ),
        "user_prompt_template": (
            "Topik edukasi: {topic}\n"
            "Tone: {tone}\n"
            "Target Durasi: {target_duration} detik (sekitar {word_count} kata)\n"
            "Konteks visual materi video yang tersedia:\n{scene_context}\n\n"
            "Tuliskan naskah edukasi:"
        ),
        "default_tone": "formal",
        "default_voice": "Aoede",
        "is_builtin": True,
    },
]


def split_into_sentence_segments(text: str) -> List[Dict[str, Any]]:
    """Split script into clean sentence segments."""
    cleaned = re.sub(r"\[.*?\]", "", text).strip()
    # Split by Indonesian sentence terminators (. ! ? or newline)
    raw_sentences = re.split(r"(?<=[.!?\n])\s+", cleaned)
    segments = []
    idx = 1
    for s in raw_sentences:
        clean_s = s.strip()
        if len(clean_s) >= 3:
            segments.append({
                "id": f"seg-{idx}",
                "text": clean_s,
                "start_ms": 0,
                "end_ms": 0,
                "words": [],
            })
            idx += 1
    return segments


async def generate_narration_script(
    adapter: BaseLLMAdapter,
    system_prompt: str,
    user_prompt_template: str,
    topic: str,
    tone: str = "santai",
    target_duration: int = 60,
    scenes_summary: Optional[List[Dict[str, Any]]] = None,
    custom_prompt: Optional[str] = None,
) -> str:
    """Generate narrative script from LLM using chosen template and scene context."""
    # Approximate words per minute for Indonesian speech ~ 130-150 wpm
    word_count = int(target_duration * 2.3)

    scene_context_str = "Tidak ada metadata scene spesifik."
    if scenes_summary:
        lines = []
        for i, sc in enumerate(scenes_summary[:12]):
            desc = sc.get("description", "")
            tags = ", ".join(sc.get("tags", []))
            lines.append(f"- Scene {i+1} ({sc.get('duration', 0)}s): {desc} (tags: {tags})")
        scene_context_str = "\n".join(lines)

    if custom_prompt:
        user_prompt = f"{custom_prompt}\n\nKonteks visual video:\n{scene_context_str}"
    else:
        user_prompt = user_prompt_template.format(
            topic=topic or "Fakta menarik seputar video ini",
            tone=tone,
            target_duration=target_duration,
            word_count=word_count,
            scene_context=scene_context_str,
        )

    raw_response = await adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=system_prompt,
    )

    # Clean any accidental conversational prefixes like "Tentu! Ini naskahnya:"
    clean_lines = []
    for line in raw_response.split("\n"):
        line_s = line.strip()
        if not line_s:
            continue
        if re.match(r"^(tentu|ini dia|berikut|halo|oke)[^.!?:;]*[:\-]", line_s, re.IGNORECASE):
            continue
        clean_lines.append(line_s)

    return " ".join(clean_lines)
