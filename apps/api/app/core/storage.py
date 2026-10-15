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

    def get_storyboard_dir(self, project_id: str) -> Path:
        p = self.get_project_dir(project_id) / "storyboard"
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

    def resolve_render_job_thumbnail_url(
        self,
        thumbnail_path: Optional[str | Path] = None,
        output_file_path: Optional[str | Path] = None,
    ) -> Optional[str]:
        """Resolves relative URL for a render job thumbnail, auto-extracting from video if missing."""
        if thumbnail_path:
            p = Path(thumbnail_path)
            if p.exists() and p.is_file() and p.stat().st_size > 0:
                return self.to_relative_url(p)

        if output_file_path:
            out_p = Path(output_file_path)
            if out_p.exists() and out_p.is_file():
                thumb_p = out_p.parent / f"{out_p.stem}_thumb.jpg"
                if thumb_p.exists() and thumb_p.is_file() and thumb_p.stat().st_size > 0:
                    return self.to_relative_url(thumb_p)
                try:
                    import subprocess
                    subprocess.run(
                        [
                            "ffmpeg", "-y",
                            "-ss", "00:00:00.500",
                            "-i", str(out_p),
                            "-vframes", "1",
                            "-q:v", "2",
                            str(thumb_p),
                        ],
                        capture_output=True,
                        timeout=5,
                    )
                    if thumb_p.exists() and thumb_p.stat().st_size > 0:
                        return self.to_relative_url(thumb_p)
                except Exception:
                    pass
        return None

    def get_file_size(self, abs_path: Optional[str | Path]) -> Optional[int]:
        if not abs_path:
            return None
        try:
            p = Path(abs_path)
            if p.is_file():
                return p.stat().st_size
        except Exception:
            pass
        return None

    def delete_file(self, abs_path: Optional[str | Path]) -> bool:
        if not abs_path:
            return False
        try:
            p = Path(abs_path)
            if p.exists() and p.is_file():
                p.unlink(missing_ok=True)
                return True
        except Exception:
            pass
        return False

    def delete_render_job_files(
        self,
        project_id: str,
        job_id: str,
        output_file_path: Optional[str | Path] = None,
    ) -> int:
        """Deletes output file and any artifacts matching job_id, returning total bytes freed."""
        freed = 0
        if output_file_path:
            try:
                p = Path(output_file_path)
                if p.exists() and p.is_file():
                    freed += p.stat().st_size
                    p.unlink(missing_ok=True)
            except Exception:
                pass

        renders_dir = self.get_renders_dir(project_id)
        if renders_dir.exists():
            for f in renders_dir.glob(f"*{job_id}*"):
                if f.is_file():
                    try:
                        freed += f.stat().st_size
                        f.unlink(missing_ok=True)
                    except Exception:
                        pass
        return freed

    def clear_all_project_renders(self, project_id: str) -> int:
        """Deletes all render files for the given project, returning total bytes freed."""
        freed = 0
        renders_dir = self.get_renders_dir(project_id)
        if renders_dir.exists():
            for f in renders_dir.iterdir():
                if f.is_file():
                    try:
                        freed += f.stat().st_size
                        f.unlink(missing_ok=True)
                    except Exception:
                        pass
        return freed

    def delete_project_files(self, project_id: str) -> None:
        p = self.get_project_dir(project_id)
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)


storage = StorageManager()

