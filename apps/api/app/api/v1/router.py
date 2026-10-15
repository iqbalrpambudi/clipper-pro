from fastapi import APIRouter
from app.api.v1.projects import router as projects_router
from app.api.v1.media import router as media_router
from app.api.v1.scenes import router as scenes_router
from app.api.v1.templates import router as templates_router
from app.api.v1.narration import router as narration_router
from app.api.v1.tts import router as tts_router
from app.api.v1.timeline import router as timeline_router
from app.api.v1.subtitles import router as subtitles_router
from app.api.v1.render import router as render_router
from app.api.v1.settings import router as settings_router
from app.api.v1.events import router as events_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.storyboard import router as storyboard_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(projects_router)
api_router.include_router(media_router)
api_router.include_router(scenes_router)
api_router.include_router(templates_router)
api_router.include_router(narration_router)
api_router.include_router(tts_router)
api_router.include_router(timeline_router)
api_router.include_router(subtitles_router)
api_router.include_router(render_router)
api_router.include_router(settings_router)
api_router.include_router(events_router)
api_router.include_router(tasks_router)
api_router.include_router(storyboard_router)

