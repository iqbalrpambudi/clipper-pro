import asyncio
import re
from pathlib import Path
from typing import Any, Dict, List, Optional


async def get_audio_duration(file_path: str) -> float:
    """Accurately probe audio duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        return round(float(stdout.decode().strip()), 3)
    except Exception:
        return 0.0


def _build_audio_filter(rate: str = "+0%", pitch: str = "+0Hz", base_sample_rate: int = 24000) -> str:
    """Build FFmpeg audio filter string for rate (speed/tempo) and pitch adjustments."""
    def parse_rate(s: Optional[str]) -> float:
        if not s:
            return 1.0
        c = s.strip().rstrip("%")
        try:
            if c.startswith(("+", "-")):
                return round(1.0 + (float(c) / 100.0), 3)
            val = float(c)
            if val > 5.0:
                return round(val / 100.0, 3)
            return val
        except Exception:
            return 1.0

    def parse_pitch(s: Optional[str]) -> float:
        if not s:
            return 1.0
        c = s.strip().lower()
        if "hz" in c:
            try:
                # 5Hz on fundamental pitch is ~5% pitch shift
                return round(1.0 + (float(c.replace("hz", "")) * 0.01), 4)
            except Exception:
                return 1.0
        elif "%" in c:
            try:
                return round(1.0 + (float(c.replace("%", "")) / 100.0), 4)
            except Exception:
                return 1.0
        elif "st" in c:
            try:
                st = float(c.replace("st", ""))
                return round(2.0 ** (st / 12.0), 4)
            except Exception:
                return 1.0
        return 1.0

    rate_factor = parse_rate(rate)
    pitch_factor = parse_pitch(pitch)

    filters = []
    if abs(pitch_factor - 1.0) > 0.001:
        new_sr = int(base_sample_rate * pitch_factor)
        filters.append(f"asetrate={new_sr}")
        comp_tempo = rate_factor / pitch_factor
    else:
        comp_tempo = rate_factor

    if abs(comp_tempo - 1.0) > 0.001:
        if 0.5 <= comp_tempo <= 2.0:
            filters.append(f"atempo={round(comp_tempo, 4)}")
        elif comp_tempo > 2.0:
            filters.append("atempo=2.0")
            filters.append(f"atempo={round(comp_tempo / 2.0, 4)}")
        elif comp_tempo < 0.5:
            filters.append("atempo=0.5")
            filters.append(f"atempo={round(comp_tempo / 0.5, 4)}")

    if abs(pitch_factor - 1.0) > 0.001:
        filters.append(f"aresample={base_sample_rate}")

    return ",".join(filters)


def _split_text_for_tts(text: str, max_chars: int = 850) -> List[str]:
    """Split script into TTS-safe chunks at sentence/paragraph boundaries (~<=max_chars each).

    Uses a balanced chunk budget (default 850 chars ~ 50-60s audio) to keep LLM multimodal audio
    generation within reliable token limits while maintaining consistent intonation and minimizing
    the number of API requests. Guarantees each intermediate chunk ends with clean terminal
    punctuation (. ! ?) so Gemini TTS does not produce hanging pitch artifacts.
    """
    text = text.strip()
    if not text:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    raw_units: List[str] = []

    for p in paragraphs:
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", p) if s.strip()]
        for s in sentences:
            if len(s) <= max_chars:
                raw_units.append(s)
            else:
                # If a single sentence exceeds max_chars, split on clauses
                clauses = [c.strip() for c in re.split(r"(?<=[,;:])\s+", s) if c.strip()]
                cur_clause = ""
                for c in clauses:
                    if cur_clause and len(cur_clause) + len(c) + 1 > max_chars:
                        raw_units.append(cur_clause)
                        cur_clause = c
                    else:
                        cur_clause = f"{cur_clause} {c}".strip() if cur_clause else c
                if cur_clause:
                    raw_units.append(cur_clause)

    chunks: List[str] = []
    cur = ""
    for unit in raw_units:
        if not unit:
            continue
        separator = " " if cur else ""
        if cur and len(cur) + len(separator) + len(unit) > max_chars:
            chunks.append(cur)
            cur = unit
        else:
            cur = f"{cur}{separator}{unit}".strip()

    if cur:
        chunks.append(cur)

    # Ensure non-final chunks end with clean terminal punctuation (. ! ?)
    # to avoid awkward rising or truncated pitch at chunk boundaries
    cleaned_chunks: List[str] = []
    for i, chk in enumerate(chunks):
        c = chk.strip()
        if i < len(chunks) - 1 and not c.endswith((".", "!", "?", "…")):
            c = f"{c}."
        cleaned_chunks.append(c)

    return cleaned_chunks


async def _concat_mp3s(part_paths: List[str], output_path: str) -> float:
    """Concatenate mp3 parts via ffmpeg concat demuxer with EBU R128 loudness leveling."""
    list_file = Path(output_path).with_suffix(".concat.txt")
    list_file.write_text("".join(f"file '{p}'\n" for p in part_paths), encoding="utf-8")
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a", "libmp3lame", "-b:a", "192k", output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, _ = await proc.communicate()
        if proc.returncode != 0:
            # Fallback without loudnorm if audio is too short or filter fails
            proc2 = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c:a", "libmp3lame", "-b:a", "192k", output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr2 = await proc2.communicate()
            if proc2.returncode != 0:
                raise RuntimeError(f"FFmpeg concat failed: {stderr2.decode()[:300]}")
    finally:
        list_file.unlink(missing_ok=True)
    return await get_audio_duration(output_path)


def _group_segments_by_chapter(segments: Optional[List[Dict[str, Any]]]) -> List[str]:
    """Group consecutive narration segments by non-empty `chapter` title into chapter text blocks.

    Returns non-empty chapter text blocks ONLY when there are >= 2 distinct chapter blocks
    so multi-chapter YouTube storyboards receive natural ~1.2s chapter breathing pauses.
    """
    if not segments or not isinstance(segments, list):
        return []

    blocks: List[str] = []
    cur_chapter: Optional[str] = None
    cur_lines: List[str] = []

    for seg in segments:
        if not isinstance(seg, dict):
            continue
        chap = str(seg.get("chapter") or "").strip()
        txt = str(seg.get("text") or "").strip()
        if not chap or not txt or txt == "...":
            continue
        if cur_chapter is None:
            cur_chapter = chap
            cur_lines = [txt]
        elif chap == cur_chapter:
            cur_lines.append(txt)
        else:
            joined = "\n\n".join(cur_lines).strip()
            if joined:
                blocks.append(joined)
            cur_chapter = chap
            cur_lines = [txt]

    if cur_lines:
        joined = "\n\n".join(cur_lines).strip()
        if joined:
            blocks.append(joined)

    return blocks if len(blocks) >= 2 else []


async def _generate_silence_mp3(
    output_path: str,
    duration_sec: float = 1.2,
    reference_mp3_path: Optional[str] = None,
) -> str:
    """Generate a clean silent MP3 matching the sample rate & channel layout of `reference_mp3_path`."""
    sample_rate = 24000
    ch_layout = "mono"

    if reference_mp3_path and Path(reference_mp3_path).exists():
        probe_proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=sample_rate,channels",
            "-of", "default=noprint_wrappers=1:nokey=1",
            reference_mp3_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await probe_proc.communicate()
        lines = [ln.strip() for ln in stdout.decode(errors="ignore").splitlines() if ln.strip()]
        if len(lines) >= 1 and lines[0].isdigit():
            sample_rate = int(lines[0])
        if len(lines) >= 2 and lines[1].isdigit():
            ch_layout = "stereo" if int(lines[1]) >= 2 else "mono"

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"anullsrc=r={sample_rate}:cl={ch_layout}",
        "-t", f"{duration_sec:.2f}",
        "-c:a", "libmp3lame",
        "-b:a", "192k",
        output_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Failed generating chapter silence MP3: {stderr.decode(errors='ignore')[:200]}")
    return output_path
