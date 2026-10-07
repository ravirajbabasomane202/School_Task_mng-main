"""
Escalation worker - standalone, callable without a request context.

Usage
-----
Manual trigger (wired to POST /api/escalations/run):
    from app.tasks.escalation import run_escalation_job
    notified = run_escalation_job(hours_threshold=48)

Scheduled via APScheduler (ENABLE_SCHEDULER=true) - see app/__init__.py.

Design
------
ESCALATED is the assigner's decision, so this job **never changes a task's status**.
It only reminds the assigner that a task is overdue so they can consider escalating it.

* Candidates: PENDING / IN_PROGRESS / DELAYED tasks whose ``due_date`` is more than
  ``hours_threshold`` hours in the past. (DELAYED is included because overdue tasks are
  moved to DELAYED automatically, long before the threshold is reached.)
* One notification per task, ever (type ``TASK_OVERDUE``) - re-running is a no-op.
* Completed / already-ESCALATED tasks are ignored.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

from app.extensions import db
from app.models.task import Task
from app.models.notification import Notification
from app.sockets.emitter import emit_notification

OVERDUE_NOTIFICATION_TYPE = 'TASK_OVERDUE'


def run_escalation_job(hours_threshold: int = 48) -> int:
    """Notify assigners about tasks overdue by more than ``hours_threshold`` hours.

    Returns the number of new notifications sent (0 on a re-run). Task statuses are
    never modified.
    """
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(hours=hours_threshold)

    overdue_tasks = Task.query.filter(
        Task.status.in_(['PENDING', 'IN_PROGRESS', 'DELAYED']),
        Task.due_date.isnot(None),
        Task.due_date < threshold,
    ).all()

    already_notified = {
        task_id
        for (task_id,) in db.session.query(Notification.task_id).filter(
            Notification.type == OVERDUE_NOTIFICATION_TYPE,
            Notification.task_id.in_([t.id for t in overdue_tasks]),
        )
    } if overdue_tasks else set()

    sent = []
    for task in overdue_tasks:
        if task.id in already_notified or not task.assigned_by:
            continue

        due = task.due_date if task.due_date.tzinfo else task.due_date.replace(tzinfo=timezone.utc)
        hours_over = int((now - due).total_seconds() // 3600)
        notif = Notification(
            user_id=task.assigned_by,
            type=OVERDUE_NOTIFICATION_TYPE,
            message=f'Task "{task.title}" is overdue by {hours_over} hours - consider escalating.',
            task_id=task.id,
        )
        db.session.add(notif)
        sent.append(notif)

    db.session.commit()
    for notif in sent:
        emit_notification(notif.user_id, notif.to_dict())
    return len(sent)
