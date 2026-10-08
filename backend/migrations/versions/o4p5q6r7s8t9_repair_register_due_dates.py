"""repair register occurrence due dates

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8

Sets due_date = first day of the period where it is NULL or wrong (e.g. rows
backfilled with the period END). Rows that are OK but have no completed_at are
left alone (no date is invented) and only counted. Row counts are printed.
"""
from alembic import op

revision = 'o4p5q6r7s8t9'
down_revision = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None


def upgrade():
    from app.services.register_repair import repair_register_occurrences
    report = repair_register_occurrences(op.get_bind())
    print(f'[register due-date repair] {report}')


def downgrade():
    pass  # data repair only; nothing to undo
