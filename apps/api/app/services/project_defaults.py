import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from app.core.config import get_settings
from app.schemas.config import ProjectDefaultsConfig
from app.services.subtitle_ass import style_to_dict

log = logging.getLogger("cliper-pro.project_defaults")

_SECTION_KEYS = ("subtitle", "watermark", "tts", "qc")


def resolve_config_json_path() -> Path:
    """Return the primary writable path for config.json."""
    settings = get_settings()
    custom = (settings.CONFIG_JSON_PATH or "").strip()
    if custom:
        p = Path(custom)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    return settings.storage_dir / "config.json"


def _fallback_config_paths() -> list[Path]:
    """Candidate fallback config.json locations when storage/config.json does not exist yet."""
    settings = get_settings()
    if (settings.CONFIG_JSON_PATH or "").strip():
        return []
    candidates = [Path.cwd() / "config.json"]
    try:
        repo_root = Path(__file__).resolve().parents[4]
        candidates.append(repo_root / "config.json")
    except IndexError:
        pass
    return candidates


def find_readable_config_path() -> Optional[Path]:
    """Locate an existing config.json (primary storage path first, then repo/cwd fallback)."""
    primary = resolve_config_json_path()
    if primary.is_file():
        return primary
    for candidate in _fallback_config_paths():
        if candidate.is_file():
            return candidate
    return None


def merge_project_defaults(raw_data: Dict[str, Any]) -> ProjectDefaultsConfig:
    """Merge a partial or full config.json dict onto built-in defaults and validate."""
    if not isinstance(raw_data, dict):
        raise ValueError("Isi config.json harus berupa JSON object")

    merged = ProjectDefaultsConfig().model_dump()
    for key in _SECTION_KEYS:
        section = raw_data.get(key)
        if section is None:
            continue
        if not isinstance(section, dict):
            raise ValueError(f"Bagian '{key}' pada config.json harus berupa JSON object")
        merged[key] = {
            **merged[key],
            **{k: v for k, v in section.items() if v is not None},
        }

    return ProjectDefaultsConfig.model_validate(merged)


def load_project_defaults(*, strict: bool = False) -> Tuple[ProjectDefaultsConfig, Path, bool]:
    """Load default project configuration from config.json, falling back to built-in defaults."""
    primary = resolve_config_json_path()
    readable = find_readable_config_path()
    if not readable:
        return ProjectDefaultsConfig(), primary, False

    try:
        raw_text = readable.read_text(encoding="utf-8")
        raw_json = json.loads(raw_text)
        cfg = merge_project_defaults(raw_json)
        return cfg, readable, True
    except Exception as exc:
        if strict:
            raise ValueError(f"Gagal membaca config.json ({readable}): {exc}") from exc
        log.warning("Invalid config.json at %s (%s); using built-in defaults", readable, exc)
        return ProjectDefaultsConfig(), primary, False


def save_project_defaults(payload: ProjectDefaultsConfig | Dict[str, Any]) -> ProjectDefaultsConfig:
    """Validate and persist default project configuration to config.json."""
    cfg = (
        payload
        if isinstance(payload, ProjectDefaultsConfig)
        else merge_project_defaults(payload)
    )
    target = resolve_config_json_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_suffix(".json.tmp")
    tmp_path.write_text(export_project_defaults_json(cfg), encoding="utf-8")
    tmp_path.replace(target)
    return cfg


def reset_project_defaults() -> ProjectDefaultsConfig:
    """Reset config.json back to built-in default values."""
    return save_project_defaults(ProjectDefaultsConfig())


def export_project_defaults_json(cfg: Optional[ProjectDefaultsConfig] = None) -> str:
    """Serialize ProjectDefaultsConfig as formatted config.json text."""
    if cfg is None:
        cfg, _, _ = load_project_defaults()
    return json.dumps(cfg.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"


def build_project_config_snapshot(
    project: Any,
    audio_track: Any = None,
    subtitle_style: Any = None,
) -> ProjectDefaultsConfig:
    """Build a ProjectDefaultsConfig snapshot from an existing project's settings."""
    defaults, _, _ = load_project_defaults()
    raw: Dict[str, Any] = {}

    sub = subtitle_style if subtitle_style is not None else getattr(project, "subtitle_style", None)
    if sub is not None:
        raw["subtitle"] = style_to_dict(sub)
    else:
        raw["subtitle"] = defaults.subtitle.model_dump()

    wm = getattr(project, "watermark", None)
    if isinstance(wm, dict):
        raw["watermark"] = wm
    else:
        raw["watermark"] = defaults.watermark.model_dump()

    tts_source: Dict[str, Any] = {}
    proj_tts = getattr(project, "tts_config", None)
    if isinstance(proj_tts, dict):
        tts_source.update(proj_tts)
    if audio_track is not None:
        for attr in ("provider", "voice", "rate", "pitch"):
            val = getattr(audio_track, attr, None)
            if val is not None:
                tts_source[attr] = val
    raw["tts"] = tts_source if tts_source else defaults.tts.model_dump()

    proj_qc = getattr(project, "qc_config", None)
    raw["qc"] = proj_qc if isinstance(proj_qc, dict) else defaults.qc.model_dump()

    return merge_project_defaults(raw)
