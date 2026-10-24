"""Add heatmap_data JSON column to source_videos.

Revision ID: 0004_add_heatmap_data
Revises: 0003_drop_tts_fallback_enabled
Create Date: 2026-10-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_add_heatmap_data"
down_revision: Union[str, None] = "0003_drop_tts_fallback_enabled"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column(
        "source_videos",
        sa.Column("heatmap_data", sa.JSON(), nullable=True),
    )

def downgrade() -> None:
    op.drop_column("source_videos", "heatmap_data")
