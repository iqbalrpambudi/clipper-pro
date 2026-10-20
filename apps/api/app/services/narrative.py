import logging
import re
from typing import Any, Dict, List, Optional

from app.prompts.narrative import (
    DEFAULT_TEMPLATES,
    LEGACY_TEMPLATE_ALIASES,
    MASTER_SCRIPTWRITING_DIRECTIVE,
    build_master_scriptwriting_directive,
)
from app.services.ai_adapters.base import BaseLLMAdapter

log = logging.getLogger(__name__)

__all__ = [
    "DEFAULT_TEMPLATES",
    "LEGACY_TEMPLATE_ALIASES",
    "MASTER_SCRIPTWRITING_DIRECTIVE",
    "build_master_scriptwriting_directive",
]



def split_into_sentence_segments(text: str, balance: bool = True) -> List[Dict[str, Any]]:
    """Split script into clean, balanced sentence segments (~3-6s per segment sweetspot).
    Prevents hyper-fragmented 1-second cuts (< 3 words) and overly long 10-second visual freezes (> 22 words).
    """
    cleaned = re.sub(r"\[.*?\]", "", text).strip()
    # Normalize colons and semicolons for natural TTS speech
    cleaned = re.sub(r"(\d+):(\d+)", r"\1.\2", cleaned)
    cleaned = re.sub(r"\s*;\s*", ", ", cleaned)
    cleaned = re.sub(r"\s*:\s*", ", ", cleaned)
    cleaned = re.sub(r",(\s*,)+", ",", cleaned)
    cleaned = re.sub(r",\s*([.!?])", r"\1", cleaned)
    # Split by Indonesian sentence terminators (. ! ? or newline)
    raw_sentences = [s.strip() for s in re.split(r"(?<=[.!?\n])\s+", cleaned) if s.strip()]

    if not balance:
        return [
            {"id": f"seg-{i+1}", "text": s, "start_ms": 0, "end_ms": 0, "words": []}
            for i, s in enumerate(raw_sentences)
            if len(s) >= 3
        ]

    # Pass 1: split excessively long sentences (> 22 words) by natural clauses / conjunctions
    clause_delims = r"(?<=[,;:\—\-])\s+|(?<=\s)(?:namun|tetapi|sedangkan|sehingga|sementara|padahal|karena|saat)\s+"
    balanced = []
    for s in raw_sentences:
        words = s.split()
        if len(words) > 22:
            clauses = [c.strip() for c in re.split(clause_delims, s, flags=re.IGNORECASE) if c.strip()]
            if len(clauses) >= 2:
                cur_chunk = []
                for c in clauses:
                    c_words = c.split()
                    if cur_chunk and (len(" ".join(cur_chunk).split()) + len(c_words) > 16):
                        balanced.append(" ".join(cur_chunk))
                        cur_chunk = [c]
                    else:
                        cur_chunk.append(c)
                if cur_chunk:
                    balanced.append(" ".join(cur_chunk))
            else:
                balanced.append(s)
        else:
            balanced.append(s)

    # Pass 2: merge ultra-short fragments (<= 3 words) into neighbor if combined <= 16 words
    merged = []
    idx = 0
    while idx < len(balanced):
        cur = balanced[idx]
        cur_w = len(cur.split())
        if cur_w <= 3 and idx + 1 < len(balanced):
            nxt = balanced[idx + 1]
            nxt_w = len(nxt.split())
            if cur_w + nxt_w <= 16:
                merged.append(f"{cur} {nxt}")
                idx += 2
                continue
        if cur_w <= 3 and merged and len(merged[-1].split()) + cur_w <= 16:
            merged[-1] = f"{merged[-1]} {cur}"
            idx += 1
            continue

        merged.append(cur)
        idx += 1

    segments = []
    for idx, s in enumerate(merged, start=1):
        clean_s = s.strip()
        if len(clean_s) >= 3:
            segments.append({
                "id": f"seg-{idx}",
                "text": clean_s,
                "start_ms": 0,
                "end_ms": 0,
                "words": [],
            })
    return segments


def _fmt_ts(sec: float) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}"


def build_full_context_lines(scenes_summary: List[Dict[str, Any]]) -> List[str]:
    """Compact per-scene lines covering the ENTIRE video, chronological, dialog included."""
    lines = []
    for sc in scenes_summary:
        desc = (sc.get("description") or "").strip()
        tags = ", ".join(sc.get("tags") or [])
        ts = _fmt_ts(sc.get("start_time", 0.0))
        parts = [f"[{ts}] {desc}"]
        if tags:
            parts.append(f"({tags})")
        tr = (sc.get("transcript") or "").strip()
        if tr:
            parts.append(f'Dialog: "{tr[:400]}"')
        lines.append(" | ".join(parts))
    return lines


def _even_sample(items: List[Any], max_items: int) -> List[Any]:
    """Evenly-spaced sample preserving order (always includes first and last)."""
    n = len(items)
    if n <= max_items:
        return list(items)
    idxs = sorted({int(round(k * (n - 1) / (max_items - 1))) for k in range(max_items)})
    return [items[i] for i in idxs]


# Adaptive Pass 1 Summarization prompts tailored to content pillars
CATEGORY_SUMMARY_PROMPTS = {
    "recap": (
        "Anda adalah analis naratif sinematik. Tugas Anda: membedah alur cerita dan dramaturgi dari log video berurutan.\n"
        "\n"
        "FORMAT OUTPUT WAJIB:\n"
        "PREMIS & KARAKTER: <siapa tokohnya dan situasi awal di video, 1-2 kalimat>\n"
        "KONFLIK & ESKALASI: <kronologi peristiwa krisis, rintangan, atau aksi dari awal ke akhir>\n"
        "MOMEN PUNCAK / KLIMAKS: <adegan paling menegangkan atau titik balik terbesar dengan timestamp>\n"
        "RESOLUSI: <bagaimana cerita berakhir atau nasib akhir karakter, 1-2 kalimat>\n"
        "\n"
        "ATURAN: Pahami materi video sebagai satu kesatuan cerita yang utuh. Dialog adalah sumber utama alur."
    ),
    "fakta": (
        "Anda adalah peneliti fakta dan trivia sains populer. Tugas Anda: menemukan informasi paling unik dan mencengangkan dari log video.\n"
        "\n"
        "FORMAT OUTPUT WAJIB:\n"
        "SUBJEK / FENOMENA: <objek atau topik utama video, 1-2 kalimat>\n"
        "POIN FAKTA & ANOMALI: <3-5 fakta unik, kejanggalan, atau data mengejutkan yang terlihat/terdengar>\n"
        "PENJELASAN MEKANISME: <mengapa hal tersebut terjadi atau apa makna penemuan tersebut>\n"
        "KESIMPULAN: <pelajaran atau pesan penting dari fakta ini, 1-2 kalimat>\n"
        "\n"
        "ATURAN: Utamakan akurasi fakta dari dialog dan visual. Hindari mendeskripsikan klip satu per satu."
    ),
    "edukasi": (
        "Anda adalah kurator materi edukasi praktis. Tugas Anda: mengekstrak masalah dan solusi actionable dari log video.\n"
        "\n"
        "FORMAT OUTPUT WAJIB:\n"
        "MASALAH / SKILL: <apa masalah yang dipecahkan atau skill yang diajarkan di video, 1-2 kalimat>\n"
        "LANGKAH SOLUSI: <tahapan metode atau tips praktis urut kronologis>\n"
        "INSIGHT PENTING: <hal krusial atau kesalahan umum yang perlu dihindari>\n"
        "HASIL AKHIR: <solusi final atau kondisi yang dicapai setelah mengikuti langkah>\n"
        "\n"
        "ATURAN: Fokus pada kejelasan langkah praktis yang bisa diterapkan audiens."
    ),
    "showcase": (
        "Anda adalah kurator visual dan reviewer produk/proses. Tugas Anda: membedah objek karya dan tahapan transformasi dari log video.\n"
        "\n"
        "FORMAT OUTPUT WAJIB:\n"
        "OBJEK / PRODUK: <karya, produk, makanan, tempat, atau hasil seni apa yang ditampilkan, 1-2 kalimat>\n"
        "TAHAPAN PROSES / FITUR: <alur pembuatan dari bahan mentah atau fitur-fitur utama yang dipamerkan>\n"
        "MOMEN IMPRESIF: <detail paling estetik, rintangan tersulit, atau keunggulan visual paling menonjol>\n"
        "HASIL AKHIR / IMPRESI: <penampakan jadi dan kepuasan/manfaat yang dirasakan>\n"
        "\n"
        "ATURAN: Sinkronkan urutan tahapan dengan rekaman visual."
    ),
    "opini": (
        "Anda adalah analis isu sosial dan pengamat konten. Tugas Anda: membedah dinamika peristiwa dan tensi emosional dari log video.\n"
        "\n"
        "FORMAT OUTPUT WAJIB:\n"
        "ISU / PERISTIWA UTAMA: <kejadian atau topik perdebatan apa yang diangkat, 1-2 kalimat>\n"
        "DINAMIKA PERISTIWA: <kronologi kejadian dan reaksi orang-orang yang terlibat>\n"
        "TITIK KONTROVERSI / DILEMA: <bagian mana yang paling memicu pertanyaan moral atau perdebatan emosional>\n"
        "KESIMPULAN AKHIR: <posisi situasi terakhir di akhir video>\n"
        "\n"
        "ATURAN: Tangkap nuansa emosional dan sudut pandang yang memancing perdebatan."
    ),
}

DEFAULT_SUMMARY_SYSTEM_PROMPT = (
    "Anda adalah analis konten video. Tugas Anda: memahami KESELURUHAN isi video dari log scene "
    "berurutan (deskripsi visual + dialog), lalu menghasilkan ringkasan terstruktur dalam Bahasa Indonesia.\n"
    "\n"
    "FORMAT OUTPUT WAJIB:\n"
    "TOPIK UTAMA: <video ini tentang apa, 1-2 kalimat>\n"
    "ALUR: <kronologi peristiwa/tahapan dari AWAL sampai AKHIR video, 5-10 poin urut waktu>\n"
    "MOMEN KUNCI: <3-5 bagian paling menarik/bernilai, sertakan timestamp>\n"
    "AKHIR: <bagaimana video berakhir / hasil akhir, 1-2 kalimat>\n"
    "\n"
    "ATURAN:\n"
    "- Rangkum video sebagai SATU KESATUAN cerita/proses — JANGAN mendeskripsikan scene satu per satu.\n"
    "- Dialog adalah sumber utama pemahaman; deskripsi visual sebagai pelengkap.\n"
    "- Output hanya ringkasan terstruktur, tanpa penjelasan tambahan."
)


async def summarize_video_content(
    adapter: BaseLLMAdapter,
    scenes_summary: List[Dict[str, Any]],
    category: Optional[str] = None,
) -> str:
    """LLM pass 1: holistic understanding tailored to the script's content category."""
    context = "\n".join(build_full_context_lines(scenes_summary))
    system_prompt = CATEGORY_SUMMARY_PROMPTS.get(
        (category or "").lower(),
        DEFAULT_SUMMARY_SYSTEM_PROMPT,
    )
    prompt = (
        f"Log scene video (berurutan, mencakup SELURUH video, {len(scenes_summary)} scene):\n\n"
        f"{context}\n\n"
        "Hasilkan ringkasan terstruktur dari keseluruhan isi video:"
    )
    return await adapter.generate_chat(prompt=prompt, system_prompt=system_prompt)


def build_narration_context(
    summary: str,
    scenes_summary: List[Dict[str, Any]],
    category: Optional[str] = None,
) -> str:
    """Context for script pass: category-aware summary + evenly-sampled visual timeline."""
    total_sec = 0.0
    if scenes_summary:
        last = scenes_summary[-1]
        total_sec = (last.get("start_time", 0.0) or 0.0) + (last.get("duration", 0.0) or 0.0)
    sample = _even_sample(scenes_summary, 24) if scenes_summary else []
    timeline = "\n".join(
        f"- [{_fmt_ts(s.get('start_time', 0.0))}] {(s.get('description') or '').strip()}"
        for s in sample
    )
    return (
        "RINGKASAN KESELURUHAN ISI VIDEO:\n"
        f"{summary}\n\n"
        f"LINIMASA VISUAL (sampel merata {len(sample)} dari {len(scenes_summary)} scene, "
        f"durasi total ~{int(total_sec)} detik):\n"
        f"{timeline}\n\n"
        "PENTING: Gunakan ringkasan isi video di atas sebagai tulang punggung narasi cerita yang mengalir utuh. "
        "Jangan mendeskripsikan scene satu per satu; ceritakan peristiwanya secara hidup sesuai kategori naskah yang dipilih."
    )


async def generate_narration_script(
    adapter: BaseLLMAdapter,
    system_prompt: str,
    user_prompt_template: str,
    topic: str,
    tone: str = "santai",
    target_duration: int = 60,
    scenes_summary: Optional[List[Dict[str, Any]]] = None,
    custom_prompt: Optional[str] = None,
    category: Optional[str] = None,
    language: str = "id",
) -> str:
    """Generate narrative script from LLM using chosen template and adaptive scene context."""
    # Approximate words per second dynamically adjusted by tone
    pace_multipliers = {
        "tegang": 2.4,
        "kocak": 2.4,
        "santai": 2.2,
        "dramatis": 2.2,
        "hangat": 2.1,
        "formal": 2.1,
        "berwibawa": 2.0,
        "mencekam": 2.0,
    }
    pace = pace_multipliers.get(tone.lower(), 2.2)
    word_count = int(target_duration * pace)

    # Two-pass generation:
    # Pass 1 — LLM memahami KESELURUHAN video secara adaptif sesuai pilar konten naskah.
    # Pass 2 — Tulis naskah dari ringkasan level-cerita dengan Standard Emas Scriptwriting.
    if scenes_summary:
        try:
            summary = await summarize_video_content(adapter, scenes_summary, category=category)
            scene_context_str = build_narration_context(summary, scenes_summary, category=category)
        except Exception as e:
            log.warning("Adaptive summary failed (%s), falling back to compact scene log", e)
            scene_context_str = "\n".join(build_full_context_lines(_even_sample(scenes_summary, 40)))
    else:
        scene_context_str = "No specific scene metadata available." if language == "en" else "Tidak ada metadata scene spesifik."

    clean_topic = topic or ("Interesting facts about this video" if language == "en" else "Fakta menarik seputar video ini")
    min_words = int(word_count * 0.85)
    max_words = int(word_count * 1.15)

    if custom_prompt:
        context_label = "Visual video context:" if language == "en" else "Konteks visual video:"
        user_prompt = f"{custom_prompt}\n\n{context_label}\n{scene_context_str}"
    else:
        user_prompt = user_prompt_template.format(
            topic=clean_topic,
            tone=tone,
            target_duration=target_duration,
            word_count=word_count,
            scene_context=scene_context_str,
        )

    # Dual-Anchoring: Tegaskan kembali batas durasi, bahasa, intonasi & alur mengalir di akhir user prompt
    # agar recency bias LLM memperkuat instruksi sistem.
    if language == "en":
        user_prompt += (
            f"\n\n--- CRITICAL DURATION, TONE & LANGUAGE INSTRUCTION (MANDATORY) ---\n"
            f"• Language: ENGLISH ONLY (Write 100% of the narration in fluent, captivating American/international English. Do NOT write in Indonesian).\n"
            f"• Topic: {clean_topic}\n"
            f"• Tone / Delivery: {tone}\n"
            f"• Target Duration: {target_duration}s (STRICT CORRIDOR: {min_words} - {max_words} words, target ~{word_count} words).\n"
            f"• Narrative Flow: Must flow naturally with connective phrases; NO robotic staccato sentences or AI clichés.\n"
            f"Write ONLY the final spoken English narration script ready for TTS voiceover:"
        )
    else:
        user_prompt += (
            f"\n\n--- PENGINGAT KETAT DURASI, INTONASI & ALUR NARASI (WAJIB DIPATUHI) ---\n"
            f"• Bahasa: BAHASA INDONESIA (Tulis seluruh narasi dalam Bahasa Indonesia lisan yang lancar dan memikat).\n"
            f"• Topik: {clean_topic}\n"
            f"• Intonasi / Nada Bicara: {tone}\n"
            f"• Target Durasi: {target_duration} detik (KORIDOR KETAT: {min_words} - {max_words} kata, target ~{word_count} kata).\n"
            f"• Alur Bicara: Wajib mengalir alami dengan kalimat penghubung/jembatan antar tahapan; DILARANG kalimat patah-patah/staccato.\n"
            f"Tulis HANYA naskah narasi final yang padat, mengalir hidup, dan langsung siap dibacakan oleh voiceover (TTS):"
        )

    master_directive = build_master_scriptwriting_directive(
        topic=clean_topic,
        tone=tone,
        target_duration=target_duration,
        word_count=word_count,
        language=language,
    )

    raw_response = await adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=system_prompt + master_directive,
    )

    # Clean any accidental conversational prefixes like "Tentu! Ini naskahnya:" or "Sure! Here is the script:"
    clean_lines = []
    for line in raw_response.split("\n"):
        line_s = line.strip()
        if not line_s:
            continue
        if re.match(r"^(tentu|ini dia|berikut|halo|oke|sure|here is|here's|certainly|welcome|alright)[^.!?:;]*[:\-]", line_s, re.IGNORECASE):
            continue
        clean_lines.append(line_s)

    return " ".join(clean_lines)
