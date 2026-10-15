"""add head type and fixed head ordering to users

Revision ID: p8q9r0s1t2u3
Revises: merge_heads_20260708, o4p5q6r7s8t9
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'p8q9r0s1t2u3'
down_revision = ('merge_heads_20260708', 'o4p5q6r7s8t9')
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('head_type', sa.String(length=60), nullable=True))
    op.add_column('users', sa.Column('sort_order', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('users', 'sort_order')
    op.drop_column('users', 'head_type')
