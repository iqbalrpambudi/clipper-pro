"""Initial baseline schema for Cliper Pro

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-20 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 2. projects table
    if "projects" not in existing_tables:
        op.create_table(
            "projects",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(50), server_default="draft", nullable=False),
            sa.Column("project_type", sa.String(50), server_default="short_video", nullable=False),
            sa.Column("aspect_ratio", sa.String(20), server_default="9:16", nullable=False),
            sa.Column("resolution", sa.String(20), server_default="1080p", nullable=False),
            sa.Column("background_fill", sa.JSON(), nullable=True),
            sa.Column("watermark", sa.JSON(), nullable=True),
            sa.Column("youtube_metadata", sa.JSON(), server_default="{}", nullable=True),
            sa.Column("characters", sa.JSON(), server_default="[]", nullable=True),
            sa.Column("locations", sa.JSON(), server_default="[]", nullable=True),
            sa.Column("world_setting", sa.JSON(), server_default="{}", nullable=True),
            sa.Column("language", sa.String(10), server_default="id", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 3. source_videos table
    if "source_videos" not in existing_tables:
        op.create_table(
            "source_videos",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("origin", sa.String(20), server_default="upload", nullable=False),
            sa.Column("file_path", sa.String(500), nullable=True),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("youtube_url", sa.String(500), nullable=True),
            sa.Column("selected_resolution", sa.String(255), nullable=True),
            sa.Column("duration", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("width", sa.Integer(), server_default="0", nullable=False),
            sa.Column("height", sa.Integer(), server_default="0", nullable=False),
            sa.Column("fps", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("status", sa.String(50), server_default="pending", nullable=False),
            sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 4. scenes table
    if "scenes" not in existing_tables:
        op.create_table(
            "scenes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("source_video_id", sa.String(36), sa.ForeignKey("source_videos.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("scene_index", sa.Integer(), server_default="0", nullable=False),
            sa.Column("start_time", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("end_time", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("duration", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("thumbnail_path", sa.String(500), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("analysis", sa.JSON(), nullable=True),
            sa.Column("transcript", sa.Text(), nullable=True),
            sa.Column("embedding", Vector(768), nullable=True),
            sa.Column("status", sa.String(50), server_default="detected", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 5. render_jobs table
    if "render_jobs" not in existing_tables:
        op.create_table(
            "render_jobs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("render_type", sa.String(20), server_default="final", nullable=False),
            sa.Column("status", sa.String(50), server_default="queued", nullable=False),
            sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
            sa.Column("output_file_path", sa.String(500), nullable=True),
            sa.Column("thumbnail_path", sa.String(500), nullable=True),
            sa.Column("log_output", sa.Text(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )

    # 6. narration_templates table
    if "narration_templates" not in existing_tables:
        op.create_table(
            "narration_templates",
            sa.Column("id", sa.String(50), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(50), server_default="custom", nullable=False),
            sa.Column("sub_category", sa.String(100), nullable=True),
            sa.Column("system_prompt", sa.Text(), nullable=False),
            sa.Column("user_prompt_template", sa.Text(), nullable=False),
            sa.Column("default_tone", sa.String(50), server_default="santai", nullable=False),
            sa.Column("default_voice", sa.String(50), server_default="Puck", nullable=False),
            sa.Column("is_builtin", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 7. narrations table
    if "narrations" not in existing_tables:
        op.create_table(
            "narrations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("template_id", sa.String(50), sa.ForeignKey("narration_templates.id"), nullable=True),
            sa.Column("script_text", sa.Text(), nullable=False),
            sa.Column("segments", sa.JSON(), nullable=False),
            sa.Column("language", sa.String(10), server_default="id", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 8. audio_tracks table
    if "audio_tracks" not in existing_tables:
        op.create_table(
            "audio_tracks",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("narration_id", sa.String(36), sa.ForeignKey("narrations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("file_path", sa.String(500), nullable=False),
            sa.Column("duration", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("voice", sa.String(50), nullable=False),
            sa.Column("provider", sa.String(50), server_default="gemini", nullable=False),
            sa.Column("rate", sa.Float(), server_default="1.0", nullable=False),
            sa.Column("pitch", sa.Float(), server_default="1.0", nullable=False),
            sa.Column("words", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(50), server_default="ready", nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 9. timelines table
    if "timelines" not in existing_tables:
        op.create_table(
            "timelines",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False),
            sa.Column("clips", sa.JSON(), nullable=False),
            sa.Column("total_duration", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("has_audio", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("has_subtitles", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 10. subtitle_styles table
    if "subtitle_styles" not in existing_tables:
        op.create_table(
            "subtitle_styles",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=True),
            sa.Column("preset_name", sa.String(50), server_default="viral_tiktok", nullable=False),
            sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("description", sa.String(255), nullable=True),
            sa.Column("is_preset", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("font_family", sa.String(100), server_default="Poppins", nullable=False),
            sa.Column("font_size", sa.Integer(), server_default="52", nullable=False),
            sa.Column("font_weight", sa.String(20), server_default="Bold", nullable=False),
            sa.Column("primary_color", sa.String(20), server_default="#FFFFFF", nullable=False),
            sa.Column("highlight_color", sa.String(20), server_default="#FFE600", nullable=False),
            sa.Column("outline_color", sa.String(20), server_default="#000000", nullable=False),
            sa.Column("outline_width", sa.Integer(), server_default="4", nullable=False),
            sa.Column("box_color", sa.String(20), server_default="#000000", nullable=False),
            sa.Column("box_opacity", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("position", sa.String(20), server_default="bottom", nullable=False),
            sa.Column("offset_y", sa.Integer(), server_default="0", nullable=False),
            sa.Column("offset_x", sa.Integer(), server_default="0", nullable=False),
            sa.Column("display_mode", sa.String(20), server_default="per_word", nullable=False),
            sa.Column("burst_word_count", sa.Integer(), server_default="2", nullable=False),
            sa.Column("highlight_animation", sa.String(20), server_default="color", nullable=False),
            sa.Column("scale_factor", sa.Float(), server_default="1.0", nullable=False),
            sa.Column("emoji_enabled", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 11. model_configs table
    if "model_configs" not in existing_tables:
        op.create_table(
            "model_configs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(100), server_default="default", nullable=False),
            sa.Column("base_url", sa.String(500), nullable=True),
            sa.Column("chat_model", sa.String(100), server_default="gemini-2.0-flash", nullable=False),
            sa.Column("vision_model", sa.String(100), server_default="gemini-2.0-flash", nullable=False),
            sa.Column("api_key_encrypted", sa.Text(), nullable=True),
            sa.Column("tts_provider", sa.String(50), server_default="gemini-2.5-flash-preview-tts", nullable=False),
            sa.Column("tts_api_key_encrypted", sa.Text(), nullable=True),
            sa.Column("tts_fallback_enabled", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("elevenlabs_api_key_encrypted", sa.Text(), nullable=True),
            sa.Column("elevenlabs_model", sa.String(100), server_default="eleven_multilingual_v2", nullable=False),
            sa.Column("runware_api_key_encrypted", sa.Text(), nullable=True),
            sa.Column("runware_tts_model", sa.String(100), server_default="fishaudio:s2.1@pro", nullable=False),
            sa.Column("image_base_url", sa.String(500), nullable=True),
            sa.Column("image_model", sa.String(100), server_default="dall-e-3", nullable=False),
            sa.Column("image_concurrency", sa.Integer(), server_default="2", nullable=False),
            sa.Column("image_api_key_encrypted", sa.Text(), nullable=True),
            sa.Column("image_system_prompt", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 12. storyboard_items table
    if "storyboard_items" not in existing_tables:
        op.create_table(
            "storyboard_items",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("narration_id", sa.String(36), sa.ForeignKey("narrations.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("chapter_title", sa.String(255), nullable=True),
            sa.Column("segment_id", sa.String(50), server_default="seg-1", nullable=False),
            sa.Column("order_index", sa.Integer(), server_default="0", nullable=False, index=True),
            sa.Column("script_text", sa.Text(), server_default="", nullable=False),
            sa.Column("image_prompt", sa.Text(), server_default="", nullable=False),
            sa.Column("file_path", sa.String(500), nullable=True),
            sa.Column("start_time", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("end_time", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("duration", sa.Float(), server_default="0.0", nullable=False),
            sa.Column("motion_effect", sa.String(50), server_default="zoom_in", nullable=False),
            sa.Column("status", sa.String(50), server_default="pending", nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )

    # 13. image_presets table
    if "image_presets" not in existing_tables:
        op.create_table(
            "image_presets",
            sa.Column("id", sa.String(50), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(50), server_default="custom", nullable=False),
            sa.Column("master_prompt", sa.Text(), nullable=False),
            sa.Column("negative_prompt", sa.Text(), nullable=True),
            sa.Column("reference_image_url", sa.String(500), nullable=True),
            sa.Column("preview_image_url", sa.String(500), nullable=True),
            sa.Column("user_text_input", sa.Text(), nullable=True),
            sa.Column("style_attributes", sa.JSON(), server_default="{}", nullable=True),
            sa.Column("is_builtin", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(NOW() AT TIME ZONE 'utc')"), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("image_presets", if_exists=True)
    op.drop_table("storyboard_items", if_exists=True)
    op.drop_table("subtitle_styles", if_exists=True)
    op.drop_table("timelines", if_exists=True)
    op.drop_table("audio_tracks", if_exists=True)
    op.drop_table("narrations", if_exists=True)
    op.drop_table("narration_templates", if_exists=True)
    op.drop_table("render_jobs", if_exists=True)
    op.drop_table("scenes", if_exists=True)
    op.drop_table("source_videos", if_exists=True)
    op.drop_table("model_configs", if_exists=True)
    op.drop_table("projects", if_exists=True)
