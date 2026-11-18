import os
from pathlib import Path

from app.cli import build_parser
from app.service_runtime import (
    build_launchd_plist,
    build_service_env,
    ensure_data_dir,
    ensure_encryption_key,
    get_data_dir,
    resolve_web_dist,
)


def test_get_data_dir_override(tmp_path: Path, monkeypatch):
    target = tmp_path / "custom-data"
    monkeypatch.setenv("CLIPER_DATA_DIR", str(target))
    assert get_data_dir() == target.resolve()


def test_ensure_encryption_key_persists(tmp_path: Path):
    data = ensure_data_dir(tmp_path / "data")
    first = ensure_encryption_key(data)
    second = ensure_encryption_key(data)
    assert len(first) == 64
    assert first == second
    mode = (data / "encryption.key").stat().st_mode & 0o777
    assert mode == 0o600


def test_build_service_env_and_web_dist(tmp_path: Path, monkeypatch):
    web = tmp_path / "web_dist"
    web.mkdir()
    (web / "index.html").write_text("<html></html>", encoding="utf-8")
    monkeypatch.setenv("WEB_DIST", str(web))

    data = tmp_path / "data"
    env = build_service_env(data, host="127.0.0.1", port=18080)
    assert env["STORAGE_PATH"] == str(data)
    assert env["DATABASE_URL"] == f"sqlite+aiosqlite:///{data / 'cliper.db'}"
    assert env["PUBLIC_API_URL"] == "http://127.0.0.1:18080"
    assert env["WEB_DIST"] == str(web.resolve())
    assert len(env["ENCRYPTION_KEY"]) == 64
    assert resolve_web_dist() == web.resolve()


def test_build_launchd_plist(tmp_path: Path):
    plist = build_launchd_plist(tmp_path, host="127.0.0.1", port=18080, with_tray=True)
    assert plist["Label"] == "com.cliperpro.service"
    assert plist["RunAtLoad"] is True
    assert "tray" in plist["ProgramArguments"]
    assert "--with-api" in plist["ProgramArguments"]
    assert plist["EnvironmentVariables"]["CLIPER_DATA_DIR"] == str(tmp_path)


def test_cli_parser_subcommands():
    parser = build_parser()
    args = parser.parse_args(["start", "--headless", "--port", "19090"])
    assert args.command == "start"
    assert args.headless is True
    assert args.port == 19090

    svc_args = parser.parse_args(["service", "install"])
    assert svc_args.command == "service"
    assert svc_args.action == "install"

    exp_args = parser.parse_args(["export", "--version", "0.2.0", "--skip-checks", "--install"])
    assert exp_args.command == "export"
    assert exp_args.version == "0.2.0"
    assert exp_args.skip_checks is True
    assert exp_args.install is True
    assert os.path.basename(str(get_data_dir()))  # sanity check
