"""
Escalation worker — standalone, callable without a request context.

Usage
-----
Manual trigger (already wired via POST /api/escalations/run):
    from app.tasks.escalation import run_escalation_job
    escalated = run_escalation_job(hours_threshold=48)

Scheduled via APScheduler (ENABLE_SCHEDULER=true):
    The scheduler hooks should call run_escalation_job() at the configured interval.
    Set ENABLE_SCHEDULER=false (default) until topology is confirmed single-worker.

Design
------
* Only tasks in PENDING / IN_PROGRESS whose due_date (or updated_at fallback)
  exceeds ``hours_threshold`` are escalated.
* Completed / already-ESCALATED tasks are never re-escalated — idempotent.
* A TaskHistory row and a Notification row are created per escalated task.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from app.extensions import db
from app.models.task import Task, TaskHistory
from app.models.notification import Notification
from app.sockets.emitter import emit_notification


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_escalation_job(hours_threshold: int = 48) -> int:
    """Run the escalation sweep and return the number of tasks escalated.

    Parameters
    ----------
    hours_threshold:
        A task is considered overdue when its *due_date* (or, if not set,
        its *updated_at*) is more than this many hours in the past.

    Returns
    -------
    int
        Count of tasks that were newly escalated in this run.
    """
    threshold = datetime.now(timezone.utc) - timedelta(hours=hours_threshold)

    overdue_query = Task.query.filter(
        Task.status.in_(['PENDING', 'IN_PROGRESS']),
        # Use due_date when present; fall back to updated_at
        db.or_(
            Task.due_date < threshold,
            db.and_(Task.due_date.is_(None), Task.updated_at < threshold),
        ),
    )

    overdue_tasks = overdue_query.all()

    escalated = 0
    for task in overdue_tasks:
        # Idempotent guard — already handled
        if task.status == 'ESCALATED':
            continue

        task.status = 'ESCALATED'

        # Find the Chairman user to satisfy the non-nullable updated_by FK.
        # If no Chairman exists yet (e.g. fresh DB), skip this task rather than
        # inserting a NULL into a NOT NULL column and crashing the whole batch.
        from app.models.user import User
        chairman = User.query.filter_by(role='CHAIRMAN').first()
        if not chairman:
            app_logger = __import__('logging').getLogger(__name__)
            app_logger.warning(
                f'[Escalation] Skipping task {task.id}: no CHAIRMAN user found for updated_by FK.'
            )
            task.status = task.status  # revert in-memory change
            db.session.expunge(task)
            db.session.refresh(task)
            continue
        chairman_id = chairman.id

        history = TaskHistory(
            task_id=task.id,
            new_status='ESCALATED',
            updated_by=chairman_id,
            comment=(
                f'Auto-escalated after {hours_threshold} hours overdue '
                f'(due: {task.due_date.isoformat() if task.due_date else "not set"})'
            ),
        )
        db.session.add(history)

        if task.assigned_to:
            notif = Notification(
                user_id=task.assigned_to,
                type='TASK_ESCALATED',
                message=(
                    f'Task "{task.title}" has been auto-escalated due to overdue.'
                ),
                task_id=task.id,
            )
            db.session.add(notif)
            db.session.flush()
            emit_notification(task.assigned_to, notif.to_dict())

        # Fix #14: Also notify the task creator (assigned_by)
        if task.assigned_by and task.assigned_by != task.assigned_to:
            creator_notif = Notification(
                user_id=task.assigned_by,
                type='TASK_ESCALATED',
                message=(
                    f'Task "{task.title}" you assigned has been auto-escalated due to overdue.'
                ),
                task_id=task.id,
            )
            db.session.add(creator_notif)
            db.session.flush()
            emit_notification(task.assigned_by, creator_notif.to_dict())

        db.session.add(task)
        escalated += 1

    db.session.commit()
    return escalated
