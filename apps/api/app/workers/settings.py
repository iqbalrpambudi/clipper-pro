from app.core.redis import get_redis_settings
from app.services.cancellation import start_cancellation_listener
from app.workers.tasks import (
    cleanup_stuck_render_jobs,
    detect_scenes_job,
    download_youtube_job,
    generate_storyboard_images_job,
    generate_tts_and_align_job,
    render_video_job,
)


async def startup(ctx):
    await start_cancellation_listener()
    await cleanup_stuck_render_jobs()


class WorkerSettings:
    functions = [
        download_youtube_job,
        detect_scenes_job,
        generate_tts_and_align_job,
        render_video_job,
        generate_storyboard_images_job,
    ]
    redis_settings = get_redis_settings()
    max_jobs = 4
    job_timeout = 3600  # 60 minutes for high-res 1080p long renders
    on_startup = startup
