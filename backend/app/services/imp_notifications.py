"""Business logic for Important (recurring) Notifications.

Everything that changes a cycle goes through this module so the routes, the
scheduler and the tests share one implementation of the recurrence rules.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.imp_notification import (
    IMP_REMINDER_TYPE,
    ImpNotification,
    ImpNotificationCycle,
    ImpNotificationReminder,
    next_due_date_after,
)
from app.models.notification import Notification
from app.models.user import User
from app.utils.timezone import school_today


class ImpNotificationError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _new_cycle(notification, index, due_date):
    cycle = ImpNotificationCycle(
        notification=notification,
        cycle_index=index,
        due_date=due_date,
        notify_from=due_date - timedelta(days=notification.lead_days),
        status='PENDING',
    )
    db.session.add(cycle)
    return cycle


def start_first_cycle(notification):
    """Create cycle 0 for a brand-new notification."""
    return _new_cycle(notification, 0, notification.due_date)


def complete_cycle(notification, user, today=None):
    """Mark the current cycle Done and schedule the next one.

    * stores completed date + completed-by (history is never rewritten),
    * One Time: nothing further is scheduled - it stops permanently,
    * recurring: the next cycle is created now, strictly in the future, so the
      next cycle's reminders can only start after this one is closed.
    Returns (done_cycle, next_cycle_or_None).
    """
    today = today or school_today()
    cycle = notification.current_cycle()
    if cycle is None:
        raise ImpNotificationError('Notification has no active cycle', 409)
    if cycle.status == 'DONE':
        raise ImpNotificationError('This cycle is already marked Done', 409)

    cycle.status = 'DONE'
    cycle.completed_at = datetime.now(timezone.utc)
    cycle.completed_by = user.id if user else None

    # Reminders for a finished cycle are noise: clear them from inboxes.
    Notification.query.filter(
        Notification.imp_notification_id == notification.id,
        Notification.type == IMP_REMINDER_TYPE,
        Notification.is_read.is_(False),
    ).update({'is_read': True}, synchronize_session=False)

    next_cycle = None
    next_due = next_due_date_after(cycle.due_date, notification.recurrence, notification.due_date.day, today)
    if next_due is not None:
        next_cycle = _new_cycle(notification, cycle.cycle_index + 1, next_due)
    return cycle, next_cycle


def set_cycle_status(notification, new_status, user, today=None):
    """PENDING <-> IN_PROGRESS, or DONE (via complete_cycle)."""
    cycle = notification.current_cycle()
    if cycle is None:
        raise ImpNotificationError('Notification has no active cycle', 409)
    if new_status == 'DONE':
        return complete_cycle(notification, user, today)
    if cycle.status == 'DONE':
        raise ImpNotificationError('A completed cycle cannot be reopened', 409)
    cycle.status = new_status
    return cycle, None


def apply_schedule_change(notification, today=None):
    """Re-sync the current cycle after due date / start date / recurrence edits."""
    today = today or school_today()
    cycle = notification.current_cycle()
    if cycle is None:
        start_first_cycle(notification)
        return
    if cycle.status != 'DONE':
        cycle.due_date = notification.due_date
        cycle.notify_from = notification.due_date - timedelta(days=notification.lead_days)
    elif notification.recurrence != 'ONE_TIME':
        # A finished One Time notification turned into a recurring one.
        due = next_due_date_after(cycle.due_date, notification.recurrence, notification.due_date.day, today)
        _new_cycle(notification, cycle.cycle_index + 1, due)


def _reminder_message(notification, cycle, today):
    due_text = cycle.due_date.strftime('%d %b %Y')
    prefix = f'[{notification.priority.title()}] Imp Notification "{notification.title}"'
    if today < cycle.due_date:
        days = (cycle.due_date - today).days
        return 'UPCOMING', f'{prefix} is due on {due_text} (in {days} day{"s" if days != 1 else ""}).'
    if today == cycle.due_date:
        return 'DUE', f'{prefix} is due today ({due_text}). Please complete it.'
    days = (today - cycle.due_date).days
    return 'OVERDUE', (
        f'{prefix} is overdue by {days} day{"s" if days != 1 else ""} (was due {due_text}). '
        'You will be reminded daily until it is marked Done.'
    )


def send_cycle_reminder(notification, cycle, today):
    """Send at most ONE reminder for `cycle` on `today`. Returns the list of
    Notification rows created (empty when skipped).

    De-duplication is enforced by the database: the reminder-log row with
    UNIQUE (cycle_id, reminder_date) is inserted first, so a concurrent run
    (second worker, manual trigger) fails the insert and sends nothing.
    """
    if not notification.is_active or cycle.status == 'DONE' or today < cycle.notify_from:
        return []
    if today < cycle.due_date and cycle.has_upcoming_reminder():
        return []  # before the due date: one heads-up only, then wait for the due day

    kind, message = _reminder_message(notification, cycle, today)
    recipients = sorted(notification.assigned_user_id_set())
    users = (
        User.query.filter(User.id.in_(recipients), User.is_active.is_(True)).all() if recipients else []
    )
    if not users:
        return []

    try:
        with db.session.begin_nested():
            db.session.add(ImpNotificationReminder(
                cycle_id=cycle.id, reminder_date=today, kind=kind, recipient_count=len(users)
            ))
            db.session.flush()
    except IntegrityError:
        return []

    created = []
    for user in users:
        notif = Notification(
            user_id=user.id, type=IMP_REMINDER_TYPE, message=message,
            imp_notification_id=notification.id,
        )
        db.session.add(notif)
        created.append(notif)
    return created


def run_imp_reminders(today=None):
    """Scheduler entry point (also exposed via CLI / manual endpoint).

    Idempotent: running it any number of times on the same day sends each
    eligible cycle's reminder exactly once. Returns the number of
    Notification rows created.
    """
    today = today or school_today()
    cycles = (
        ImpNotificationCycle.query
        .join(ImpNotification, ImpNotification.id == ImpNotificationCycle.notification_id)
        .filter(
            ImpNotification.is_active.is_(True),
            ImpNotificationCycle.status != 'DONE',
            ImpNotificationCycle.notify_from <= today,
        )
        .all()
    )
    sent = []
    for cycle in cycles:
        try:
            sent.extend(send_cycle_reminder(cycle.notification, cycle, today))
            db.session.commit()
        except Exception:  # one bad row must not stop the rest of the sweep
            db.session.rollback()
            from flask import current_app
            current_app.logger.exception('Imp reminder failed for cycle %s', cycle.id)
    try:
        from app.sockets.emitter import emit_notification
        for notif in sent:
            emit_notification(notif.user_id, notif.to_dict())
    except Exception:  # realtime push is best-effort; the inbox row is saved
        pass
    return len(sent)
