"""add academic events

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-11-24
"""
from alembic import op
import sqlalchemy as sa


revision = 'u5v6w7x8y9z0'
down_revision = 't4u5v6w7x8y9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'academic_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=30), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('target_audience', sa.JSON(), nullable=False),
        sa.Column('attachment_filename', sa.String(length=255), nullable=True),
        sa.Column('attachment_storage_name', sa.String(length=80), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('attachment_storage_name'),
    )
    op.create_index('ix_academic_events_start_date', 'academic_events', ['start_date'], unique=False)
    op.create_index('ix_academic_events_end_date', 'academic_events', ['end_date'], unique=False)


def downgrade():
    op.drop_index('ix_academic_events_end_date', table_name='academic_events')
    op.drop_index('ix_academic_events_start_date', table_name='academic_events')
    op.drop_table('academic_events')
