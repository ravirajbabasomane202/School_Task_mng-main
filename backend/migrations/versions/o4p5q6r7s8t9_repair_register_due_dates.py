"""repair register_occurrences.due_date (= period start)

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8

due_date is the scheduled check date = FIRST day of the checking period, which is
exactly register_occurrences.occurrence_date (rows are keyed by period start).

* Rows whose due_date is NULL or different (e.g. backfilled with the period END by
  an earlier version of n3o4p5q6r7s8) are set to occurrence_date. The number of
  repaired rows is printed.
* Rows with status OK but no completed_at are NOT given an invented date. They are
  counted and reported; the app shows them as "checked (date unknown)" and counts
  them as On Time Checked.
"""
import sqlalchemy as sa
from alembic import op

revision = 'o4p5q6r7s8t9'
down_revision = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    wrong = bind.execute(sa.text(
        'SELECT COUNT(*) FROM register_occurrences '
        'WHERE due_date IS NULL OR due_date <> occurrence_date')).scalar()
    bind.execute(sa.text(
        'UPDATE register_occurrences SET due_date = occurrence_date '
        'WHERE due_date IS NULL OR due_date <> occurrence_date'))
    unknown = bind.execute(sa.text(
        "SELECT COUNT(*) FROM register_occurrences WHERE status = 'OK' AND completed_at IS NULL")).scalar()
    print(f'[o4p5q6r7s8t9] due_date repaired on {wrong} row(s); '
          f'{unknown} OK row(s) have no check time (left as "checked, date unknown").')


def downgrade():
    # Data repair only; nothing to undo.
    pass
