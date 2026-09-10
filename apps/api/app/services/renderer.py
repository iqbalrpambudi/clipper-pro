import asyncio
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable

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

            clip_start = clip.get("clip_start", 0.0)
            clip_end = clip.get("clip_end", clip_start + 3.0)
            duration = max(clip_end - clip_start, 0.5)

            chunk_out = temp_dir / f"chunk_{idx:04d}.mp4"

            # Background filter: blur or solid color
            if bg_mode == "blur":
                # Split input: [0:v] split into [bg] and [fg]
                # bg: scale to fill, crop, blur
                # fg: scale to fit
                # overlay fg on bg
                vf_filter = (
                    f"split[bg_in][fg_in];"
                    f"[bg_in]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=25:5[bg];"
                    f"[fg_in]scale={w}:{h}:force_original_aspect_ratio=decrease[fg];"
                    f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30"
                )
            else:
                vf_filter = (
                    f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                    f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color={bg_color},"
                    f"setsar=1,fps=30"
                )

            cut_cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                str(clip_start),
                "-t",
                str(duration),
                "-i",
                src_file,
                "-filter_complex",
                vf_filter,
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
