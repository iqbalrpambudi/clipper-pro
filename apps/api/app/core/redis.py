from typing import Optional

from arq.connections import RedisSettings
from redis import asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()
_redis_client: Optional[aioredis.Redis] = None


def get_redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.REDIS_URL)


def get_redis_client() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client

