import asyncio
import json
import logging
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
from scenedetect import AdaptiveDetector, ContentDetector

log = logging.getLogger(__name__)

# Executor dedicated untuk deteksi scene agar tidak kelaparan thread asyncio lain
_DETECT_EXECUTOR = ThreadPoolExecutor(max_workers=1)


async def get_video_metadata(video_path: str) -> Dict[str, Any]:
    """Inspect video file width, height, duration, and fps using ffprobe."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate,duration:format=duration",
        "-of",
        "json",
        video_path,
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(f"Gagal membaca metadata video: {stderr.decode()}")

    data = json.loads(stdout.decode())
    streams = data.get("streams") or [{}]
    stream = streams[0] if streams else {}
    fmt = data.get("format", {})

    width = int(stream.get("width", 1920))
    height = int(stream.get("height", 1080))

    duration_str = stream.get("duration") or fmt.get("duration") or "0"
    duration = float(duration_str)

    # Frame rate e.g. "30/1" or "29.97"
    fps_str = stream.get("r_frame_rate", "30/1")
    if "/" in fps_str:
        num, den = fps_str.split("/")
        fps = round(float(num) / float(den), 2) if float(den) > 0 else 30.0
    else:
        fps = float(fps_str)

    return {
        "width": width,
        "height": height,
        "duration": duration,
        "fps": fps,
    }


def extract_frame(video_path: str, timestamp_sec: float, output_path: str) -> bool:
    """Extract a single frame at timestamp_sec using FFmpeg (with OpenCV fallback) and save as JPEG."""
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    # 1. Primary: FFmpeg CLI (Native support for all codecs: AV1, VP9, HEVC, H.264, ProRes, MKV, WebM)
    cmd = [
        "ffmpeg",
        "-v", "error",
        "-ss", str(max(0.0, timestamp_sec)),
        "-i", str(video_path),
        "-vframes", "1",
        "-q:v", "2",
        "-y",
        str(output_path),
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, timeout=15)
        if res.returncode == 0 and out_p.exists() and out_p.stat().st_size > 0:
            return True
    except Exception as e:
        log.warning("FFmpeg frame extraction failed for %s at %ss: %s", video_path, timestamp_sec, e)

    # 2. Secondary fallback: OpenCV cv2.VideoCapture
    try:
        cap = cv2.VideoCapture(str(video_path))
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_sec * 1000.0)
            ret, frame = cap.read()
            cap.release()
            if ret and frame is not None:
                cv2.imwrite(str(output_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                return True
    except Exception as e:
        log.warning("OpenCV fallback frame extraction failed for %s: %s", video_path, e)

    return False


def extract_frames_batch(video_path: str, items: List[Tuple[float, str]], max_workers: int = 6) -> int:
    """Extract multiple frames from a video in parallel."""
    if not items:
        return 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(extract_frame, video_path, t, p)
            for t, p in items
        ]
        results = [f.result() for f in futures]
    return sum(1 for r in results if r)

def _extract_chunk(video_path: str, windows: List[Tuple[float, float]], out_pattern: str) -> bool:
    """Satu panggilan ffmpeg untuk <=SELECT_CHUNK frame (limit parser select ~150 rentang).
    windows: list (lo, hi) disjoint — masing-masing menampung tepat 1 frame."""
    filters = "+".join(f"between(t,{lo:.4f},{hi:.4f})" for lo, hi in windows)
    cmd = [
        "ffmpeg",
        "-v", "error",
        "-i", video_path,
        # Downscale max 640px: cukup untuk thumbnail UI + vision tagging (payload Gemini lebih kecil)
        "-vf", f"select='{filters}',scale='min(640,iw)':-2",
        "-vsync", "0",
        "-frames:v", str(len(windows)),
        "-q:v", "3",
        "-y",
        out_pattern,
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, timeout=600)
        return res.returncode == 0
    except Exception as e:
        log.warning("chunk extraction failed for %s: %s", video_path, e)
        return False


def extract_frames_single_pass(video_path: str, items: List[Tuple[float, str]]) -> int:
    """Extract banyak frame dengan ffmpeg chunked: decode video hanya per-chunk
    (bukan per-frame). Timestamp di-snap ke frame terdekat sehingga tiap jendela
    select menampung tepat 1 frame (output %04d kronologis, mapping 1:1).
    Fallback ke extract_frames_batch untuk frame yang gagal."""
    if not items:
        return 0

    # fps video untuk snap frame
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", video_path],
            capture_output=True, timeout=30,
        )
        rate = probe.stdout.decode().strip()
        num, den = (rate.split("/") + ["1"])[:2]
        fps = float(num) / float(den) if float(den) else 30.0
    except Exception:
        fps = 30.0
    if fps <= 0:
        fps = 30.0
    half = 0.49 / fps  # < setengah interval frame -> jendela berisi tepat 1 frame

    # snap ke frame terdekat; frame sama dipakai >1 target -> copy untuk target kedua
    snapped: Dict[int, Tuple[float, str]] = {}  # frame_num -> (pts, target utama)
    for t, target in items:
        fn = round(t * fps)
        if fn < 0:
            continue
        snapped.setdefault(fn, (fn / fps, target))
    ordered = sorted(snapped.items())  # [(fn, (pts, target))]

    SELECT_CHUNK = 100  # aman di bawah limit parser expression select
    out_dir = Path(items[0][1]).parent
    ok_frames: Dict[int, Path] = {}  # frame_num -> tmp file

    for ci in range(0, len(ordered), SELECT_CHUNK):
        chunk = ordered[ci : ci + SELECT_CHUNK]
        tmp_prefix = out_dir / f"_sp{ci // SELECT_CHUNK:03d}_"
        pattern = str(tmp_prefix) + "%04d.jpg"
        windows = [(pts - half, pts + half) for _, (pts, _) in chunk]
        if _extract_chunk(video_path, windows, pattern):
            outs = sorted(out_dir.glob(f"{tmp_prefix.name}*.jpg"))
            if len(outs) >= len(chunk):
                for (fn, _), src in zip(chunk, outs, strict=False):
                    ok_frames[fn] = src
                continue
            log.warning("chunk %d: expected %d frames, got %d", ci // SELECT_CHUNK, len(chunk), len(outs))
        else:
            log.warning("chunk %d: ffmpeg failed", ci // SELECT_CHUNK)
        break  # chunk gagal -> sisa lewat fallback per-frame

    # Rename/copy hasil ke path target
    n = 0
    renamed: set = set()
    for fn, (_, target) in ordered:
        src = ok_frames.get(fn)
        if src is None:
            continue
        try:
            if fn in renamed:
                import shutil
                shutil.copyfile(src, target)
            else:
                if src.name != Path(target).name:
                    os.replace(src, target)
                renamed.add(fn)
            n += 1
        except OSError:
            pass

    # bersihkan sisa tmp
    for p in out_dir.glob("_sp*_*.jpg"):
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass

    # fallback untuk yang gagal (subprocess per frame, paralel)
    missing = [(t, target) for t, target in items if round(t * fps) not in ok_frames]
    if missing:
        n += extract_frames_batch(video_path, missing)
    return n


async def detect_silences(video_path: str, min_silence_sec: float = 0.35, noise_db: float = -35.0) -> List[Tuple[float, float]]:
    """Deteksi rentang silence via ffmpeg silencedetect. Return list (start, end)."""
    cmd = [
        "ffmpeg",
        "-v", "info",
        "-i", video_path,
        "-vn",
        "-af", f"silencedetect=noise={noise_db}dB:d={min_silence_sec}",
        "-f", "null", "-",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        text = stderr.decode(errors="replace")

        silences: List[Tuple[float, float]] = []
        starts = [float(m) for m in re.findall(r"silence_start:\s*([0-9.]+)", text)]
        ends = [float(m) for m in re.findall(r"silence_end:\s*([0-9.]+)", text)]
        for i, s in enumerate(starts):
            e = ends[i] if i < len(ends) else s + min_silence_sec
            silences.append((s, e))
        return silences
    except Exception as e:
        log.warning("silencedetect failed for %s: %s", video_path, e)
        return []


def _split_at_silences(
    silences: List[Tuple[float, float]],
    total_duration: float,
    fps: float,
    target_len: float = 4.0,
    max_len: float = 6.0,
) -> List[Tuple[float, float]]:
    """Bagi video di titik silence terdekat dari grid target_len.
    Fallback ke grid biasa bila tidak ada silence yang bisa dipakai."""
    frame = 1.0 / fps if fps > 0 else 1.0 / 30.0
    # Titik kandidat: tengah tiap rentang silence
    candidates = [round((s + e) / 2.0, 3) for s, e in silences if e > s]

    cuts: List[float] = []
    cur = 0.0
    next_grid = target_len
    while next_grid < total_duration - 0.5:
        # pilih silence terdekat dengan grid; batasi deviasi +-1.5s
        best = None
        for c in candidates:
            if cur + 0.8 <= c <= next_grid + 1.5:
                best = c if best is None else (best if abs(best - next_grid) <= abs(c - next_grid) else c)
        cut = best if best is not None else next_grid
        cuts.append(max(cur + 0.5, min(cut, total_duration - frame - 0.1)))
        cur = cut
        next_grid = cur + target_len

    scenes: List[Tuple[float, float]] = []
    prev = 0.0
    for c in cuts:
        # anti-bleeding: mundur 1 frame
        end = c - frame if c - frame > prev else c
        scenes.append((prev, end))
        prev = c
    if prev < total_duration - 0.2:
        scenes.append((prev, total_duration))

    # merge segmen yang terlalu pendek
    merged: List[List[float]] = []
    for s, e in scenes:
        if merged and (e - s) < 1.0:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def _sharpness(image_path: str) -> float:
    """Variance Laplacian sebagai proxy ketajaman frame."""
    try:
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return -1.0
        return float(cv2.Laplacian(img, cv2.CV_64F).var())
    except Exception:
        return -1.0


def pick_sharpest(candidates: List[str], final_path: str) -> str:
    """Pilih gambar paling tajam, pindahkan isinya ke final_path, hapus sisanya.
    Referensi lama (keyframe_paths/thumbnail_path) tetap valid karena path tidak berubah."""
    valid = [
        p for p in candidates
        if Path(p).exists() and Path(p).stat().st_size > 0
    ]
    if not valid:
        return final_path
    scored = sorted(((_sharpness(p), p) for p in valid), reverse=True)
    best = scored[0][1] if scored[0][0] >= 0 else valid[0]
    if best != final_path:
        try:
            os.replace(best, final_path)
        except OSError:
            return best  # keep best path bila rename gagal
    # hapus kandidat sisanya
    for _, p in scored[1:]:
        if p != final_path:
            try:
                Path(p).unlink(missing_ok=True)
            except Exception:
                pass
    return final_path


# ─────────────────────────────────────────────────────────────────────────────
# Shot-precise detection
#
# Prinsip: over-detect aman, under-detect fatal. Cut palsu hanya mempersempit
# area aman (usable range); cut yang terlewat bocor jadi flash scene di timeline.
# Karena itu SEMUA cut dideteksi (multi-detektor, tanpa frame_skip, min_scene_len
# kecil), lalu shot pendek digabung untuk tampilan Media Pool — tetapi posisi
# cut-nya dicatat di `shot_info` agar matching tidak pernah mengiris melewatinya.
# ─────────────────────────────────────────────────────────────────────────────
SHOT_INFO_VERSION = 1
FLASH_MIN_SEC = 1.5          # shot < ini = flash, tidak boleh tampil sendiri di timeline
MONTAGE_MIN_SEC = 3.0        # rangkaian flash >= ini jadi scene sendiri (tanpa usable range)
CUT_HEAD_MARGIN = 0.12       # jarak aman setelah cut (≈ 3-4 frame)
CUT_TAIL_MARGIN = 0.15       # jarak aman sebelum cut
SOFT_EDGE_MARGIN = 0.05      # margin batas non-cut (awal/akhir video, titik silence)
MIN_USABLE_RANGE_SEC = 1.0
DETECT_MIN_SHOT_SEC = 0.25   # min_scene_len detektor (anti double-trigger flash frame)
CUT_DEDUP_FRAMES = 2         # cut dari detektor berbeda yang berjarak <= N frame = cut yang sama


def _build_shot_detectors(fps: float) -> list:
    """Kombinasi detektor yang saling menutup titik buta masing-masing."""
    min_len = max(3, int(round(DETECT_MIN_SHOT_SEC * fps)))
    detectors: list = [
        # Cut umum, adaptif terhadap gerakan kamera
        AdaptiveDetector(adaptive_threshold=3.0, min_scene_len=min_len, min_content_val=15.0),
        # Cut saat gerakan tinggi (Adaptive cenderung meredam cut seperti ini)
        ContentDetector(threshold=27.0, min_scene_len=min_len),
    ]
    try:
        # Shot-reverse-shot / warna mirip: perbandingan struktur (perceptual hash)
        from scenedetect.detectors import HashDetector

        detectors.append(HashDetector(threshold=0.395, min_scene_len=min_len))
    except Exception as e:  # pragma: no cover - tergantung versi scenedetect
        log.debug("HashDetector unavailable: %s", e)
    try:
        # Fade in/out & flash hitam
        from scenedetect.detectors import ThresholdDetector

        detectors.append(ThresholdDetector(threshold=12.0, min_scene_len=min_len, add_final_scene=False))
    except Exception as e:  # pragma: no cover
        log.debug("ThresholdDetector unavailable: %s", e)
    return detectors


def _open_video_safe(video_path: str):
    """Buka video dengan backend PyAV sebagai prioritas utama (mendukung AV1, VP9, H.264, HEVC, ProRes)
    dengan fallback ke OpenCV bila PyAV tidak tersedia."""
    try:
        import av
        av.logging.set_level(av.logging.ERROR)
    except Exception:
        pass

    from scenedetect import open_video

    try:
        return open_video(video_path, backend="pyav")
    except Exception as e:
        log.warning("PySceneDetect open_video(backend='pyav') failed for %s: %s, falling back to default/opencv", video_path, e)
        return open_video(video_path)


def find_shot_cuts_ffmpeg(
    video_path: str,
    start_sec: Optional[float] = None,
    end_sec: Optional[float] = None,
    threshold: float = 0.28,
) -> List[float]:
    """Deteksi cut visual menggunakan filter scene detection native FFmpeg.
    Sangat tangguh untuk semua format/codec tanpa kendala decoding (AV1, VP9, H.264, dll)."""
    cmd = ["ffmpeg"]
    if start_sec and start_sec > 0:
        cmd.extend(["-ss", str(start_sec)])
    cmd.extend(["-i", str(video_path)])
    if end_sec and start_sec and end_sec > start_sec:
        cmd.extend(["-t", str(end_sec - start_sec)])
    elif end_sec:
        cmd.extend(["-t", str(end_sec)])

    cmd.extend([
        "-filter_complex", f"select='gt(scene,{threshold})',metadata=print",
        "-f", "null", "-",
    ])

    try:
        res = subprocess.run(cmd, capture_output=True, timeout=300)
        output = res.stderr.decode(errors="replace")
        cuts: List[float] = []
        offset = float(start_sec) if start_sec and start_sec > 0 else 0.0
        for m in re.finditer(r"pts_time:([0-9.]+)", output):
            t = float(m.group(1)) + offset
            cuts.append(round(t, 4))
        return cuts
    except Exception as e:
        log.warning("FFmpeg native scene detect failed for %s: %s", video_path, e)
        return []


def find_shot_cuts(
    video_path: str,
    start_sec: Optional[float] = None,
    end_sec: Optional[float] = None,
) -> Tuple[List[float], float]:
    """Deteksi semua cut (detik, absolut) dalam video / rentang [start_sec, end_sec].
    Menggunakan Dual-Engine: PySceneDetect (PyAV backend) + FFmpeg native scene detection
    untuk akurasi 100% dan kekebalan terhadap codec failure (AV1/VP9).

    Return (cuts, fps). Blocking — jalankan di executor.
    """
    from scenedetect import SceneManager

    fps = 30.0
    pyscene_cuts: List[float] = []

    # Engine 1: PySceneDetect dengan PyAV backend
    try:
        video = _open_video_safe(video_path)
        fps = float(video.frame_rate or 30.0) or 30.0
        sm = SceneManager()
        # Kecepatan dari downscale (bukan frame_skip yang merusak perbandingan antar frame)
        sm.auto_downscale = True
        for det in _build_shot_detectors(fps):
            sm.add_detector(det)

        if start_sec and start_sec > 0:
            video.seek(float(start_sec))
        sm.detect_scenes(video, end_time=float(end_sec) if end_sec else None, frame_skip=0)
        scene_list = sm.get_scene_list()

        cut_frames = sorted({sc[0].get_frames() for sc in scene_list[1:]})
        deduped: List[int] = []
        for f in cut_frames:
            if deduped and f - deduped[-1] <= CUT_DEDUP_FRAMES:
                continue
            deduped.append(f)
        pyscene_cuts = [round(f / fps, 4) for f in deduped]
    except Exception as e:
        log.warning("PySceneDetect engine failed for %s: %s", video_path, e)

    # Engine 2: FFmpeg native scene detection
    ffmpeg_cuts: List[float] = []
    try:
        ffmpeg_cuts = find_shot_cuts_ffmpeg(video_path, start_sec=start_sec, end_sec=end_sec)
    except Exception as e:
        log.warning("FFmpeg native scene detect failed for %s: %s", video_path, e)

    # Union & Deduplicate (toleransi 0.15s ≈ 4-5 frame)
    all_cuts = sorted(pyscene_cuts + ffmpeg_cuts)
    final_cuts: List[float] = []
    for c in all_cuts:
        if final_cuts and abs(c - final_cuts[-1]) <= 0.15:
            continue
        final_cuts.append(c)

    log.info(
        "Dual-engine shot detection for %s: PySceneDetect=%d cuts, FFmpeg=%d cuts -> Unified=%d cuts (fps=%.2f)",
        video_path, len(pyscene_cuts), len(ffmpeg_cuts), len(final_cuts), fps,
    )
    return final_cuts, fps


def find_cuts_in_range(video_path: str, start_sec: float, end_sec: float) -> List[float]:
    """Cut yang berada di dalam (start_sec, end_sec). Dipakai verifikasi scene lama."""
    if end_sec <= start_sec:
        return []
    # Mulai sedikit sebelum start agar detektor punya frame pembanding
    lead = 0.2
    cuts, fps = find_shot_cuts(video_path, max(0.0, start_sec - lead), end_sec + 0.05)
    frame = 1.0 / fps
    return [c for c in cuts if start_sec + frame < c < end_sec - frame]


def _usable_range(s: float, e: float, head_cut: bool, tail_cut: bool) -> Optional[List[float]]:
    a = s + (CUT_HEAD_MARGIN if head_cut else (SOFT_EDGE_MARGIN if s > 0 else 0.0))
    b = e - (CUT_TAIL_MARGIN if tail_cut else SOFT_EDGE_MARGIN)
    if b - a >= MIN_USABLE_RANGE_SEC:
        return [round(a, 3), round(b, 3)]
    return None


def group_shots_into_scenes(
    boundaries: List[float],
    total_duration: float,
    fps: float,
    hard_cuts: bool = True,
) -> List[Dict[str, Any]]:
    """Kelompokkan shot menjadi scene Media Pool.

    - Shot >= FLASH_MIN_SEC menjadi jangkar scene.
    - Rangkaian shot flash pendek ditempel ke jangkar sebelumnya (atau berikutnya bila
      di awal video). Rangkaian flash panjang (montage) jadi scene sendiri tanpa usable range.
    - `usable_ranges` hanya berisi shot utuh (>= FLASH_MIN_SEC) dikurangi margin cut.

    boundaries: titik batas shot (detik, tanpa 0 & total). hard_cuts=False untuk batas
    non-visual (silence split) sehingga margin lebih kecil.
    """
    frame = 1.0 / fps if fps > 0 else 1.0 / 30.0
    pts = [0.0] + sorted(b for b in boundaries if frame < b < total_duration - frame) + [total_duration]
    shots = [(pts[i], pts[i + 1]) for i in range(len(pts) - 1) if pts[i + 1] > pts[i]]
    if not shots:
        return []

    groups: List[List[Tuple[float, float]]] = []
    pending: List[Tuple[float, float]] = []  # rangkaian flash yang belum punya jangkar
    carry_to_next: List[Tuple[float, float]] = []

    def _run_dur(run: List[Tuple[float, float]]) -> float:
        return run[-1][1] - run[0][0] if run else 0.0

    for shot in shots:
        if shot[1] - shot[0] >= FLASH_MIN_SEC:
            if pending:
                if _run_dur(pending) >= MONTAGE_MIN_SEC:
                    groups.append(pending)
                elif groups:
                    groups[-1].extend(pending)
                else:
                    carry_to_next = pending  # flash di awal video -> tempel ke jangkar pertama
                pending = []
            groups.append(carry_to_next + [shot])
            carry_to_next = []
        else:
            pending.append(shot)

    if pending:
        if groups and _run_dur(pending) < MONTAGE_MIN_SEC:
            groups[-1].extend(pending)
        else:
            groups.append(pending)

    scenes: List[Dict[str, Any]] = []
    for g in groups:
        g_start, g_end = g[0][0], g[-1][1]
        ranges: List[List[float]] = []
        for s, e in g:
            if e - s < FLASH_MIN_SEC:
                continue
            r = _usable_range(
                s, e,
                head_cut=hard_cuts and s > frame,
                tail_cut=hard_cuts and e < total_duration - frame,
            )
            if r:
                ranges.append(r)
        # Anti-bleeding: end_time = frame terakhir scene ini (batas = frame pertama scene berikut)
        end_time = g_end - frame if g_end < total_duration - frame and g_end - frame > g_start else g_end
        scenes.append({
            "start_time": round(g_start, 3),
            "end_time": round(end_time, 3),
            "shot_info": {
                "version": SHOT_INFO_VERSION,
                "internal_cuts": [round(s, 3) for s, _ in g[1:]] if hard_cuts else [],
                "usable_ranges": ranges,
                "usable_duration": round(max((b - a for a, b in ranges), default=0.0), 3),
                "shot_count": len(g),
                "montage": not ranges,
            },
        })
    return scenes


async def detect_scenes(
    video_path: str,
    output_dir: str,
) -> List[Dict[str, Any]]:
    """Detect scenes (shot-precise) in video and extract representative thumbnails."""
    meta = await get_video_metadata(video_path)
    total_duration = meta["duration"]
    fps = float(meta.get("fps") or 30.0)
    if fps <= 0:
        fps = 30.0

    out_p = Path(output_dir)
    out_p.mkdir(parents=True, exist_ok=True)

    loop = asyncio.get_running_loop()

    def _run_detection() -> Optional[List[float]]:
        try:
            cuts, det_fps = find_shot_cuts(video_path)
            return cuts
        except Exception as e:
            log.warning("PySceneDetect error: %s, falling back to silence segmentation", e)
            return None

    cuts = await loop.run_in_executor(_DETECT_EXECUTOR, _run_detection)

    if cuts:
        raw_scenes = group_shots_into_scenes(cuts, total_duration, fps, hard_cuts=True)
        log.info(
            "Shot detection: %d cuts -> %d scenes (%d montage) for %s (duration=%.1fs, fps=%.2f)",
            len(cuts), len(raw_scenes),
            sum(1 for s in raw_scenes if s["shot_info"]["montage"]),
            video_path, total_duration, fps,
        )
    else:
        # Tidak ada cut visual (atau deteksi gagal): bagi di titik silence audio.
        # Batasnya bukan cut visual, jadi seluruh segmen aman dipakai.
        silences = await detect_silences(video_path)
        segments = _split_at_silences(silences, total_duration, fps)
        boundaries = [s for s, _ in segments[1:]]
        raw_scenes = group_shots_into_scenes(boundaries, total_duration, fps, hard_cuts=cuts is None)
        log.info(
            "No visual cuts detected; split into %d segments using %d silence points",
            len(raw_scenes), len(silences),
        )

    scenes_data: List[Dict[str, Any]] = []
    extraction_tasks: List[Tuple[float, str]] = []

    for idx, raw in enumerate(raw_scenes):
        start_t, end_t = raw["start_time"], raw["end_time"]
        shot_info = raw["shot_info"]
        duration = round(end_t - start_t, 3)

        # Thumbnail & keyframe diambil dari shot terpanjang (bukan tengah scene yang
        # bisa saja jatuh di shot flash)
        ranges = shot_info["usable_ranges"]
        if ranges:
            rep_s, rep_e = max(ranges, key=lambda r: r[1] - r[0])
        else:
            rep_s, rep_e = start_t, end_t
        rep_dur = max(0.0, rep_e - rep_s)

        mid_t = rep_s + (rep_dur / 2.0)
        thumb_filename = f"thumb_{idx:04d}_{int(start_t*1000)}.jpg"
        thumb_abs = str(out_p / thumb_filename)

        # Kandidat thumbnail: 25% / 50% / 75% durasi — pilih paling tajam (anti motion blur)
        cands = [thumb_abs]
        if rep_dur >= 1.2:
            for ci, frac in enumerate((0.25, 0.75)):
                cp = str(out_p / f"thumbcand_{idx:04d}_{ci}.jpg")
                cands.append(cp)
                extraction_tasks.append((rep_s + rep_dur * frac, cp))
        extraction_tasks.append((mid_t, thumb_abs))

        # Extract keyframes for vision model (start, middle, end)
        keyframe_paths = [thumb_abs]
        if rep_dur >= 3.0:
            kf2 = str(out_p / f"kf_{idx:04d}_2.jpg")
            # Clamp keyframe start+0.5 agar tetap di dalam shot
            kf2_t = min(rep_s + 0.5, rep_e - 0.1)
            if kf2_t > rep_s:
                extraction_tasks.append((kf2_t, kf2))
                keyframe_paths.append(kf2)

        scenes_data.append({
            "scene_index": idx,
            "start_time": round(start_t, 3),
            "end_time": round(end_t, 3),
            "duration": duration,
            "thumbnail_path": thumb_abs,
            "keyframe_paths": keyframe_paths,
            "shot_info": shot_info,
            "_thumb_candidates": cands,
        })

    # Batch extract all thumbnails & keyframes: single-pass ffmpeg (decode sekali)
    if extraction_tasks:
        await loop.run_in_executor(_DETECT_EXECUTOR, extract_frames_single_pass, video_path, extraction_tasks)

    # Pilih thumbnail paling tajam per scene (dipindah ke path thumb_ agar referensi stabil)
    for sc in scenes_data:
        cands = sc.pop("_thumb_candidates")
        if len(cands) > 1:
            sc["thumbnail_path"] = pick_sharpest(cands, cands[0])

    return scenes_data


async def resolve_or_extract_scene_thumbnail(
    project_id: str,
    filename: str,
    storage_path: str,
    session_factory,
) -> Optional[Path]:
    """Resolve an existing scene thumbnail or extract it on-the-fly from source video."""
    storage_dir = Path(storage_path)
    file_path = storage_dir / "projects" / project_id / "scenes" / filename

    if file_path.exists() and file_path.stat().st_size > 0:
        return file_path

    from sqlalchemy import select

    from app.models.project import Scene, SourceVideo

    try:
        async with session_factory() as db:
            s_res = await db.execute(
                select(Scene).where(
                    Scene.project_id == project_id,
                    Scene.thumbnail_path.like(f"%{filename}"),
                )
            )
            scene = s_res.scalar_one_or_none()

            video_path = None
            timestamp_sec = 0.0

            if scene:
                timestamp_sec = scene.start_time + (scene.duration / 2.0)
                if scene.source_video_id:
                    v_res = await db.execute(
                        select(SourceVideo).where(SourceVideo.id == scene.source_video_id)
                    )
                    vid = v_res.scalar_one_or_none()
                    if vid and vid.file_path and Path(vid.file_path).exists():
                        video_path = vid.file_path

            if not video_path:
                parts = filename.replace(".jpg", "").split("_")
                if len(parts) >= 3 and parts[0] == "thumb" and parts[2].isdigit():
                    timestamp_sec = float(parts[2]) / 1000.0

                v_res = await db.execute(
                    select(SourceVideo).where(SourceVideo.project_id == project_id)
                )
                vids = v_res.scalars().all()
                for v in vids:
                    if v.file_path and Path(v.file_path).exists():
                        video_path = v.file_path
                        break

            if video_path:
                loop = asyncio.get_running_loop()
                ok = await loop.run_in_executor(
                    None, extract_frame, video_path, timestamp_sec, str(file_path)
                )
                if ok and file_path.exists() and file_path.stat().st_size > 0:
                    return file_path
    except Exception as e:
        log.warning("On-the-fly self healing thumbnail extraction failed for %s: %s", filename, e)

    return None
