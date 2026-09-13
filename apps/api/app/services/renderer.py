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


async def render_timeline_video(
    clips: List[Dict[str, Any]],
    source_videos_map: Dict[str, str],  # source_video_id -> file_path
    audio_path: Optional[str],
    ass_subtitle_path: Optional[str],
    output_path: str,
    aspect_ratio: str = "9:16",
    resolution: str = "1080p",
    background_fill: Optional[Dict[str, Any]] = None,
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
        total_clips = len(clips)

        for idx, clip in enumerate(clips):
            vid_id = clip["source_video_id"]
            src_file = source_videos_map.get(vid_id)
            if not src_file or not Path(src_file).exists():
                log.warning("Source video file %s not found for clip %s", src_file, clip["id"])
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

            proc = await asyncio.create_subprocess_exec(
                *cut_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                log.error("Clip chunk %d failed: %s", idx, stderr.decode()[-300:])
                continue

            clip_files.append(chunk_out)

            if progress_callback:
                pct = 10 + int((idx + 1) / total_clips * 40)
                await progress_callback(pct, f"Memproses klip {idx + 1}/{total_clips}...")

        if not clip_files:
            raise RuntimeError("Tidak ada klip video yang berhasil diproses.")

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

        proc_concat = await asyncio.create_subprocess_exec(
            *concat_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc_concat.communicate()

        # Step 3: Mix audio and burn in ASS subtitles
        if progress_callback:
            await progress_callback(70, "Menyematkan subtitle karaoke & audio narasi...")

        final_inputs = ["-i", str(concatenated_video)]
        filter_chains = []

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

        proc_final = await asyncio.create_subprocess_exec(
            *cmd_final,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr_final = await proc_final.communicate()

        if proc_final.returncode != 0:
            err_msg = stderr_final.decode()[-400:]
            log.error("Final render failed: %s", err_msg)
            raise RuntimeError(f"FFmpeg render error: {err_msg}")

        if progress_callback:
            await progress_callback(100, "Render selesai!")

        return str(out_p)

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
