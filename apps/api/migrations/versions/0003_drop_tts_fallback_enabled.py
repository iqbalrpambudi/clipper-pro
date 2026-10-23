"""Drop tts_fallback_enabled from model_configs.

Revision ID: 0003_drop_tts_fallback_enabled
Revises: 0002_add_image_preset_type
Create Date: 2026-10-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_drop_tts_fallback_enabled"
down_revision: Union[str, None] = "0002_add_image_preset_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("model_configs", "tts_fallback_enabled")


def downgrade() -> None:
    op.add_column(
        "model_configs",
        sa.Column("tts_fallback_enabled", sa.Boolean(), server_default="true", nullable=False),
    )
