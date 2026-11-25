"""Important (recurring) notifications.

Design
------
* ``ImpNotification``      ONE configuration row per recurring activity
  (title, recurrence, priority, assignees ...). Never duplicated per day.
* ``ImpNotificationCycle`` ONE row per recurrence cycle (the due date of that
  cycle, its status, who completed it and when). This is the history.
* ``ImpNotificationReminder`` one row per (cycle, calendar day) a reminder was
  sent. Its UNIQUE (cycle_id, reminder_date) constraint is the database-level
  guarantee that a cycle is reminded at most once per day, even if the
  scheduler and a manual run (or two workers) race.

Each next due date steps from the previous cycle but lands on the ANCHOR day
(``ImpNotification.due_date.day``) whenever the month allows it, so 31 Jan
monthly gives 28/29 Feb then 31 Mar again, and 29 Feb yearly gives 28 Feb in
common years and 29 Feb again in the next leap year.
"""
from datetime import datetime, timedelta, timezone

from app.extensions import db

RECURRENCES = ('ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')
PRIORITIES = ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
STATUSES = ('PENDING', 'IN_PROGRESS', 'DONE')

IMP_REMINDER_TYPE = 'IMP_REMINDER'


def _add_months_anchored(base, months, anchor_day):
    """`base` + `months` calendar months, landing on `anchor_day` where the
    month is long enough and on the month's last day otherwise. Using the
    ANCHOR day (not base.day) means 31 Jan -> 28 Feb -> 31 Mar, not 28 Mar."""
    import calendar
    index = base.month - 1 + months
    year = base.year + index // 12
    month = index % 12 + 1
    return base.replace(year=year, month=month, day=min(anchor_day, calendar.monthrange(year, month)[1]))


def advance_due_date(current, recurrence, anchor_day):
    """One recurrence step after `current` (None for One Time)."""
    if recurrence == 'DAILY':
        return current + timedelta(days=1)
    if recurrence == 'WEEKLY':
        return current + timedelta(days=7)
    if recurrence == 'MONTHLY':
        return _add_months_anchored(current, 1, anchor_day)
    if recurrence == 'YEARLY':
        return _add_months_anchored(current, 12, anchor_day)
    return None


def next_due_date_after(current, recurrence, anchor_day, after_date):
    """First recurrence date strictly after BOTH `current` and `after_date`.

    A cycle completed late skips occurrences that are already in the past
    (e.g. a Daily task finished 3 days late resumes tomorrow, rather than
    immediately creating three overdue cycles)."""
    if recurrence == 'ONE_TIME':
        return None
    limit = max(current, after_date)
    due = advance_due_date(current, recurrence, anchor_day)
    while due <= limit:
        due = advance_due_date(due, recurrence, anchor_day)
    return due


class ImpNotification(db.Model):
    __tablename__ = 'imp_notifications'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    # Anchor: the due date as configured; its day-of-month drives later cycles.
    due_date = db.Column(db.Date, nullable=False)
    recurrence = db.Column(db.String(15), nullable=False, default='ONE_TIME')
    start_date = db.Column(db.Date, nullable=False)  # first reminder date
    priority = db.Column(db.String(10), nullable=False, default='MEDIUM')
    assigned_roles = db.Column(db.JSON, nullable=False, default=list)
    assigned_user_ids = db.Column(db.JSON, nullable=False, default=list)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc),
    )

    creator = db.relationship('User', foreign_keys=[created_by])
    cycles = db.relationship(
        'ImpNotificationCycle', back_populates='notification',
        cascade='all, delete-orphan', order_by='ImpNotificationCycle.cycle_index',
    )

    @property
    def lead_days(self):
        """How many days before the due date reminders begin (set by the
        Notification Start Date of the first cycle, reused by later cycles)."""
        return max((self.due_date - self.start_date).days, 0)

    def current_cycle(self):
        """The latest cycle: the one in progress, or the last completed one for
        a finished One Time notification."""
        return self.cycles[-1] if self.cycles else None

    def assigned_user_id_set(self):
        from app.models.user import User
        ids = set(int(i) for i in (self.assigned_user_ids or []))
        roles = list(self.assigned_roles or [])
        if roles:
            ids.update(
                uid for (uid,) in db.session.query(User.id).filter(User.role.in_(roles), User.is_active.is_(True))
            )
        return ids

    def is_assigned_to(self, user):
        if user.id in set(int(i) for i in (self.assigned_user_ids or [])):
            return True
        return user.role in (self.assigned_roles or [])

    def history(self, today):
        """Cycle history incl. the next not-yet-generated cycle ("Upcoming")."""
        rows = [c.to_dict(today) for c in self.cycles]
        last = self.current_cycle()
        if last is not None and last.status != 'DONE' and self.recurrence != 'ONE_TIME':
            due = next_due_date_after(last.due_date, self.recurrence, self.due_date.day, last.due_date)
            rows.append({
                'id': None, 'cycle_index': last.cycle_index + 1, 'cycle_number': last.cycle_index + 2,
                'due_date': due.isoformat(), 'notify_from': None, 'status': 'UPCOMING',
                'completed_at': None, 'completed_by': None, 'completed_by_name': None,
                'is_overdue': False, 'reminder_count': 0,
            })
        return rows

    def to_dict(self, today, user=None, include_history=False):
        from app.models.user import User
        cycle = self.current_cycle()
        assignees = []
        ids = sorted(self.assigned_user_id_set())
        if ids:
            assignees = [
                {'id': u.id, 'name': u.name, 'role': u.role}
                for u in User.query.filter(User.id.in_(ids)).order_by(User.name.asc()).all()
            ]
        data = {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'due_date': self.due_date.isoformat(),
            'start_date': self.start_date.isoformat(),
            'recurrence': self.recurrence,
            'priority': self.priority,
            'assigned_roles': list(self.assigned_roles or []),
            'assigned_user_ids': [int(i) for i in (self.assigned_user_ids or [])],
            'assignees': assignees,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_by_name': self.creator.name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'cycle': cycle.to_dict(today) if cycle else None,
            'current_due_date': cycle.due_date.isoformat() if cycle else self.due_date.isoformat(),
            'status': cycle.status if cycle else 'PENDING',
            'next_reminder': self.next_reminder_date(today),
        }
        if include_history:
            data['history'] = self.history(today)
        return data

    def next_reminder_date(self, today):
        """ISO date of the next reminder, or None when none will be sent."""
        cycle = self.current_cycle()
        if cycle is None or not self.is_active or cycle.status == 'DONE':
            return None
        notify_from = cycle.notify_from
        if today >= cycle.due_date:
            return today.isoformat() if not cycle.reminded_on(today) else (today + timedelta(days=1)).isoformat()
        if cycle.has_upcoming_reminder() or today > notify_from:
            return cycle.due_date.isoformat()
        return max(notify_from, today).isoformat()


class ImpNotificationCycle(db.Model):
    __tablename__ = 'imp_notification_cycles'
    __table_args__ = (
        db.UniqueConstraint('notification_id', 'cycle_index', name='uq_imp_cycle_notification_index'),
    )

    id = db.Column(db.Integer, primary_key=True)
    notification_id = db.Column(
        db.Integer, db.ForeignKey('imp_notifications.id', ondelete='CASCADE'), nullable=False, index=True
    )
    cycle_index = db.Column(db.Integer, nullable=False)  # 0-based cycle counter
    due_date = db.Column(db.Date, nullable=False, index=True)
    notify_from = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(15), nullable=False, default='PENDING')
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    notification = db.relationship('ImpNotification', back_populates='cycles')
    completer = db.relationship('User', foreign_keys=[completed_by])
    reminders = db.relationship('ImpNotificationReminder', back_populates='cycle', cascade='all, delete-orphan')

    def reminded_on(self, day):
        return any(r.reminder_date == day for r in self.reminders)

    def has_upcoming_reminder(self):
        return any(r.kind == 'UPCOMING' for r in self.reminders)

    def to_dict(self, today):
        return {
            'id': self.id,
            'cycle_index': self.cycle_index,
            'cycle_number': self.cycle_index + 1,
            'due_date': self.due_date.isoformat(),
            'notify_from': self.notify_from.isoformat(),
            'status': self.status,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'completed_by': self.completed_by,
            'completed_by_name': self.completer.name if self.completer else None,
            'is_overdue': self.status != 'DONE' and today > self.due_date,
            'reminder_count': len(self.reminders),
        }


class ImpNotificationReminder(db.Model):
    __tablename__ = 'imp_notification_reminders'
    __table_args__ = (
        db.UniqueConstraint('cycle_id', 'reminder_date', name='uq_imp_reminder_cycle_day'),
    )

    id = db.Column(db.Integer, primary_key=True)
    cycle_id = db.Column(
        db.Integer, db.ForeignKey('imp_notification_cycles.id', ondelete='CASCADE'), nullable=False, index=True
    )
    reminder_date = db.Column(db.Date, nullable=False)
    kind = db.Column(db.String(10), nullable=False)  # UPCOMING / DUE / OVERDUE
    recipient_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    cycle = db.relationship('ImpNotificationCycle', back_populates='reminders')
