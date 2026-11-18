"""CLI entrypoint for running Cliper Pro as a background service with system tray."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional

from app.service_runtime import (
    DEFAULT_HOST,
    DEFAULT_PORT,
    api_pidfile,
    build_service_env,
    ensure_data_dir,
    find_ffmpeg,
    find_ytdlp,
    get_data_dir,
    install_login_service,
    is_api_healthy,
    is_api_running,
    is_login_service_installed,
    is_process_running,
    open_browser,
    read_pid,
    resolve_web_dist,
    service_url,
    start_api_background,
    start_tray_background,
    stop_api,
    stop_tray,
    tray_pidfile,
    uninstall_login_service,
    wait_for_api,
)


def _cmd_start(args: argparse.Namespace) -> int:
    data_dir = ensure_data_dir(Path(args.data_dir) if args.data_dir else None)

    if not find_ffmpeg(data_dir):
        print(
            "⚠️  ffmpeg tidak ditemukan di PATH. Render video dan ekstraksi frame butuh ffmpeg "
            "(macOS: `brew install ffmpeg`, Ubuntu/Debian: `sudo apt install ffmpeg`).",
            file=sys.stderr,
        )

    if args.foreground:
        env = build_service_env(data_dir, host=args.host, port=args.port)
        os.environ.update(env)
        import uvicorn

        uvicorn.run(
            "app.main:app",
            host=args.host,
            port=args.port,
            timeout_graceful_shutdown=5,
        )
        return 0

    already = is_api_running(data_dir, host=args.host, port=args.port)
    pid = (
        read_pid(api_pidfile(data_dir))
        if already
        else start_api_background(
            data_dir=data_dir,
            host=args.host,
            port=args.port,
        )
    )

    ready = wait_for_api(host=args.host, port=args.port, timeout=25.0)
    url = service_url(args.host, args.port)
    if ready:
        print(f"Cliper Pro service running at {url} (PID: {pid or '?'})")
    else:
        print(
            f"Cliper Pro service started (PID: {pid or '?'}), masih inisialisasi. Cek log: {data_dir / 'api.log'}"
        )

    if not args.headless:
        tray_pid = start_tray_background(data_dir=data_dir, host=args.host, port=args.port)
        print(f"System tray active (PID: {tray_pid})")

    if args.open and ready:
        open_browser(args.host, args.port)

    return 0


def _cmd_stop(args: argparse.Namespace) -> int:
    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()
    stopped_tray = stop_tray(data_dir)
    stopped_api = stop_api(data_dir)
    if stopped_api or stopped_tray:
        print("Cliper Pro service stopped.")
    else:
        print("Cliper Pro service is not running.")
    return 0


def _cmd_restart(args: argparse.Namespace) -> int:
    _cmd_stop(args)
    return _cmd_start(args)


def _cmd_status(args: argparse.Namespace) -> int:
    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()
    api_pid = read_pid(api_pidfile(data_dir))
    api_alive = is_process_running(api_pid, "uvicorn app.main:app")
    healthy = is_api_healthy(args.host, args.port, timeout=1.0)
    tray_pid = read_pid(tray_pidfile(data_dir))
    tray_alive = is_process_running(tray_pid, "app.cli")

    url = service_url(args.host, args.port)
    status_str = "running (healthy)" if healthy else ("starting" if api_alive else "stopped")
    print(f"Status       : {status_str}")
    print(f"Web UI / API : {url}")
    print(f"API PID      : {api_pid if api_alive else '-'}")
    print(f"Tray PID     : {tray_pid if tray_alive else '-'}")
    print(f"Data dir     : {data_dir}")
    print(f"Web bundle   : {resolve_web_dist() or 'NOT FOUND (build apps/web terlebih dahulu)'}")
    print(f"ffmpeg       : {find_ffmpeg(data_dir) or 'NOT FOUND'}")
    print(f"yt-dlp       : {find_ytdlp(data_dir) or 'NOT FOUND'}")
    print(f"Auto-start   : {'enabled' if is_login_service_installed() else 'disabled'}")
    return 0 if healthy else 1


def _cmd_open(args: argparse.Namespace) -> int:
    open_browser(args.host, args.port)
    print(f"Opened {service_url(args.host, args.port)}")
    return 0


def _cmd_logs(args: argparse.Namespace) -> int:
    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()
    log_path = data_dir / "api.log"
    if not log_path.is_file():
        print(f"Belum ada log di {log_path}")
        return 0

    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    for line in lines[-args.lines :]:
        print(line)

    if not args.follow:
        return 0

    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            f.seek(0, os.SEEK_END)
            while True:
                line = f.readline()
                if line:
                    print(line, end="")
                else:
                    time.sleep(0.3)
    except KeyboardInterrupt:
        return 0


def _cmd_tray(args: argparse.Namespace) -> int:
    from app.tray import run_tray

    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()
    run_tray(
        data_dir=data_dir,
        host=args.host,
        port=args.port,
        with_api=args.with_api,
    )
    return 0


def _cmd_service(args: argparse.Namespace) -> int:
    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()
    if args.action == "install":
        path = install_login_service(
            data_dir=data_dir,
            host=args.host,
            port=args.port,
            with_tray=not args.headless,
        )
        print(f"Auto-start service installed: {path}")
        return 0
    if args.action == "uninstall":
        removed = uninstall_login_service()
        print("Auto-start service removed." if removed else "Auto-start service was not installed.")
        return 0
    if args.action == "status":
        print("enabled" if is_login_service_installed() else "disabled")
        return 0
    return 1


def _cmd_doctor(args: argparse.Namespace) -> int:
    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()
    ffmpeg_path = find_ffmpeg(data_dir)
    ytdlp_path = find_ytdlp(data_dir)
    web_dist = resolve_web_dist()

    checks = [
        ("Python", sys.version.split()[0], True),
        ("Data directory", str(data_dir), True),
        ("Web UI bundle", str(web_dist) if web_dist else "Missing", web_dist is not None),
        ("ffmpeg", ffmpeg_path or "Missing (brew install ffmpeg)", ffmpeg_path is not None),
        ("yt-dlp", ytdlp_path or "Missing", ytdlp_path is not None),
    ]
    all_ok = True
    for name, detail, ok in checks:
        mark = "OK" if ok else "MISSING"
        print(f"[{mark:7}] {name:16}: {detail}")
        if not ok:
            all_ok = False
    return 0 if all_ok else 1


def _find_repo_root() -> Optional[Path]:
    for base in (Path.cwd(), Path(__file__).resolve().parent):
        for candidate in (base, *base.parents):
            if (candidate / "scripts" / "release.sh").is_file():
                return candidate
    return None


def _cmd_export(args: argparse.Namespace) -> int:
    repo = _find_repo_root()
    if not repo:
        print(
            "Error: `cliper-pro export` harus dijalankan dari source repository (scripts/release.sh tidak ditemukan).",
            file=sys.stderr,
        )
        return 1

    cmd = ["bash", str(repo / "scripts" / "release.sh")]
    if args.version:
        cmd.extend(["--version", args.version])
    if args.skip_checks:
        cmd.append("--skip-checks")
    if args.install:
        cmd.append("--install")
    if args.tag:
        cmd.append("--tag")
    return subprocess.run(cmd, cwd=str(repo)).returncode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cliper-pro",
        description="Cliper Pro background service, Web UI & system tray controller",
    )
    parser.add_argument("--data-dir", help="Override data directory (default: ~/.cliper-pro)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_start = sub.add_parser("start", help="Start Cliper Pro service (and system tray)")
    p_start.add_argument("--host", default=DEFAULT_HOST)
    p_start.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_start.add_argument(
        "--headless", action="store_true", help="Run background service without system tray"
    )
    p_start.add_argument("--foreground", action="store_true", help="Run API server in foreground")
    p_start.add_argument("--open", action="store_true", help="Open Web UI in browser once ready")
    p_start.set_defaults(func=_cmd_start)

    p_stop = sub.add_parser("stop", help="Stop Cliper Pro service and tray")
    p_stop.set_defaults(func=_cmd_stop)

    p_restart = sub.add_parser("restart", help="Restart Cliper Pro service")
    p_restart.add_argument("--host", default=DEFAULT_HOST)
    p_restart.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_restart.add_argument("--headless", action="store_true")
    p_restart.add_argument("--foreground", action="store_true")
    p_restart.add_argument("--open", action="store_true")
    p_restart.set_defaults(func=_cmd_restart)

    p_status = sub.add_parser("status", help="Show service status")
    p_status.add_argument("--host", default=DEFAULT_HOST)
    p_status.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_status.set_defaults(func=_cmd_status)

    p_open = sub.add_parser("open", help="Open Web UI in default browser")
    p_open.add_argument("--host", default=DEFAULT_HOST)
    p_open.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_open.set_defaults(func=_cmd_open)

    p_logs = sub.add_parser("logs", help="View API service logs")
    p_logs.add_argument("-n", "--lines", type=int, default=80)
    p_logs.add_argument("-f", "--follow", action="store_true")
    p_logs.set_defaults(func=_cmd_logs)

    p_tray = sub.add_parser("tray", help="Run the system tray icon in foreground")
    p_tray.add_argument("--host", default=DEFAULT_HOST)
    p_tray.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_tray.add_argument("--with-api", action="store_true", help="Ensure API service is started too")
    p_tray.set_defaults(func=_cmd_tray)

    p_svc = sub.add_parser("service", help="Manage auto-start login service")
    p_svc.add_argument("action", choices=["install", "uninstall", "status"])
    p_svc.add_argument("--host", default=DEFAULT_HOST)
    p_svc.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_svc.add_argument("--headless", action="store_true")
    p_svc.set_defaults(func=_cmd_service)

    p_doc = sub.add_parser("doctor", help="Check system dependencies and paths")
    p_doc.set_defaults(func=_cmd_doctor)

    p_exp = sub.add_parser("export", help="Export production bundle to ./dist/ (source repo only)")
    p_exp.add_argument("--version", help="Set/bump release version (e.g. 0.2.0)")
    p_exp.add_argument("--skip-checks", action="store_true", help="Skip lint & test checks")
    p_exp.add_argument("--install", action="store_true", help="Install exported wheel locally")
    p_exp.add_argument("--tag", action="store_true", help="Create git tag v<VERSION>")
    p_exp.set_defaults(func=_cmd_export)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
