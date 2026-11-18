from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.project import Project
from app.models.qc import QCRun
from app.schemas.qc import QCLatestResponse, QCRunRequest, QCRunResponse
from app.services.qc import revert_qc_run, run_project_qc, to_qc_run_response

router = APIRouter(prefix="/projects/{project_id}/qc", tags=["qc"])


@router.get("/runs", response_model=List[QCRunResponse])
async def list_project_qc_runs(
    project_id: str,
    gate: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    stmt = select(QCRun).where(QCRun.project_id == project_id)
    if gate in ("script", "timeline"):
        stmt = stmt.where(QCRun.gate == gate)
    stmt = stmt.order_by(QCRun.created_at.desc()).limit(max(1, min(limit, 100)))

    res = await db.execute(stmt)
    return [to_qc_run_response(r) for r in res.scalars().all()]


@router.get("/latest", response_model=QCLatestResponse)
async def get_latest_project_qc(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    script_res = await db.execute(
        select(QCRun)
        .where(QCRun.project_id == project_id, QCRun.gate == "script")
        .order_by(QCRun.created_at.desc())
        .limit(1)
    )
    timeline_res = await db.execute(
        select(QCRun)
        .where(QCRun.project_id == project_id, QCRun.gate == "timeline")
        .order_by(QCRun.created_at.desc())
        .limit(1)
    )
    s_run = script_res.scalars().first()
    t_run = timeline_res.scalars().first()

    return QCLatestResponse(
        script=to_qc_run_response(s_run) if s_run else None,
        timeline=to_qc_run_response(t_run) if t_run else None,
    )


@router.post("/run", response_model=QCRunResponse)
async def trigger_project_qc_run(
    project_id: str,
    payload: QCRunRequest,
    db: AsyncSession = Depends(get_db),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    run = await run_project_qc(
        db,
        project_id,
        payload.gate,
        auto_fix=payload.auto_fix,
        trigger=payload.trigger,
    )
    return to_qc_run_response(run)


@router.post("/runs/{run_id}/revert", response_model=QCRunResponse)
async def revert_project_qc_run(
    project_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        run = await revert_qc_run(db, project_id, run_id)
        return to_qc_run_response(run)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
