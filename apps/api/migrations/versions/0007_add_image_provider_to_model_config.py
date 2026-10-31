"""Add image_provider to model_configs.

Revision ID: 0007_add_image_provider
Revises: 0006_add_shot_metadata
Create Date: 2026-10-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_add_image_provider"
down_revision: Union[str, None] = "0006_add_shot_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "model_configs",
        sa.Column("image_provider", sa.String(length=50), nullable=True, server_default="runware"),
    )


def downgrade() -> None:
    op.drop_column("model_configs", "image_provider")

