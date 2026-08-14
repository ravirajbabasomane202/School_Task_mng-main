import calendar
from datetime import datetime, timezone, date, timedelta

from app.extensions import db

CYCLES = ['DAILY', 'WEEKLY', '15_DAYS', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']
PRIORITIES = ['HIGH', 'MEDIUM', 'LOW']
STATUSES = ['IDLE', 'OK', 'REJECTED']


def _add_months(base: date, months: int) -> date:
    """Add calendar months to a date, clamping the day to the target month's length."""
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def calculate_next_due_date(from_date, cycle: str):
    """Return the next due date after `from_date` for the given cycle."""
    if isinstance(from_date, datetime):
        from_date = from_date.date()

    cycle = (cycle or '').upper()
    if cycle == 'DAILY':
        return from_date + timedelta(days=1)
    if cycle == 'WEEKLY':
        return from_date + timedelta(days=7)
    if cycle == '15_DAYS':
        return from_date + timedelta(days=15)
    if cycle == 'MONTHLY':
        return _add_months(from_date, 1)
    if cycle == 'QUARTERLY':
        return _add_months(from_date, 3)
    if cycle == 'HALF_YEARLY':
        return _add_months(from_date, 6)
    if cycle == 'YEARLY':
        return _add_months(from_date, 12)
    # Fallback: treat unknown cycles like monthly
    return _add_months(from_date, 1)


class RegisterOccurrence(db.Model):
    """A single dated occurrence of a recurring Register's cycle.

    THIS TABLE IS THE FIX for the "editing one occurrence updates several"
    bug: previously a Register's recurring calendar had NO per-occurrence
    identity at all -- `generate_occurrences()` derived every dot's color
    purely from the single shared `Register.next_due_date` field, so
    completing one occurrence (which advances `next_due_date`) retroactively
    flipped every earlier occurrence to green too.

    Each row here is uniquely identified by (register_id, occurrence_date)
    and stores that ONE occurrence's status independently of the others and
    independently of the parent Register's own `status`/`next_due_date`
    (which now only represent the series-level defaults used by "Edit
    Entire Series" / by occurrences that have never been individually
    touched).
    """
    __tablename__ = 'register_occurrences'
    __table_args__ = (
        db.UniqueConstraint('register_id', 'occurrence_date', name='uq_register_occurrence_date'),
    )

    id = db.Column(db.Integer, primary_key=True)
    register_id = db.Column(db.Integer, db.ForeignKey('registers.id', ondelete='CASCADE'), nullable=False, index=True)
    occurrence_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False)  # OK, REJECTED, IDLE
    completed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    completed_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    register = db.relationship('Register', backref=db.backref('occurrences', lazy='dynamic', cascade='all, delete-orphan'))

    def computed_status(self):
        if self.status == 'OK':
            return 'COMPLETED'
        if self.status == 'REJECTED':
            return 'FAILED'
        return 'UPCOMING'

    def dot_color(self):
        return {
            'COMPLETED': 'green',
            'FAILED': 'red',
            'UPCOMING': 'gray',
        }[self.computed_status()]

    def to_dict(self):
        return {
            'id': self.id,
            'register_id': self.register_id,
            'occurrence_date': self.occurrence_date.isoformat(),
            'status': self.status,
            'computed_status': self.computed_status(),
            'dot_color': self.dot_color(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }


class Register(db.Model):
    __tablename__ = 'registers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    register_no = db.Column(db.String(50), nullable=False, unique=True)
    # Head Name is now backed by a Head ID (FK to users). `head_name` is kept as a
    # denormalized display cache so existing readers keep working, but it is derived
    # from the linked user whenever `head_id` is set.
    head_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    head_name = db.Column(db.String(150), nullable=False)
    # NOTE: column name kept as `cycle` for backward compatibility with the existing
    # schema/data; it is exposed to API consumers as `checking_cycle`.
    cycle = db.Column(db.String(20), nullable=False)  # DAILY, WEEKLY, MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY
    priority = db.Column(db.String(10), nullable=False, default='MEDIUM')  # HIGH, MEDIUM, LOW
    status = db.Column(db.String(20), nullable=False, default='IDLE')  # IDLE, OK, REJECTED
    start_date = db.Column(db.Date, nullable=False)
    next_due_date = db.Column(db.Date, nullable=False)
    last_completed_date = db.Column(db.Date, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', foreign_keys=[created_by], lazy='joined')
    head = db.relationship('User', foreign_keys=[head_id], lazy='joined')

    def computed_status(self, today=None):
        """Derive the live status instead of relying solely on the stored `status`.

        - OK / REJECTED are explicit outcomes recorded for the current period.
        - IDLE + due date already passed  -> PENDING (auto-detected, not stored)
        - IDLE + due date still in future -> UPCOMING
        """
        today = today or date.today()
        if self.status == 'OK':
            return 'COMPLETED'
        if self.status == 'REJECTED':
            return 'FAILED'
        if self.next_due_date and self.next_due_date < today:
            return 'PENDING'
        return 'UPCOMING'

    def dot_color(self, today=None):
        return {
            'COMPLETED': 'green',
            'PENDING': 'yellow',
            'FAILED': 'red',
            'UPCOMING': 'gray',
        }[self.computed_status(today)]

    def generate_occurrences(self, range_start, range_end, today=None, occurrence_map=None):
        """Project the full recurring series for this register's Checking Cycle
        across [range_start, range_end], instead of surfacing only the single
        stored `next_due_date`.

        Each projected date is a distinct occurrence with its OWN identity and
        its OWN status, resolved independently as follows:
        - if a `RegisterOccurrence` row exists for that exact date, THAT row's
          status is authoritative (this is what "Edit This Occurrence" writes,
          and it never touches any other date's row);
        - otherwise, the date matching the register's current `next_due_date`
          mirrors the register's own live computed status (PENDING/COMPLETED/
          FAILED/UPCOMING) -- this is the series-level default;
        - otherwise, a past/overdue date with no record is PENDING/yellow
          (nobody has completed it yet -- it is NOT assumed to be green just
          because a *later* date was completed), and a future date is
          UPCOMING/gray.

        `occurrence_map` may be passed in as a pre-fetched
        `{date: RegisterOccurrence}` dict to avoid N+1 queries when projecting
        many registers at once (see `calendar_events`); if omitted it is
        loaded here for just this register.
        """
        today = today or date.today()
        if not self.start_date or not self.next_due_date or not range_start or not range_end:
            return []
        if range_end < range_start:
            return []

        if occurrence_map is None:
            occurrence_map = {
                occ.occurrence_date: occ
                for occ in RegisterOccurrence.query.filter(
                    RegisterOccurrence.register_id == self.id,
                    RegisterOccurrence.occurrence_date >= range_start,
                    RegisterOccurrence.occurrence_date <= range_end,
                ).all()
            }

        occurrences = []
        cursor = self.start_date
        # Bounded walk (guards against pathological ranges with a DAILY cycle).
        for _ in range(5000):
            if cursor > range_end:
                break
            if cursor >= range_start:
                record = occurrence_map.get(cursor)
                if record is not None:
                    # This exact occurrence was individually edited/completed --
                    # its own record wins, regardless of the series' next_due_date.
                    status, color, occurrence_id = record.computed_status(), record.dot_color(), record.id
                elif cursor == self.next_due_date:
                    status, color, occurrence_id = self.computed_status(today), self.dot_color(today), None
                elif cursor < today:
                    status, color, occurrence_id = 'PENDING', 'yellow', None
                else:
                    status, color, occurrence_id = 'UPCOMING', 'gray', None
                occurrences.append({
                    'date': cursor,
                    'status': status,
                    'dot_color': color,
                    'occurrence_id': occurrence_id,
                })
            cursor = calculate_next_due_date(cursor, self.cycle)

        return occurrences

    def effective_today_status(self, today=None, occurrence=None):
        """Return (status, computed_status, dot_color) for "today" specifically.

        The list/detail views show a single Status badge per register, and
        the only thing that is ever updated now is TODAY's occurrence (see
        `update_occurrence_status`) -- so that badge must reflect today's
        `RegisterOccurrence` row when one exists, not the register's own
        stale `status` column (which nothing writes to anymore once "Edit
        Entire Series" was removed from the UI). Falls back to the
        register-level computed status when today has no occurrence record
        yet (e.g. a WEEKLY register on a day that isn't due).
        """
        today = today or date.today()
        if occurrence is not None and occurrence.occurrence_date == today:
            return occurrence.status, occurrence.computed_status(), occurrence.dot_color()
        return self.status, self.computed_status(today), self.dot_color(today)

    def to_dict(self, today=None, occurrence=None):
        today = today or date.today()
        status, computed_status, dot_color = self.effective_today_status(today, occurrence)
        return {
            'id': self.id,
            'name': self.name,
            'register_no': self.register_no,
            'head_id': self.head_id,
            'head_name': self.head.name if self.head else self.head_name,
            'checking_cycle': self.cycle,
            'cycle': self.cycle,  # deprecated alias, kept for backward compatibility
            'priority': self.priority,
            'status': status,
            'computed_status': computed_status,
            'dot_color': dot_color,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'next_due_date': self.next_due_date.isoformat() if self.next_due_date else None,
            'last_completed_date': self.last_completed_date.isoformat() if self.last_completed_date else None,
            'created_by': self.created_by,
            'created_by_name': self.creator.name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
