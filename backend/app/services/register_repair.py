"""Data repair for register check rows (used by the migration and the CLI).

* due_date NULL                      -> set to the first day of the row's period
* due_date wrong (the period END, or a date outside the period)
                                     -> set to the first day of the period
* status OK but no completed_at      -> NOT touched: no date is ever invented.
                                        Counted and reported; they are treated
                                        as On Time Checked ("date unknown").

Idempotent. Works with a Session or a Connection (raw SQL only).
"""
from datetime import date

from sqlalchemy import text

from app.models.register import period_bounds


def _as_date(value):
    if value is None or isinstance(value, date) and not hasattr(value, 'hour'):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return value.date() if hasattr(value, 'date') else value


def repair_register_occurrences(conn, dry_run=False):
    rows = conn.execute(text(
        'SELECT o.id, o.occurrence_date, o.due_date, o.status, o.completed_at, r.cycle '
        'FROM register_occurrences o JOIN registers r ON r.id = o.register_id'
    )).fetchall()

    report = {'scanned': len(rows), 'due_date_null': 0, 'due_date_wrong': 0,
              'checked_without_time': 0, 'changed': 0}
    for oid, occ_date, due, status, completed_at, cycle in rows:
        occ_date, due = _as_date(occ_date), _as_date(due)
        p_start, p_end = period_bounds(cycle, occ_date)
        if status == 'OK' and completed_at is None:
            report['checked_without_time'] += 1
        new_due = None
        if due is None:
            report['due_date_null'] += 1
            new_due = p_start
        elif due != p_start and (due == p_end or not (p_start <= due <= p_end)):
            report['due_date_wrong'] += 1
            new_due = p_start
        if new_due is not None:
            report['changed'] += 1
            if not dry_run:
                conn.execute(text('UPDATE register_occurrences SET due_date=:d WHERE id=:i'),
                             {'d': new_due, 'i': oid})
    if not dry_run and hasattr(conn, 'commit') and report['changed']:
        conn.commit()
    return report
