import asyncio
import logging
import math
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import cv2

from app.core.frame_math import COMPOSITION_FPS, frame_to_sec, sec_to_frame
from app.core.storage import storage
from app.services.cancellation import (
    TaskCancelledException,
    is_cancelled,
    register_process,
    unregister_process,
)
from app.services.renderer import _build_watermark_filter, _escape_filter_path, _run_ffmpeg
from app.services.tts import get_audio_duration

log = logging.getLogger(__name__)


def _build_zoompan_filter(
    motion_effect: str,
    total_frames: int,
    w: int,
    h: int,
    fps: int = 30,
) -> str:
    """
    (Legacy) Generate an FFmpeg zoompan filter expression.
    Kept for backward compatibility. Note that FFmpeg's zoompan filter exhibits
    frame-to-frame pixel judder due to internal even-integer chroma coordinate bitmasking.
    Use render_slide_subpixel_motion for butter-smooth camera movement.
    """
    scale_w = int(round(w * 1.25 / 2)) * 2
    scale_h = int(round(h * 1.25 / 2)) * 2

    motion = (motion_effect or "zoom_in").lower().strip()
    tf = max(total_frames, 1)

    if motion == "zoom_in":
        zoom_expr = f"min(1.15,max(1.00,1.00+0.075*(1-cos(3.14159265*on/{tf}))))"
        x_expr = "max(0,iw/2-(iw/zoom/2))"
        y_expr = "max(0,ih/2-(ih/zoom/2))"
    elif motion == "zoom_out":
        zoom_expr = f"min(1.15,max(1.00,1.15-0.075*(1-cos(3.14159265*on/{tf}))))"
        x_expr = "max(0,iw/2-(iw/zoom/2))"
        y_expr = "max(0,ih/2-(ih/zoom/2))"
    elif motion == "pan_left":
        zoom_expr = "1.10"
        x_expr = f"max(0,(iw*0.08)*(1+cos(3.14159265*on/{tf}))/2)"
        y_expr = "max(0,ih/2-(ih/zoom/2))"
    elif motion == "pan_right":
        zoom_expr = "1.10"
        x_expr = f"min(iw*0.08,(iw*0.08)*(1-cos(3.14159265*on/{tf}))/2)"
        y_expr = "max(0,ih/2-(ih/zoom/2))"
    elif motion == "pan_up":
        zoom_expr = "1.10"
        x_expr = "max(0,iw/2-(iw/zoom/2))"
        y_expr = f"max(0,(ih*0.08)*(1+cos(3.14159265*on/{tf}))/2)"
    else:
        zoom_expr = f"min(1.05,max(1.00,1.00+0.025*(1-cos(3.14159265*on/{tf}))))"
        x_expr = "max(0,iw/2-(iw/zoom/2))"
        y_expr = "max(0,ih/2-(ih/zoom/2))"

    vf = (
        f"scale={scale_w}:{scale_h}:force_original_aspect_ratio=increase,"
        f"crop={scale_w}:{scale_h},"
        f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':d=1:s={w}x{h}:fps={fps}"
    )
    return vf


async def render_slide_subpixel_motion(
    img_path: str,
    output_path: Path,
    motion_effect: str,
    total_frames: int,
    w: int,
    h: int,
    fps: int = 30,
    proc_key: Optional[str] = None,
    project_id: Optional[str] = None,
    job_id: Optional[str] = None,
    timeout: float = 300.0,
    heartbeat_callback: Optional[Callable[[], Any]] = None,
) -> None:
    """
    Render a single storyboard slide image into an MPEG-TS chunk with 100% butter-smooth subpixel
    Ken Burns motion using OpenCV affine transformation and rawvideo streaming into FFmpeg.

    This completely eliminates the discrete 1-2 pixel coordinate jitter caused by FFmpeg's
    built-in vf_zoompan (which forcibly bitmasks x and y to even integers for chroma subsampling).
    """
    img = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Tidak dapat membaca file gambar adegan: {img_path}")

    # Strip any baked-in letterbox/pillarbox/white bars and conform to 16:9 full bleed
    from app.services.image_gen import strip_bars_from_cv2_image
    img = strip_bars_from_cv2_image(img)

    # Aspect ratio cover (object-cover origin-center) to target canvas (w, h)
    ih, iw = img.shape[:2]
    scale = max(w / iw, h / ih)
    new_w = int(round(iw * scale))
    new_h = int(round(ih * scale))
    interp = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LANCZOS4
    resized = cv2.resize(img, (new_w, new_h), interpolation=interp)

    x_off = max(0, (new_w - w) // 2)
    y_off = max(0, (new_h - h) // 2)
    base_img = resized[y_off:y_off + h, x_off:x_off + w]
    if base_img.shape[0] != h or base_img.shape[1] != w:
        base_img = cv2.resize(base_img, (w, h), interpolation=cv2.INTER_LINEAR)

    cmd = [
        "ffmpeg",
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{w}x{h}",
        "-pix_fmt", "bgr24",
        "-r", str(fps),
        "-i", "-",
        "-vf", f"eq=contrast=1.03:saturation=1.05:brightness=0.01,fps={fps}",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "22",
        "-g", str(fps),
        "-keyint_min", str(fps),
        "-sc_threshold", "0",
        "-pix_fmt", "yuv420p",
        "-an",
        str(output_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )

    if proc_key:
        register_process(proc_key, proc)

    cx, cy = w / 2.0, h / 2.0
    motion = (motion_effect or "zoom_in").lower().strip()
    tf_denom = max(1, total_frames - 1)

    try:
        async def _feed_frames():
            for i in range(total_frames):
                if (i % 15 == 0) and (project_id or job_id):
                    if await is_cancelled(project_id, job_id=job_id):
                        raise TaskCancelledException("Rendering storyboard dibatalkan oleh pengguna.")

                if (i % 30 == 0) and heartbeat_callback:
                    try:
                        hb_res = heartbeat_callback()
                        if asyncio.iscoroutine(hb_res):
                            await hb_res
                    except Exception:
                        pass

                # Smooth cosine ease-in-out progress [0.0 -> 1.0]
                t = i / tf_denom
                p = 0.5 * (1.0 - math.cos(math.pi * t))

                if motion == "zoom_in":
                    zoom = 1.00 + 0.12 * p
                    M = cv2.getRotationMatrix2D((cx, cy), 0.0, zoom)
                elif motion == "zoom_out":
                    zoom = 1.15 - 0.15 * p
                    M = cv2.getRotationMatrix2D((cx, cy), 0.0, zoom)
                elif motion == "pan_left":
                    zoom = 1.10
                    shift_x = (1.0 - 2.0 * p) * (0.04 * w)
                    M = cv2.getRotationMatrix2D((cx, cy), 0.0, zoom)
                    M[0, 2] += shift_x
                elif motion == "pan_right":
                    zoom = 1.10
                    shift_x = (-1.0 + 2.0 * p) * (0.04 * w)
                    M = cv2.getRotationMatrix2D((cx, cy), 0.0, zoom)
                    M[0, 2] += shift_x
                elif motion == "pan_up":
                    zoom = 1.10
                    shift_y = (1.0 - 2.0 * p) * (0.04 * h)
                    M = cv2.getRotationMatrix2D((cx, cy), 0.0, zoom)
                    M[1, 2] += shift_y
                elif motion == "pan_down":
                    zoom = 1.10
                    shift_y = (-1.0 + 2.0 * p) * (0.04 * h)
                    M = cv2.getRotationMatrix2D((cx, cy), 0.0, zoom)
                    M[1, 2] += shift_y
                else:  # static or gentle breathing zoom
                    zoom = 1.00 + 0.03 * p
                    M = cv2.getRotationMatrix2D((cx, cy), 0.0, zoom)

                frame = cv2.warpAffine(
                    base_img,
                    M,
                    (w, h),
                    flags=cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_REFLECT,
                )

                try:
                    proc.stdin.write(frame.tobytes())
                    await proc.stdin.drain()
                except (BrokenPipeError, ConnectionResetError):
                    break

            if proc.stdin and not proc.stdin.is_closing():
                proc.stdin.close()

        if timeout and timeout > 0:
            await asyncio.wait_for(_feed_frames(), timeout=timeout)
        else:
            await _feed_frames()

        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            if await is_cancelled(project_id, job_id=job_id):
                raise TaskCancelledException("Rendering storyboard dibatalkan oleh pengguna.")
            err = stderr.decode(errors="replace")[-300:] if stderr else "unknown error"
            raise RuntimeError(f"FFmpeg slide encoding failed (code {proc.returncode}): {err}")

    except (asyncio.CancelledError, TaskCancelledException):
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        raise
    except asyncio.TimeoutError:
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        raise TimeoutError(f"Proses rendering slide timeout setelah {int(timeout)} detik.")
    except Exception:
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        raise
    finally:
        if proc_key:
            unregister_process(proc_key)


async def render_storyboard_video(
    items: List[Dict[str, Any]],
    audio_path: Optional[str],
    ass_subtitle_path: Optional[str],
    output_path: str,
    aspect_ratio: str = "16:9",
    resolution: str = "1080p",
    watermark: Optional[Dict[str, Any]] = None,
    is_preview: bool = False,
    progress_callback: Optional[Callable[[int, str], Any]] = None,
    heartbeat_callback: Optional[Callable[[], Any]] = None,
    project_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> str:
    """
    Render 16:9 Long Storyboard Explainer video from a sequence of AI illustration images
    synced to audio narration with Ken Burns motion dynamics and optional subtitles.
    """
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    proc_key = f"render:{job_id}" if job_id else f"render:{out_p.stem}"

    # Determine canvas dimensions
    if aspect_ratio == "9:16":
        w, h = (540, 960) if is_preview else ((720, 1280) if resolution == "720p" else (1080, 1920))
    elif aspect_ratio == "1:1":
        w, h = (540, 540) if is_preview else ((720, 720) if resolution == "720p" else (1080, 1080))
    else:  # 16:9 (Default for Storyboard Explainer)
        w, h = (960, 540) if is_preview else ((1280, 720) if resolution == "720p" else (1920, 1080))

    audio_dur = 0.0
    if audio_path and Path(audio_path).exists():
        audio_dur = await get_audio_duration(audio_path)

    temp_dir = Path(tempfile.mkdtemp(prefix="storyboard_render_"))

    try:
        if progress_callback:
            await progress_callback(5, "Menyiapkan aset gambar ilustrasi storyboard...")

        valid_items = []
        for it in items:
            fp = it.get("file_path")
            if not fp:
                continue
            p = Path(fp)
            if not p.exists():
                p = storage.to_absolute_path(fp)
            if p and p.exists():
                it_copy = dict(it)
                it_copy["file_path"] = str(p)
                valid_items.append(it_copy)

        if not valid_items:
            raise RuntimeError("Tidak ada gambar storyboard yang siap dirender. Silakan generate gambar adegan terlebih dahulu.")

        total_items = len(valid_items)
        clip_files = []

        # Calculate total specified duration of items
        sum_item_dur = sum(float(it.get("duration") or 4.0) for it in valid_items)

        # Check if items have start_time from Whisper alignment
        has_start_times = any(it.get("start_time") is not None for it in valid_items)

        scale_ratio = 1.0
        if audio_dur > 0 and sum_item_dur > 0:
            scale_ratio = audio_dur / sum_item_dur

        total_audio_frames = sec_to_frame(audio_dur, COMPOSITION_FPS) if audio_dur > 0 else 0
        current_frame = 0
        slide_specs = []

        for idx, item in enumerate(valid_items):
            base_duration = float(item.get("duration") or 4.0)

            # Precise timing: calculate exact frame boundaries matching preview player and audio alignment
            if has_start_times and item.get("start_time") is not None:
                # First slide always starts at 0.0s (frame 0) to seamlessly cover any initial silence
                start_sec = 0.0 if idx == 0 else float(item["start_time"])
                if idx < total_items - 1 and valid_items[idx + 1].get("start_time") is not None:
                    next_start = float(valid_items[idx + 1]["start_time"])
                    end_sec = max(start_sec + 0.5, next_start)
                else:
                    end_sec = max(start_sec + 1.0, audio_dur if audio_dur > 0 else start_sec + base_duration)
            else:
                if audio_dur > 0 and 0.5 < scale_ratio < 2.0:
                    dur = base_duration * scale_ratio
                else:
                    dur = base_duration
                start_sec = frame_to_sec(current_frame, COMPOSITION_FPS)
                end_sec = start_sec + max(1.0, dur)

            start_f = sec_to_frame(start_sec, COMPOSITION_FPS)
            end_f = sec_to_frame(end_sec, COMPOSITION_FPS)

            # Monotonic frame boundary: slide begins exactly where previous slide ended
            start_f = max(current_frame, start_f)
            slide_frames = max(15, end_f - start_f)

            # Extend or align last slide to match exact audio length
            if idx == total_items - 1 and total_audio_frames > start_f:
                slide_frames = max(15, total_audio_frames - start_f)

            actual_dur = frame_to_sec(slide_frames, COMPOSITION_FPS)
            current_frame = start_f + slide_frames
            motion = item.get("motion_effect", "zoom_in")
            chunk_out = temp_dir / f"sb_chunk_{idx:04d}.ts"

            slide_specs.append({
                "idx": idx,
                "item": item,
                "img_path": str(item["file_path"]),
                "motion": motion,
                "total_frames": slide_frames,
                "actual_dur": actual_dur,
                "chunk_out": chunk_out,
            })

        # Process slides with bounded concurrency (3 parallel renders) for fast rendering
        sem = asyncio.Semaphore(3)
        completed_count = 0

        async def _render_single_slide(spec: Dict[str, Any]):
            nonlocal completed_count
            async with sem:
                if await is_cancelled(project_id, job_id=job_id):
                    log.info("Storyboard rendering cancelled by user at slide %d/%d (job=%s)", spec["idx"], total_items, job_id)
                    raise TaskCancelledException("Rendering storyboard dibatalkan oleh pengguna.")

                slide_proc_key = f"{proc_key}:slide_{spec['idx']}" if proc_key else None
                await render_slide_subpixel_motion(
                    img_path=spec["img_path"],
                    output_path=spec["chunk_out"],
                    motion_effect=spec["motion"],
                    total_frames=spec["total_frames"],
                    w=w,
                    h=h,
                    fps=COMPOSITION_FPS,
                    proc_key=slide_proc_key,
                    project_id=project_id,
                    job_id=job_id,
                    timeout=300.0,
                    heartbeat_callback=heartbeat_callback,
                )

                completed_count += 1
                if progress_callback:
                    pct = 10 + int(completed_count / total_items * 50)
                    await progress_callback(pct, f"Merender adegan visual {completed_count}/{total_items} (efek: {spec['motion']})...")

        await asyncio.gather(*[_render_single_slide(s) for s in slide_specs])
        clip_files = [s["chunk_out"] for s in slide_specs]

        # Step 2: Concatenate all storyboard slides
        if progress_callback:
            await progress_callback(65, "Menggabungkan rangkaian adegan visual...")

        concat_list_path = temp_dir / "sb_concat_list.txt"
        with open(concat_list_path, "w") as f:
            for cf in clip_files:
                f.write(f"file '{cf.resolve()}'\n")

        concatenated_video = temp_dir / "sb_concatenated.ts"
        concat_cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list_path),
            "-c", "copy",
            str(concatenated_video),
        ]

        ret_concat, stderr_concat = await _run_ffmpeg(
            concat_cmd,
            proc_key=proc_key,
            timeout=600.0,
            progress_callback=progress_callback,
            heartbeat_callback=heartbeat_callback,
            start_pct=65,
            end_pct=74,
            total_duration_sec=audio_dur,
            progress_msg_prefix="Menggabungkan rangkaian adegan visual",
        )
        if ret_concat != 0:
            if await is_cancelled(project_id, job_id=job_id):
                raise TaskCancelledException("Rendering storyboard dibatalkan oleh pengguna.")
            err_msg = stderr_concat.decode(errors="replace")[-400:]
            log.error("Storyboard concat failed: %s", err_msg)
            raise RuntimeError(f"FFmpeg concat error: {err_msg}")

        # Step 3: Combine with audio, apply watermark, burn in subtitles
        if progress_callback:
            await progress_callback(75, "Menyematkan audio voiceover dan subtitle...")

        final_inputs = ["-i", str(concatenated_video)]
        filter_chains = []

        if watermark and watermark.get("enabled"):
            wm_filter = _build_watermark_filter(watermark, temp_dir, w, h)
            if wm_filter:
                filter_chains.append(wm_filter)

        if ass_subtitle_path and Path(ass_subtitle_path).exists():
            esc_ass = _escape_filter_path(ass_subtitle_path)
            fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
            if fonts_dir.exists():
                esc_fonts = _escape_filter_path(str(fonts_dir))
                filter_chains.append(f"ass='{esc_ass}':fontsdir='{esc_fonts}'")
            else:
                filter_chains.append(f"ass='{esc_ass}'")

        cmd_final = ["ffmpeg", "-y"]
        cmd_final.extend(final_inputs)

        if audio_path and Path(audio_path).exists():
            cmd_final.extend(["-i", audio_path])
            audio_args = ["-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        else:
            audio_args = ["-c:a", "copy"]

        if filter_chains:
            cmd_final.extend(["-vf", ",".join(filter_chains)])

        preset = "ultrafast" if is_preview else "veryfast"
        crf = "26" if is_preview else "20"

        cmd_final.extend([
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", crf,
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ])
        cmd_final.extend(audio_args)
        cmd_final.append(str(out_p))

        log.info("Running final storyboard ffmpeg cmd: %s", " ".join(cmd_final))

        if progress_callback:
            await progress_callback(75, "Menyelesaikan kompilasi video final 16:9...")

        ret_final, stderr_final = await _run_ffmpeg(
            cmd_final,
            proc_key=proc_key,
            timeout=1800.0,
            progress_callback=progress_callback,
            heartbeat_callback=heartbeat_callback,
            start_pct=75,
            end_pct=98,
            total_duration_sec=audio_dur,
            progress_msg_prefix="Menyelesaikan kompilasi video final 16:9",
        )
        if ret_final != 0:
            if await is_cancelled(project_id, job_id=job_id):
                raise TaskCancelledException("Rendering storyboard dibatalkan oleh pengguna.")
            err_msg = stderr_final.decode(errors="replace")[-400:]
            log.error("Final storyboard render failed: %s", err_msg)
            raise RuntimeError(f"FFmpeg render error: {err_msg}")

        if progress_callback:
            await progress_callback(100, "Render video storyboard selesai!")

        return str(out_p)

    except BaseException:
        out_p.unlink(missing_ok=True)
        raise
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
