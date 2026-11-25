"""add important (recurring) notifications

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa


revision = 'v6w7x8y9z0a1'
down_revision = 'u5v6w7x8y9z0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'imp_notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('recurrence', sa.String(length=15), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('priority', sa.String(length=10), nullable=False),
        sa.Column('assigned_roles', sa.JSON(), nullable=False),
        sa.Column('assigned_user_ids', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'imp_notification_cycles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_id', sa.Integer(), nullable=False),
        sa.Column('cycle_index', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('notify_from', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=15), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['notification_id'], ['imp_notifications.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['completed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('notification_id', 'cycle_index', name='uq_imp_cycle_notification_index'),
    )
    op.create_index('ix_imp_notification_cycles_notification_id', 'imp_notification_cycles', ['notification_id'])
    op.create_index('ix_imp_notification_cycles_due_date', 'imp_notification_cycles', ['due_date'])
    op.create_table(
        'imp_notification_reminders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cycle_id', sa.Integer(), nullable=False),
        sa.Column('reminder_date', sa.Date(), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('recipient_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['cycle_id'], ['imp_notification_cycles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('cycle_id', 'reminder_date', name='uq_imp_reminder_cycle_day'),
    )
    op.create_index('ix_imp_notification_reminders_cycle_id', 'imp_notification_reminders', ['cycle_id'])

    # Additive, nullable link so a reminder can open its Imp Notification.
    # Existing notification rows are untouched.
    with op.batch_alter_table('notifications') as batch:
        batch.add_column(sa.Column('imp_notification_id', sa.Integer(), nullable=True))
        batch.create_foreign_key(
            'fk_notifications_imp_notification_id', 'imp_notifications',
            ['imp_notification_id'], ['id'], ondelete='CASCADE',
        )
        batch.create_index('ix_notifications_imp_notification_id', ['imp_notification_id'])


def downgrade():
    with op.batch_alter_table('notifications') as batch:
        batch.drop_index('ix_notifications_imp_notification_id')
        batch.drop_constraint('fk_notifications_imp_notification_id', type_='foreignkey')
        batch.drop_column('imp_notification_id')
    op.drop_index('ix_imp_notification_reminders_cycle_id', table_name='imp_notification_reminders')
    op.drop_table('imp_notification_reminders')
    op.drop_index('ix_imp_notification_cycles_due_date', table_name='imp_notification_cycles')
    op.drop_index('ix_imp_notification_cycles_notification_id', table_name='imp_notification_cycles')
    op.drop_table('imp_notification_cycles')
    op.drop_table('imp_notifications')
