import asyncio
import logging
import time
from typing import Dict, Optional

log = logging.getLogger("cliper-cancellation")


class TaskCancelledException(Exception):
    """Raised when a background worker task is explicitly cancelled by the user."""
    pass


# Local in-memory registry of active subprocesses (keyed by task identifier, e.g. "video:<video_id>" or "render:<job_id>")
_active_processes: Dict[str, asyncio.subprocess.Process] = {}

# In-memory dictionary of cancellation flags with expiration timestamps: { "cancel:project:<id>": expire_timestamp }
_cancellation_flags: Dict[str, float] = {}


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
    """Set in-memory cancellation flags and immediately terminate all matching subprocesses."""
    expiry = time.time() + 300.0  # Expire after 5 minutes
    if job_id:
        _cancellation_flags[f"cancel:render:{job_id}"] = expiry
    elif video_id:
        _cancellation_flags[f"cancel:video:{video_id}"] = expiry
    elif project_id:
        _cancellation_flags[f"cancel:project:{project_id}"] = expiry

    log.info("Requested cancellation for project %s (video=%s, job=%s)", project_id, video_id, job_id)
    # Immediately kill any matching subprocesses running in-process
    kill_all_matching_processes(project_id, video_id, job_id)


async def is_cancelled(
    project_id: Optional[str] = None,
    video_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bool:
    """Check if an in-memory cancellation flag has been set for this project, video, or job."""
    now = time.time()
    keys = []
    if project_id:
        keys.append(f"cancel:project:{project_id}")
    if video_id:
        keys.append(f"cancel:video:{video_id}")
    if job_id:
        keys.append(f"cancel:render:{job_id}")

    for k in keys:
        exp = _cancellation_flags.get(k)
        if exp is not None:
            if now < exp:
                return True
            else:
                _cancellation_flags.pop(k, None)  # Expired
    return False


async def clear_cancellation(
    project_id: Optional[str] = None,
    video_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> None:
    """Clear in-memory cancellation flags."""
    if project_id:
        _cancellation_flags.pop(f"cancel:project:{project_id}", None)
    if video_id:
        _cancellation_flags.pop(f"cancel:video:{video_id}", None)
    if job_id:
        _cancellation_flags.pop(f"cancel:render:{job_id}", None)


async def start_cancellation_listener() -> None:
    """No-op in standalone in-process mode."""
    pass
