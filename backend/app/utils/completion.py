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


from app.utils.timezone import to_school_date as as_school_date


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


def register_completion_category(occ_status, due_date, completed_at):
    """Timing bucket of one register period: ON_TIME / LATE for a completed
    period, PENDING otherwise. Thin wrapper over classify_register_period so
    there is a single comparison in the code base."""
    if occ_status != 'COMPLETED':
        return CAT_PENDING
    outcome = register_check_outcome(due_date, completed_at, None)
    return CAT_LATE if outcome == CHECK_LATE else CAT_ON_TIME


# ----------------------------------------------------------------------
# Register period classification -- THE single source of truth.
#
# due_date   = scheduled check date = FIRST day of the checking period.
# window_end = LAST day of the period (the check window is due_date..window_end).
# checked_at = the actual moment of the check, converted to the SCHOOL time
#              zone (app.utils.timezone) before dates are compared.
#
#   checked_at <= due_date                -> ON_TIME     "On Time Checked"        green
#   checked_at >  due_date                -> LATE        "Checked After Due Date" yellow
#   rejected check                        -> REJECTED                              red
#   not checked and today > window_end    -> DELAYED     "Not Checked"            grey outline
#   not checked and today <= window_end   -> UPCOMING    open / not started       grey
#
# Everything (calendar, register list, dashboard performance, reports and
# exports) calls classify_register_period; nothing else compares these dates.
# ----------------------------------------------------------------------
CHECK_ON_TIME = 'ON_TIME'
CHECK_LATE = 'LATE'
CHECK_DELAYED = 'DELAYED'
CHECK_UPCOMING = 'UPCOMING'
CHECK_REJECTED = 'REJECTED'


def register_check_outcome(due_date, checked_at, today, window_end=None):
    due = as_school_date(due_date)
    if checked_at is not None:
        done = as_school_date(checked_at)
        if due is None or done <= due:
            return CHECK_ON_TIME
        return CHECK_LATE
    end = as_school_date(window_end) if window_end is not None else due
    if end is not None and as_school_date(today) is not None and as_school_date(today) > end:
        return CHECK_DELAYED
    return CHECK_UPCOMING


def classify_register_period(status, due_date, window_end, checked_at, today):
    """Classify one checking period.

    `status` is the STORED occurrence status ('OK', 'REJECTED', anything else
    or None = not checked). Returns a dict:
      outcome            ON_TIME | LATE | REJECTED | DELAYED | UPCOMING
      computed_status    COMPLETED | FAILED | PENDING | UPCOMING (API enum, unchanged)
      dot_color          green | yellow | red | outline | gray
      check_timing       'ON_TIME' | 'LATE' | None (only for completed periods)
      checked_at_unknown True for an OK row that has no check time (legacy data):
                         counted as On Time Checked, the date is NOT invented.
    """
    if status == 'OK':
        unknown = checked_at is None
        outcome = register_check_outcome(due_date, checked_at, today, window_end)
        late = outcome == CHECK_LATE
        return {
            'outcome': CHECK_LATE if late else CHECK_ON_TIME,
            'computed_status': 'COMPLETED',
            'dot_color': 'yellow' if late else 'green',
            'check_timing': CHECK_LATE if late else CHECK_ON_TIME,
            'checked_at_unknown': unknown,
        }
    if status == 'REJECTED':
        return {'outcome': CHECK_REJECTED, 'computed_status': 'FAILED', 'dot_color': 'red',
                'check_timing': None, 'checked_at_unknown': False}
    outcome = register_check_outcome(due_date, None, today, window_end)
    if outcome == CHECK_DELAYED:
        return {'outcome': CHECK_DELAYED, 'computed_status': 'PENDING', 'dot_color': 'outline',
                'check_timing': None, 'checked_at_unknown': False}
    return {'outcome': CHECK_UPCOMING, 'computed_status': 'UPCOMING', 'dot_color': 'gray',
            'check_timing': None, 'checked_at_unknown': False}
