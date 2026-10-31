"""Add shot_metadata to storyboard_items and text_case to subtitle_styles.

Revision ID: 0006_add_shot_metadata
Revises: 0005_add_shot_info
Create Date: 2026-10-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_add_shot_metadata"
down_revision: Union[str, None] = "0005_add_shot_info"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "storyboard_items",
        sa.Column("shot_metadata", sa.JSON(), nullable=True),
    )
    op.add_column(
        "subtitle_styles",
        sa.Column("text_case", sa.String(length=20), nullable=False, server_default="uppercase"),
    )


def downgrade() -> None:
    op.drop_column("subtitle_styles", "text_case")
    op.drop_column("storyboard_items", "shot_metadata")

