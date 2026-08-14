"""add salary_increments table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'salary_increments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('current_salary', sa.Numeric(14, 2), nullable=False),
        sa.Column('proposed_salary', sa.Numeric(14, 2), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='PENDING_HR'),
        sa.Column('requested_by', sa.Integer(), nullable=False),
        sa.Column('hr_approved_by', sa.Integer(), nullable=True),
        sa.Column('finance_approved_by', sa.Integer(), nullable=True),
        sa.Column('hr_comment', sa.Text(), nullable=True),
        sa.Column('finance_comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['employee_id'], ['users.id']),
        sa.ForeignKeyConstraint(['requested_by'], ['users.id']),
        sa.ForeignKeyConstraint(['hr_approved_by'], ['users.id']),
        sa.ForeignKeyConstraint(['finance_approved_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_salary_increments_employee_id', 'salary_increments', ['employee_id'])
    op.create_index('ix_salary_increments_status', 'salary_increments', ['status'])
    op.create_index('ix_salary_increments_created_at', 'salary_increments', ['created_at'])


def downgrade():
    op.drop_index('ix_salary_increments_created_at', table_name='salary_increments')
    op.drop_index('ix_salary_increments_status', table_name='salary_increments')
    op.drop_index('ix_salary_increments_employee_id', table_name='salary_increments')
    op.drop_table('salary_increments')
