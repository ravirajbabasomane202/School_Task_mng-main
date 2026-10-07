"""Recruitment tables

Revision ID: c3d4e5f6a7b1
Revises: b2c3d4e5f6a7
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa


revision = 'c3d4e5f6a7b1'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'recruitments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('position_title', sa.String(length=120), nullable=False),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('vacancies', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='OPEN'),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recruitments_department_id', 'recruitments', ['department_id'])
    op.create_index('ix_recruitments_status', 'recruitments', ['status'])
    op.create_index('ix_recruitments_created_at', 'recruitments', ['created_at'])

    op.create_table(
        'recruitment_applications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('recruitment_id', sa.Integer(), nullable=False),
        sa.Column('applicant_name', sa.String(length=120), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('resume_path', sa.String(length=255), nullable=True),
        sa.Column('stage', sa.String(length=20), nullable=False, server_default='APPLIED'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['recruitment_id'], ['recruitments.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recruitments_applications_recruitment_id', 'recruitment_applications', ['recruitment_id'])
    op.create_index('ix_recruitments_applications_stage', 'recruitment_applications', ['stage'])


def downgrade():
    op.drop_index('ix_recruitments_applications_stage', table_name='recruitment_applications')
    op.drop_index('ix_recruitments_applications_recruitment_id', table_name='recruitment_applications')
    op.drop_table('recruitment_applications')
    op.drop_index('ix_recruitments_created_at', table_name='recruitments')
    op.drop_index('ix_recruitments_status', table_name='recruitments')
    op.drop_index('ix_recruitments_department_id', table_name='recruitments')
    op.drop_table('recruitments')
