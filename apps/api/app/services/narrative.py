"""Script writing: code picks the shots, the LLM writes one spoken line per shot.

Keeping the model's job to "write N numbered lines, line k is about shot k" makes cheap
models reliable. The scene <-> sentence link is then checked against what each line actually
says (align_lines_to_shots), so a model that adds, merges or skips a line cannot shift the visuals."""

import json
import logging
import math
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from app.prompts.narrative import DEFAULT_TEMPLATES
from app.services.ai_adapters.base import BaseLLMAdapter
from app.services.matching import (
    _calc_visual_satisfaction_boost,
    _get_scene_usable_range,
    is_filler_scene,
)

log = logging.getLogger(__name__)

__all__ = ["DEFAULT_TEMPLATES"]

WORDS_PER_SEC = 2.5  # reference explainer channel speaks 2.4-2.65 words/s
SEC_PER_LINE = 4.5  # one picked shot per spoken line; matching may add a second cut inside a line


def line_count_for(duration_sec: int) -> int:
    return max(4, round(duration_sec / SEC_PER_LINE))


# ---------------------------------------------------------------------------
# 1. Shots
# ---------------------------------------------------------------------------


def _usable(s: Dict[str, Any]) -> float:
    _, _, dur, montage = _get_scene_usable_range(s, SEC_PER_LINE)
    # Capped at one line's length: past that, the most satisfying shot wins, not the longest.
    return 0.0 if montage else min(dur, SEC_PER_LINE)


_RANGE_PROMPT = {
    "id": (
        "Ini daftar scene dari satu video sumber (nomor | waktu | isi).\n{scenes}\n\n"
        "Pilih SATU rentang scene berurutan yang menceritakan satu subjek atau satu proses dari awal sampai hasilnya, "
        "dengan minimal {n} scene. Kalau seluruh video memang satu proses, pilih semuanya. "
        'Jawab JSON saja: {{"start": nomor_awal, "end": nomor_akhir, "topic": "subjek dan prosesnya dalam satu kalimat"}}'
    ),
    "en": (
        "This is the scene list of one source video (number | time | content).\n{scenes}\n\n"
        "Pick ONE run of consecutive scenes that tells one subject or one process from start to result, "
        "with at least {n} scenes. If the whole video is one process, pick all of it. "
        'Answer JSON only: {{"start": first_number, "end": last_number, "topic": "the subject and its process in one sentence"}}'
    ),
}


async def pick_story_range(
    adapter: BaseLLMAdapter, scenes: List[Dict[str, Any]], n: int, language: str = "id"
) -> Tuple[List[Dict[str, Any]], str]:
    """One story inside the source: a compilation of many subjects gets cut down to its best
    single-subject chapter (one ingredient, one method), a single-process video keeps everything.
    The model only names the range; code checks it has enough usable shots."""
    content = sorted(
        [s for s in scenes if not is_filler_scene(s)] or scenes,
        key=lambda s: float(s.get("start_time", 0.0)),
    )
    if len(content) <= n:
        return content, ""
    listing = "\n".join(
        f"{i} | {_fmt_ts(float(s.get('start_time', 0.0)))} | {(s.get('description') or '').strip()[:90]}"
        for i, s in enumerate(content)
    )
    prompt = _RANGE_PROMPT["en" if language == "en" else "id"].format(scenes=listing, n=n)
    try:
        raw = await adapter.generate_chat(prompt=prompt, json_mode=True)
        data = json.loads(raw[raw.find("{") : raw.rfind("}") + 1])
        a, b = sorted((int(data["start"]), int(data["end"])))
        topic = str(data.get("topic") or "").strip()
    except Exception as exc:
        log.warning("Story range pick failed (%s); using the whole video", exc)
        return content, ""
    a, b = max(0, a), min(len(content) - 1, b)
    # Too few usable shots for the line count: widen evenly instead of trusting the model.
    while sum(1 for s in content[a : b + 1] if _usable(s) >= 2.5) < n and (
        a > 0 or b < len(content) - 1
    ):
        a, b = max(0, a - 1), min(len(content) - 1, b + 1)
    log.info("Story range %d-%d of %d scenes: %s", a, b, len(content), topic)
    return content[a : b + 1], topic


def pick_story_shots(scenes: List[Dict[str, Any]], n: int) -> List[Dict[str, Any]]:
    """Shot 1 is the most satisfying shot of the whole video (the hook shows the payoff first);
    the other n-1 are spread over the video (start -> end of the process), best shot per slice."""
    content = [s for s in scenes if not is_filler_scene(s)] or scenes
    ordered = sorted(content, key=lambda s: float(s.get("start_time", 0.0)))
    usable = _usable

    cands = [s for s in ordered if usable(s) >= 2.5]
    if len(cands) < n:
        cands = [s for s in ordered if usable(s) > 0] or ordered
    n = min(n, len(cands))
    if n == 0:
        return []

    def score(s: Dict[str, Any]) -> float:
        return usable(s) * _calc_visual_satisfaction_boost(s)

    hook = max(cands, key=score)
    rest = [s for s in cands if s is not hook]
    m = min(n - 1, len(rest))
    return [hook] + [
        max(rest[k * len(rest) // m : (k + 1) * len(rest) // m], key=score) for k in range(m)
    ]


# ---------------------------------------------------------------------------
# 2. Prompt
# ---------------------------------------------------------------------------

_TEXT = {
    "id": {
        "rules": (
            "FORMAT: video short explainer tentang SATU proses, sekitar {dur} detik. "
            "Satu narator menceritakan satu cerita utuh: apa yang dikerjakan, untuk apa, bagaimana caranya, dan hasil akhirnya.\n\n"
            "CARA MENULIS:\n"
            'Baris pertama tulis "Inti:" lalu satu kalimat: apa yang dikerjakan di video, tujuannya, dan hasil akhirnya.\n'
            "Setelah itu tulis tepat {n} baris bernomor 1. sampai {n}.\n\n"
            "PERAN BARIS (tertulis di ujung tiap gambar):\n"
            "- PEMBUKA: sesuai GAYA, tentang hal paling unik dari judul atau seluruh proses, bukan isi satu gambar. "
            "Satu pertanyaan atau pernyataan yang membuat penasaran.\n"
            "- APA & KENAPA: sebut nama benda atau kegiatannya dan alasan kenapa ini dilakukan.\n"
            "- TAHAP: tahap yang terjadi di gambar itu + alasannya (agar, supaya, karena, sehingga). "
            "Sambungkan dengan kata seperti setelah itu, lalu, sebelum, sekaligus, bedanya, artinya, tapi jangan di setiap baris.\n"
            '- TANTANGAN: "Namun, ..." masalah atau risiko di tahap gambar itu, lalu cara mereka mengatasinya.\n'
            "- HASIL: hasil dari prosesnya.\n"
            "- PENUTUP: menjawab pembuka. Rangkum caranya dalam satu kalimat (misalnya tiga bagian: A untuk ..., B untuk ..., dan C untuk ...) "
            "atau beri julukan yang mudah diingat.\n\n"
            "ATURAN:\n"
            "1. Baris ke-k diucapkan saat GAMBAR ke-k tampil dan menjalankan PERAN gambar ke-k. "
            "Tepat {n} baris: jangan menambah, menggabung, atau menggeser baris. "
            "Ceritakan sebagai lanjutan cerita, jangan mendeskripsikan gambarnya (cuaca, warna, sudut kamera seperti 'dari udara').\n"
            "2. Satu baris = satu kalimat, {lo}-{hi} kata.\n"
            "3. Bahasa Indonesia lisan yang rapi dan konsisten, sudut pandang orang ketiga (mereka, petani, pekerja). Nada {tone}. "
            "Jangan campur slang (gak, nggak, bikin, bener-bener).\n"
            "4. Jelaskan, jangan memuji: tiap baris menjawab bagaimana alat atau langkah itu bekerja dan kenapa. "
            "Hindari kata lebay (monster, gila, mustahil, canggih, dalam sekejap, tanpa sisa).\n"
            "5. Sebut nama bahan dan alat seperti di daftar gambar. Alasan boleh dari pengetahuan umum yang pasti benar, tapi jangan mengarang angka pasti (ton, kilogram, detik, menit), tempat, atau nama orang.\n"
            "6. Hanya kata yang diucapkan narator: tanpa judul, tanda kurung, emoji, ajakan subscribe, pertanyaan ke penonton (menurut kalian...), "
            "atau kata 'scene', 'kamera', 'gambar', 'video ini', 'di layar'."
        ),
        "user": (
            "Topik: {topic}\n"
            "Judul video sumber: {title}\n\n"
            "DAFTAR GAMBAR (gambar 1 = pembuka paling menarik, sisanya urut waktu dari awal sampai akhir proses):\n{shots}\n\n"
            "Contoh bentuk jawaban saja (topik lain, jangan disalin):\n"
            "Inti: pekerja memukul daging ikan berulang kali supaya menjadi bakso kenyal untuk dijual.\n"
            "1. Kenapa daging ikan ini dipukul berkali-kali sebelum dimasak?\n"
            "2. Ini adalah cara membuat bakso ikan yang kenyal tanpa bahan tambahan.\n"
            "3. Daging ikan lebih dulu dipisahkan dari kulit dan tulangnya agar adonannya halus.\n"
            "4. Setelah itu daging dipukul terus sehingga seratnya rapat dan lengket.\n\n"
            'Tulis "Inti:" lalu {n} baris sekarang:'
        ),
        "retry": 'Jawaban sebelumnya salah format. Tulis "Inti:" lalu tepat {n} baris bernomor, satu kalimat per baris, tanpa teks lain.',
        "no_topic": "simpulkan dari judul dan daftar gambar",
    },
    "en": {
        "rules": (
            "FORMAT: a short explainer video about ONE process, about {dur} seconds. "
            "One narrator tells one complete story: what is being done, why, how, and the final result.\n\n"
            "HOW TO WRITE:\n"
            'First write "Core:" and one sentence: what is done in the video, why, and the final result.\n'
            "Then write exactly {n} lines numbered 1. to {n}.\n\n"
            "LINE ROLES (written at the end of each shot):\n"
            "- OPENER: in the given STYLE, about the most unusual thing in the title or the whole process, not one shot. "
            "One question or statement that makes people curious.\n"
            "- WHAT & WHY: name the thing or activity and why it is done.\n"
            "- STEP: the step happening in that shot + why (so that, because, which). "
            "Link with words like then, after that, before, at the same time, the difference is, which means, but not on every line.\n"
            '- CHALLENGE: "But ..." a problem or risk at the step in that shot, then how they handle it.\n'
            "- RESULT: what the process produces.\n"
            "- CLOSE: answers the opener. Sum up the method in one sentence (for example three parts: A for ..., B for ..., and C for ...) "
            "or give it a memorable nickname.\n\n"
            "RULES:\n"
            "1. Line k is spoken while SHOT k is on screen and does the ROLE of shot k. "
            "Exactly {n} lines: never add, merge, or shift a line. "
            "Tell it as the next part of the story; do not describe the picture (weather, colors, camera angle like 'from above').\n"
            "2. One line = one sentence, {lo}-{hi} words.\n"
            "3. Natural, consistent spoken English, third person (they, the farmers, the workers). {tone} tone.\n"
            "4. Explain, do not hype: each line says how the tool or step works and why. "
            "Avoid hype words (monster, insane, impossible, high-tech, in seconds, nothing left).\n"
            "5. Name ingredients and tools as the shot list does. Reasons may come from general knowledge that is surely true, but do not invent exact numbers (tons, kilograms, seconds, minutes), places, or names.\n"
            "6. Only words the narrator says: no titles, brackets, emoji, subscribe calls, questions to the viewer (what do you think...), "
            "or words like 'scene', 'camera', 'shot', 'this video', 'on screen'."
        ),
        "user": (
            "Topic: {topic}\n"
            "Source video title: {title}\n\n"
            "SHOT LIST (shot 1 = the most striking opener, the rest in time order from start to end of the process):\n{shots}\n\n"
            "Answer shape example only (other topic, do not copy):\n"
            "Core: workers pound fish meat over and over so it becomes chewy fish balls to sell.\n"
            "1. Why is this fish meat pounded over and over before cooking?\n"
            "2. This is how chewy fish balls are made without any additives.\n"
            "3. The meat is first separated from the skin and bones so the paste turns smooth.\n"
            "4. After that it is pounded nonstop, packing the fibers tight and sticky.\n\n"
            'Write "Core:" and the {n} lines now:'
        ),
        "retry": 'Your last answer had the wrong format. Write "Core:" and then exactly {n} numbered lines, one sentence each, nothing else.',
        "no_topic": "infer it from the title and the shot list",
    },
}


_ROLES = {
    "id": ("PEMBUKA", "APA & KENAPA", "TAHAP", "HASIL", "PENUTUP", "TANTANGAN"),
    "en": ("OPENER", "WHAT & WHY", "STEP", "RESULT", "CLOSE", "CHALLENGE"),
}


def _role(k: int, n: int, roles: Tuple[str, ...]) -> str:
    """Story beat for line k of n: opener, what & why, steps (one challenge ~60% in), result, close."""
    if k == 1:
        return roles[0]
    if k == n:
        return roles[4]
    if k == 2:
        return roles[1]
    if k == n - 1:
        return roles[3]
    # A fixed challenge line; asking for a twist "somewhere" made models insert an extra line and shift every shot after it.
    if n >= 7 and k == round(n * 0.6):
        return roles[5]
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
        desc = (s.get("description") or "").strip()[:160] if role in roles[2:4] + roles[5:] else "-"
        return f"{k}. [{_fmt_ts(float(s.get('start_time', 0.0)))}] {desc} -> {role}"

    shot_lines = "\n".join(shot_line(k, s) for k, s in enumerate(shots, start=1))
    label = "STYLE" if language == "en" else "GAYA"
    system = f"{label}:\n{style.strip()}\n\n" + t["rules"].format(
        n=n, lo=lo, hi=hi, tone=tone, dur=target_duration
    )
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
_BRIEF = re.compile(
    r"^\s*(?:\*\*)?(?:inti|core|summary|ringkasan)(?:\*\*)?\s*:.*$", re.IGNORECASE | re.MULTILINE
)
_EMOJI = re.compile("[\U0001f000-\U0001ffff☀-➿️]")


def clean_spoken(text: str) -> str:
    """Strip what TTS must not read: brackets, emoji, markdown, labels, colons/semicolons."""
    s = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", text)
    s = _EMOJI.sub("", s)
    s = s.replace("**", "").replace("*", "").strip(" \"'“”")
    s = re.sub(
        r"^(?:hook|baris|line|kalimat|gambar|shot|scene)\s*\d*\s*[:\-]\s*",
        "",
        s,
        flags=re.IGNORECASE,
    )
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


def segments_from_lines(
    lines: List[str], shots: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    segs = []
    for i, line in enumerate(lines):
        seg: Dict[str, Any] = {
            "id": f"seg-{i + 1}",
            "text": line,
            "start_ms": 0,
            "end_ms": 0,
            "words": [],
        }
        if shots and i < len(shots):
            seg["scene_id"] = shots[i]["id"]
        segs.append(seg)
    return segs


_WORD = re.compile(r"[^\W\d_]{4,}")
_STAY_PENALTY = 0.05  # two lines on one shot only when the words say so
_POSITION_PRIOR = (
    0.1  # weaker than a real word match; decides lines that name nothing (opener, close)
)


def _words(text: Optional[str]) -> set:
    return {w.lower() for w in _WORD.findall(text or "")}


def align_lines_to_shots(lines: List[str], shots: List[Dict[str, Any]]) -> List[int]:
    """Shot index for every line, from what the line talks about rather than its position.

    Monotonic DP (story order): line 1 stays on the hook shot, a line may share the previous
    shot (merged/extra line) or skip shots (dropped line). Words shared with a shot description
    count by rarity across the shot list, so 'kubis' or 'pisau' weigh more than 'mesin'."""
    L, S = len(lines), len(shots)
    if not L or not S:
        return []
    docs = [_words(s.get("description")) for s in shots]
    df = Counter(w for d in docs for w in d)
    idf = {w: math.log((S + 1) / (c + 1)) for w, c in df.items()}
    norms = [sum(idf[w] for w in d) or 1.0 for d in docs]
    line_words = [_words(l) for l in lines]

    def gain(i: int, j: int) -> float:
        expected = round(i * (S - 1) / max(1, L - 1))
        shared = sum(idf[w] for w in line_words[i] & docs[j]) / norms[j]
        return shared + (_POSITION_PRIOR if j == expected else 0.0)

    neg = float("-inf")
    best = [[neg] * S for _ in range(L)]
    back = [[0] * S for _ in range(L)]
    best[0][0] = gain(0, 0)
    for i in range(1, L):
        run, arg = neg, 0
        for j in range(S):
            stay = best[i - 1][j] - _STAY_PENALTY
            prev, prev_j = (run, arg) if run >= stay else (stay, j)
            if prev > neg:
                best[i][j], back[i][j] = prev + gain(i, j), prev_j
            if best[i - 1][j] > run:
                run, arg = best[i - 1][j], j
    j = max(range(S), key=lambda k: best[L - 1][k])
    out = [0] * L
    for i in range(L - 1, -1, -1):
        out[i] = j
        j = back[i][j]
    return out


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
    n = line_count_for(target_duration)
    story_scenes, story_topic = await pick_story_range(adapter, scenes, n, language)
    shots = pick_story_shots(story_scenes, n)
    if not shots:
        raise ValueError("Belum ada scene. Analisis video dulu di tab Media.")

    system, user = build_script_prompt(
        style, tone, topic or story_topic, source_title, shots, target_duration, language
    )
    lines = parse_script_lines(await adapter.generate_chat(prompt=user, system_prompt=system))
    if len(lines) < max(2, len(shots) // 2):
        retry = _TEXT["en" if language == "en" else "id"]["retry"].format(n=len(shots))
        lines = parse_script_lines(
            await adapter.generate_chat(prompt=f"{user}\n\n{retry}", system_prompt=system)
        )
        if len(lines) < max(2, len(shots) // 2):
            raise ValueError(
                f"Model AI tidak mengikuti format ({len(lines)} dari {len(shots)} baris). Coba lagi atau ganti model."
            )

    # A model that repeats its hook at the end breaks the loop feel.
    if len(lines) >= 4 and lines[0].lower() == lines[-1].lower():
        lines = lines[:-1]
    picks = align_lines_to_shots(lines, shots)
    if picks != list(range(len(lines))):
        log.info("Script lines re-aligned to shots by content: %s", picks)
    return "\n".join(lines), segments_from_lines(lines, [shots[j] for j in picks])


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
