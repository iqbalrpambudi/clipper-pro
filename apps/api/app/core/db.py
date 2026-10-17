from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
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


async def init_db() -> None:
    async with engine.begin() as conn:
        # Ensure pgvector extension is enabled
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)
        # Ensure new schema columns exist
        await conn.execute(text("ALTER TABLE scenes ADD COLUMN IF NOT EXISTS transcript TEXT;"))
        await conn.execute(text("ALTER TABLE subtitle_styles ADD COLUMN IF NOT EXISTS description VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE subtitle_styles ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;"))
        await conn.execute(text("ALTER TABLE source_videos ALTER COLUMN selected_resolution TYPE VARCHAR(255);"))
        await conn.execute(text("ALTER TABLE timelines ADD COLUMN IF NOT EXISTS has_audio BOOLEAN DEFAULT TRUE;"))
        await conn.execute(text("ALTER TABLE timelines ADD COLUMN IF NOT EXISTS has_subtitles BOOLEAN DEFAULT TRUE;"))
        await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS watermark JSON DEFAULT NULL;"))
        await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) DEFAULT 'short_video';"))
        await conn.execute(text("ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(500);"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS image_base_url VARCHAR(500);"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS image_model VARCHAR(100) DEFAULT 'dall-e-3';"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS image_api_key_encrypted TEXT;"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS image_system_prompt TEXT;"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS image_concurrency INTEGER DEFAULT 2;"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS tts_fallback_enabled BOOLEAN DEFAULT TRUE;"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS elevenlabs_api_key_encrypted TEXT;"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS elevenlabs_model VARCHAR(100) DEFAULT 'eleven_multilingual_v2';"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS runware_api_key_encrypted TEXT;"))
        await conn.execute(text("ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS runware_tts_model VARCHAR(100) DEFAULT 'fishaudio:s2.1@pro';"))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS image_presets (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                category VARCHAR(50) DEFAULT 'custom',
                master_prompt TEXT NOT NULL,
                negative_prompt TEXT,
                reference_image_url VARCHAR(500),
                preview_image_url VARCHAR(500),
                user_text_input TEXT,
                style_attributes JSON DEFAULT '{}'::json,
                is_builtin BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
            );
        """))

