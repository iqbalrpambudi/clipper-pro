"""Cross-platform system tray controller for Cliper Pro using pystray."""

from __future__ import annotations

import os
import signal
import sys
import threading
from pathlib import Path
from typing import Optional

import pystray
from PIL import Image, ImageDraw
from pystray import Menu, MenuItem

from app.service_runtime import (
    DEFAULT_HOST,
    DEFAULT_PORT,
    ensure_data_dir,
    install_login_service,
    is_api_healthy,
    is_api_running,
    is_login_service_installed,
    open_browser,
    open_path,
    resolve_icon_path,
    start_api_background,
    stop_api,
    tray_pidfile,
    uninstall_login_service,
)


def _hide_macos_dock_icon() -> None:
    """Keep the tray process out of the macOS Dock (menu bar only)."""
    if sys.platform != "darwin":
        return
    try:
        from AppKit import NSApplication, NSApplicationActivationPolicyAccessory  # type: ignore

        NSApplication.sharedApplication().setActivationPolicy_(
            NSApplicationActivationPolicyAccessory
        )
    except Exception:
        pass


def _load_tray_image() -> Image.Image:
    """Load the Cliper Pro tray icon, or generate a simple fallback icon."""
    icon_path = resolve_icon_path()
    if icon_path:
        with Image.open(icon_path) as img:
            return img.convert("RGBA").resize((64, 64), Image.Resampling.LANCZOS)

    img = Image.new("RGBA", (64, 64), (24, 24, 27, 255))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [4, 4, 60, 60], radius=14, fill=(24, 24, 27, 255), outline=(250, 204, 21, 255), width=4
    )
    draw.polygon([(25, 20), (25, 44), (46, 32)], fill=(250, 204, 21, 255))
    return img


def run_tray(
    data_dir: Optional[Path] = None,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    with_api: bool = False,
) -> None:
    """Run the system tray icon on the main thread until quit."""
    d = ensure_data_dir(data_dir)
    pidfile = tray_pidfile(d)
    pidfile.write_text(str(os.getpid()), encoding="utf-8")

    _hide_macos_dock_icon()

    if with_api and not is_api_running(d, host=host, port=port):
        start_api_background(d, host=host, port=port)

    state = {
        "healthy": is_api_healthy(host, port, timeout=0.5),
        "running": is_api_running(d, host=host, port=port),
        "login_enabled": is_login_service_installed(),
        "stopping": False,
    }
    stop_event = threading.Event()

    def _status_text(_item: MenuItem) -> str:
        if state["healthy"]:
            return f"● API Running (:{port})"
        if state["running"]:
            return f"◐ Starting (:{port})..."
        return "○ API Stopped"

    def _toggle_text(_item: MenuItem) -> str:
        return "Stop Service" if state["running"] else "Start Service"

    def _on_open(_icon: pystray.Icon, _item: MenuItem) -> None:
        if not is_api_running(d, host=host, port=port):
            start_api_background(d, host=host, port=port)
        open_browser(host, port)

    def _on_toggle(icon: pystray.Icon, _item: MenuItem) -> None:
        if is_api_running(d, host=host, port=port):
            stop_api(d)
        else:
            start_api_background(d, host=host, port=port)
        state["running"] = is_api_running(d, host=host, port=port)
        state["healthy"] = is_api_healthy(host, port, timeout=0.5)
        icon.update_menu()

    def _on_restart(icon: pystray.Icon, _item: MenuItem) -> None:
        stop_api(d)
        start_api_background(d, host=host, port=port)
        state["running"] = True
        state["healthy"] = False
        icon.update_menu()

    def _on_open_data(_icon: pystray.Icon, _item: MenuItem) -> None:
        ensure_data_dir(d)
        open_path(d)

    def _on_open_logs(_icon: pystray.Icon, _item: MenuItem) -> None:
        log_file = d / "api.log"
        if not log_file.exists():
            log_file.touch()
        open_path(log_file)

    def _on_toggle_login(icon: pystray.Icon, _item: MenuItem) -> None:
        if is_login_service_installed():
            uninstall_login_service()
        else:
            install_login_service(d, host=host, port=port, with_tray=True)
        state["login_enabled"] = is_login_service_installed()
        icon.update_menu()

    def _on_detach(icon: pystray.Icon, _item: MenuItem) -> None:
        stop_event.set()
        icon.stop()

    def _on_quit(icon: pystray.Icon, _item: MenuItem) -> None:
        state["stopping"] = True
        stop_event.set()
        stop_api(d)
        icon.stop()

    menu_items = [
        MenuItem(_status_text, lambda *_: None, enabled=False),
        MenuItem("Open Cliper Pro", _on_open, default=True),
        MenuItem(_toggle_text, _on_toggle),
        MenuItem("Restart Service", _on_restart),
        Menu.SEPARATOR,
        MenuItem("Open Data Folder", _on_open_data),
        MenuItem("View Logs", _on_open_logs),
    ]
    if sys.platform == "darwin" or sys.platform.startswith("linux"):
        menu_items.append(
            MenuItem(
                "Start at Login",
                _on_toggle_login,
                checked=lambda _item: state["login_enabled"],
            )
        )
    menu_items.extend(
        [
            Menu.SEPARATOR,
            MenuItem("Detach Tray (Keep Running)", _on_detach),
            MenuItem("Stop Service & Quit", _on_quit),
        ]
    )

    icon = pystray.Icon(
        "cliper-pro",
        _load_tray_image(),
        "Cliper Pro",
        Menu(*menu_items),
    )

    def _poll_status() -> None:
        while not stop_event.is_set():
            healthy = is_api_healthy(host, port, timeout=0.6)
            running = healthy or is_api_running(d, host=host, port=port)
            if healthy != state["healthy"] or running != state["running"]:
                state["healthy"] = healthy
                state["running"] = running
                try:
                    icon.update_menu()
                except Exception:
                    pass
            stop_event.wait(0.4 if not healthy and running else 2.5)

    def _handle_sig(_signum: int, _frame: object) -> None:
        stop_event.set()
        try:
            icon.stop()
        except Exception:
            pass

    signal.signal(signal.SIGTERM, _handle_sig)
    signal.signal(signal.SIGINT, _handle_sig)

    poller = threading.Thread(target=_poll_status, daemon=True)
    poller.start()

    try:
        icon.run()
    finally:
        stop_event.set()
        pidfile.unlink(missing_ok=True)
