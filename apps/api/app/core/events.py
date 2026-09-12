import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from app.core.redis import get_redis_client

log = logging.getLogger("cliper-events")


async def publish_project_event(
    project_id: str,
    task_type: str,
    status: str,
    progress: int = 0,
    stage: str = "",
    message: str = "",
    error: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> None:
    """Publish a real-time progress event to Redis Pub/Sub channel for a project.

    Args:
        project_id: Target project UUID.
        task_type: Type of task ('youtube_download', 'scene_detect', 'tts_align', 'render').
        status: Task status ('queued', 'progress', 'success', 'error').
        progress: Progress percentage (0 - 100).
        stage: Machine-readable sub-step identifier.
        message: Human-friendly descriptive message in Indonesian.
        error: Error details if status == 'error'.
        data: Optional auxiliary payload data (e.g. counts, URLs).
    """
    event_payload = {
        "project_id": project_id,
        "task_type": task_type,
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "stage": stage,
        "message": message,
        "error": error,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


    channel = f"project:{project_id}:events"
    try:
        redis = get_redis_client()
        payload_json = json.dumps(event_payload)
        await redis.publish(channel, payload_json)

        # Cache active task in Redis so refreshed pages or new connections immediately see current progress
        active_key = f"project:{project_id}:active_task"
        if status in ("progress", "queued"):
            await redis.set(active_key, payload_json, ex=1800)
        elif status in ("success", "error"):
            await redis.delete(active_key)

        log.debug("Published event to %s: [%s] %s (%d%%)", channel, task_type, message, progress)
    except Exception as e:
        log.warning("Failed to publish event to Redis channel %s: %s", channel, e)
