"""merge heads

Revision ID: merge_heads_20260530
Revises: i2j3k4l5m6n7, inc_report_type_20260530
Create Date: 2026-05-30 17:12:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'merge_heads_20260530'
down_revision = ('i2j3k4l5m6n7', 'inc_report_type_20260530')
branch_labels = None
depends_on = None


def upgrade():
    # merge migration - no DB changes, just consolidates heads
    pass


def downgrade():
    # no-op
    pass
