import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

import app.models
from app.api.v1.router import api_router
from app.api.v1.templates import seed_templates
from app.core.config import get_settings
from app.core.db import SessionLocal, init_db
from app.service_runtime import resolve_web_dist
from app.services.scene_detector import resolve_or_extract_scene_thumbnail

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("cliper-pro")
# httpx logs every request URL at INFO, and Gemini calls carry the API key in ?key=
logging.getLogger("httpx").setLevel(logging.WARNING)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Cliper Pro API is starting up...")
    try:
        await init_db()
        async with SessionLocal() as db:
            await seed_templates(db)
        log.info("Database initialized, templates seeded.")
        from app.services.cancellation import start_cancellation_listener

        await start_cancellation_listener()
        from app.workers.tasks import cleanup_stuck_render_jobs

        await cleanup_stuck_render_jobs()
        from app.services.autopilot import start_autopilot_scheduler

        await start_autopilot_scheduler()
    except Exception as e:
        # Fail fast: serving traffic with no DB only produces confusing 500s.
        log.error("Database initialization failed: %s", e)
        raise
    yield
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
    file_path = await resolve_or_extract_scene_thumbnail(
        project_id, filename, settings.STORAGE_PATH, SessionLocal
    )
    if file_path:
        return FileResponse(file_path, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Thumbnail not found")


# Mount Static Storage for Videos, Audios, and Thumbnails
storage_dir = Path(settings.STORAGE_PATH)
storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_dir), html=False), name="storage")

# Include API Routers
app.include_router(api_router)


@app.get("/healthz", tags=["health"])
async def healthz():
    db_ok = False
    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        log.warning("Healthcheck DB failed: %s", e)

    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": "ok" if db_ok else "degraded",
            "app": "cliper-pro-api",
            "version": "1.0.0",
            "db": db_ok,
            "mode": "standalone",
        },
    )


web_dist = resolve_web_dist()

if web_dist and (web_dist / "index.html").is_file():
    # Service mode: serve the built frontend from the API so the page, /api and /storage share one origin.
    # The API returns relative /storage/... media URLs, and <a download> only works same-origin.

    @app.get("/{path:path}", include_in_schema=False)
    async def web_app(path: str):
        if path.startswith(("api/", "storage/")):
            raise HTTPException(status_code=404, detail="Not Found")
        f = (web_dist / path).resolve()
        if path and f.is_file() and f.is_relative_to(web_dist):
            return FileResponse(f)
        return FileResponse(web_dist / "index.html")  # SPA route
else:

    @app.get("/", tags=["health"])
    async def root():
        return {
            "name": "Cliper Pro API",
            "status": "online",
            "docs_url": "/docs",
        }
