import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

log = logging.getLogger("cliper-events")


class EventBus:
    """In-memory asynchronous pub/sub event bus for real-time progress events."""

    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
        self._active_tasks: Dict[str, str] = {}

    def subscribe(self, project_id: str) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=200)
        self._subscribers[project_id].add(q)
        return q

    def unsubscribe(self, project_id: str, q: asyncio.Queue) -> None:
        if project_id in self._subscribers:
            self._subscribers[project_id].discard(q)
            if not self._subscribers[project_id]:
                self._subscribers.pop(project_id, None)

    def get_active_task(self, project_id: str) -> Optional[str]:
        return self._active_tasks.get(project_id)

    def publish(self, project_id: str, payload_json: str, status: str) -> None:
        if status in ("progress", "queued"):
            self._active_tasks[project_id] = payload_json
        elif status in ("success", "error"):
            self._active_tasks.pop(project_id, None)

        queues = list(self._subscribers.get(project_id, []))
        for q in queues:
            try:
                q.put_nowait(payload_json)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                except Exception:
                    pass
                try:
                    q.put_nowait(payload_json)
                except Exception:
                    pass


# Global singleton in-memory event bus
event_bus = EventBus()


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
    """Publish a real-time progress event to the in-memory event bus for a project.

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

    payload_json = json.dumps(event_payload)
    event_bus.publish(project_id, payload_json, status)
    log.debug("Published event for project %s: [%s] %s (%d%%)", project_id, task_type, message, progress)
