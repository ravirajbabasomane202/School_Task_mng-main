"""add task headline to tasks

Revision ID: q1r2s3t4u5v6
Revises: p8q9r0s1t2u3
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa


revision = 'q1r2s3t4u5v6'
down_revision = 'p8q9r0s1t2u3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('task_headline', sa.String(length=255), nullable=True))


def downgrade():
    op.drop_column('tasks', 'task_headline')
