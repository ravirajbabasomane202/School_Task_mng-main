"""add proof_path to tasks

Revision ID: g8h9i0j1k2l3
Revises: e5f6a7b8c9d0
Create Date: 2026-05-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'g8h9i0j1k2l3'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('proof_path', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('tasks', 'proof_path')
