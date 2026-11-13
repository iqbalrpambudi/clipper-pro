"""Script writing: code picks the shots, the LLM writes one spoken line per shot.

Keeping the model's job to "write N numbered lines, line k is about shot k" makes cheap
models reliable, and the scene <-> sentence link comes from line order, not from the model."""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from app.prompts.narrative import DEFAULT_TEMPLATES
from app.services.ai_adapters.base import BaseLLMAdapter
from app.services.matching import _calc_visual_satisfaction_boost, _get_scene_usable_range

log = logging.getLogger(__name__)

__all__ = ["DEFAULT_TEMPLATES"]

WORDS_PER_SEC = 2.2
SEC_PER_LINE = 4.5  # one picked shot per spoken line; matching may add a second cut inside a line


def line_count_for(duration_sec: int) -> int:
    return max(4, round(duration_sec / SEC_PER_LINE))


# ---------------------------------------------------------------------------
# 1. Shots
# ---------------------------------------------------------------------------

def pick_story_shots(scenes: List[Dict[str, Any]], n: int) -> List[Dict[str, Any]]:
    """Pick n scenes spread over the whole video (start -> end of the process), best shot per slice."""
    ordered = sorted(scenes, key=lambda s: float(s.get("start_time", 0.0)))

    def usable(s: Dict[str, Any]) -> float:
        _, _, dur, montage = _get_scene_usable_range(s, SEC_PER_LINE)
        return 0.0 if montage else dur

    cands = [s for s in ordered if usable(s) >= 2.5]
    if len(cands) < n:
        cands = [s for s in ordered if usable(s) > 0] or ordered
    n = min(n, len(cands))
    if n == 0:
        return []

    shots = []
    for k in range(n):
        bucket = cands[k * len(cands) // n:(k + 1) * len(cands) // n]
        shots.append(max(bucket, key=lambda s: usable(s) * _calc_visual_satisfaction_boost(s)))
    return shots


# ---------------------------------------------------------------------------
# 2. Prompt
# ---------------------------------------------------------------------------

_TEXT = {
    "id": {
        "rules": (
            "FORMAT: video short dokumenter tentang SATU proses, sekitar {dur} detik. "
            "Satu narator menceritakan satu cerita utuh: apa yang dikerjakan, untuk apa, bagaimana caranya, dan hasil akhirnya.\n\n"
            "CARA MENULIS:\n"
            "Baris pertama tulis \"Inti:\" lalu satu kalimat: apa yang dikerjakan di video, tujuannya, dan hasil akhirnya.\n"
            "Setelah itu tulis tepat {n} baris bernomor 1. sampai {n}.\n\n"
            "PERAN BARIS (tertulis di ujung tiap gambar):\n"
            "- PEMBUKA: sesuai GAYA, tentang hal paling unik dari judul atau seluruh proses, bukan isi satu gambar.\n"
            "- APA & KENAPA: sebut nama benda atau kegiatannya dan alasan kenapa ini dilakukan.\n"
            "- TAHAP: tahap yang terjadi di gambar itu + alasannya (agar, supaya, karena, sehingga). "
            "Sambungkan dengan kata seperti setelah itu, lalu, kemudian, selama, tapi jangan di setiap baris.\n"
            "- HASIL: hasil dari prosesnya.\n"
            "- PENUTUP: kegunaan atau nilai hasilnya, yang menjawab pembuka.\n\n"
            "ATURAN:\n"
            "1. Baris ke-k diucapkan saat GAMBAR ke-k tampil dan menjalankan PERAN gambar ke-k. "
            "Ceritakan sebagai lanjutan cerita, jangan mendeskripsikan gambarnya.\n"
            "2. Satu baris = satu kalimat, {lo}-{hi} kata.\n"
            "3. Bahasa Indonesia yang enak didengar, sudut pandang orang ketiga (mereka, petani, pekerja). Nada {tone}.\n"
            "4. Sebut nama bahan dan alat seperti di daftar gambar. Jangan mengarang angka, tempat, atau nama orang.\n"
            "5. Hanya kata yang diucapkan narator: tanpa judul, tanda kurung, emoji, ajakan subscribe, "
            "atau kata 'scene', 'kamera', 'gambar', 'video ini', 'di layar'."
        ),
        "user": (
            "Topik: {topic}\n"
            "Judul video sumber: {title}\n\n"
            "DAFTAR GAMBAR (urut waktu, dari awal sampai akhir proses):\n{shots}\n\n"
            "Contoh bentuk jawaban saja (topik lain, jangan disalin):\n"
            "Inti: pekerja memukul daging ikan berulang kali supaya menjadi bakso kenyal untuk dijual.\n"
            "1. Kenapa daging ikan ini dipukul ratusan kali sebelum dimasak?\n"
            "2. Ini adalah cara membuat bakso ikan yang kenyal tanpa bahan tambahan.\n"
            "3. Daging ikan lebih dulu dipisahkan dari kulit dan tulangnya agar adonannya halus.\n"
            "4. Setelah itu daging dipukul terus sehingga seratnya rapat dan lengket.\n\n"
            "Tulis \"Inti:\" lalu {n} baris sekarang:"
        ),
        "retry": "Jawaban sebelumnya salah format. Tulis \"Inti:\" lalu tepat {n} baris bernomor, satu kalimat per baris, tanpa teks lain.",
        "no_topic": "simpulkan dari judul dan daftar gambar",
    },
    "en": {
        "rules": (
            "FORMAT: a short documentary video about ONE process, about {dur} seconds. "
            "One narrator tells one complete story: what is being done, why, how, and the final result.\n\n"
            "HOW TO WRITE:\n"
            "First write \"Core:\" and one sentence: what is done in the video, why, and the final result.\n"
            "Then write exactly {n} lines numbered 1. to {n}.\n\n"
            "LINE ROLES (written at the end of each shot):\n"
            "- OPENER: in the given STYLE, about the most unusual thing in the title or the whole process, not one shot.\n"
            "- WHAT & WHY: name the thing or activity and why it is done.\n"
            "- STEP: the step happening in that shot + why (so that, because, which). "
            "Link with words like then, after that, while, but not on every line.\n"
            "- RESULT: what the process produces.\n"
            "- CLOSE: what the result is used for or worth, answering the opener.\n\n"
            "RULES:\n"
            "1. Line k is spoken while SHOT k is on screen and does the ROLE of shot k. "
            "Tell it as the next part of the story; do not describe the picture.\n"
            "2. One line = one sentence, {lo}-{hi} words.\n"
            "3. Natural spoken English, third person (they, the farmers, the workers). {tone} tone.\n"
            "4. Name ingredients and tools as the shot list does. Do not invent numbers, places, or names.\n"
            "5. Only words the narrator says: no titles, brackets, emoji, subscribe calls, "
            "or words like 'scene', 'camera', 'shot', 'this video', 'on screen'."
        ),
        "user": (
            "Topic: {topic}\n"
            "Source video title: {title}\n\n"
            "SHOT LIST (in time order, start to end of the process):\n{shots}\n\n"
            "Answer shape example only (other topic, do not copy):\n"
            "Core: workers pound fish meat over and over so it becomes chewy fish balls to sell.\n"
            "1. Why is this fish meat pounded hundreds of times before cooking?\n"
            "2. This is how chewy fish balls are made without any additives.\n"
            "3. The meat is first separated from the skin and bones so the paste turns smooth.\n"
            "4. After that it is pounded nonstop, packing the fibers tight and sticky.\n\n"
            "Write \"Core:\" and the {n} lines now:"
        ),
        "retry": "Your last answer had the wrong format. Write \"Core:\" and then exactly {n} numbered lines, one sentence each, nothing else.",
        "no_topic": "infer it from the title and the shot list",
    },
}


_ROLES = {
    "id": ("PEMBUKA", "APA & KENAPA", "TAHAP", "HASIL", "PENUTUP"),
    "en": ("OPENER", "WHAT & WHY", "STEP", "RESULT", "CLOSE"),
}


def _role(k: int, n: int, roles: Tuple[str, ...]) -> str:
    """Story beat for line k of n: opener, what & why, steps..., result, close."""
    if k == 1:
        return roles[0]
    if k == n:
        return roles[4]
    if k == 2:
        return roles[1]
    if k == n - 1:
        return roles[3]
    return roles[2]


def _fmt_ts(sec: float) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}"


def build_script_prompt(
    style: str,
    tone: str,
    topic: str,
    source_title: str,
    shots: List[Dict[str, Any]],
    target_duration: int,
    language: str = "id",
) -> Tuple[str, str]:
    t = _TEXT["en" if language == "en" else "id"]
    n = len(shots)
    per_line = target_duration * WORDS_PER_SEC / max(1, n)
    lo, hi = max(5, round(per_line * 0.8)), round(per_line * 1.2)
    roles = _ROLES["en" if language == "en" else "id"]
    # Only STEP/RESULT lines get the shot description; showing it on the opener/what/close lines
    # makes models narrate shot 1 on line 3 (every step shifts by two).
    def shot_line(k: int, s: Dict[str, Any]) -> str:
        role = _role(k, n, roles)
        desc = (s.get("description") or "").strip()[:160] if role in roles[2:4] else "-"
        return f"{k}. [{_fmt_ts(float(s.get('start_time', 0.0)))}] {desc} -> {role}"

    shot_lines = "\n".join(shot_line(k, s) for k, s in enumerate(shots, start=1))
    label = "STYLE" if language == "en" else "GAYA"
    system = f"{label}:\n{style.strip()}\n\n" + t["rules"].format(n=n, lo=lo, hi=hi, tone=tone, dur=target_duration)
    user = t["user"].format(
        topic=(topic or "").strip() or t["no_topic"],
        title=(source_title or "-").strip(),
        shots=shot_lines,
        n=n,
    )
    return system, user


# ---------------------------------------------------------------------------
# 3. Parse
# ---------------------------------------------------------------------------

_NUMBERED = re.compile(r"^\s*(?:\*\*)?\d+\s*[.)\]:-]\s*(?:\*\*)?\s*(.+)$")
_BRIEF = re.compile(r"^\s*(?:\*\*)?(?:inti|core|summary|ringkasan)(?:\*\*)?\s*:.*$", re.IGNORECASE | re.MULTILINE)
_EMOJI = re.compile("[\U0001F000-\U0001FFFF☀-➿️]")


def clean_spoken(text: str) -> str:
    """Strip what TTS must not read: brackets, emoji, markdown, labels, colons/semicolons."""
    s = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", text)
    s = _EMOJI.sub("", s)
    s = s.replace("**", "").replace("*", "").strip(" \"'“”")
    s = re.sub(r"^(?:hook|baris|line|kalimat|gambar|shot|scene)\s*\d*\s*[:\-]\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"(\d+):(\d+)", r"\1.\2", s)
    s = re.sub(r"\s*[;:]\s*", ", ", s)
    s = re.sub(r",\s*([.!?])", r"\1", s)
    return re.sub(r"\s+([.,!?])", r"\1", " ".join(s.split()))


def parse_script_lines(text: str) -> List[str]:
    """Numbered lines if the model gave them, else plain sentences (cheap models sometimes write a paragraph)."""
    # The "Inti:" brief only steers the model; it is never spoken.
    text = _BRIEF.sub("", text)
    numbered = [m.group(1) for m in (_NUMBERED.match(l) for l in text.splitlines()) if m]
    raw = numbered or re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    lines = [clean_spoken(l) for l in raw]
    return [l for l in lines if len(l.split()) >= 3]


def segments_from_lines(lines: List[str], shots: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    segs = []
    for i, line in enumerate(lines):
        seg: Dict[str, Any] = {"id": f"seg-{i + 1}", "text": line, "start_ms": 0, "end_ms": 0, "words": []}
        if shots and i < len(shots):
            seg["scene_id"] = shots[i]["id"]
        segs.append(seg)
    return segs


async def generate_narration_script(
    adapter: BaseLLMAdapter,
    style: str,
    tone: str,
    topic: str,
    source_title: str,
    scenes: List[Dict[str, Any]],
    target_duration: int = 55,
    language: str = "id",
) -> Tuple[str, List[Dict[str, Any]]]:
    """Returns (raw_text with one line per shot, segments with scene_id)."""
    shots = pick_story_shots(scenes, line_count_for(target_duration))
    if not shots:
        raise ValueError("Belum ada scene. Analisis video dulu di tab Media.")

    system, user = build_script_prompt(style, tone, topic, source_title, shots, target_duration, language)
    lines = parse_script_lines(await adapter.generate_chat(prompt=user, system_prompt=system))
    if len(lines) < max(2, len(shots) // 2):
        retry = _TEXT["en" if language == "en" else "id"]["retry"].format(n=len(shots))
        lines = parse_script_lines(await adapter.generate_chat(prompt=f"{user}\n\n{retry}", system_prompt=system))
        if len(lines) < max(2, len(shots) // 2):
            raise ValueError(f"Model AI tidak mengikuti format ({len(lines)} dari {len(shots)} baris). Coba lagi atau ganti model.")

    # A model that repeats its hook at the end breaks the loop feel.
    if len(lines) >= 4 and lines[0].lower() == lines[-1].lower():
        lines = lines[:-1]
    return "\n".join(lines), segments_from_lines(lines, shots)


# ---------------------------------------------------------------------------
# 4. Re-split after a manual edit
# ---------------------------------------------------------------------------

def split_into_sentence_segments(text: str) -> List[Dict[str, Any]]:
    """One segment per line when the script is line-based (generated scripts), else per sentence."""
    if "\n" in text.strip():
        raw = [l for l in text.splitlines() if l.strip()]
        raw = [(_NUMBERED.match(l).group(1) if _NUMBERED.match(l) else l) for l in raw]
    else:
        raw = re.split(r"(?<=[.!?])\s+", text.strip())
    return segments_from_lines([c for c in (clean_spoken(l) for l in raw) if len(c) >= 3])
