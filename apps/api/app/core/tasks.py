import asyncio
import logging
from typing import Any, Callable, Coroutine, Set

log = logging.getLogger("cliper-tasks")

_running_tasks: Set[asyncio.Task] = set()


def run_background_task(coro_fn: Callable[..., Coroutine[Any, Any, Any]], *args: Any, **kwargs: Any) -> asyncio.Task:
    """Run an async coroutine in the background, keeping a strong reference so it is not garbage-collected."""
    task = asyncio.create_task(coro_fn(*args, **kwargs))
    _running_tasks.add(task)

    def _on_done(t: asyncio.Task) -> None:
        _running_tasks.discard(t)
        if not t.cancelled():
            exc = t.exception()
            if exc:
                log.error("Background task '%s' failed: %s", t.get_name(), exc, exc_info=exc)

    task.add_done_callback(_on_done)
    return task
