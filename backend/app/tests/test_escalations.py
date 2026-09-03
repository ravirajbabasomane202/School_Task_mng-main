"""
Backend route tests — Escalation job
"""

import datetime

import pytest


class TestEscalationRunEndpoint:
    """Tests for POST /api/escalations/run."""

    def test_requires_auth(self, client):
        resp = client.post('/api/escalations/run', json={})
        assert resp.status_code == 401

    def test_forbidden_for_regular(self, client, auth_headers):
        resp = client.post(
            '/api/escalations/run',
            json={'hours_threshold': 48},
            headers=auth_headers['regular'],
        )
        assert resp.status_code == 403

    def test_director_can_run(self, client, auth_headers):
        resp = client.post(
            '/api/escalations/run',
            json={'hours_threshold': 48},
            headers=auth_headers['director'],
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True

    def test_chairman_can_run(self, client, auth_headers):
        resp = client.post(
            '/api/escalations/run',
            json={'hours_threshold': 48},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 200


class TestEscalationJobLogic:
    """Direct unit tests against run_escalation_job()."""

    def test_no_escalation_when_none_due(self, client, auth_headers, department, app_context):  # noqa: F811
        from app.tasks.escalation import run_escalation_job
        count = run_escalation_job(hours_threshold=48)
        assert count == 0

    def test_overdue_pending_task_is_escalated(
        self, client, auth_headers, department, app_context
    ):
        from datetime import datetime, timezone, timedelta
        from app.extensions import db
        from app.models.task import Task, TaskHistory

        # Create a task that is 72 h overdue (PENDING)
        overdue = Task(
            title='Overdue Pending Task',
            description='Should be escalated',
            status='PENDING',
            priority='HIGH',
            assigned_to=1,
            department_id=department.id,
            created_by=1,
            due_date=datetime.now(timezone.utc) - timedelta(hours=72),
        )
        db.session.add(overdue)
        db.session.commit()

        from app.tasks.escalation import run_escalation_job
        count = run_escalation_job(hours_threshold=48)
        assert count == 1

        # Status changed
        assert db.session.get(Task, overdue.id).status == 'ESCALATED'
        # History record created
        histories = TaskHistory.query.filter_by(task_id=overdue.id, status='ESCALATED').all()
        assert len(histories) == 1

    def test_completed_task_never_escalated(
        self, client, auth_headers, department, app_context
    ):
        from datetime import datetime, timezone, timedelta
        from app.extensions import db
        from app.models.task import Task, TaskHistory

        completed = Task(
            title='Completed Task',
            description='Already done',
            status='COMPLETED',
            priority='LOW',
            assigned_to=1,
            department_id=department.id,
            created_by=1,
            due_date=datetime.now(timezone.utc) - timedelta(hours=72),
        )
        db.session.add(completed)
        db.session.commit()

        from app.tasks.escalation import run_escalation_job
        count = run_escalation_job(hours_threshold=48)

        assert count == 0
        assert db.session.get(Task, completed.id).status == 'COMPLETED'

    def test_rerun_is_idempotent(self, client, auth_headers, department, app_context):
        from datetime import datetime, timezone, timedelta
        from app.extensions import db
        from app.models.task import Task

        overdue = Task(
            title='Already Escalated Task',
            description='Rerun test',
            status='ESCALATED',
            priority='HIGH',
            assigned_to=1,
            department_id=department.id,
            created_by=1,
            due_date=datetime.now(timezone.utc) - timedelta(hours=72),
        )
        db.session.add(overdue)
        db.session.commit()

        from app.tasks.escalation import run_escalation_job
        count = run_escalation_job(hours_threshold=48)

        assert count == 0  # idempotent — no additional escalation
