from app.core.redis import get_redis_settings
from app.workers.tasks import (
    download_youtube_job,
    detect_scenes_job,
    generate_tts_and_align_job,
    render_video_job,
    generate_storyboard_images_job,
    cleanup_stuck_render_jobs,
)
from app.services.cancellation import start_cancellation_listener


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
    job_timeout = 1800  # 30 minutes
    on_startup = startup
