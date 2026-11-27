"""In-app notifications for the academic event workflow.

Everything here is idempotent: an event that has already been reported as
overdue (``overdue_notified_at``) is never reported again until it is
rescheduled, so it is safe to call from the hourly scheduler *and* lazily when
a user opens the calendar/dashboard (so it works even with the scheduler off).
"""
from datetime import datetime, timezone

from app.extensions import db
from app.models.academic_event import COMPLETION_PENDING, AcademicEvent
from app.models.notification import Notification
from app.utils.timezone import school_now, school_today

EVENT_OVERDUE_TYPE = 'EVENT_OVERDUE'
EVENT_ASSIGNED_TYPE = 'EVENT_ASSIGNED'
EVENT_APPROVAL_TYPE = 'EVENT_APPROVAL'


def _notify(user_id, type_, message):
    db.session.add(Notification(user_id=user_id, type=type_, message=message))


def notify_assigned(event, actor_id=None):
    if event.responsible_user_id and event.responsible_user_id != actor_id:
        _notify(
            event.responsible_user_id,
            EVENT_ASSIGNED_TYPE,
            f'You are responsible for the academic event "{event.title}" '
            f'scheduled on {event.start_date.strftime("%d %b %Y")}.',
        )


def notify_approval_changed(event, actor_id=None):
    if event.responsible_user_id and event.responsible_user_id != actor_id:
        _notify(
            event.responsible_user_id,
            EVENT_APPROVAL_TYPE,
            f'Management approval for "{event.title}" is now '
            f'{event.approval_status.title()}.',
        )


def notify_overdue_events(responsible_user_id=None):
    """Tell responsible persons that an update is required. Returns the count."""
    query = AcademicEvent.query.filter(
        AcademicEvent.responsible_user_id.isnot(None),
        AcademicEvent.completion_status == COMPLETION_PENDING,
        AcademicEvent.overdue_notified_at.is_(None),
        AcademicEvent.end_date <= school_today(),  # cheap SQL prefilter; exact check below
    )
    if responsible_user_id is not None:
        query = query.filter(AcademicEvent.responsible_user_id == responsible_user_id)

    sent = 0
    now = datetime.now(timezone.utc)
    for event in query.all():
        if not event.is_overdue:
            continue
        _notify(
            event.responsible_user_id,
            EVENT_OVERDUE_TYPE,
            f'Update required: the academic event "{event.title}" was scheduled for '
            f'{event.end_date.strftime("%d %b %Y")} and is not marked completed. '
            'Please submit the reason or mark it completed.',
        )
        event.overdue_notified_at = now
        sent += 1
    if sent:
        db.session.commit()
    return sent


def pending_updates_for(user_id):
    """Events this user is responsible for that are overdue and not completed."""
    events = AcademicEvent.query.filter(
        AcademicEvent.responsible_user_id == user_id,
        AcademicEvent.completion_status == COMPLETION_PENDING,
        AcademicEvent.end_date <= school_today(),
    ).order_by(AcademicEvent.end_date.asc(), AcademicEvent.end_time.asc()).all()
    return [event for event in events if event.is_overdue]
