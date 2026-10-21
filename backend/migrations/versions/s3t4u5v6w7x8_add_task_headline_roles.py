"""scope task headlines to user roles

A headline with no rows in task_headline_roles is global (visible for every
assignee), so existing headlines keep working unchanged after this migration.

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa


revision = 's3t4u5v6w7x8'
down_revision = 'r2s3t4u5v6w7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'task_headline_roles',
        sa.Column(
            'headline_id',
            sa.Integer(),
            sa.ForeignKey('task_headlines.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column('role', sa.String(length=30), primary_key=True),
    )


def downgrade():
    op.drop_table('task_headline_roles')
