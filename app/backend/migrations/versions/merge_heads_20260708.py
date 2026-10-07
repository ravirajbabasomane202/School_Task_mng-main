"""merge multiple heads (auto)

Revision ID: merge_heads_20260708
Revises: merge_heads_20260530, j3k4l5m6n7o8
Create Date: 2026-07-08 16:05:00.000000

This is an empty merge revision to unify multiple heads so Alembic
can upgrade to a single head.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'merge_heads_20260708'
down_revision = ('merge_heads_20260530', 'j3k4l5m6n7o8')
branch_labels = None
depends_on = None


def upgrade():
    # empty merge migration
    pass


def downgrade():
    # no-op
    pass
