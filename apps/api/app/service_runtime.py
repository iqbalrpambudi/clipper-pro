"""Runtime helpers for running Cliper Pro as a headless background service + system tray."""

from __future__ import annotations

import http.client
import os
import plistlib
import secrets
import shutil
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Dict, Optional

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 18080
LAUNCHD_LABEL = "com.cliperpro.service"
SYSTEMD_UNIT = "cliper-pro.service"


def get_data_dir() -> Path:
    """Return the Cliper Pro data directory (overrideable via CLIPER_DATA_DIR)."""
    override = os.environ.get("CLIPER_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".cliper-pro").resolve()


def ensure_data_dir(data_dir: Optional[Path] = None) -> Path:
    """Ensure the data directory and standard subdirectories exist."""
    d = data_dir or get_data_dir()
    d.mkdir(parents=True, exist_ok=True)
    (d / "bgm").mkdir(exist_ok=True)
    (d / "projects").mkdir(exist_ok=True)
    (d / "hf").mkdir(exist_ok=True)
    return d


def ensure_encryption_key(data_dir: Path) -> str:
    """Return the persisted 32-byte hex encryption key, creating it once if absent."""
    key_path = data_dir / "encryption.key"
    if key_path.is_file():
        existing = key_path.read_text(encoding="utf-8").strip()
        if existing:
            return existing

    key = secrets.token_hex(32)
    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(fd, key.encode("utf-8"))
    finally:
        os.close(fd)
    return key


def resolve_web_dist() -> Optional[Path]:
    """Find the built React frontend (env override, packaged web_dist, or repo apps/web/dist)."""
    env_dist = os.environ.get("WEB_DIST", "").strip()
    candidates = []
    if env_dist:
        candidates.append(Path(env_dist).expanduser())

    pkg_dir = Path(__file__).resolve().parent
    candidates.append(pkg_dir / "web_dist")
    # Repo source checkout fallback: apps/api/app -> apps/web/dist
    candidates.append(pkg_dir.parents[1] / "web" / "dist")

    for candidate in candidates:
        resolved = candidate.resolve()
        if (resolved / "index.html").is_file():
            return resolved
    return None


def resolve_icon_path() -> Optional[Path]:
    """Locate the bundled PNG tray icon."""
    icon = Path(__file__).resolve().parent / "assets" / "icon.png"
    return icon if icon.is_file() else None


def build_augmented_path(data_dir: Path) -> str:
    """Prepend venv bin, local data bin, and common Homebrew/system dirs to PATH."""
    parts = [
        str(data_dir / "bin"),
        str(Path(sys.executable).resolve().parent),
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ]
    existing = os.environ.get("PATH", "")
    if existing:
        parts.append(existing)
    seen: list[str] = []
    for p in parts:
        if p and p not in seen:
            seen.append(p)
    return os.pathsep.join(seen)


def build_service_env(
    data_dir: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> Dict[str, str]:
    """Build environment variables for the FastAPI/Uvicorn worker process."""
    ensure_data_dir(data_dir)
    key = ensure_encryption_key(data_dir)
    env = os.environ.copy()
    env["PATH"] = build_augmented_path(data_dir)
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["CLIPER_DATA_DIR"] = str(data_dir)
    env["STORAGE_PATH"] = str(data_dir)
    env["DATABASE_URL"] = f"sqlite+aiosqlite:///{data_dir / 'cliper.db'}"
    env["HF_HOME"] = str(data_dir / "hf")
    env["ENCRYPTION_KEY"] = key
    env["PUBLIC_API_URL"] = f"http://{host}:{port}"
    env.setdefault(
        "CORS_ORIGINS",
        f"http://localhost:3031,http://127.0.0.1:{port},http://localhost:{port}",
    )
    web_dist = resolve_web_dist()
    if web_dist:
        env["WEB_DIST"] = str(web_dist)
    return env


def read_pid(pidfile: Path) -> Optional[int]:
    """Read an integer PID from pidfile if valid."""
    if not pidfile.is_file():
        return None
    try:
        return int(pidfile.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def is_process_running(pid: Optional[int], match_substring: Optional[str] = None) -> bool:
    """Return True if pid is alive and (optionally) its command line contains match_substring."""
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False

    if not match_substring or sys.platform == "win32":
        return True

    try:
        out = subprocess.check_output(
            ["ps", "-o", "command=", "-p", str(pid)],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return match_substring in out
    except (subprocess.SubprocessError, OSError):
        return False


def stop_pidfile_process(
    pidfile: Path,
    match_substring: str,
    timeout: float = 6.0,
) -> bool:
    """Gracefully terminate a tracked process and remove its pidfile."""
    pid = read_pid(pidfile)
    if not is_process_running(pid, match_substring):
        pidfile.unlink(missing_ok=True)
        return False

    assert pid is not None
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pidfile.unlink(missing_ok=True)
        return False

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not is_process_running(pid, match_substring):
            pidfile.unlink(missing_ok=True)
            return True
        time.sleep(0.15)

    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass
    pidfile.unlink(missing_ok=True)
    return True


def is_api_healthy(
    host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, timeout: float = 1.0
) -> bool:
    """Return True if GET /healthz responds with HTTP 200."""
    connect_host = "127.0.0.1" if host == "0.0.0.0" else host
    conn = http.client.HTTPConnection(connect_host, port, timeout=timeout)
    try:
        conn.request("GET", "/healthz")
        resp = conn.getresponse()
        return resp.status == 200
    except OSError:
        return False
    finally:
        conn.close()


def wait_for_api(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    timeout: float = 30.0,
) -> bool:
    """Poll /healthz until healthy or timeout expires."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if is_api_healthy(host, port, timeout=1.0):
            return True
        time.sleep(0.25)
    return False


def api_pidfile(data_dir: Path) -> Path:
    return data_dir / "api.pid"


def tray_pidfile(data_dir: Path) -> Path:
    return data_dir / "tray.pid"


def is_api_running(data_dir: Path, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> bool:
    """Check tracked PID or live /healthz endpoint."""
    pid = read_pid(api_pidfile(data_dir))
    if is_process_running(pid, "uvicorn app.main:app"):
        return True
    return is_api_healthy(host, port, timeout=0.5)


def start_api_background(
    data_dir: Optional[Path] = None,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> int:
    """Start Uvicorn in the background and return its PID."""
    data_dir = ensure_data_dir(data_dir)
    pidfile = api_pidfile(data_dir)

    existing = read_pid(pidfile)
    if is_process_running(existing, "uvicorn app.main:app"):
        assert existing is not None
        return existing
    pidfile.unlink(missing_ok=True)

    env = build_service_env(data_dir, host=host, port=port)
    log_path = data_dir / "api.log"
    api_cwd = Path(__file__).resolve().parents[1]

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        host,
        "--port",
        str(port),
        "--timeout-graceful-shutdown",
        "5",
    ]
    with open(log_path, "a", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            cmd,
            cwd=str(api_cwd) if (api_cwd / "app").is_dir() else None,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=log_file,
            start_new_session=True,
        )
    pidfile.write_text(str(proc.pid), encoding="utf-8")
    return proc.pid


def start_tray_background(
    data_dir: Optional[Path] = None,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> int:
    """Launch the system tray icon process in the background and return its PID."""
    data_dir = ensure_data_dir(data_dir)
    pidfile = tray_pidfile(data_dir)
    existing = read_pid(pidfile)
    if is_process_running(existing, "app.cli"):
        assert existing is not None
        return existing
    pidfile.unlink(missing_ok=True)

    env = build_service_env(data_dir, host=host, port=port)
    log_path = data_dir / "tray.log"
    cmd = [
        sys.executable,
        "-m",
        "app.cli",
        "tray",
        "--host",
        host,
        "--port",
        str(port),
    ]
    with open(log_path, "a", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            cmd,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=log_file,
            start_new_session=True,
        )
    pidfile.write_text(str(proc.pid), encoding="utf-8")
    return proc.pid


def stop_api(data_dir: Optional[Path] = None) -> bool:
    d = data_dir or get_data_dir()
    return stop_pidfile_process(api_pidfile(d), "uvicorn app.main:app")


def stop_tray(data_dir: Optional[Path] = None) -> bool:
    d = data_dir or get_data_dir()
    return stop_pidfile_process(tray_pidfile(d), "app.cli")


def service_url(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> str:
    browser_host = "127.0.0.1" if host == "0.0.0.0" else host
    return f"http://{browser_host}:{port}"


def open_browser(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> None:
    webbrowser.open(service_url(host, port))


def open_path(path: Path) -> None:
    """Open a file or folder in the OS file manager / default viewer."""
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    elif sys.platform == "win32":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", str(path)])


def find_ffmpeg(data_dir: Optional[Path] = None) -> Optional[str]:
    d = data_dir or get_data_dir()
    return shutil.which("ffmpeg", path=build_augmented_path(d))


def find_ytdlp(data_dir: Optional[Path] = None) -> Optional[str]:
    d = data_dir or get_data_dir()
    return shutil.which("yt-dlp", path=build_augmented_path(d))


def _launchd_plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LAUNCHD_LABEL}.plist"


def _systemd_unit_path() -> Path:
    return Path.home() / ".config" / "systemd" / "user" / SYSTEMD_UNIT


def build_launchd_plist(
    data_dir: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    with_tray: bool = True,
) -> dict:
    """Create the macOS LaunchAgent plist dictionary."""
    args = [sys.executable, "-m", "app.cli"]
    if with_tray:
        args.extend(["tray", "--with-api", "--host", host, "--port", str(port)])
    else:
        args.extend(["start", "--headless", "--foreground", "--host", host, "--port", str(port)])

    return {
        "Label": LAUNCHD_LABEL,
        "ProgramArguments": args,
        "EnvironmentVariables": {
            "CLIPER_DATA_DIR": str(data_dir),
            "PATH": build_augmented_path(data_dir),
        },
        "RunAtLoad": True,
        "KeepAlive": False,
        "StandardOutPath": str(data_dir / "service.log"),
        "StandardErrorPath": str(data_dir / "service.log"),
    }


def is_login_service_installed() -> bool:
    if sys.platform == "darwin":
        return _launchd_plist_path().is_file()
    if sys.platform.startswith("linux"):
        return _systemd_unit_path().is_file()
    return False


def install_login_service(
    data_dir: Optional[Path] = None,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    with_tray: bool = True,
) -> Path:
    """Register Cliper Pro to auto-start on login (launchd on macOS, systemd --user on Linux)."""
    d = ensure_data_dir(data_dir)
    if sys.platform == "darwin":
        plist_path = _launchd_plist_path()
        plist_path.parent.mkdir(parents=True, exist_ok=True)
        payload = build_launchd_plist(d, host=host, port=port, with_tray=with_tray)
        with open(plist_path, "wb") as f:
            plistlib.dump(payload, f)
        subprocess.run(["launchctl", "unload", str(plist_path)], stderr=subprocess.DEVNULL)
        subprocess.run(["launchctl", "load", str(plist_path)], check=False)
        return plist_path

    if sys.platform.startswith("linux"):
        unit_path = _systemd_unit_path()
        unit_path.parent.mkdir(parents=True, exist_ok=True)
        exec_cmd = (
            f"{sys.executable} -m app.cli start --headless --foreground --host {host} --port {port}"
        )
        unit_path.write_text(
            "\n".join(
                [
                    "[Unit]",
                    "Description=Cliper Pro Service",
                    "After=network.target",
                    "",
                    "[Service]",
                    f"Environment=CLIPER_DATA_DIR={d}",
                    f"Environment=PATH={build_augmented_path(d)}",
                    f"ExecStart={exec_cmd}",
                    "Restart=on-failure",
                    "",
                    "[Install]",
                    "WantedBy=default.target",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
        subprocess.run(["systemctl", "--user", "enable", "--now", SYSTEMD_UNIT], check=False)
        return unit_path

    raise RuntimeError(f"Auto-start service belum didukung di platform {sys.platform}")


def uninstall_login_service() -> bool:
    """Remove the login auto-start service registration."""
    if sys.platform == "darwin":
        plist_path = _launchd_plist_path()
        if not plist_path.exists():
            return False
        subprocess.run(["launchctl", "unload", str(plist_path)], stderr=subprocess.DEVNULL)
        plist_path.unlink(missing_ok=True)
        return True

    if sys.platform.startswith("linux"):
        unit_path = _systemd_unit_path()
        if not unit_path.exists():
            return False
        subprocess.run(["systemctl", "--user", "disable", "--now", SYSTEMD_UNIT], check=False)
        unit_path.unlink(missing_ok=True)
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
        return True

    return False
