import asyncio
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from arq import create_pool
from app.core.db import get_db
from app.core.redis import get_redis_settings
from app.core.storage import storage
from app.models.project import Project, RenderJob
from app.schemas.project import RenderJobResponse
from app.workers.tasks import render_video_job

router = APIRouter(prefix="/projects/{project_id}/render", tags=["render"])


async def enqueue_render_task(job_id: str):
    try:
        pool = await create_pool(get_redis_settings())
        await pool.enqueue_job("render_video_job", job_id)
        await pool.close()
    except Exception:
        asyncio.create_task(render_video_job({}, job_id))


from datetime import datetime
from app.services.cancellation import clear_cancellation, kill_all_matching_processes


@router.post("", response_model=RenderJobResponse)
async def trigger_final_render(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # 1. Clear any prior project-level cancellation flags so new render starts clean
    await clear_cancellation(project_id=project_id)

    # 2. Clean up any active/queued jobs from previous runs to prevent competing renders
    res = await db.execute(
        select(RenderJob).where(
            RenderJob.project_id == project_id,
            RenderJob.status.in_(["rendering", "queued"]),
        )
    )
    for old_job in res.scalars().all():
        kill_all_matching_processes(project_id, job_id=old_job.id)
        old_job.status = "failed"
        old_job.error_message = "Dibatalkan karena proses render baru telah dimulai."
        old_job.completed_at = datetime.utcnow()

    job = RenderJob(
        project_id=project_id,
        render_type="final",
        status="queued",
        progress=0,
        log_output="Antrean render final dibuat...",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Clear specific job cancellation flag
    await clear_cancellation(job_id=job.id)

    await enqueue_render_task(job.id)

    return RenderJobResponse(
        id=job.id,
        project_id=job.project_id,
        render_type=job.render_type,
        status=job.status,
        progress=job.progress,
        output_url=None,
        thumbnail_url=None,
        log_output=job.log_output,
        error_message=None,
        created_at=job.created_at,
        completed_at=None,
    )


@router.post("/preview", response_model=RenderJobResponse)
async def trigger_preview_render(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # 1. Clear any prior project-level cancellation flags so new render starts clean
    await clear_cancellation(project_id=project_id)

    # 2. Clean up any active/queued jobs from previous runs
    res = await db.execute(
        select(RenderJob).where(
            RenderJob.project_id == project_id,
            RenderJob.status.in_(["rendering", "queued"]),
        )
    )
    for old_job in res.scalars().all():
        kill_all_matching_processes(project_id, job_id=old_job.id)
        old_job.status = "failed"
        old_job.error_message = "Dibatalkan karena proses preview render baru telah dimulai."
        old_job.completed_at = datetime.utcnow()

    job = RenderJob(
        project_id=project_id,
        render_type="preview",
        status="queued",
        progress=0,
        log_output="Antrean render preview cepat dibuat...",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Clear specific job cancellation flag
    await clear_cancellation(job_id=job.id)

    await enqueue_render_task(job.id)

    return RenderJobResponse(
        id=job.id,
        project_id=job.project_id,
        render_type=job.render_type,
        status=job.status,
        progress=job.progress,
        output_url=None,
        thumbnail_url=None,
        log_output=job.log_output,
        error_message=None,
        created_at=job.created_at,
        completed_at=None,
    )


@router.get("/jobs", response_model=List[RenderJobResponse])
async def list_render_jobs(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(RenderJob)
        .where(RenderJob.project_id == project_id)
        .order_by(RenderJob.created_at.desc())
    )
    jobs = res.scalars().all()

    # Auto-heal any stuck jobs older than 15 minutes that were left in rendering/queued
    now = datetime.utcnow()
    has_updated = False
    for j in jobs:
        if j.status in ("rendering", "queued") and j.created_at:
            created_at_dt = j.created_at.replace(tzinfo=None) if getattr(j.created_at, "tzinfo", None) else j.created_at
            if (now - created_at_dt).total_seconds() > 900:
                j.status = "failed"
                j.error_message = "Rendering terhenti otomatis karena melebihi batas waktu (timeout)."
                j.completed_at = now
                has_updated = True
    if has_updated:
        await db.commit()
    return [
        RenderJobResponse(
            id=j.id,
            project_id=j.project_id,
            render_type=j.render_type,
            status=j.status,
            progress=j.progress,
            output_url=storage.to_relative_url(j.output_file_path),
            thumbnail_url=storage.resolve_render_job_thumbnail_url(j.thumbnail_path, j.output_file_path),
            file_size_bytes=storage.get_file_size(j.output_file_path),
            log_output=j.log_output,
            error_message=j.error_message,
            created_at=j.created_at,
            completed_at=j.completed_at,
        )
        for j in jobs
    ]


@router.delete("/jobs/{job_id}")
async def delete_render_job(
    project_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(RenderJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status_code=404, detail="Render job tidak ditemukan")

    # Delete video file and any related artifacts from storage
    freed_bytes = storage.delete_render_job_files(project_id, job.id, job.output_file_path)

    # Delete job record from database
    await db.delete(job)
    await db.commit()

    return {
        "success": True,
        "job_id": job_id,
        "freed_bytes": freed_bytes,
        "message": "Riwayat render dan file video berhasil dihapus dari penyimpanan",
    }


@router.delete("/jobs")
async def clear_render_jobs(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(RenderJob).where(RenderJob.project_id == project_id)
    )
    jobs = res.scalars().all()
    if not jobs:
        return {
            "success": True,
            "count": 0,
            "freed_bytes": 0,
            "message": "Tidak ada riwayat render untuk dihapus",
        }

    # Delete all render files for project
    freed_bytes = storage.clear_all_project_renders(project_id)

    # Delete all job records from database
    for j in jobs:
        await db.delete(j)
    await db.commit()

    return {
        "success": True,
        "count": len(jobs),
        "freed_bytes": freed_bytes,
        "message": f"{len(jobs)} riwayat render dan file video berhasil dibersihkan dari penyimpanan",
    }


@router.get("/download/{job_id}")
async def download_rendered_video(
    project_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(RenderJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status_code=404, detail="Render job tidak ditemukan")

    if not job.output_file_path or not Path(job.output_file_path).exists():
        raise HTTPException(status_code=404, detail="File video hasil render belum tersedia")

    return FileResponse(
        path=job.output_file_path,
        filename=f"cliper_short_{job.id[:8]}.mp4",
        media_type="video/mp4",
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_render_job(
    project_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Cancel and interrupt an active video rendering job."""
    job = await db.get(RenderJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status_code=404, detail="Render job tidak ditemukan")

    from app.services.cancellation import request_cancellation
    from app.core.events import publish_project_event
    await request_cancellation(project_id, job_id=job_id)

    job.status = "failed"
    job.error_message = "Rendering dibatalkan oleh pengguna"
    job.completed_at = datetime.utcnow()
    await db.commit()

    await publish_project_event(
        project_id,
        task_type="render",
        status="error",
        progress=0,
        stage="cancelled",
        message="Rendering video berhasil dibatalkan dan diinterupsi.",
        error="Dibatalkan",
        data={"job_id": job_id},
    )

    return {"status": "cancelled", "message": "Rendering video berhasil dibatalkan."}

