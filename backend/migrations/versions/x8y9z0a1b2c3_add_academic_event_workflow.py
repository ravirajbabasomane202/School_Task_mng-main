"""academic event responsible person, completion workflow, approval and history

Revision ID: x8y9z0a1b2c3
Revises: w7x8y9z0a1b2
Create Date: 2026-11-26
"""
from alembic import op
import sqlalchemy as sa


revision = 'x8y9z0a1b2c3'
down_revision = 'w7x8y9z0a1b2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('academic_events') as batch:
        batch.add_column(sa.Column('responsible_user_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('completion_status', sa.String(length=15), nullable=False, server_default='PENDING'))
        batch.add_column(sa.Column('completed_by', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('actual_completion_date', sa.Date(), nullable=True))
        batch.add_column(sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('completion_remarks', sa.Text(), nullable=True))
        batch.add_column(sa.Column('non_completion_reason', sa.Text(), nullable=True))
        batch.add_column(sa.Column('reason_submitted_by', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('reason_submitted_at', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('approval_status', sa.String(length=10), nullable=False, server_default='PENDING'))
        batch.add_column(sa.Column('approval_remarks', sa.Text(), nullable=True))
        batch.add_column(sa.Column('approval_updated_by', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('approval_updated_at', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('original_start_date', sa.Date(), nullable=True))
        batch.add_column(sa.Column('original_start_time', sa.Time(), nullable=True))
        batch.add_column(sa.Column('overdue_notified_at', sa.DateTime(timezone=True), nullable=True))
        batch.create_foreign_key('fk_academic_events_responsible', 'users', ['responsible_user_id'], ['id'], ondelete='SET NULL')
        batch.create_foreign_key('fk_academic_events_completed_by', 'users', ['completed_by'], ['id'], ondelete='SET NULL')
        batch.create_foreign_key('fk_academic_events_reason_by', 'users', ['reason_submitted_by'], ['id'], ondelete='SET NULL')
        batch.create_foreign_key('fk_academic_events_approval_by', 'users', ['approval_updated_by'], ['id'], ondelete='SET NULL')
        batch.create_index('ix_academic_events_responsible_user_id', ['responsible_user_id'], unique=False)

    # Existing events keep working untouched: no responsible person (so they
    # are not pulled into the overdue workflow), approval Pending, and their
    # current schedule recorded as the original one.
    op.execute(
        'UPDATE academic_events SET original_start_date = start_date, '
        'original_start_time = start_time WHERE original_start_date IS NULL'
    )

    op.create_table(
        'academic_event_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=30), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['event_id'], ['academic_events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_academic_event_history_event_id', 'academic_event_history', ['event_id'], unique=False)


def downgrade():
    op.drop_index('ix_academic_event_history_event_id', table_name='academic_event_history')
    op.drop_table('academic_event_history')
    with op.batch_alter_table('academic_events') as batch:
        batch.drop_index('ix_academic_events_responsible_user_id')
        batch.drop_constraint('fk_academic_events_approval_by', type_='foreignkey')
        batch.drop_constraint('fk_academic_events_reason_by', type_='foreignkey')
        batch.drop_constraint('fk_academic_events_completed_by', type_='foreignkey')
        batch.drop_constraint('fk_academic_events_responsible', type_='foreignkey')
        for column in (
            'overdue_notified_at', 'original_start_time', 'original_start_date', 'approval_updated_at',
            'approval_updated_by', 'approval_remarks', 'approval_status', 'reason_submitted_at',
            'reason_submitted_by', 'non_completion_reason', 'completion_remarks', 'completed_at',
            'actual_completion_date', 'completed_by', 'completion_status', 'responsible_user_id',
        ):
            batch.drop_column(column)
