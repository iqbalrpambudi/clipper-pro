import asyncio
import logging
import math
import os
import shutil
import tempfile
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable

from app.core.frame_math import sec_to_frame, frame_to_sec, snap_to_frame, COMPOSITION_FPS
from app.services.tts import get_audio_duration
from app.services.cancellation import (
    register_process,
    unregister_process,
    is_cancelled,
    TaskCancelledException,
)
from app.services.renderer import _run_ffmpeg, _escape_filter_path, _build_watermark_filter

log = logging.getLogger(__name__)


def _build_zoompan_filter(
    motion_effect: str,
    total_frames: int,
    w: int,
    h: int,
    fps: int = 30,
) -> str:
    """
    Generate an FFmpeg zoompan filter expression tailored for storyboard illustrations.
    total_frames: total number of output frames for this slide.
    """
    # High-resolution input scale before zoompan to ensure crisp hand-drawn details
    scale_w = int(w * 1.5)
    scale_h = int(h * 1.5)

    motion = (motion_effect or "zoom_in").lower().strip()

    if motion == "zoom_in":
        # Smooth zoom in from 1.00 to 1.12
        step = round(0.12 / max(total_frames, 1), 6)
        zoom_expr = f"min(1.00+on*{step},1.15)"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"
    elif motion == "zoom_out":
        # Smooth zoom out from 1.15 to 1.00
        step = round(0.15 / max(total_frames, 1), 6)
        zoom_expr = f"max(1.15-on*{step},1.00)"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"
    elif motion == "pan_left":
        # Slight 1.10 zoom, panning from right to left
        zoom_expr = "1.10"
        x_step = round((scale_w * 0.08) / max(total_frames, 1), 4)
        x_expr = f"max(0,iw*0.08-on*{x_step})"
        y_expr = "ih/2-(ih/zoom/2)"
    elif motion == "pan_right":
        # Slight 1.10 zoom, panning from left to right
        zoom_expr = "1.10"
        x_step = round((scale_w * 0.08) / max(total_frames, 1), 4)
        x_expr = f"min(iw*0.08,on*{x_step})"
        y_expr = "ih/2-(ih/zoom/2)"
    elif motion == "pan_up":
        # Slight 1.10 zoom, panning upward
        zoom_expr = "1.10"
        x_expr = "iw/2-(iw/zoom/2)"
        y_step = round((scale_h * 0.08) / max(total_frames, 1), 4)
        y_expr = f"max(0,ih*0.08-on*{y_step})"
    else:  # static or default gentle breathing zoom
        step = round(0.04 / max(total_frames, 1), 6)
        zoom_expr = f"min(1.00+on*{step},1.05)"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"

    vf = (
        f"scale={scale_w}:{scale_h}:force_original_aspect_ratio=increase,"
        f"crop={scale_w}:{scale_h},"
        f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':d=1:s={w}x{h}:fps={fps}"
    )
    return vf


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

        valid_items = [it for it in items if it.get("file_path") and Path(it["file_path"]).exists()]
        if not valid_items:
            raise RuntimeError("Tidak ada gambar storyboard yang siap dirender. Silakan generate gambar adegan terlebih dahulu.")

        total_items = len(valid_items)
        clip_files = []

        # Calculate total specified duration of items
        sum_item_dur = sum(float(it.get("duration") or 4.0) for it in valid_items)
        
        # If total audio is longer than sum of items, scale or adjust last item duration
        scale_ratio = 1.0
        if audio_dur > 0 and sum_item_dur > 0:
            scale_ratio = audio_dur / sum_item_dur

        current_elapsed = 0.0

        for idx, item in enumerate(valid_items):
            if await is_cancelled(project_id, job_id=job_id):
                log.info("Storyboard rendering cancelled by user at item %d/%d (job=%s)", idx, total_items, job_id)
                raise TaskCancelledException("Rendering storyboard dibatalkan oleh pengguna.")

            img_path = str(item["file_path"])
            base_duration = float(item.get("duration") or 4.0)
            
            # Adjust duration according to audio sync
            if audio_dur > 0 and 0.5 < scale_ratio < 2.0:
                duration = base_duration * scale_ratio
            else:
                duration = base_duration

            # Ensure minimum duration
            duration = max(1.0, duration)
            
            # If last item, stretch slightly if still behind total audio
            if idx == total_items - 1 and audio_dur > (current_elapsed + duration):
                duration = audio_dur - current_elapsed + 0.5

            current_elapsed += duration
            total_frames = max(15, sec_to_frame(duration))
            actual_dur = frame_to_sec(total_frames)

            motion = item.get("motion_effect", "zoom_in")
            chunk_out = temp_dir / f"sb_chunk_{idx:04d}.mp4"

            # Build motion filter
            vf_filter = _build_zoompan_filter(motion, total_frames, w, h, fps=COMPOSITION_FPS)
            # Add subtle color vibrancy for consistent hand-drawn look
            vf_filter += ",eq=contrast=1.03:saturation=1.05:brightness=0.01,fps=30"

            render_clip_cmd = [
                "ffmpeg",
                "-y",
                "-loop", "1",
                "-t", f"{actual_dur:.4f}",
                "-i", img_path,
                "-filter_complex", vf_filter,
                "-t", f"{actual_dur:.4f}",
                "-fps_mode", "cfr",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "22",
                "-pix_fmt", "yuv420p",
                "-an",
                str(chunk_out),
            ]

            ret, stderr = await _run_ffmpeg(render_clip_cmd, proc_key=proc_key)
            if ret != 0:
                err = stderr.decode()[-300:]
                log.error("Storyboard slide %d failed: %s", idx, err)
                raise RuntimeError(f"Gagal memproses gambar adegan {idx+1}: {err}")

            clip_files.append(chunk_out)

            if progress_callback:
                pct = 10 + int((idx + 1) / total_items * 50)
                await progress_callback(pct, f"Merender adegan visual {idx + 1}/{total_items} (efek: {motion})...")

        # Step 2: Concatenate all storyboard slides
        if progress_callback:
            await progress_callback(65, "Menggabungkan rangkaian adegan visual...")

        concat_list_path = temp_dir / "sb_concat_list.txt"
        with open(concat_list_path, "w") as f:
            for cf in clip_files:
                f.write(f"file '{cf.resolve()}'\n")

        concatenated_video = temp_dir / "sb_concatenated.mp4"
        concat_cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list_path),
            "-c", "copy",
            str(concatenated_video),
        ]

        ret_concat, stderr_concat = await _run_ffmpeg(concat_cmd, proc_key=proc_key)
        if ret_concat != 0:
            err_msg = stderr_concat.decode()[-400:]
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
            await progress_callback(85, "Menyelesaikan kompilasi video final 16:9...")

        ret_final, stderr_final = await _run_ffmpeg(cmd_final, proc_key=proc_key)
        if ret_final != 0:
            err_msg = stderr_final.decode()[-400:]
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
