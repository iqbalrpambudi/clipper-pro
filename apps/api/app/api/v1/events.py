import asyncio
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.events import event_bus

log = logging.getLogger("cliper-events-api")

router = APIRouter(prefix="/projects/{project_id}/events", tags=["events"])


@router.get("")
async def stream_project_events(project_id: str, request: Request) -> StreamingResponse:
    """Stream real-time progress, status, and error events for a project via SSE (In-Memory)."""

    async def event_generator() -> AsyncGenerator[str, None]:
        queue = event_bus.subscribe(project_id)
        log.info("Client connected to in-memory SSE stream for project %s", project_id)

        # Initial connection acknowledgment
        yield f'data: {{"type": "connected", "project_id": "{project_id}"}}\n\n'

        # Immediately replay currently active task if one is running
        cached_active = event_bus.get_active_task(project_id)
        if cached_active:
            yield f"data: {cached_active}\n\n"

        heartbeat_counter = 0

        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    log.info("Client disconnected from project %s SSE stream", project_id)
                    break

                try:
                    payload_str = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {payload_str}\n\n"
                    heartbeat_counter = 0
                except asyncio.TimeoutError:
                    heartbeat_counter += 1
                    # Send keep-alive comment every ~15 seconds
                    if heartbeat_counter >= 15:
                        yield ": ping\n\n"
                        heartbeat_counter = 0

        except asyncio.CancelledError:
            log.info("SSE connection cancelled for project %s", project_id)
        except Exception as e:
            log.warning("Exception in SSE stream for project %s: %s", project_id, e)
        finally:
            event_bus.unsubscribe(project_id, queue)
            log.info("Cleaned up in-memory SSE subscription for project %s", project_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream",
            "Content-Encoding": "identity",
        },
    )
