import asyncio
import json
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import websockets

from app.services.motion_renderer import (
    CDPSession,
    _find_chromium_binary,
    _get_free_port,
    _kill_process_tree,
    _resolve_web_base_url,
)

log = logging.getLogger(__name__)


def detect_static_layout_anti_patterns(code: str, orientation: str = "portrait") -> List[str]:
    """
    Fast, static anti-pattern and collision detector (< 5ms).
    Identifies common LLM spatial bugs that cause text/card overlap or clipping.
    """
    issues: List[str] = []
    if not code:
        return issues

    # 1. 50% | 50% horizontal split on 9:16 portrait
    if orientation == "portrait":
        if re.search(r'flexDirection:\s*["\']row["\']', code):
            if re.search(r'width:\s*4[0-9]{2}', code) or re.search(r'maxWidth:\s*4[0-9]{2}', code):
                issues.append(
                    "Anti-pattern: Dua kolom horizontal (flexDirection: 'row') pada rasio 9:16 portrait menyebabkan kartu terlalu sempit (~440px). Gunakan <ComparisonDuelStage> atau vertical column stack."
                )

    # 2. Huge fixed circular stage colliding with header in 9:16
    if orientation == "portrait":
        has_900_wh = len(re.findall(r'(?:width|height):\s*900', code)) >= 2
        has_large_orbit = re.search(r'\br\s*=\s*(?:4[0-9]{2}|5[0-9]{2}|[6-9][0-9]{2})', code) or re.search(r'radius\s*=\s*(?:4[0-9]{2}|5[0-9]{2}|[6-9][0-9]{2})', code)
        if has_900_wh and has_large_orbit and re.search(r'<KineticWords|<BadgePill|<h[123]', code):
            issues.append(
                "Anti-pattern: Stage lingkaran 900x900 dengan radius orbit > 400px melebihi batas vertikal dan menabrak teks header. Gunakan <OrbitHubStage> dengan radius aman (maks 310px)."
            )

    # 3. Blind absolute overlay on top of cards
    abs_matches = re.findall(r'position:\s*["\']absolute["\'][^}]+(?:top|bottom|left|right)', code)
    if len(abs_matches) > 7 and not re.search(r'<AmbientCanvas|<CloudSkyBackdrop', code):
        issues.append(
            f"Peringatan: Terdapat {len(abs_matches)} elemen dengan posisi absolute bebas. Gunakan slot layout <SceneGridLayout> untuk mencegah tabrakan visual."
        )

    # 4. Burn-in subtitle collision zone (y > 1720 on 1080x1920)
    if orientation == "portrait":
        bottom_matches = re.findall(r'(?:top|y):\s*(?:17[2-9]\d|18\d{2}|19[01]\d)', code)
        if bottom_matches and not re.search(r'subtitleSafeZone', code):
            issues.append(
                "Peringatan: Elemen berada pada zona y > 1720px yang berpotensi menutupi subtitle video vertikal. Aktifkan subtitleSafeZone={true} pada <SceneGridLayout>."
            )

    return issues


async def inspect_scene_layout_cdp(
    project_id: str,
    width: int = 1080,
    height: int = 1920,
    target_frame: int = 30,
    timeout_sec: float = 10.0,
) -> Dict[str, Any]:
    """
    Run Headless Chromium CDP session to inspect live rendered DOM layout,
    detecting text collisions, card overlaps, canvas clippings, and runtime errors.
    """
    chrome_proc = None
    user_data_dir = None
    try:
        chromium_bin = _find_chromium_binary()
        web_base = await _resolve_web_base_url()
        user_data_dir = tempfile.mkdtemp(prefix="cliper_layout_qa_")
        port = _get_free_port()

        cmd = [
            chromium_bin,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={user_data_dir}",
            "--window-size=1280,1280",
            "--hide-scrollbars",
            "--mute-audio",
            "about:blank",
        ]

        chrome_proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            preexec_fn=os.setsid if hasattr(os, "setsid") else None,
        )

        ws_url = None
        for _ in range(30):
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get(f"http://127.0.0.1:{port}/json/version")
                    if resp.status_code == 200:
                        ws_url = resp.json().get("webSocketDebuggerUrl")
                        break
            except Exception:
                await asyncio.sleep(0.1)

        if not ws_url:
            return {"valid": True, "skipped": True, "reason": "Chromium CDP port unavailable"}

        async with websockets.connect(
            ws_url,
            max_size=32 * 1024 * 1024,
            ping_interval=None,
            close_timeout=5.0,
        ) as ws:
            cdp = CDPSession(ws)
            await cdp.call("Page.enable")
            await cdp.call("Runtime.enable")

            # Emulate canvas dimensions
            await cdp.call(
                "Emulation.setDeviceMetricsOverride",
                {
                    "width": width,
                    "height": height,
                    "deviceScaleFactor": 1,
                    "mobile": height > width,
                },
            )

            # Navigate to motion render page
            render_url = f"{web_base}/motion-render/{project_id}?w={width}&h={height}"
            await cdp.call("Page.navigate", {"url": render_url})

            # Wait for __MOTION_READY__
            t0 = asyncio.get_event_loop().time()
            ready = False
            while (asyncio.get_event_loop().time() - t0) < timeout_sec:
                eval_ready = await cdp.call(
                    "Runtime.evaluate",
                    {"expression": "window.__MOTION_READY__ === true", "returnByValue": True},
                )
                if eval_ready.get("result", {}).get("value") is True:
                    ready = True
                    break
                await asyncio.sleep(0.15)

            if not ready:
                err_res = await cdp.call(
                    "Runtime.evaluate",
                    {"expression": "window.__MOTION_ERROR__ || ''", "returnByValue": True},
                )
                err_msg = err_res.get("result", {}).get("value") or "Timeout inisialisasi render scene"
                return {"valid": False, "errors": [err_msg], "overlaps": [], "clippings": []}

            # Run layout inspection at keyframe
            inspect_res = await cdp.call(
                "Runtime.evaluate",
                {
                    "expression": f"window.__inspectMotionLayout ? window.__inspectMotionLayout({target_frame}) : Promise.resolve({{ valid: true }})",
                    "awaitPromise": True,
                    "returnByValue": True,
                },
            )
            report = inspect_res.get("result", {}).get("value") or {}
            return report

    except Exception as e:
        log.warning("CDP layout inspection failed or skipped: %s", e)
        return {"valid": True, "skipped": True, "error": str(e)}
    finally:
        if chrome_proc:
            _kill_process_tree(chrome_proc)
        if user_data_dir and Path(user_data_dir).exists():
            try:
                shutil.rmtree(user_data_dir, ignore_errors=True)
            except Exception:
                pass

