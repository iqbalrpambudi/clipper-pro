import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.events import publish_project_event
from app.models.narration import AudioTrack
from app.models.project import Project, RenderJob, SourceVideo
from app.services.cancellation import request_cancellation

log = logging.getLogger("cliper-tasks-api")

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])


@router.post("/cancel")
async def cancel_project_task(
    project_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Universal cancel endpoint to interrupt and abort any active background worker task for a project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # 1. Broadcast cancellation in Redis and terminate matching subprocesses
    await request_cancellation(project_id)

    # 2. Update all in-flight tasks in the database to cancelled / failed
    # Cancel any active video downloads or scene processing
    v_res = await db.execute(
        select(SourceVideo).where(
            SourceVideo.project_id == project_id,
            SourceVideo.status.in_(["downloading", "processing"])
        )
    )
    active_videos = v_res.scalars().all()
    for v in active_videos:
        v.status = "failed"
        v.error_message = "Proses dibatalkan oleh pengguna"

    # Cancel any active render jobs
    from datetime import datetime
    r_res = await db.execute(
        select(RenderJob).where(
            RenderJob.project_id == project_id,
            RenderJob.status.in_(["rendering", "queued"])
        )
    )
    active_renders = r_res.scalars().all()
    for r in active_renders:
        r.status = "failed"
        r.error_message = "Rendering dibatalkan oleh pengguna"
        r.completed_at = datetime.utcnow()

    # Cancel any active audio generation
    a_res = await db.execute(
        select(AudioTrack).where(
            AudioTrack.project_id == project_id,
            AudioTrack.status == "generating"
        )
    )
    active_audio = a_res.scalars().all()
    for a in active_audio:
        a.status = "failed"

    await db.commit()

    # 3. Publish instant cancellation SSE event to notify web clients
    await publish_project_event(
        project_id,
        task_type="youtube_download",
        status="error",
        progress=0,
        stage="cancelled",
        message="Proses background worker berhasil dibatalkan dan diinterupsi.",
        error="Dibatalkan",
    )

    log.info("Project %s: All active worker tasks have been cancelled and interrupted.", project_id)

    return {
        "status": "cancelled",
        "message": "Proses background worker berhasil dibatalkan dan diinterupsi.",
        "cancelled_videos": len(active_videos),
        "cancelled_renders": len(active_renders),
        "cancelled_audio": len(active_audio),
    }
