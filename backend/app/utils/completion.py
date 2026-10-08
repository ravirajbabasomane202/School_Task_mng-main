"""Shared completion-category logic (On Time Complete / Complete After Due
Date / Pending) for tasks and register checks.

Lives in `utils` (not `routes/reports.py`) so both `routes/dashboard.py` and
`routes/reports.py` can use it without a circular import. `routes/reports.py`
re-exports the names, so existing imports keep working.
"""
from datetime import timezone

CAT_ON_TIME = 'ON_TIME'
CAT_LATE = 'LATE'
CAT_PENDING = 'PENDING'


def as_utc_date(value):
    """Date part of a (naive or aware) datetime, normalised to UTC so that
    SQLite (naive) and PostgreSQL (aware) values compare the same way."""
    if value is None:
        return None
    if getattr(value, 'tzinfo', None) is not None:
        value = value.astimezone(timezone.utc)
    return value.date() if hasattr(value, 'date') and callable(value.date) else value


def task_completion_category(task):
    """Classify a task into exactly one of: on-time complete, completed after
    the due date, or pending (not completed).

    - Not COMPLETED                       -> PENDING
    - COMPLETED, no due date              -> ON_TIME
    - COMPLETED, completed_at <= due date -> ON_TIME
    - COMPLETED, completed_at >  due date -> LATE
    Comparison is by calendar day (due dates are day-level deadlines). A
    completed task with no completed_at falls back to updated_at, and to
    ON_TIME if neither is available, so this never raises.
    """
    if task.status != 'COMPLETED':
        return CAT_PENDING

    due = as_utc_date(task.due_date)
    if due is None:
        return CAT_ON_TIME

    done = as_utc_date(task.completed_at) or as_utc_date(task.updated_at)
    if done is None:
        return CAT_ON_TIME

    return CAT_ON_TIME if done <= due else CAT_LATE


def register_completion_category(occ_status, period_end, completed_at):
    """Classify one register checking period into exactly one category.

    `occ_status` is the computed status from `Register.generate_occurrences`:
    - COMPLETED (check recorded OK)  -> ON_TIME when the check was recorded on
      or before the period's due date (`period_end`), LATE when after it.
      A register with no due date, or a completed check with no recorded
      completion time, is treated as ON_TIME.
    - anything else that counts as activity (PENDING = missed, FAILED =
      rejected) -> PENDING (not completed).
    """
    if occ_status != 'COMPLETED':
        return CAT_PENDING
    due = as_utc_date(period_end)
    done = as_utc_date(completed_at)
    if due is None or done is None:
        return CAT_ON_TIME
    return CAT_ON_TIME if done <= due else CAT_LATE


# ----------------------------------------------------------------------
# Register check outcome (status rules)
#
# due_date = the scheduled check date (first day of the checking period);
# the period's window runs from due_date to window_end (e.g. 5th-11th).
#
#   checked_at <= due_date                -> ON_TIME      ("On Time Checked", green)
#   checked_at >  due_date                -> LATE         ("Checked After Due Date", yellow)
#   not checked and today > window_end    -> DELAYED      ("Delayed" / "Not Checked")
#   not checked and today <= window_end   -> UPCOMING     (still can be checked)
#
# Only the stored scheduled `due_date` and the actual `checked_at` are used.
# ----------------------------------------------------------------------
CHECK_ON_TIME = 'ON_TIME'
CHECK_LATE = 'LATE'
CHECK_DELAYED = 'DELAYED'
CHECK_UPCOMING = 'UPCOMING'


def register_check_outcome(due_date, checked_at, today, window_end=None):
    due = as_utc_date(due_date)
    if checked_at is not None:
        done = as_utc_date(checked_at)
        if due is None or done <= due:
            return CHECK_ON_TIME
        return CHECK_LATE
    end = as_utc_date(window_end) if window_end is not None else due
    if end is not None and as_utc_date(today) > end:
        return CHECK_DELAYED
    return CHECK_UPCOMING
