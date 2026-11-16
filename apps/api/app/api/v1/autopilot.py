from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.tasks import run_background_task
from app.models.autopilot import AutopilotRun
from app.models.youtube import YouTubeAccount
from app.schemas.autopilot import AutopilotConfigIn, AutopilotConfigOut, AutopilotRunOut
from app.services import autopilot

router = APIRouter(prefix="/autopilot", tags=["autopilot"])

NOT_CONNECTED = "Hubungkan channel YouTube dulu di Settings → Publish YouTube"


async def _config_out(db: AsyncSession) -> AutopilotConfigOut:
    cfg = await autopilot.get_config(db)
    acc = (await db.execute(select(YouTubeAccount).limit(1))).scalar_one_or_none()
    out = AutopilotConfigOut.model_validate(cfg)
    out.producing = autopilot.is_producing()
    out.pool_count = await autopilot.pool_count(db)
    out.youtube_connected = bool(acc and acc.refresh_token_encrypted)
    return out


@router.get("", response_model=AutopilotConfigOut)
async def get_autopilot(db: AsyncSession = Depends(get_db)):
    return await _config_out(db)


@router.put("", response_model=AutopilotConfigOut)
async def update_autopilot(payload: AutopilotConfigIn, db: AsyncSession = Depends(get_db)):
    cfg = await autopilot.get_config(db)
    if payload.enabled and not (await _config_out(db)).youtube_connected:
        raise HTTPException(status_code=400, detail=NOT_CONNECTED)
    data = payload.model_dump()
    for k, v in data.items():
        setattr(cfg, k, v)
    # Drop fired-today markers of windows that no longer exist
    times = {w["time"] for w in data["production_windows"]}
    cfg.production_last_runs = {t: d for t, d in (cfg.production_last_runs or {}).items() if t in times}
    await db.commit()
    return await _config_out(db)


@router.get("/runs", response_model=List[AutopilotRunOut])
async def list_autopilot_runs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(AutopilotRun)
        .where(AutopilotRun.status != "discarded")
        .order_by(AutopilotRun.created_at.desc())
        .limit(min(limit, 200))
    )
    return res.scalars().all()


@router.post("/produce-now", status_code=202)
async def produce_autopilot_now(db: AsyncSession = Depends(get_db)):
    out = await _config_out(db)
    if out.producing:
        raise HTTPException(status_code=409, detail="Autopilot sedang membuat video, tunggu sampai selesai")
    if out.pool_count >= out.pool_size:
        raise HTTPException(status_code=400, detail=f"Pool sudah penuh ({out.pool_count}/{out.pool_size})")
    run_background_task(autopilot.produce, 1)
    return {"status": "started"}


@router.delete("/runs/{run_id}", response_model=AutopilotRunOut)
async def discard_pool_video(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(AutopilotRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")
    if run.status != "ready" or run.stage == "upload":
        raise HTTPException(status_code=400, detail="Hanya video di pool yang belum diupload yang bisa dibuang")
    run.status = "discarded"
    await db.commit()
    return run
