import asyncio
import logging
from typing import AsyncGenerator
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.core.redis import get_redis_client

log = logging.getLogger("cliper-events-api")

router = APIRouter(prefix="/projects/{project_id}/events", tags=["events"])


@router.get("")
async def stream_project_events(project_id: str, request: Request) -> StreamingResponse:
    """Stream real-time progress, status, and error events for a project via SSE."""

    async def event_generator() -> AsyncGenerator[str, None]:
        redis = get_redis_client()
        pubsub = redis.pubsub()
        channel = f"project:{project_id}:events"
        await pubsub.subscribe(channel)
        log.info("Client connected to SSE stream for project %s", project_id)

        # Initial connection acknowledgment
        yield f'data: {{"type": "connected", "project_id": "{project_id}"}}\n\n'

        # Immediately replay currently active task if one is running (so page refresh shows progress bar immediately)
        try:
            cached_active = await redis.get(f"project:{project_id}:active_task")
            if cached_active:
                if isinstance(cached_active, bytes):
                    cached_active = cached_active.decode("utf-8")
                yield f"data: {cached_active}\n\n"
        except Exception as e:
            log.warning("Failed to replay cached active task for project %s: %s", project_id, e)

        heartbeat_counter = 0

        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    log.info("Client disconnected from project %s SSE stream", project_id)
                    break

                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("type") == "message":
                    payload_str = message.get("data", "")
                    if isinstance(payload_str, bytes):
                        payload_str = payload_str.decode("utf-8")
                    yield f"data: {payload_str}\n\n"
                    heartbeat_counter = 0
                else:
                    heartbeat_counter += 1
                    # Send keep-alive comment every ~15 seconds (15 iterations of 1.0s timeout)
                    if heartbeat_counter >= 15:
                        yield ": ping\n\n"
                        heartbeat_counter = 0

                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            log.info("SSE connection cancelled for project %s", project_id)
        except Exception as e:
            log.warning("Exception in SSE stream for project %s: %s", project_id, e)
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:
                pass
            log.info("Cleaned up SSE subscription for project %s", project_id)

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

