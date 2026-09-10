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


@router.post("", response_model=RenderJobResponse)
async def trigger_final_render(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

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

    await enqueue_render_task(job.id)

    return RenderJobResponse(
        id=job.id,
        project_id=job.project_id,
        render_type=job.render_type,
        status=job.status,
        progress=job.progress,
        output_url=None,
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

    await enqueue_render_task(job.id)

    return RenderJobResponse(
        id=job.id,
        project_id=job.project_id,
        render_type=job.render_type,
        status=job.status,
        progress=job.progress,
        output_url=None,
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
    return [
        RenderJobResponse(
            id=j.id,
            project_id=j.project_id,
            render_type=j.render_type,
            status=j.status,
            progress=j.progress,
            output_url=storage.to_relative_url(j.output_file_path),
            log_output=j.log_output,
            error_message=j.error_message,
            created_at=j.created_at,
            completed_at=j.completed_at,
        )
        for j in jobs
    ]


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
