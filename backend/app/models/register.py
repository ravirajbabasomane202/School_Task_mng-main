import calendar
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.utils.completion import (
    CHECK_DELAYED,
    CHECK_LATE,
    CHECK_ON_TIME,
    CHECK_REJECTED,
    CHECK_UPCOMING,
    OUTCOME_DOT_COLOR,
    register_check_outcome,
)
from app.utils.timezone import iso_utc, school_today, to_school_date

CYCLES = ('DAILY', 'WEEKLY', '15_DAYS', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY')
PRIORITIES = ('HIGH', 'MEDIUM', 'LOW')
STATUSES = ('IDLE', 'OK', 'REJECTED')

_CYCLE_DAYS = {
    'DAILY': 1,
    'WEEKLY': 7,
    '15_DAYS': 15,
}
_CYCLE_MONTHS = {
    'MONTHLY': 1,
    'QUARTERLY': 3,
    'HALF_YEARLY': 6,
    'YEARLY': 12,
}


def _add_months(d, months):
    """Add `months` calendar months to date `d`, clamping the day to the
    last day of the resulting month (e.g. 31 Jan + 1 month -> 28/29 Feb)."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    day = min(d.day, last_day)
    return d.replace(year=year, month=month, day=day)


def _advance(d, cycle):
    """Step a single cycle forward from date `d`."""
    if cycle in _CYCLE_DAYS:
        return d + timedelta(days=_CYCLE_DAYS[cycle])
    if cycle in _CYCLE_MONTHS:
        return _add_months(d, _CYCLE_MONTHS[cycle])
    # Unknown cycle value: fall back to a daily step rather than raising,
    # so a bad/legacy value never crashes the whole calendar/list view.
    return d + timedelta(days=1)


def calculate_next_due_date(start_date, cycle):
    """The register's first due date: exactly one cycle step past start_date."""
    if start_date is None:
        return None
    return _advance(start_date, cycle)


# ----------------------------------------------------------------------
# Checking periods
#
# A register is checked ONCE PER CHECKING PERIOD, not on one exact date.
# Periods are calendar-aligned so everyone shares the same boundaries:
#
#   DAILY        the day itself
#   WEEKLY       Monday -> Sunday
#   15_DAYS      1st-15th, and 16th -> end of the month
#   MONTHLY      1st -> last day of the calendar month
#   QUARTERLY    Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec
#   HALF_YEARLY  Jan-Jun, Jul-Dec
#   YEARLY       1 Jan -> 31 Dec
#
# A check is stored as one RegisterOccurrence row whose `occurrence_date` is
# the period's START date, so the existing (register_id, occurrence_date)
# unique constraint is also a database-level "one check per period" guard.
# Rows written before this change sit on their old exact scheduled date;
# they are mapped to the period that contains that date, so history stays
# valid and is never rewritten.
# ----------------------------------------------------------------------

CHECKED_STATUSES = ('OK', 'REJECTED')

_PERIOD_LABEL = {
    'DAILY': 'day',
    'WEEKLY': 'week',
    '15_DAYS': '15-day period',
    'MONTHLY': 'month',
    'QUARTERLY': 'quarter',
    'HALF_YEARLY': 'half-year',
    'YEARLY': 'year',
}


def period_label(cycle):
    return _PERIOD_LABEL.get(cycle, 'day')


def _month_end(year, month):
    return calendar.monthrange(year, month)[1]


def period_bounds(cycle, d):
    """(start, end), both inclusive, of the checking period containing `d`."""
    if cycle == 'WEEKLY':
        start = d - timedelta(days=d.weekday())  # Monday
        return start, start + timedelta(days=6)
    if cycle == '15_DAYS':
        if d.day <= 15:
            return d.replace(day=1), d.replace(day=15)
        return d.replace(day=16), d.replace(day=_month_end(d.year, d.month))
    if cycle == 'MONTHLY':
        return d.replace(day=1), d.replace(day=_month_end(d.year, d.month))
    if cycle == 'QUARTERLY':
        first_month = 3 * ((d.month - 1) // 3) + 1
        return (
            d.replace(month=first_month, day=1),
            d.replace(month=first_month + 2, day=_month_end(d.year, first_month + 2)),
        )
    if cycle == 'HALF_YEARLY':
        first_month = 1 if d.month <= 6 else 7
        return (
            d.replace(month=first_month, day=1),
            d.replace(month=first_month + 5, day=_month_end(d.year, first_month + 5)),
        )
    if cycle == 'YEARLY':
        return d.replace(month=1, day=1), d.replace(month=12, day=31)
    # DAILY, and any unknown/legacy value (same fallback as `_advance`).
    return d, d


def next_period_start(cycle, d):
    """Start date of the period after the one containing `d`."""
    return period_bounds(cycle, d)[1] + timedelta(days=1)


def scheduled_due_date(cycle, d):
    """The SCHEDULED due date (check date) of the checking period containing
    `d`: the FIRST day of the period (e.g. period 5-11 is due on the 5th).
    A check made on that day is on time; a check later in the window (6th-11th)
    is "after due date". It depends only on the schedule (cycle + calendar),
    never on when the register was actually checked."""
    return period_bounds(cycle, d)[0]


def checked_after_due(due_date, checked_at):
    """True when the check was made after the scheduled due date (school-local
    calendar days; see utils/completion.register_check_outcome)."""
    if due_date is None or checked_at is None:
        return False
    return register_check_outcome(due_date, checked_at, None, status='OK') == CHECK_LATE


# Outcome -> the computed status the calendar/list have always exposed.
_OUTCOME_COMPUTED_STATUS = {
    CHECK_ON_TIME: 'COMPLETED',
    CHECK_LATE: 'COMPLETED',
    CHECK_REJECTED: 'FAILED',
    CHECK_DELAYED: 'PENDING',     # period ended unchecked (shown as "Missed")
    CHECK_UPCOMING: 'UPCOMING',
}


def describe_check(row, due, today, window_end):
    """Everything one period's check says, derived ONLY from the stored row and
    the shared classifier. Returned for every API so they cannot disagree."""
    status = row.status if row is not None and row.status in CHECKED_STATUSES else None
    checked_at = row.completed_at if (row is not None and status) else None
    outcome = register_check_outcome(due, checked_at, today, window_end, status=status or 'IDLE')
    return {
        'outcome': outcome,
        'computed_status': _OUTCOME_COMPUTED_STATUS[outcome],
        'dot_color': OUTCOME_DOT_COLOR[outcome],
        'checked_at': checked_at,
        # Checked OK in the past but no moment was ever recorded (legacy data):
        # counted as On Time Checked, never given an invented date.
        'checked_at_unknown': status == 'OK' and checked_at is None,
        'check_timing': (
            ('LATE' if outcome == CHECK_LATE else 'ON_TIME') if status == 'OK' else None
        ),
    }


def schedule_next_due_date(cycle, scheduled_period_start):
    """Next due date after the period that was just satisfied.

    Calculated from the SCHEDULE: `scheduled_period_start` is the scheduled
    period the check belongs to, not the day the check was physically made. A
    late check therefore can't shift the schedule (and an early or late click
    can't skip or repeat a period).
    """
    return next_period_start(cycle, scheduled_period_start)


def _best_row(current, candidate):
    """Of two RegisterOccurrence rows in one period, the one that represents
    the period: a recorded check beats an IDLE placeholder, then the later one."""
    if current is None:
        return candidate
    cur_checked = current.status in CHECKED_STATUSES
    cand_checked = candidate.status in CHECKED_STATUSES
    if cur_checked != cand_checked:
        return current if cur_checked else candidate
    cur_key = (current.completed_at or datetime.min, current.occurrence_date)
    cand_key = (candidate.completed_at or datetime.min, candidate.occurrence_date)
    return candidate if cand_key > cur_key else current


def index_rows_by_period(cycle, rows):
    """{period_start: RegisterOccurrence} for an iterable of rows."""
    by_period = {}
    for row in rows:
        start = period_bounds(cycle, row.occurrence_date)[0]
        by_period[start] = _best_row(by_period.get(start), row)
    return by_period


def fetch_occurrence_maps(registers, range_start, range_end):
    """{register_id: {occurrence_date: row}} for every register in one query.

    A period can start before `range_start` (e.g. a week straddling the
    range edge), so the lower bound is widened by the longest period
    (a year) to make sure the row that represents such a period is loaded.
    """
    maps = {r.id: {} for r in registers}
    if not maps:
        return maps
    rows = RegisterOccurrence.query.filter(
        RegisterOccurrence.register_id.in_(list(maps.keys())),
        RegisterOccurrence.occurrence_date >= range_start - timedelta(days=366),
        RegisterOccurrence.occurrence_date <= range_end,
    ).all()
    for row in rows:
        maps[row.register_id][row.occurrence_date] = row
    return maps


def fetch_current_cycle_occurrences(registers, today):
    """Batch-fetch each register's row for its CURRENT checking period (one
    query total) instead of one query per register. A register with no row
    in its current period is simply absent from the result."""
    periods = {}
    for r in registers:
        period = r.current_period(today)
        if period is not None:
            periods[r.id] = period
    if not periods:
        return {}

    rows = RegisterOccurrence.query.filter(
        RegisterOccurrence.register_id.in_(periods.keys()),
        RegisterOccurrence.occurrence_date >= min(p[0] for p in periods.values()),
        RegisterOccurrence.occurrence_date <= max(p[1] for p in periods.values()),
    ).all()

    result = {}
    for row in rows:
        period = periods.get(row.register_id)
        if period is not None and period[0] <= row.occurrence_date <= period[1]:
            result[row.register_id] = _best_row(result.get(row.register_id), row)
    return result


def summarize_register_periods(register, date_from, date_to, today, occurrence_map=None):
    """Check counts of ONE register over [date_from, date_to] -- the single
    place the Performance numbers are produced (dashboard rows, the Performance
    panel's data, reports and exports all call this).

    Unit = one checking period due in the range (see `due_periods_in_range`).
    Every period lands in exactly one bucket, so
        on_time + late + not_checked + rejected == total
    holds everywhere. A period that is still open (unchecked, window not over)
    can still be checked, so it is reported as `open` and is NOT in `total`.
    """
    counts = {'on_time': 0, 'late': 0, 'not_checked': 0, 'rejected': 0, 'open': 0}
    strip = []
    for occ in register.due_periods_in_range(date_from, date_to, today, occurrence_map):
        outcome = occ['check_outcome']
        if outcome == CHECK_ON_TIME:
            counts['on_time'] += 1
        elif outcome == CHECK_LATE:
            counts['late'] += 1
        elif outcome == CHECK_DELAYED:
            counts['not_checked'] += 1
        elif outcome == CHECK_REJECTED:
            counts['rejected'] += 1
        else:
            counts['open'] += 1
            continue
        strip.append({'date': occ['date'], 'color': occ['dot_color']})
    counts['total'] = counts['on_time'] + counts['late'] + counts['not_checked'] + counts['rejected']
    counts['completed'] = counts['on_time'] + counts['late']
    counts['strip'] = strip
    return counts


_UNSET = object()


class Register(db.Model):
    __tablename__ = 'registers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    register_no = db.Column(db.String(50), nullable=False, unique=True)
    head_name = db.Column(db.String(150), nullable=False)
    head_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    cycle = db.Column(db.String(20), nullable=False)
    priority = db.Column(db.String(10), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='IDLE')
    start_date = db.Column(db.Date, nullable=False)
    next_due_date = db.Column(db.Date, nullable=False)
    last_completed_date = db.Column(db.Date, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    head = db.relationship('User', foreign_keys=[head_id])
    creator = db.relationship('User', foreign_keys=[created_by])
    occurrences = db.relationship('RegisterOccurrence', backref='register', cascade='all, delete-orphan')

    # ------------------------------------------------------------------
    # Period-based checking logic (see "Checking periods" above)
    # ------------------------------------------------------------------

    def current_period(self, today):
        """(start, end) of the checking period containing `today`, or None
        if the register hasn't started yet (start_date is in the future)."""
        if self.start_date is None or self.start_date > today:
            return None
        return period_bounds(self.cycle, today)

    def current_cycle_occurrence_date(self, today):
        """Key date of the current checking period: its START date (the
        `occurrence_date` a check made in this period is stored under), or
        None before the register starts."""
        period = self.current_period(today)
        return period[0] if period else None

    def periods_in_range(self, range_start, range_end):
        """Every checking period overlapping [range_start, range_end] that
        isn't entirely before the register's start date, as (start, end)."""
        if self.start_date is None:
            return []
        periods = []
        start = period_bounds(self.cycle, max(range_start, self.start_date))[0]
        guard = 0
        while start <= range_end:
            end = period_bounds(self.cycle, start)[1]
            periods.append((start, end))
            start = end + timedelta(days=1)
            guard += 1
            if guard > 10000:
                break
        return periods

    def due_periods_in_range(self, range_start, range_end, today, occurrence_map=None):
        """The periods that BELONG to [range_start, range_end] for performance
        purposes: a period belongs to the range by its due_date (its stored due
        date, else its first day), and only once that due date has arrived.

        A period that merely overlaps the range, but is due before it or after
        it, is not included -- and a check made after the range end still counts
        for the period it was made for, because the period is found by its own
        due date, never by when it was checked.
        """
        if occurrence_map is None:
            occurrence_map = fetch_occurrence_maps([self], range_start, range_end)[self.id]
        return [
            occ for occ in self.generate_occurrences(
                range_start - timedelta(days=366), range_end, today,
                occurrence_map=occurrence_map)
            if range_start <= occ['due_date'] <= range_end and occ['due_date'] <= today
        ]

    def generate_occurrences(self, range_start, range_end, today, occurrence_map=None):
        """One entry per checking period overlapping [range_start, range_end],
        each with its computed status/dot color.

        `date` is the period's start date (also its storage key). A period
        is COMPLETED/FAILED once a check is recorded in it; PENDING (i.e.
        missed) only after the period has ended unchecked; a period that is
        still open and unchecked, or hasn't begun, is UPCOMING -- it can't
        be counted as missed yet, because it can still be checked.

        occurrence_map, if given, maps occurrence_date -> RegisterOccurrence
        (see `fetch_occurrence_maps`) so callers can batch-load records for
        many registers in one query instead of one query per register.
        """
        if self.start_date is None:
            return []

        if occurrence_map is None:
            occurrence_map = fetch_occurrence_maps([self], range_start, range_end)[self.id]
        by_period = index_rows_by_period(self.cycle, occurrence_map.values())

        results = []
        for p_start, p_end in self.periods_in_range(range_start, range_end):
            row = by_period.get(p_start)
            is_open = p_start <= today <= p_end
            # The due date frozen on the stored check wins over the one
            # derived from today's cycle, so history never moves if the
            # register's cycle is edited later. Due = the period's first day.
            due = row.due_date if (row is not None and row.due_date) else p_start
            info = describe_check(row, due, today, p_end)

            results.append({
                'date': p_start,
                'period_start': p_start,
                'period_end': p_end,
                'due_date': due,
                'check_outcome': info['outcome'],
                'check_timing': info['check_timing'],
                'checked_at_unknown': info['checked_at_unknown'],
                'is_open': is_open,
                'status': info['computed_status'],
                'dot_color': info['dot_color'],
                'occurrence_id': row.id if row is not None else None,
                # When the check was recorded (None if unchecked).
                'completed_at': info['checked_at'],
                'checked_at': info['checked_at'],
            })

        return results

    def current_check(self, today, occurrence=None):
        """The check state of the CURRENT period, from the shared classifier:
        {outcome, computed_status, dot_color, checked_at, checked_at_unknown,
        check_timing, due_date, period_start, period_end}, or None before the
        register has started. `occurrence` is the row for the current period
        (see `fetch_current_cycle_occurrences`)."""
        period = self.current_period(today)
        if period is None:
            return None
        row = occurrence if (occurrence is not None and occurrence.status in CHECKED_STATUSES) else None
        due = row.due_date if (row is not None and row.due_date) else period[0]
        info = describe_check(row, due, today, period[1])
        info.update({'due_date': due, 'period_start': period[0], 'period_end': period[1]})
        return info

    def effective_today_status(self, today, occurrence=None):
        """(status, computed_status, dot_color, current_due) for the
        register's CURRENT checking period -- `occurrence`, if given, should
        be the row for that period (see `fetch_current_cycle_occurrences`).

        `status` comes only from a check recorded in the current period, so
        it returns to IDLE by itself when a new period starts. `current_due`
        is the current period's start date. An unchecked current period is
        still open (it can be checked until it ends), so it is UPCOMING/gray,
        never yellow: yellow only ever means Checked After Due Date.
        """
        info = self.current_check(today, occurrence)
        if info is None:
            return 'IDLE', 'UPCOMING', OUTCOME_DOT_COLOR[CHECK_UPCOMING], None
        status = occurrence.status if (occurrence is not None and occurrence.status in CHECKED_STATUSES) else 'IDLE'
        return status, info['computed_status'], info['dot_color'], info['period_start']

    # ------------------------------------------------------------------

    def to_dict(self, today=None, occurrence=_UNSET):
        if today is None:
            today = school_today()

        period = self.current_period(today)
        if occurrence is _UNSET:
            # Caller didn't pre-fetch this register's current-period row.
            occurrence = fetch_current_cycle_occurrences([self], today).get(self.id)

        status, computed_status, dot_color, current_due = self.effective_today_status(today, occurrence)
        current = self.current_check(today, occurrence)

        checked = period is not None and status in CHECKED_STATUSES
        if period is None:
            can_check = False
            block_reason = f'Checking starts on {self.start_date.isoformat()}.' if self.start_date else None
        elif checked:
            can_check = False
            block_reason = f'Already checked for this {period_label(self.cycle)}.'
        else:
            can_check = True
            block_reason = None

        return {
            'id': self.id,
            'name': self.name,
            'register_no': self.register_no,
            'head_id': self.head_id,
            'head_name': self.head_name,
            'checking_cycle': self.cycle,
            'cycle': self.cycle,
            'priority': self.priority,
            'status': status,
            'computed_status': computed_status,
            'dot_color': dot_color,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'next_due_date': self.next_due_date.isoformat() if self.next_due_date else None,
            'current_due_date': current_due.isoformat() if current_due else None,
            # Check state of the current period (all from the shared classifier):
            # when it was ACTUALLY checked, how that compares with the due date.
            'current_checked_at': (
                iso_utc(current['checked_at']) if current and current['checked_at'] else None
            ),
            'current_checked_at_unknown': bool(current and current['checked_at_unknown']),
            'current_check_outcome': current['outcome'] if current else None,
            'current_check_timing': current['check_timing'] if current else None,
            'current_period_start': period[0].isoformat() if period else None,
            'current_period_end': period[1].isoformat() if period else None,
            'checked_in_current_period': checked,
            'can_check': can_check,
            'check_block_reason': block_reason,
            'last_completed_date': self.last_completed_date.isoformat() if self.last_completed_date else None,
            'created_by': self.created_by,
            'created_by_name': self.creator.name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class RegisterOccurrence(db.Model):
    __tablename__ = 'register_occurrences'
    __table_args__ = (
        db.UniqueConstraint('register_id', 'occurrence_date', name='uq_register_occurrence_date'),
    )

    id = db.Column(db.Integer, primary_key=True)
    register_id = db.Column(db.Integer, db.ForeignKey('registers.id', ondelete='CASCADE'), nullable=False, index=True)
    occurrence_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default='IDLE')
    # Scheduled due date of this period (its first day, the scheduled check date). Set once, when the row
    # is first written, and never overwritten -- a late check must not replace it.
    due_date = db.Column(db.Date, nullable=True)
    completed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    # The ACTUAL moment the register was checked (checked_at). Kept apart from
    # due_date so "on time" vs "after due date" can always be told.
    completed_at = db.Column(db.DateTime, nullable=True)

    completer = db.relationship('User', foreign_keys=[completed_by])

    def to_dict(self, today=None):
        today = today or school_today()
        due = self.due_date or self.occurrence_date
        # The window end is not stored; a single-row view only needs it for the
        # unchecked case, where `today` against the due date is the best it has.
        info = describe_check(self, due, today, due)

        return {
            'id': self.id,
            'register_id': self.register_id,
            'occurrence_date': self.occurrence_date.isoformat() if self.occurrence_date else None,
            'status': self.status,
            'computed_status': info['computed_status'],
            'dot_color': info['dot_color'],
            'check_outcome': info['outcome'],
            'check_timing': info['check_timing'],
            'checked_at_unknown': info['checked_at_unknown'],
            'due_date': due.isoformat() if due else None,
            'completed_by': self.completed_by,
            'completed_at': iso_utc(self.completed_at),
            'checked_at': iso_utc(self.completed_at),
        }
