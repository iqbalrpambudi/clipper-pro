import asyncio
import json
import logging
from typing import Optional, Dict
from app.core.redis import get_redis_client

log = logging.getLogger("cliper-cancellation")


class TaskCancelledException(Exception):
    """Raised when a background worker task is explicitly cancelled by the user."""
    pass


# Local in-memory registry of active subprocesses (keyed by task identifier, e.g. "video:<video_id>" or "render:<job_id>")
_active_processes: Dict[str, asyncio.subprocess.Process] = {}
_listener_task: Optional[asyncio.Task] = None


def register_process(key: str, proc: asyncio.subprocess.Process) -> None:
    """Register an active subprocess so it can be killed on cancellation."""
    _active_processes[key] = proc
    log.debug("Registered process for key: %s (pid: %s)", key, getattr(proc, "pid", None))


def unregister_process(key: str) -> None:
    """Unregister a completed or terminated subprocess."""
    _active_processes.pop(key, None)
    log.debug("Unregistered process for key: %s", key)


def kill_registered_process(key: str) -> bool:
    """Kill a specific registered process immediately."""
    proc = _active_processes.pop(key, None)
    if proc:
        try:
            log.info("Killing registered process for key: %s (pid: %s)", key, getattr(proc, "pid", None))
            proc.kill()
            return True
        except ProcessLookupError:
            pass
        except Exception as e:
            log.warning("Error killing process %s: %s", key, e)
    return False


def kill_all_matching_processes(project_id: str, video_id: Optional[str] = None, job_id: Optional[str] = None) -> int:
    """Kill all in-memory processes associated with a project, video, or render job."""
    killed = 0
    keys_to_kill = []
    for k in list(_active_processes.keys()):
        if job_id and f"render:{job_id}" in k:
            keys_to_kill.append(k)
        elif video_id and f"video:{video_id}" in k:
            keys_to_kill.append(k)
        elif not job_id and not video_id and project_id and project_id in k:
            keys_to_kill.append(k)

    for k in keys_to_kill:
        if kill_registered_process(k):
            killed += 1
    return killed


async def request_cancellation(
    project_id: str,
    video_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> None:
    """Set cancellation flags in Redis and broadcast an immediate cancellation signal to all workers."""
    redis = get_redis_client()
    try:
        # If job_id or video_id is targeted, only cancel that specific resource.
        # Only set project-wide cancellation if neither is specified (i.e. universal cancel).
        if job_id:
            await redis.set(f"cancel:render:{job_id}", "1", ex=300)
        elif video_id:
            await redis.set(f"cancel:video:{video_id}", "1", ex=300)
        elif project_id:
            await redis.set(f"cancel:project:{project_id}", "1", ex=300)

        # Broadcast via Redis pubsub channel so all worker processes kill subprocesses immediately
        payload = json.dumps({
            "project_id": project_id,
            "video_id": video_id,
            "job_id": job_id,
        })
        await redis.publish("system:cancellations", payload)
        log.info("Requested cancellation for project %s (video=%s, job=%s)", project_id, video_id, job_id)
    except Exception as e:
        log.warning("Failed to set cancellation in Redis: %s", e)

    # Also kill any processes running in the current Python process
    kill_all_matching_processes(project_id, video_id, job_id)


async def is_cancelled(
    project_id: Optional[str] = None,
    video_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bool:
    """Check if a cancellation flag has been set in Redis for this project, video, or job."""
    try:
        redis = get_redis_client()
        keys = []
        if project_id:
            keys.append(f"cancel:project:{project_id}")
        if video_id:
            keys.append(f"cancel:video:{video_id}")
        if job_id:
            keys.append(f"cancel:render:{job_id}")

        if not keys:
            return False

        # Check each key
        for k in keys:
            val = await redis.get(k)
            if val == "1" or val == 1 or val == b"1":
                return True
        return False
    except Exception as e:
        log.warning("Error checking cancellation status: %s", e)
        return False


async def clear_cancellation(
    project_id: Optional[str] = None,
    video_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> None:
    """Clear cancellation flags in Redis so subsequent task runs are not aborted."""
    try:
        redis = get_redis_client()
        keys = []
        if project_id:
            keys.append(f"cancel:project:{project_id}")
        if video_id:
            keys.append(f"cancel:video:{video_id}")
        if job_id:
            keys.append(f"cancel:render:{job_id}")
        if keys:
            await redis.delete(*keys)
    except Exception as e:
        log.warning("Error clearing cancellation status: %s", e)


async def start_cancellation_listener() -> None:
    """Background listener for cancellation broadcasts from Redis pubsub."""
    global _listener_task
    if _listener_task is not None and not _listener_task.done():
        return

    async def _listener_loop():
        while True:
            try:
                redis = get_redis_client()
                pubsub = redis.pubsub()
                await pubsub.subscribe("system:cancellations")
                log.info("Cancellation listener subscribed to 'system:cancellations'")
                while True:
                    msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if msg and msg.get("type") == "message":
                        data_str = msg.get("data", "")
                        if isinstance(data_str, bytes):
                            data_str = data_str.decode("utf-8")
                        try:
                            payload = json.loads(data_str)
                            p_id = payload.get("project_id", "")
                            v_id = payload.get("video_id")
                            j_id = payload.get("job_id")
                            killed = kill_all_matching_processes(p_id, v_id, j_id)
                            log.info("Cancellation broadcast received: killed %d subprocesses for project %s", killed, p_id)
                        except Exception as parse_err:
                            log.warning("Failed to parse cancellation message: %s", parse_err)
                    await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.warning("Cancellation listener connection error: %s, retrying in 3s...", e)
                await asyncio.sleep(3.0)

    _listener_task = asyncio.create_task(_listener_loop())
