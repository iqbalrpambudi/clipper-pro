"""Worker tasks facade.

Domain-specific worker tasks have been decomposed into dedicated modules:
- app.workers.youtube: download_youtube_job
- app.workers.scenes: detect_scenes_job, transcribe_scenes_job
- app.workers.tts: generate_tts_and_align_job
- app.workers.render: render_video_job, cleanup_stuck_render_jobs
- app.workers.storyboard: generate_storyboard_images_job

All jobs are re-exported here for backward compatibility with ARQ worker settings
and existing API route endpoints.
"""

from app.workers.render import cleanup_stuck_render_jobs, render_video_job
from app.workers.scenes import detect_scenes_job, transcribe_scenes_job
from app.workers.storyboard import generate_storyboard_images_job
from app.workers.tts import generate_tts_and_align_job
from app.workers.youtube import download_youtube_job

__all__ = [
    "cleanup_stuck_render_jobs",
    "detect_scenes_job",
    "download_youtube_job",
    "generate_storyboard_images_job",
    "generate_tts_and_align_job",
    "render_video_job",
    "transcribe_scenes_job",
]
