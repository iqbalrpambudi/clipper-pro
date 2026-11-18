"""Add shot_info JSON column to scenes.

Revision ID: 0005_add_shot_info
Revises: 0004_add_heatmap_data
Create Date: 2026-10-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_add_shot_info"
down_revision: Union[str, None] = "0004_add_heatmap_data"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scenes",
        sa.Column("shot_info", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scenes", "shot_info")
