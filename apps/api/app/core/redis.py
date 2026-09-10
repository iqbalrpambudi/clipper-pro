from arq.connections import RedisSettings
from app.core.config import get_settings

settings = get_settings()


def get_redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.REDIS_URL)
