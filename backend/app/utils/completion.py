"""Shared completion-category logic (On Time Complete / Complete After Due
Date / Pending) for tasks and register checks.

Lives in `utils` (not `routes/reports.py`) so both `routes/dashboard.py` and
`routes/reports.py` can use it without a circular import. `routes/reports.py`
re-exports the names, so existing imports keep working.
"""
from datetime import timezone

from app.utils.timezone import to_school_date

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


# ----------------------------------------------------------------------
# Register check outcome (status rules) -- THE one classifier.
#
# due_date = the scheduled check date (first day of the checking period);
# the period's window runs from due_date to window_end (e.g. 5th-11th).
#
#   checked_at <= due_date                -> ON_TIME      ("On Time Checked", green)
#   checked_at >  due_date                -> LATE         ("Checked After Due Date", yellow)
#   rejected check                        -> REJECTED     (red)
#   not checked and today > window_end    -> DELAYED      ("Not Checked" / "Delayed")
#   not checked and today <= window_end   -> UPCOMING     (still open, can be checked)
#
# Dates are compared as calendar days in the SCHOOL time zone (checked_at is
# stored in UTC; see utils/timezone.py). A check recorded as OK that has no
# checked_at (legacy data) is never given an invented date: it counts as On
# Time Checked and is flagged "date unknown" by the caller.
#
# Every consumer (calendar, register list, dashboard performance, reports,
# CSV/Excel exports, the Performance panel) calls this function or reads the
# `check_outcome` it produced -- nobody compares dates on their own.
# ----------------------------------------------------------------------
CHECK_ON_TIME = 'ON_TIME'
CHECK_LATE = 'LATE'
CHECK_DELAYED = 'DELAYED'
CHECK_UPCOMING = 'UPCOMING'
CHECK_REJECTED = 'REJECTED'

# Dot colour for each outcome. `missed` is its own marker (a hollow red ring)
# so it can never be confused with yellow = Checked After Due Date.
OUTCOME_DOT_COLOR = {
    CHECK_ON_TIME: 'green',
    CHECK_LATE: 'yellow',
    CHECK_REJECTED: 'red',
    CHECK_DELAYED: 'missed',
    CHECK_UPCOMING: 'gray',
}


def register_check_outcome(due_date, checked_at, today, window_end=None, status=None):
    """Classify one register checking period. See the rules above.

    `status` is the stored check status ('OK' / 'REJECTED' / 'IDLE'). When
    omitted it is inferred: a `checked_at` means the register was checked.
    """
    status = (status or ('OK' if checked_at is not None else 'IDLE')).upper()
    if status == 'REJECTED':
        return CHECK_REJECTED
    if status == 'OK':
        due = to_school_date(due_date)
        done = to_school_date(checked_at)
        if due is None or done is None:
            return CHECK_ON_TIME
        return CHECK_ON_TIME if done <= due else CHECK_LATE
    end = to_school_date(window_end if window_end is not None else due_date)
    if end is not None and today is not None and today > end:
        return CHECK_DELAYED
    return CHECK_UPCOMING


def register_completion_category(occ_status, period_due, completed_at):
    """Task-style ON_TIME / LATE / PENDING view of one register period, built on
    `register_check_outcome` (kept for callers that think in those terms).
    `occ_status` is the computed status (COMPLETED / FAILED / PENDING / ...)."""
    if occ_status != 'COMPLETED':
        return CAT_PENDING
    outcome = register_check_outcome(period_due, completed_at, None, status='OK')
    return CAT_ON_TIME if outcome == CHECK_ON_TIME else CAT_LATE
