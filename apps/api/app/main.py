import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import get_settings
from app.core.db import init_db, SessionLocal
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
    except Exception as e:
        log.warning("Database initialization deferred/failed: %s", e)
    yield
    log.info("Cliper Pro API is shutting down...")


app = FastAPI(
    title="Cliper Pro API",
    description="Auto Short Video Maker API with AI (Vision, LLM, TTS, Karaoke Subtitles & FFmpeg Render)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Storage for Videos, Audios, and Thumbnails
storage_dir = Path(settings.STORAGE_PATH)
storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_dir), html=False), name="storage")

# Include API Routers
app.include_router(api_router)


@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok", "app": "cliper-pro-api", "version": "1.0.0"}


@app.get("/", tags=["health"])
async def root():
    return {
        "name": "Cliper Pro API",
        "status": "online",
        "docs_url": "/docs",
        "storage_path": settings.STORAGE_PATH,
    }
