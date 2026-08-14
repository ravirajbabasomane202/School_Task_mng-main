"""Asset management tables

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b1
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'assets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('serial_number', sa.String(length=100), nullable=True),
        sa.Column('assigned_to', sa.Integer(), nullable=True),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('purchase_date', sa.DateTime(), nullable=True),
        sa.Column('purchase_value', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('condition', sa.String(length=20), nullable=False, server_default='GOOD'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id']),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_assets_department_id', 'assets', ['department_id'])
    op.create_index('ix_assets_category', 'assets', ['category'])
    op.create_index('ix_assets_status', 'assets', ['status'])
    op.create_index('ix_assets_created_at', 'assets', ['created_at'])


def downgrade():
    op.drop_index('ix_assets_created_at', table_name='assets')
    op.drop_index('ix_assets_status', table_name='assets')
    op.drop_index('ix_assets_category', table_name='assets')
    op.drop_index('ix_assets_department_id', table_name='assets')
    op.drop_table('assets')
