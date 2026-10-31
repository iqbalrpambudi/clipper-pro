import logging
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

logger = logging.getLogger("cliper-pro.db")
settings = get_settings()

# Prepare SQLite directory if file-based database
is_sqlite = settings.DATABASE_URL.startswith("sqlite")
connect_args = {}
if is_sqlite:
    connect_args["check_same_thread"] = False
    # If using relative path like sqlite+aiosqlite:///storage/cliper.db
    db_path_str = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
    if db_path_str and not db_path_str.startswith(":memory:"):
        db_file = Path(db_path_str)
        db_file.parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args,
)

if is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

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


async def init_db() -> None:
    """Initialize DB: create all tables on startup and ensure incremental columns exist."""
    from sqlalchemy import inspect, text
    import app.models  # noqa: F401

    def _ensure_incremental_columns(sync_conn) -> None:
        inspector = inspect(sync_conn)
        table_names = set(inspector.get_table_names())
        if "storyboard_items" in table_names:
            sb_cols = {c["name"] for c in inspector.get_columns("storyboard_items")}
            if "shot_metadata" not in sb_cols:
                sync_conn.execute(text("ALTER TABLE storyboard_items ADD COLUMN shot_metadata JSON"))
        if "subtitle_styles" in table_names:
            sub_cols = {c["name"] for c in inspector.get_columns("subtitle_styles")}
            if "text_case" not in sub_cols:
                sync_conn.execute(
                    text("ALTER TABLE subtitle_styles ADD COLUMN text_case VARCHAR(20) DEFAULT 'uppercase'")
                )
        if "model_configs" in table_names:
            mc_cols = {c["name"] for c in inspector.get_columns("model_configs")}
            if "image_provider" not in mc_cols:
                sync_conn.execute(
                    text("ALTER TABLE model_configs ADD COLUMN image_provider VARCHAR(50) DEFAULT 'runware'")
                )
            if "image_steps" not in mc_cols:
                sync_conn.execute(
                    text("ALTER TABLE model_configs ADD COLUMN image_steps INTEGER DEFAULT 5")
                )
            if "image_cfg_scale" not in mc_cols:
                sync_conn.execute(
                    text("ALTER TABLE model_configs ADD COLUMN image_cfg_scale FLOAT DEFAULT 3.5")
                )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_incremental_columns)
    logger.info("Database initialized successfully.")


