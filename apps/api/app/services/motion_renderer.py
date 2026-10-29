import asyncio
import base64
import json
import logging
import os
import shutil
import signal
import socket
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import httpx
import websockets

from app.core.frame_math import COMPOSITION_FPS
from app.services.cancellation import (
    TaskCancelledException,
    is_cancelled,
    register_process,
    unregister_process,
)
from app.services.renderer import _build_watermark_filter, _escape_filter_path, _run_ffmpeg
from app.services.tts import get_audio_duration

log = logging.getLogger(__name__)


def _find_chromium_binary() -> str:
    """Locate Chromium / Chrome executable across Debian Docker, Linux, and macOS."""
    env_bin = os.getenv("CHROMIUM_PATH")
    if env_bin and Path(env_bin).exists():
        return env_bin

    candidates = [
        "/usr/lib/chromium/chromium",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for c in candidates:
        if Path(c).exists():
            return c

    which_bin = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
    if which_bin:
        return which_bin

    raise RuntimeError(
        "Binary Chromium tidak ditemukan di server API. Pastikan paket 'chromium' telah terpasang."
    )


def _kill_process_tree(proc: Optional[asyncio.subprocess.Process]) -> None:
    """Force-kill a subprocess and its entire process group so no renderer/utility children leak."""
    if not proc or proc.returncode is not None:
        return
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def _get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


async def _resolve_web_base_url() -> str:
    """Discover reachable Next.js web container URL from API worker."""
    candidates = [
        os.getenv("WEB_INTERNAL_URL", "").strip(),
        "http://web:3030",
        "http://127.0.0.1:3030",
        "http://localhost:3030",
        "http://host.docker.internal:3030",
    ]
    async with httpx.AsyncClient(timeout=3.0) as client:
        for base in candidates:
            if not base:
                continue
            clean = base.rstrip("/")
            try:
                resp = await client.get(f"{clean}/")
                if resp.status_code < 500:
                    return clean
            except Exception:
                continue
    return "http://web:3030"


class CDPSession:
    """Minimal, fast Chrome DevTools Protocol client over websockets."""

    def __init__(self, ws: Any):
        self.ws = ws
        self._msg_id = 0

    async def call(self, method: str, params: Optional[Dict[str, Any]] = None, timeout: float = 30.0) -> Dict[str, Any]:
        self._msg_id += 1
        req_id = self._msg_id
        payload = {"id": req_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(payload))

        async def _recv_until_id() -> Dict[str, Any]:
            while True:
                raw = await self.ws.recv()
                msg = json.loads(raw)
                if msg.get("id") == req_id:
                    if "error" in msg:
                        raise RuntimeError(f"CDP {method} error: {msg['error']}")
                    return msg.get("result") or {}

        return await asyncio.wait_for(_recv_until_id(), timeout=timeout)


async def _render_frame_chunk(
    chromium_bin: str,
    temp_dir: Path,
    worker_idx: int,
    render_url: str,
    start_frame: int,
    end_frame: int,
    w: int,
    h: int,
    fps: int,
    chunk_out: Path,
    jpeg_quality: int,
    proc_key: Optional[str],
    project_id: Optional[str],
    job_id: Optional[str],
    on_frame_rendered: Callable[[], Any],
) -> None:
    """Launch an isolated headless Chromium instance & FFmpeg pipe for a frame range [start_frame, end_frame)."""
    if worker_idx > 0:
        await asyncio.sleep(worker_idx * 0.4)
    user_data_dir = temp_dir / f"chrome_profile_{worker_idx}"
    user_data_dir.mkdir(parents=True, exist_ok=True)
    debug_port = _get_free_port()

    chrome_cmd = [
        chromium_bin,
        "--headless=new",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-ipc-flooding-protection",
        "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,OptimizationHints,OptimizationGuideModelDownloading,OnDeviceModelService,PaintHolding,Translate",
        "--disable-sync",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-first-run",
        "--no-default-browser-check",
        f"--user-data-dir={user_data_dir}",
        f"--remote-debugging-port={debug_port}",
        f"--window-size={w},{h}",
        "about:blank",
    ]

    chrome_env = {
        **os.environ,
        "DBUS_SESSION_BUS_ADDRESS": "/dev/null",
        "DBUS_SYSTEM_BUS_ADDRESS": "/dev/null",
    }
    chrome_proc = await asyncio.create_subprocess_exec(
        *chrome_cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
        env=chrome_env,
    )
    chrome_key = f"{proc_key}:chromium_{worker_idx}" if proc_key else None
    if chrome_key:
        register_process(chrome_key, chrome_proc)

    cdp_http_base = f"http://127.0.0.1:{debug_port}"

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-r", str(fps),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "20",
        "-g", str(fps),
        "-keyint_min", str(fps),
        "-sc_threshold", "0",
        "-pix_fmt", "yuv420p",
        "-an",
        str(chunk_out),
    ]

    ff_proc = await asyncio.create_subprocess_exec(
        *ffmpeg_cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    ff_key = f"{proc_key}:ff_{start_frame}" if proc_key else None
    if ff_key:
        register_process(ff_key, ff_proc)

    try:
        # 1. Wait for this worker's Chromium DevTools HTTP endpoint and grab its primary page target
        ws_url: Optional[str] = None
        async with httpx.AsyncClient(timeout=3.0) as client:
            for _ in range(160):
                try:
                    list_resp = await client.get(f"{cdp_http_base}/json/list")
                    if list_resp.status_code == 200:
                        targets = list_resp.json()
                        page_target = next(
                            (t for t in targets if t.get("type") == "page" and t.get("webSocketDebuggerUrl")),
                            None,
                        )
                        if page_target:
                            ws_url = page_target["webSocketDebuggerUrl"]
                            break
                except Exception:
                    pass
                await asyncio.sleep(0.15)

            if not ws_url:
                tab_resp = await client.put(f"{cdp_http_base}/json/new?about:blank")
                if tab_resp.status_code != 200:
                    tab_resp = await client.get(f"{cdp_http_base}/json/new?about:blank")
                ws_url = tab_resp.json()["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=32 * 1024 * 1024) as ws:
            cdp = CDPSession(ws)
            await cdp.call("Page.enable")
            await cdp.call("Runtime.enable")
            await cdp.call("Page.bringToFront")
            await cdp.call(
                "Emulation.setDeviceMetricsOverride",
                {
                    "width": w,
                    "height": h,
                    "deviceScaleFactor": 1,
                    "mobile": False,
                },
            )
            await cdp.call("Page.navigate", {"url": render_url}, timeout=45.0)
            await cdp.call("Page.bringToFront")

            # Wait until Next.js page mounts Remotion stage & fonts and sets window.__MOTION_READY__ = true
            ready = False
            for _ in range(180):  # up to 45 seconds
                if project_id or job_id:
                    if await is_cancelled(project_id, job_id=job_id):
                        raise TaskCancelledException("Rendering motion graphic dibatalkan oleh pengguna.")
                eval_res = await cdp.call(
                    "Runtime.evaluate",
                    {
                        "expression": "window.__MOTION_ERROR__ ? ('ERR:' + window.__MOTION_ERROR__) : Boolean(window.__MOTION_READY__)",
                        "returnByValue": True,
                    },
                )
                val = (eval_res.get("result") or {}).get("value")
                if isinstance(val, str) and val.startswith("ERR:"):
                    raise RuntimeError(f"Gagal memuat komposisi Motion Studio: {val[4:]}")
                if val is True:
                    ready = True
                    break
                await asyncio.sleep(0.25)

            if not ready:
                raise TimeoutError("Halaman render Motion Studio timeout saat inisialisasi.")

            for frame_idx in range(start_frame, end_frame):
                if ((frame_idx - start_frame) % 10 == 0) and (project_id or job_id):
                    if await is_cancelled(project_id, job_id=job_id):
                        raise TaskCancelledException("Rendering motion graphic dibatalkan oleh pengguna.")

                await cdp.call(
                    "Runtime.evaluate",
                    {
                        "expression": f"window.__setMotionFrame({frame_idx})",
                        "awaitPromise": True,
                        "returnByValue": True,
                    },
                    timeout=15.0,
                )

                shot = await cdp.call(
                    "Page.captureScreenshot",
                    {
                        "format": "jpeg",
                        "quality": jpeg_quality,
                        "optimizeForSpeed": True,
                    },
                    timeout=15.0,
                )
                b64_data = shot.get("data")
                if not b64_data:
                    raise RuntimeError(f"Gagal menangkap frame {frame_idx} dari Chromium.")

                jpg_bytes = base64.b64decode(b64_data)
                if ff_proc.stdin:
                    ff_proc.stdin.write(jpg_bytes)
                    await ff_proc.stdin.drain()

                cb_res = on_frame_rendered()
                if asyncio.iscoroutine(cb_res):
                    await cb_res

        if ff_proc.stdin and not ff_proc.stdin.is_closing():
            ff_proc.stdin.close()

        _, stderr = await ff_proc.communicate()
        if ff_proc.returncode != 0:
            err = stderr.decode(errors="replace")[-300:] if stderr else "unknown"
            raise RuntimeError(f"FFmpeg frame encoding gagal (code {ff_proc.returncode}): {err}")

    except BaseException:
        try:
            ff_proc.kill()
            await ff_proc.wait()
        except ProcessLookupError:
            pass
        raise
    finally:
        if ff_key:
            unregister_process(ff_key)
        if chrome_key:
            unregister_process(chrome_key)
        _kill_process_tree(chrome_proc)
        try:
            await asyncio.wait_for(chrome_proc.wait(), timeout=2.0)
        except Exception:
            pass


async def render_motion_graphic_video(
    project_id: str,
    total_frames: int,
    audio_path: Optional[str],
    ass_subtitle_path: Optional[str],
    output_path: str,
    aspect_ratio: str = "16:9",
    resolution: str = "1080p",
    watermark: Optional[Dict[str, Any]] = None,
    is_preview: bool = False,
    progress_callback: Optional[Callable[[int, str], Any]] = None,
    heartbeat_callback: Optional[Callable[[], Any]] = None,
    job_id: Optional[str] = None,
) -> str:
    """
    Render Generative React/Remotion Motion Graphic project into Full HD MP4
    using Headless Chromium CDP deterministic frame stepping + FFmpeg muxing.
    """
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    proc_key = f"render:{job_id}" if job_id else f"render:{out_p.stem}"

    if aspect_ratio == "9:16":
        w, h = (540, 960) if is_preview else ((720, 1280) if resolution == "720p" else (1080, 1920))
    elif aspect_ratio == "1:1":
        w, h = (540, 540) if is_preview else ((720, 720) if resolution == "720p" else (1080, 1080))
    else:
        w, h = (960, 540) if is_preview else ((1280, 720) if resolution == "720p" else (1920, 1080))

    audio_dur = 0.0
    if audio_path and Path(audio_path).exists():
        audio_dur = await get_audio_duration(audio_path)

    effective_frames = max(30, int(total_frames))
    chromium_bin = _find_chromium_binary()
    web_base = await _resolve_web_base_url()
    render_url = f"{web_base}/motion-render/{project_id}?w={w}&h={h}"

    temp_dir = Path(tempfile.mkdtemp(prefix="motion_render_"))

    if progress_callback:
        await progress_callback(8, f"Menyiapkan engine Chromium & komposisi React/Remotion ({w}x{h})...")

    try:
        # Pre-warm Next.js route so dev-mode compilation never competes with headless Chromium startup
        try:
            async with httpx.AsyncClient(timeout=30.0) as warm_client:
                await warm_client.get(render_url)
        except Exception:
            pass

        # Split frames across 2 isolated Chromium processes when video has >= 120 frames for ~2x speedup
        num_workers = 2 if effective_frames >= 120 else 1
        chunk_size = (effective_frames + num_workers - 1) // num_workers
        ranges: List[tuple[int, int, Path]] = []
        for idx in range(num_workers):
            s_f = idx * chunk_size
            e_f = min(effective_frames, (idx + 1) * chunk_size)
            if s_f < e_f:
                ranges.append((s_f, e_f, temp_dir / f"motion_chunk_{idx:03d}.ts"))

        rendered_frames = 0
        jpeg_quality = 84 if is_preview else 93

        async def _on_frame():
            nonlocal rendered_frames
            rendered_frames += 1
            if heartbeat_callback and (rendered_frames % 10 == 0):
                res = heartbeat_callback()
                if asyncio.iscoroutine(res):
                    await res
            if progress_callback and (rendered_frames % 15 == 0 or rendered_frames == effective_frames):
                pct = 10 + int((rendered_frames / effective_frames) * 65)
                await progress_callback(
                    min(75, pct),
                    f"Merender frame animasi React/Remotion ({rendered_frames}/{effective_frames} frame @ {COMPOSITION_FPS}fps)...",
                )

        await asyncio.gather(
            *[
                _render_frame_chunk(
                    chromium_bin=chromium_bin,
                    temp_dir=temp_dir,
                    worker_idx=idx,
                    render_url=render_url,
                    start_frame=s_f,
                    end_frame=e_f,
                    w=w,
                    h=h,
                    fps=COMPOSITION_FPS,
                    chunk_out=c_out,
                    jpeg_quality=jpeg_quality,
                    proc_key=proc_key,
                    project_id=project_id,
                    job_id=job_id,
                    on_frame_rendered=_on_frame,
                )
                for idx, (s_f, e_f, c_out) in enumerate(ranges)
            ]
        )

        if len(ranges) == 1:
            concatenated_video = ranges[0][2]
        else:
            if progress_callback:
                await progress_callback(77, "Menggabungkan segmen visual motion graphic...")
            concat_list = temp_dir / "concat.txt"
            with open(concat_list, "w", encoding="utf-8") as f:
                for _, _, c_out in ranges:
                    f.write(f"file '{c_out.resolve()}'\n")
            concatenated_video = temp_dir / "motion_concatenated.ts"
            rc, stderr_concat = await _run_ffmpeg(
                [
                    "ffmpeg", "-y",
                    "-f", "concat",
                    "-safe", "0",
                    "-i", str(concat_list),
                    "-c", "copy",
                    str(concatenated_video),
                ],
                proc_key=proc_key,
                timeout=300.0,
            )
            if rc != 0:
                err_msg = stderr_concat.decode(errors="replace")[-350:]
                raise RuntimeError(f"FFmpeg concat error: {err_msg}")

        # Final Mux: Video + Voiceover Audio + Optional Watermark + Optional Subtitles
        if progress_callback:
            await progress_callback(82, "Menyematkan audio voiceover dan kompilasi MP4 Full HD...")

        cmd_final = ["ffmpeg", "-y", "-i", str(concatenated_video)]
        filter_chains: List[str] = []

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

        if audio_path and Path(audio_path).exists():
            cmd_final.extend(["-i", audio_path])
            audio_args = ["-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        else:
            audio_args = ["-an"]

        if filter_chains:
            cmd_final.extend(["-vf", ",".join(filter_chains)])
            preset = "ultrafast" if is_preview else "veryfast"
            crf = "24" if is_preview else "19"
            cmd_final.extend(["-c:v", "libx264", "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p"])
        else:
            # Re-encode cleanly into MP4 container with high quality & faststart
            preset = "ultrafast" if is_preview else "veryfast"
            crf = "24" if is_preview else "19"
            cmd_final.extend(["-c:v", "libx264", "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p"])

        cmd_final.extend(["-movflags", "+faststart"])
        cmd_final.extend(audio_args)
        cmd_final.append(str(out_p))

        rc_final, stderr_final = await _run_ffmpeg(
            cmd_final,
            proc_key=proc_key,
            timeout=1200.0,
            progress_callback=progress_callback,
            heartbeat_callback=heartbeat_callback,
            start_pct=82,
            end_pct=98,
            total_duration_sec=audio_dur or (effective_frames / COMPOSITION_FPS),
            progress_msg_prefix="Menyelesaikan kompilasi MP4 Motion Graphic",
        )
        if rc_final != 0:
            if await is_cancelled(project_id, job_id=job_id):
                raise TaskCancelledException("Rendering motion graphic dibatalkan oleh pengguna.")
            err_msg = stderr_final.decode(errors="replace")[-400:]
            raise RuntimeError(f"FFmpeg final mux gagal: {err_msg}")

        if progress_callback:
            await progress_callback(100, "Render video Motion Graphic selesai!")

        return str(out_p)

    except BaseException:
        out_p.unlink(missing_ok=True)
        raise
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


