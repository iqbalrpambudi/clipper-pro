import asyncio
import json
import logging
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Dict, Any, Tuple
import cv2
from scenedetect import ContentDetector, AdaptiveDetector

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
                for (fn, _), src in zip(chunk, outs):
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


async def detect_scenes(
    video_path: str,
    output_dir: str,
    threshold: float = 27.0,
    min_scene_len_sec: float = 0.8,
) -> List[Dict[str, Any]]:
    """Detect scenes in video and extract representative thumbnails."""
    meta = await get_video_metadata(video_path)
    total_duration = meta["duration"]
    fps = float(meta.get("fps") or 30.0)
    if fps <= 0:
        fps = 30.0

    out_p = Path(output_dir)
    out_p.mkdir(parents=True, exist_ok=True)

    loop = asyncio.get_running_loop()

    def _run_pyscenedetect(adaptive_threshold: float, frame_skip: int) -> List[Tuple[float, float]]:
        try:
            from scenedetect import SceneManager, open_video
            min_scene_frames = max(1, int(min_scene_len_sec * fps))

            def _detect(detector) -> List[Tuple[float, float]]:
                # SceneManager + frame_skip: skip N frame per iterasi untuk speed
                video = open_video(video_path)
                sm = SceneManager()
                sm.add_detector(detector)
                sm.detect_scenes(video, frame_skip=frame_skip)
                return sm.get_scene_list()

            # 1. AdaptiveDetector: adaptif terhadap gerakan kamera & cut dinamis
            scene_list = _detect(
                AdaptiveDetector(adaptive_threshold=adaptive_threshold, min_scene_len=min_scene_frames)
            )

            # 2. Fallback ke ContentDetector jika AdaptiveDetector tidak mendeteksi adegan
            if not scene_list:
                scene_list = _detect(
                    ContentDetector(threshold=threshold, min_scene_len=min_scene_frames)
                )

            results = []
            for scene in scene_list:
                start_sec = scene[0].get_seconds()
                start_frame = scene[0].get_frames()
                end_frame = scene[1].get_frames()

                # Anti-bleeding: scene[1] adalah frame pertama scene berikutnya,
                # kurangi 1 frame agar end_time tepat di frame terakhir scene ini:
                if end_frame > start_frame:
                    safe_end_frame = end_frame - 1
                    end_sec = safe_end_frame / fps
                else:
                    end_sec = scene[1].get_seconds()

                end_sec = max(start_sec, end_sec)
                results.append((start_sec, end_sec))
            return results
        except Exception as e:
            log.warning("PySceneDetect error: %s, falling back to time segmentation", e)
            return []

    # Adaptasi threshold: bila hasil terlalu sedikit/banyak, coba sekali lagi
    raw_scenes = await loop.run_in_executor(_DETECT_EXECUTOR, _run_pyscenedetect, 3.0, 1)
    min_expected = max(2, int(total_duration / 12.0))   # rata-rata scene <= 12s
    max_expected = max(4, int(total_duration / 0.8))    # rata-rata scene >= 0.8s
    if len(raw_scenes) < min_expected:
        log.info(
            "Scene detection returned %d scenes (< %d expected), retrying with lower threshold",
            len(raw_scenes), min_expected,
        )
        raw_scenes = await loop.run_in_executor(_DETECT_EXECUTOR, _run_pyscenedetect, 1.5, 0)
    elif len(raw_scenes) > max_expected:
        log.info(
            "Scene detection returned %d scenes (> %d expected), retrying with higher threshold",
            len(raw_scenes), max_expected,
        )
        raw_scenes = await loop.run_in_executor(_DETECT_EXECUTOR, _run_pyscenedetect, 5.0, 1)

    log.info(
        "Scene detection finished: %d scenes for %s (duration=%.1fs, fps=%.2f)",
        len(raw_scenes), video_path, total_duration, fps,
    )

    # Fallback if no cut detected: bagi di titik silence audio (batas natural), bukan grid buta
    if not raw_scenes:
        silences = await detect_silences(video_path)
        raw_scenes = _split_at_silences(silences, total_duration, fps)
        log.info(
            "No scenes detected by PySceneDetect; split into %d segments using %d silence points",
            len(raw_scenes), len(silences),
        )

    scenes_data: List[Dict[str, Any]] = []
    extraction_tasks: List[Tuple[float, str]] = []

    for idx, (start_t, end_t) in enumerate(raw_scenes):
        duration = round(end_t - start_t, 3)
        if duration < 0.8 and idx > 0 and idx == len(raw_scenes) - 1:
            # Append tiny last chunk to previous
            scenes_data[-1]["end_time"] = round(end_t, 3)
            scenes_data[-1]["duration"] = round(end_t - scenes_data[-1]["start_time"], 3)
            continue

        mid_t = start_t + (duration / 2.0)
        thumb_filename = f"thumb_{idx:04d}_{int(start_t*1000)}.jpg"
        thumb_abs = str(out_p / thumb_filename)

        # Kandidat thumbnail: 25% / 50% / 75% durasi — pilih paling tajam (anti motion blur)
        cands = [thumb_abs]
        if duration >= 1.2:
            for ci, frac in enumerate((0.25, 0.75)):
                cp = str(out_p / f"thumbcand_{idx:04d}_{ci}.jpg")
                cands.append(cp)
                extraction_tasks.append((start_t + duration * frac, cp))
        extraction_tasks.append((mid_t, thumb_abs))

        # Extract keyframes for vision model (start, middle, end)
        keyframe_paths = [thumb_abs]
        if duration >= 3.0:
            kf2 = str(out_p / f"kf_{idx:04d}_2.jpg")
            # Clamp keyframe start+0.5 agar tetap di dalam scene
            kf2_t = min(start_t + 0.5, end_t - 0.1)
            if kf2_t > start_t:
                extraction_tasks.append((kf2_t, kf2))
                keyframe_paths.append(kf2)

        scenes_data.append({
            "scene_index": idx,
            "start_time": round(start_t, 3),
            "end_time": round(end_t, 3),
            "duration": duration,
            "thumbnail_path": thumb_abs,
            "keyframe_paths": keyframe_paths,
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
