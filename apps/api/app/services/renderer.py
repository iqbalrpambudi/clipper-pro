import asyncio
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from app.core.frame_math import sec_to_frame, frame_to_sec, snap_to_frame, COMPOSITION_FPS
from app.services.tts import get_audio_duration

log = logging.getLogger(__name__)


def _escape_filter_path(path: str) -> str:
    """Escape special characters in path for FFmpeg filter argument."""
    # libass/ffmpeg requires colons, backslashes, and single quotes escaped
    escaped = str(path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    return escaped

async def _run_ffmpeg(cmd: List[str]) -> tuple[int, bytes]:
    """Run an ffmpeg command, killing the child if the task is cancelled."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await proc.communicate()
    except asyncio.CancelledError:
        proc.kill()
        await proc.wait()
        raise
    return proc.returncode or 0, stderr


def _build_watermark_filter(
    watermark: Dict[str, Any],
    temp_dir: Path,
    video_w: int,
    video_h: int,
) -> Optional[str]:
    """Build an FFmpeg drawtext filter string for watermark overlay."""
    if not watermark or not watermark.get("enabled"):
        return None

    text = str(watermark.get("text") or "").strip()
    if not text:
        return None

    # Write text to a file in temp_dir to safely handle colons, quotes, emojis, and newlines
    text_file = temp_dir / "watermark_text.txt"
    with open(text_file, "w", encoding="utf-8") as f:
        f.write(text)
    esc_text_file = _escape_filter_path(str(text_file))

    # Font path resolution
    fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
    font_family = str(watermark.get("font_family") or "Poppins").strip().lower()

    font_map = {
        "poppins": "Poppins.ttf",
        "montserrat": "Montserrat.ttf",
        "anton": "Anton.ttf",
        "bebas neue": "BebasNeue.ttf",
        "bebasneue": "BebasNeue.ttf",
        "oswald": "Oswald.ttf",
        "roboto": "Roboto.ttf",
        "inter": "Inter.ttf",
    }
    font_filename = font_map.get(font_family, "Poppins.ttf")
    font_path = fonts_dir / font_filename
    if not font_path.exists():
        fallback = next(fonts_dir.glob("*.ttf"), None)
        font_path = fallback if fallback else font_path

    esc_font_path = _escape_filter_path(str(font_path))

    # Scale font size and offsets relative to baseline width 1080
    scale = video_w / 1080.0
    base_font_size = float(watermark.get("font_size", 36) or 36)
    font_size = max(12, int(round(base_font_size * scale)))

    base_ox = float(watermark.get("offset_x", 30) or 30)
    base_oy = float(watermark.get("offset_y", 30) or 30)
    ox = max(4, int(round(base_ox * scale)))
    oy = max(4, int(round(base_oy * scale)))

    # Color & opacity
    color_hex = str(watermark.get("font_color") or "#FFFFFF").strip().lstrip("#")
    if len(color_hex) != 6:
        color_hex = "FFFFFF"
    opacity = float(watermark.get("opacity", 0.85) if watermark.get("opacity") is not None else 0.85)
    opacity = max(0.05, min(1.0, opacity))
    font_color_arg = f"0x{color_hex}@{opacity:.2f}"

    # Positioning expressions
    pos = str(watermark.get("position") or "bottom-right").lower().replace(" ", "-")
    if pos == "top-left":
        pos_expr = f"x={ox}:y={oy}"
    elif pos == "top-center":
        pos_expr = f"x=(w-text_w)/2:y={oy}"
    elif pos == "top-right":
        pos_expr = f"x=w-text_w-{ox}:y={oy}"
    elif pos == "center":
        pos_expr = f"x=(w-text_w)/2:y=(h-text_h)/2"
    elif pos == "bottom-left":
        pos_expr = f"x={ox}:y=h-text_h-{oy}"
    elif pos == "bottom-center":
        pos_expr = f"x=(w-text_w)/2:y=h-text_h-{oy}"
    else:  # default bottom-right
        pos_expr = f"x=w-text_w-{ox}:y=h-text_h-{oy}"

    filter_opts = [
        f"fontfile='{esc_font_path}'",
        f"textfile='{esc_text_file}'",
        f"fontsize={font_size}",
        f"fontcolor={font_color_arg}",
        pos_expr,
    ]

    # Background box / badge if enabled
    if watermark.get("has_background"):
        bg_hex = str(watermark.get("background_color") or "#000000").strip().lstrip("#")
        if len(bg_hex) != 6:
            bg_hex = "000000"
        bg_opacity = float(watermark.get("background_opacity", 0.5) if watermark.get("background_opacity") is not None else 0.5)
        bg_opacity = max(0.05, min(1.0, bg_opacity))
        borderw = max(4, int(round(8 * scale)))
        filter_opts.append(f"box=1:boxcolor=0x{bg_hex}@{bg_opacity:.2f}:boxborderw={borderw}")

    # Shadow & outline for crisp readability over video
    if watermark.get("has_shadow", True):
        shadow_hex = str(watermark.get("shadow_color") or "#000000").strip().lstrip("#")
        if len(shadow_hex) != 6:
            shadow_hex = "000000"
        s_dist = max(1, int(round(2 * scale)))
        filter_opts.append(f"shadowcolor=0x{shadow_hex}@0.6:shadowx={s_dist}:shadowy={s_dist}")
        b_stroke = max(1, int(round(1.5 * scale)))
        filter_opts.append(f"borderw={b_stroke}:bordercolor=0x{shadow_hex}@0.7")

    return "drawtext=" + ":".join(filter_opts)


async def render_timeline_video(
    clips: List[Dict[str, Any]],
    source_videos_map: Dict[str, str],  # source_video_id -> file_path
    audio_path: Optional[str],
    ass_subtitle_path: Optional[str],
    output_path: str,
    aspect_ratio: str = "9:16",
    resolution: str = "1080p",
    background_fill: Optional[Dict[str, Any]] = None,
    watermark: Optional[Dict[str, Any]] = None,
    is_preview: bool = False,
    progress_callback: Optional[Callable[[int, str], Any]] = None,
) -> str:
    """Render structured timeline into final MP4 video using FFmpeg."""
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    # Resolution dimensions
    if aspect_ratio == "9:16":
        w, h = (540, 960) if is_preview else ((720, 1280) if resolution == "720p" else (1080, 1920))
    elif aspect_ratio == "1:1":
        w, h = (540, 540) if is_preview else ((720, 720) if resolution == "720p" else (1080, 1080))
    else:  # 16:9
        w, h = (960, 540) if is_preview else ((1280, 720) if resolution == "720p" else (1920, 1080))

    bg_mode = (background_fill or {}).get("mode", "blur")
    bg_color = (background_fill or {}).get("color", "black")
    custom_zoom = float((background_fill or {}).get("zoom", 1.0) or 1.0)
    anti_copyright = (background_fill or {}).get("anti_copyright", True)
    dynamic_zoom = (background_fill or {}).get("dynamic_zoom", True) if anti_copyright else False
    color_grading = (background_fill or {}).get("color_grading", True) if anti_copyright else False

    # Check target audio duration if audio provided
    audio_dur = 0.0
    if audio_path and Path(audio_path).exists():
        audio_dur = await get_audio_duration(audio_path)

    temp_dir = Path(tempfile.mkdtemp(prefix="cliper_render_"))

    try:
        if progress_callback:
            await progress_callback(10, "Menyiapkan potongan klip scene...")

        # Step 1: Normalize and render each clip chunk
        clip_files = []
        failed_clips: List[Dict[str, Any]] = []
        total_clips = len(clips)

        for idx, clip in enumerate(clips):
            vid_id = clip["source_video_id"]
            src_file = source_videos_map.get(vid_id)
            if not src_file or not Path(src_file).exists():
                log.warning("Source video file %s not found for clip %s", src_file, clip["id"])
                failed_clips.append({"index": idx, "id": clip.get("id"), "reason": "source file missing"})
                continue

            clip_start = snap_to_frame(float(clip.get("clip_start", 0.0)))
            clip_end = snap_to_frame(float(clip.get("clip_end", clip_start + 3.0)))
            clip_speed = float(clip.get("speed", 1.0) or 1.0)
            source_dur = max(clip_end - clip_start, 0.4)

            # Target output duration on the 30 FPS timeline
            timeline_start = snap_to_frame(float(clip.get("timeline_start", 0.0)))
            raw_timeline_end = float(clip.get("timeline_end", timeline_start + source_dur))
            
            # If this is the last clip and audio is longer, extend to cover the full audio duration
            if idx == total_clips - 1 and audio_dur > 0 and audio_dur > raw_timeline_end:
                timeline_end = snap_to_frame(audio_dur)
            else:
                timeline_end = snap_to_frame(raw_timeline_end)

            target_out_frames = max(12, sec_to_frame(timeline_end - timeline_start))
            target_out_dur = frame_to_sec(target_out_frames)

            chunk_out = temp_dir / f"chunk_{idx:04d}.mp4"

            # Frame-accurate read duration based on target frames & speed
            read_frames = max(12, int(round(target_out_frames * clip_speed)))
            source_max_frames = sec_to_frame(source_dur)
            actual_read_frames = min(read_frames, source_max_frames)
            safe_read_duration = frame_to_sec(actual_read_frames)

            # Transformative post-processing filters (Ken Burns Dynamic Zoom & Micro Color Grade)
            post_filters = []
            if dynamic_zoom:
                # Alternate zoom in and subtle zoom out / gentle pan per clip
                if idx % 2 == 0:
                    post_filters.append(
                        f"zoompan=z='min(zoom+0.0008,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={w}x{h}:fps=30"
                    )
                else:
                    post_filters.append(
                        f"zoompan=z='if(lte(zoom,1.0),1.05,max(1.001,zoom-0.0008))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={w}x{h}:fps=30"
                    )

            if color_grading:
                post_filters.append("eq=contrast=1.03:saturation=1.04:brightness=0.01")

            post_chain = ("," + ",".join(post_filters)) if post_filters else ""

            # Speed adjustment & trim to ensure zero bleed into next scene
            speed_prefix = ""
            if 0.5 <= clip_speed <= 2.0 and abs(clip_speed - 1.0) > 0.02:
                pts_factor = round(target_out_dur / safe_read_duration, 4)
                speed_prefix = f"[0:v]trim=duration={safe_read_duration},setpts={pts_factor}*PTS[v_speed];"
                in_label = "[v_speed]"
            else:
                speed_prefix = f"[0:v]trim=duration={safe_read_duration},setpts=PTS-STARTPTS[v_trim];"
                in_label = "[v_trim]"

            # Calculate scaled foreground dimensions if custom zoom is applied
            fg_w = int(round(w * custom_zoom))
            fg_h = int(round(h * custom_zoom))
            fg_w = fg_w if fg_w % 2 == 0 else fg_w + 1
            fg_h = fg_h if fg_h % 2 == 0 else fg_h + 1

            # Video layout filter: cover (fullscreen 9:16), blur with zoom, or solid color with zoom
            if bg_mode == "cover":
                vf_filter = (
                    f"{speed_prefix}"
                    f"{in_label}scale={w}:{h}:force_original_aspect_ratio=increase,"
                    f"crop={w}:{h},"
                    f"setsar=1,fps=30{post_chain}"
                )
            elif bg_mode == "blur":
                vf_filter = (
                    f"{speed_prefix}"
                    f"{in_label}split[bg_in][fg_in];"
                    f"[bg_in]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=25:5[bg];"
                    f"[fg_in]scale={fg_w}:{fg_h}:force_original_aspect_ratio=decrease[fg];"
                    f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30{post_chain}"
                )
            else:
                # Solid color background (black or custom color) using color canvas to safely support custom zoom
                vf_filter = (
                    f"{speed_prefix}"
                    f"color=c='{bg_color}':s={w}x{h}:r=30[bg_solid];"
                    f"{in_label}scale={fg_w}:{fg_h}:force_original_aspect_ratio=decrease[fg];"
                    f"[bg_solid][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,fps=30{post_chain}"
                )

            cut_cmd = [
                "ffmpeg",
                "-y",
                "-accurate_seek",
                "-ss",
                f"{clip_start:.4f}",
                "-t",
                f"{safe_read_duration:.4f}",
                "-i",
                src_file,
                "-filter_complex",
                vf_filter,
                "-t",
                f"{target_out_dur:.4f}",
                "-fps_mode",
                "cfr",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "23",
                "-an",
                str(chunk_out),
            ]

            ret, stderr = await _run_ffmpeg(cut_cmd)
            if ret != 0:
                log.error("Clip chunk %d failed: %s", idx, stderr.decode()[-300:])
                failed_clips.append(
                    {"index": idx, "id": clip.get("id"), "reason": stderr.decode()[-200:]}
                )
                continue

            clip_files.append(chunk_out)

            if progress_callback:
                pct = 10 + int((idx + 1) / total_clips * 40)
                await progress_callback(pct, f"Memproses klip {idx + 1}/{total_clips}...")

        if not clip_files:
            raise RuntimeError("Tidak ada klip video yang berhasil diproses.")

        if failed_clips:
            # Fail loudly instead of silently shipping a video with missing footage.
            raise RuntimeError(
                f"{len(failed_clips)} dari {total_clips} klip gagal diproses: {failed_clips[:5]}"
            )

        # Step 2: Concat all chunks
        concat_list_path = temp_dir / "concat_list.txt"
        with open(concat_list_path, "w") as f:
            for cf in clip_files:
                f.write(f"file '{cf.resolve()}'\n")

        concatenated_video = temp_dir / "concatenated.mp4"
        concat_cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list_path),
            "-c",
            "copy",
            str(concatenated_video),
        ]

        if progress_callback:
            await progress_callback(55, "Menggabungkan urutan klip video...")

        ret_concat, stderr_concat = await _run_ffmpeg(concat_cmd)
        if ret_concat != 0:
            err_msg = stderr_concat.decode()[-400:]
            log.error("Concat failed: %s", err_msg)
            raise RuntimeError(f"FFmpeg concat error: {err_msg}")

        # Step 3: Mix audio and burn in ASS subtitles
        if progress_callback:
            await progress_callback(70, "Menyematkan subtitle karaoke & audio narasi...")

        final_inputs = ["-i", str(concatenated_video)]
        filter_chains = []

        # Video filter: add watermark overlay if enabled
        if watermark and watermark.get("enabled"):
            wm_filter = _build_watermark_filter(watermark, temp_dir, w, h)
            if wm_filter:
                filter_chains.append(wm_filter)

        # Video filter: add subtitles if ass file provided
        if ass_subtitle_path and Path(ass_subtitle_path).exists():
            esc_ass = _escape_filter_path(ass_subtitle_path)
            fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
            if fonts_dir.exists():
                esc_fonts = _escape_filter_path(str(fonts_dir))
                filter_chains.append(f"ass='{esc_ass}':fontsdir='{esc_fonts}'")
            else:
                filter_chains.append(f"ass='{esc_ass}'")

        if filter_chains:
            vf_arg = [",".join(filter_chains)]
        else:
            vf_arg = []

        cmd_final = ["ffmpeg", "-y"]
        cmd_final.extend(final_inputs)

        # Audio input
        if audio_path and Path(audio_path).exists():
            cmd_final.extend(["-i", audio_path])
            audio_args = ["-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        else:
            audio_args = ["-c:a", "copy"]

        if vf_arg:
            cmd_final.extend(["-vf", vf_arg[0]])

        preset = "ultrafast" if is_preview else "veryfast"
        crf = "28" if is_preview else "21"

        cmd_final.extend([
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-crf",
            crf,
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ])
        cmd_final.extend(audio_args)
        cmd_final.append(str(out_p))

        log.info("Running final ffmpeg cmd: %s", " ".join(cmd_final))

        if progress_callback:
            await progress_callback(85, "Merender hasil akhir video...")

        ret_final, stderr_final = await _run_ffmpeg(cmd_final)

        if ret_final != 0:
            err_msg = stderr_final.decode()[-400:]
            log.error("Final render failed: %s", err_msg)
            raise RuntimeError(f"FFmpeg render error: {err_msg}")

        if progress_callback:
            await progress_callback(100, "Render selesai!")

        return str(out_p)

    except BaseException:
        # Remove any partial output so a failed render is never mistaken for a good one.
        out_p.unlink(missing_ok=True)
        raise
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
