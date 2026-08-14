"""add registers table

Revision ID: j3k4l5m6n7o8
Revises: f702125c7dd5
Create Date: 2026-07-08 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j3k4l5m6n7o8'
down_revision = 'f702125c7dd5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('registers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('register_no', sa.String(length=50), nullable=False),
        sa.Column('head_name', sa.String(length=150), nullable=False),
        sa.Column('cycle', sa.String(length=20), nullable=False),
        sa.Column('priority', sa.String(length=10), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('next_due_date', sa.Date(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('register_no')
    )


def downgrade():
    op.drop_table('registers')
