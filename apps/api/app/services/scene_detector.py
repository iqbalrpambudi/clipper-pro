import asyncio
import json
import logging
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Dict, Any, Tuple
import cv2
from scenedetect import detect, ContentDetector, AdaptiveDetector

log = logging.getLogger(__name__)


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


async def detect_scenes(
    video_path: str,
    output_dir: str,
    threshold: float = 27.0,
    min_scene_len_sec: float = 1.5,
) -> List[Dict[str, Any]]:
    """Detect scenes in video and extract representative thumbnails."""
    meta = await get_video_metadata(video_path)
    total_duration = meta["duration"]
    fps = float(meta.get("fps") or 30.0)
    if fps <= 0:
        fps = 30.0

    out_p = Path(output_dir)
    out_p.mkdir(parents=True, exist_ok=True)

    # Run PySceneDetect in thread pool
    loop = asyncio.get_running_loop()

    def _run_pyscenedetect() -> List[Tuple[float, float]]:
        try:
            min_scene_frames = max(1, int(min_scene_len_sec * fps))
            # 1. Coba dengan AdaptiveDetector (adaptif terhadap variasi gerakan kamera & scene cut dinamis)
            detector = AdaptiveDetector(adaptive_threshold=3.0, min_scene_len=min_scene_frames)
            scene_list = detect(video_path, detector)

            # 2. Fallback ke ContentDetector jika AdaptiveDetector tidak mendeteksi adegan
            if not scene_list:
                scene_list = detect(video_path, ContentDetector(threshold=threshold, min_scene_len=min_scene_frames))

            results = []
            for scene in scene_list:
                start_sec = scene[0].get_seconds()
                start_frame = scene[0].get_frames()
                end_frame = scene[1].get_frames()

                # Solusi Anti-Bleeding:
                # scene[1] adalah cut boundary (frame pertama scene berikutnya).
                # Kurangi 1 frame agar end_time tepat berada di frame terakhir scene ini:
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

    raw_scenes = await loop.run_in_executor(None, _run_pyscenedetect)

    # Fallback if no cut detected (e.g. static camera or single take)
    if not raw_scenes:
        log.info("No scenes detected by PySceneDetect; splitting into 4.0s segments")
        chunk_len = 4.0
        cur = 0.0
        while cur < total_duration:
            next_t = min(cur + chunk_len, total_duration)
            if next_t < total_duration:
                safe_next_t = max(cur, next_t - (1.0 / fps))
            else:
                safe_next_t = next_t
            raw_scenes.append((cur, safe_next_t))
            cur = next_t

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

        # Representative middle frame task
        extraction_tasks.append((mid_t, thumb_abs))

        # Extract keyframes for vision model (start, middle, end)
        keyframe_paths = [thumb_abs]
        if duration >= 3.0:
            kf2 = str(out_p / f"kf_{idx:04d}_2.jpg")
            extraction_tasks.append((start_t + 0.5, kf2))
            keyframe_paths.append(kf2)

        scenes_data.append({
            "scene_index": idx,
            "start_time": round(start_t, 3),
            "end_time": round(end_t, 3),
            "duration": duration,
            "thumbnail_path": thumb_abs,
            "keyframe_paths": keyframe_paths,
        })

    # Batch extract all thumbnails & keyframes in parallel for maximum speed
    if extraction_tasks:
        await loop.run_in_executor(None, extract_frames_batch, video_path, extraction_tasks)

    return scenes_data
