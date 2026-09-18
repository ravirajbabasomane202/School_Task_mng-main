from datetime import datetime, timedelta, timezone

from app.extensions import db

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


def fetch_current_cycle_occurrences(registers, today):
    """Batch-fetch each register's own current-cycle RegisterOccurrence row
    (one query total) instead of one query per register."""
    wanted = {}
    for r in registers:
        due = r.current_cycle_occurrence_date(today)
        if due is not None:
            wanted[r.id] = due
    if not wanted:
        return {}

    rows = RegisterOccurrence.query.filter(
        RegisterOccurrence.register_id.in_(wanted.keys())
    ).all()

    result = {}
    for row in rows:
        due = wanted.get(row.register_id)
        if due is not None and row.occurrence_date == due:
            result[row.register_id] = row
    return result


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
    # Cyclic due-date logic
    # ------------------------------------------------------------------

    def current_cycle_occurrence_date(self, today):
        """Return the exact scheduled date for the current cycle.

        DAILY registers are due every day after the start date. For every
        other cycle, the first due date is ``start_date + cycle`` and each
        later due date is another cycle step. If an older due date was
        missed, move the *displayed* due date forward to the first scheduled
        date on/after today; this prevents the Update Status action from
        remaining enabled indefinitely after a missed cycle.

        The returned date is therefore either today's date (when the cycle
        is actually due), a future scheduled date (button disabled), or None
        before the register starts.
        """
        if self.start_date is None or self.start_date > today:
            return None
        if self.cycle == 'DAILY':
            return today

        due = self.next_due_date or calculate_next_due_date(self.start_date, self.cycle)
        if due is None:
            return None

        # Never let a stale next_due_date make a missed weekly/monthly/etc.
        # cycle look editable on a random later date. Find the next scheduled
        # occurrence on or after today.
        guard = 0
        while due < today:
            due = _advance(due, self.cycle)
            guard += 1
            if guard > 10000:
                break
        return due

    def generate_occurrences(self, range_start, range_end, today, occurrence_map=None):
        """Every cyclic occurrence date within [range_start, range_end],
        each with its computed status/dot color.

        occurrence_map, if given, maps occurrence_date -> RegisterOccurrence
        (a pre-fetched slice for this register) so callers can batch-load
        records for many registers in one query instead of one query per
        register here.
        """
        if self.start_date is None:
            return []

        if occurrence_map is None:
            rows = RegisterOccurrence.query.filter(
                RegisterOccurrence.register_id == self.id,
                RegisterOccurrence.occurrence_date >= range_start,
                RegisterOccurrence.occurrence_date <= range_end,
            ).all()
            occurrence_map = {row.occurrence_date: row for row in rows}

        results = []
        current = self.start_date
        # Fast-forward to the first cycle date at/after range_start without
        # emitting anything before it.
        guard = 0
        while current < range_start:
            current = _advance(current, self.cycle)
            guard += 1
            if guard > 10000:
                break

        while current <= range_end:
            occ = occurrence_map.get(current)
            if occ is not None and occ.status == 'OK':
                computed_status, dot_color = 'COMPLETED', 'green'
            elif occ is not None and occ.status == 'REJECTED':
                computed_status, dot_color = 'FAILED', 'red'
            elif current > today:
                computed_status, dot_color = 'UPCOMING', 'gray'
            else:
                computed_status, dot_color = 'PENDING', 'yellow'

            results.append({
                'date': current,
                'status': computed_status,
                'dot_color': dot_color,
                'occurrence_id': occ.id if occ is not None else None,
            })
            current = _advance(current, self.cycle)

        return results

    def effective_today_status(self, today, occurrence=None):
        """(status, computed_status, dot_color, current_due) as shown to
        the user for the register's current cycle -- `occurrence`, if
        given, should be the RegisterOccurrence row at
        `current_cycle_occurrence_date(today)` (see
        `fetch_current_cycle_occurrences`)."""
        current_due = self.current_cycle_occurrence_date(today)

        if occurrence is not None and current_due is not None and occurrence.occurrence_date == current_due:
            status = occurrence.status
        else:
            status = self.status

        if status == 'OK':
            computed_status, dot_color = 'COMPLETED', 'green'
        elif status == 'REJECTED':
            computed_status, dot_color = 'FAILED', 'red'
        elif current_due is not None:
            computed_status, dot_color = 'PENDING', 'yellow'
        else:
            computed_status, dot_color = 'UPCOMING', 'gray'

        return status, computed_status, dot_color, current_due

    # ------------------------------------------------------------------

    def to_dict(self, today=None, occurrence=None):
        if today is None:
            today = datetime.now(timezone.utc).date()

        status, computed_status, dot_color, current_due = self.effective_today_status(today, occurrence)

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
    completed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    completer = db.relationship('User', foreign_keys=[completed_by])

    def to_dict(self):
        if self.status == 'OK':
            computed_status, dot_color = 'COMPLETED', 'green'
        elif self.status == 'REJECTED':
            computed_status, dot_color = 'FAILED', 'red'
        else:
            computed_status, dot_color = 'PENDING', 'yellow'

        return {
            'id': self.id,
            'register_id': self.register_id,
            'occurrence_date': self.occurrence_date.isoformat() if self.occurrence_date else None,
            'status': self.status,
            'computed_status': computed_status,
            'dot_color': dot_color,
            'completed_by': self.completed_by,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }
