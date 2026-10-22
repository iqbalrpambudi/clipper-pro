"""Add image preset intent.

Revision ID: 0002_add_image_preset_type
Revises: 0001_initial_schema
Create Date: 2026-10-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_image_preset_type"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "image_presets",
        sa.Column("preset_type", sa.String(length=20), server_default="style", nullable=False),
    )
    op.create_check_constraint(
        "ck_image_presets_preset_type",
        "image_presets",
        "preset_type IN ('style', 'character', 'combined')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_image_presets_preset_type", "image_presets", type_="check")
    op.drop_column("image_presets", "preset_type")
