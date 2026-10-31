"""Add image_steps and image_cfg_scale to model_configs.

Revision ID: 0008_add_image_steps_and_cfg_scale
Revises: 0007_add_image_provider
Create Date: 2026-10-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_add_image_steps_and_cfg_scale"
down_revision: Union[str, None] = "0007_add_image_provider"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "model_configs",
        sa.Column("image_steps", sa.Integer(), nullable=True, server_default="5"),
    )
    op.add_column(
        "model_configs",
        sa.Column("image_cfg_scale", sa.Float(), nullable=True, server_default="3.5"),
    )


def downgrade() -> None:
    op.drop_column("model_configs", "image_cfg_scale")
    op.drop_column("model_configs", "image_steps")

