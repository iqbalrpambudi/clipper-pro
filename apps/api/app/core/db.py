from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def run_migrations_sync() -> None:
    """Run Alembic migrations programmatically to head."""
    import logging

    from alembic import command
    from alembic.config import Config

    logger = logging.getLogger("cliper-pro.db")
    ini_path = Path(__file__).resolve().parent.parent.parent / "alembic.ini"
    alembic_cfg = Config(str(ini_path))
    command.upgrade(alembic_cfg, "head")
    logger.info("Alembic database migrations applied successfully to head.")


async def init_db() -> None:
    """Initialize DB by running Alembic migrations to head."""
    import asyncio
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, run_migrations_sync)

