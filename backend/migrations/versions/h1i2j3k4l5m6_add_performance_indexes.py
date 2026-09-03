"""add performance indexes

Revision ID: h1i2j3k4l5m6
Revises: g8h9i0j1k2l3
Create Date: 2026-05-23 00:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'h1i2j3k4l5m6'
down_revision = 'g8h9i0j1k2l3'
branch_labels = None
depends_on = None


def upgrade():
    # tasks — most frequently filtered columns
    op.create_index('ix_tasks_assigned_to',   'tasks', ['assigned_to'])
    op.create_index('ix_tasks_assigned_by',   'tasks', ['assigned_by'])
    op.create_index('ix_tasks_status',        'tasks', ['status'])
    op.create_index('ix_tasks_department_id', 'tasks', ['department_id'])
    op.create_index('ix_tasks_due_date',      'tasks', ['due_date'])

    # notifications — polled constantly for the bell icon
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_is_read', 'notifications', ['is_read'])

    # leave_requests — filtered by user and status
    op.create_index('ix_leave_requests_user_id', 'leave_requests', ['user_id'])
    op.create_index('ix_leave_requests_status',  'leave_requests', ['status'])

    # task_history — joined on task_id
    op.create_index('ix_task_history_task_id', 'task_history', ['task_id'])

    # approvals — filtered by status and requester
    op.create_index('ix_approvals_status',       'approvals', ['status'])
    op.create_index('ix_approvals_requested_by', 'approvals', ['requested_by'])

    # salary_increments — filtered by status
    # already indexed by the salary increments migration

    # purchase_orders — filtered by status and department
    # already indexed by the purchase order migration

    # users — frequently looked up by role and is_active
    op.create_index('ix_users_role',      'users', ['role'])
    op.create_index('ix_users_is_active', 'users', ['is_active'])


def downgrade():
    op.drop_index('ix_tasks_assigned_to',   'tasks')
    op.drop_index('ix_tasks_assigned_by',   'tasks')
    op.drop_index('ix_tasks_status',        'tasks')
    op.drop_index('ix_tasks_department_id', 'tasks')
    op.drop_index('ix_tasks_due_date',      'tasks')

    op.drop_index('ix_notifications_user_id', 'notifications')
    op.drop_index('ix_notifications_is_read', 'notifications')

    op.drop_index('ix_leave_requests_user_id', 'leave_requests')
    op.drop_index('ix_leave_requests_status',  'leave_requests')

    op.drop_index('ix_task_history_task_id', 'task_history')

    op.drop_index('ix_approvals_status',       'approvals')
    op.drop_index('ix_approvals_requested_by', 'approvals')

    op.drop_index('ix_users_role',      'users')
    op.drop_index('ix_users_is_active', 'users')
