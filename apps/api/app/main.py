import logging
from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import get_settings
from app.core.db import init_db, SessionLocal
import app.models
from app.models.project import Scene, SourceVideo
from sqlalchemy import select, text
from app.api.v1.router import api_router
from app.api.v1.templates import seed_templates

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("cliper-pro")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Cliper Pro API is starting up...")
    try:
        await init_db()
        async with SessionLocal() as db:
            await seed_templates(db)
        log.info("Database initialized and templates seeded.")
        from app.services.cancellation import start_cancellation_listener
        await start_cancellation_listener()
        from app.workers.tasks import cleanup_stuck_render_jobs
        await cleanup_stuck_render_jobs()
    except Exception as e:
        # Fail fast: serving traffic with no DB only produces confusing 500s.
        log.error("Database initialization failed: %s", e)
        raise
    yield
    # Close the shared Redis client on shutdown
    try:
        from app.core.redis import get_redis_client
        await get_redis_client().aclose()
    except asyncio.CancelledError:
        # --reload force-cancels us once the graceful window expires (open SSE streams
        # never disconnect on their own). The process is exiting anyway, so skipping
        # the Redis close is harmless; re-raising would log a bogus shutdown failure.
        pass
    except Exception as e:
        log.debug("Redis client close skipped: %s", e)
    log.info("Cliper Pro API is shutting down...")


app = FastAPI(
    title="Cliper Pro API",
    description="Auto Short Video Maker API with AI (Vision, LLM, TTS, Karaoke Subtitles & FFmpeg Render)",
    version="1.0.0",
    lifespan=lifespan,
)

# GZip Compression for large JSON payloads
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dynamic Self-Healing Route for Scene Thumbnails (On-the-fly extraction if file is missing)
@app.get("/storage/projects/{project_id}/scenes/{filename}")
async def get_scene_thumbnail(project_id: str, filename: str):
    storage_dir = Path(settings.STORAGE_PATH)
    file_path = storage_dir / "projects" / project_id / "scenes" / filename

    if file_path.exists() and file_path.stat().st_size > 0:
        return FileResponse(file_path, media_type="image/jpeg")

    # On-the-fly self-healing extraction from project source video
    try:
        async with SessionLocal() as db:
            # 1. Try to find matching scene in DB
            s_res = await db.execute(
                select(Scene).where(
                    Scene.project_id == project_id,
                    Scene.thumbnail_path.like(f"%{filename}"),
                )
            )
            scene = s_res.scalar_one_or_none()

            video_path = None
            timestamp_sec = 0.0

            if scene:
                timestamp_sec = scene.start_time + (scene.duration / 2.0)
                if scene.source_video_id:
                    v_res = await db.execute(
                        select(SourceVideo).where(SourceVideo.id == scene.source_video_id)
                    )
                    vid = v_res.scalar_one_or_none()
                    if vid and vid.file_path and Path(vid.file_path).exists():
                        video_path = vid.file_path

            # If not matched directly, parse filename e.g. thumb_0001_4000.jpg
            if not video_path:
                parts = filename.replace(".jpg", "").split("_")
                if len(parts) >= 3 and parts[0] == "thumb" and parts[2].isdigit():
                    timestamp_sec = float(parts[2]) / 1000.0

                v_res = await db.execute(
                    select(SourceVideo).where(SourceVideo.project_id == project_id)
                )
                vids = v_res.scalars().all()
                for v in vids:
                    if v.file_path and Path(v.file_path).exists():
                        video_path = v.file_path
                        break

            if video_path:
                from app.services.scene_detector import extract_frame
                # extract_frame uses blocking subprocess.run -> run off the event loop
                loop = asyncio.get_running_loop()
                ok = await loop.run_in_executor(
                    None, extract_frame, video_path, timestamp_sec, str(file_path)
                )
                if ok and file_path.exists() and file_path.stat().st_size > 0:
                    return FileResponse(file_path, media_type="image/jpeg")
    except Exception as e:
        log.warning("On-the-fly self healing thumbnail extraction failed for %s: %s", filename, e)

    raise HTTPException(status_code=404, detail="Thumbnail not found")


# Mount Static Storage for Videos, Audios, and Thumbnails
storage_dir = Path(settings.STORAGE_PATH)
storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_dir), html=False), name="storage")

# Include API Routers
app.include_router(api_router)


@app.get("/healthz", tags=["health"])
async def healthz():
    # Real readiness: verify DB and Redis, not just that the process is alive.
    db_ok = False
    redis_ok = False
    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        log.warning("Healthcheck DB failed: %s", e)
    try:
        from app.core.redis import get_redis_client
        await get_redis_client().ping()
        redis_ok = True
    except Exception as e:
        log.warning("Healthcheck Redis failed: %s", e)

    ok = db_ok and redis_ok
    return JSONResponse(
        status_code=200 if ok else 503,
        content={
            "status": "ok" if ok else "degraded",
            "app": "cliper-pro-api",
            "version": "1.0.0",
            "db": db_ok,
            "redis": redis_ok,
        },
    )


@app.get("/", tags=["health"])
async def root():
    return {
        "name": "Cliper Pro API",
        "status": "online",
        "docs_url": "/docs",
    }
