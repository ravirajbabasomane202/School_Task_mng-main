"""increase report_history.type length to 20

Revision ID: inc_report_type_20260530
Revises: f702125c7dd5
Create Date: 2026-05-30 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'inc_report_type_20260530'
down_revision = 'f702125c7dd5'
branch_labels = None
depends_on = None


def upgrade():
    # Alter the `type` column in `report_history` to allow longer values
    op.alter_column(
        'report_history',
        'type',
        existing_type=sa.String(length=10),
        type_=sa.String(length=20),
        existing_nullable=False,
    )


def downgrade():
    # Revert column length back to 10
    op.alter_column(
        'report_history',
        'type',
        existing_type=sa.String(length=20),
        type_=sa.String(length=10),
        existing_nullable=False,
    )
