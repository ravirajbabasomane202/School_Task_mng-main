"""add database-backed task headline and subtask catalog

Revision ID: r2s3t4u5v6w7
Revises: q1r2s3t4u5v6
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa

from app.task_catalog import TASK_CATALOG


revision = 'r2s3t4u5v6w7'
down_revision = 'q1r2s3t4u5v6'
branch_labels = None
depends_on = None


def upgrade():
    headlines = op.create_table(
        'task_headlines',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.UniqueConstraint('name', name='uq_task_headlines_name'),
    )
    subtasks = op.create_table(
        'task_subtasks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('headline_id', sa.Integer(), sa.ForeignKey('task_headlines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.UniqueConstraint('headline_id', 'name', name='uq_task_subtasks_headline_name'),
    )

    connection = op.get_bind()
    for headline_name, subtask_names in TASK_CATALOG.items():
        result = connection.execute(headlines.insert().values(name=headline_name))
        headline_id = result.inserted_primary_key[0]
        connection.execute(
            subtasks.insert(),
            [{'headline_id': headline_id, 'name': subtask_name} for subtask_name in subtask_names],
        )


def downgrade():
    op.drop_table('task_subtasks')
    op.drop_table('task_headlines')
