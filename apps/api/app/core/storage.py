import shutil
from pathlib import Path
from typing import Optional
from app.core.config import get_settings


class StorageManager:
    def __init__(self):
        self.settings = get_settings()

    @property
    def base_dir(self) -> Path:
        p = Path(self.settings.STORAGE_PATH)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_project_dir(self, project_id: str) -> Path:
        p = self.base_dir / "projects" / str(project_id)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_videos_dir(self, project_id: str) -> Path:
        p = self.get_project_dir(project_id) / "videos"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_scenes_dir(self, project_id: str) -> Path:
        p = self.get_project_dir(project_id) / "scenes"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_audio_dir(self, project_id: str) -> Path:
        p = self.get_project_dir(project_id) / "audio"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_renders_dir(self, project_id: str) -> Path:
        p = self.get_project_dir(project_id) / "renders"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_fonts_dir(self) -> Path:
        p = self.base_dir / "fonts"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def to_relative_url(self, abs_path: Optional[str | Path]) -> Optional[str]:
        if not abs_path:
            return None
        abs_p = Path(abs_path).resolve()
        base_p = self.base_dir.resolve()
        try:
            rel = abs_p.relative_to(base_p)
            return f"/storage/{rel.as_posix()}"
        except ValueError:
            return str(abs_path)

    def to_absolute_path(self, rel_url: Optional[str]) -> Optional[Path]:
        if not rel_url:
            return None
        if rel_url.startswith("/storage/"):
            rel_str = rel_url[len("/storage/") :]
            return self.base_dir / rel_str
        return Path(rel_url)

    def delete_project_files(self, project_id: str) -> None:
        p = self.get_project_dir(project_id)
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)


storage = StorageManager()
