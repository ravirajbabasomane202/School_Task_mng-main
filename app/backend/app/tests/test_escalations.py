"""
Backend route tests - Overdue reminder ("escalation") job.

ESCALATED is the assigner's decision, so the job must never change a task's status; it only
sends the assigner a one-time "overdue by N hours, consider escalating" notification.
"""

from datetime import datetime, timedelta, timezone

import pytest


def _uid(email):
    from app.models.user import User
    return User.query.filter_by(email=email).first().id


@pytest.fixture
def make_overdue(auth_headers, department, app_context):
    from app.extensions import db
    from app.models.task import Task

    def _make(status='PENDING', hours_overdue=72, due_date='default'):
        due = datetime.now(timezone.utc) - timedelta(hours=hours_overdue) if due_date == 'default' else due_date
        task = Task(
            title=f'Overdue {status}',
            status=status,
            priority='HIGH',
            assigned_by=_uid('chairman-test@school.test'),
            assigned_to=_uid('regular-test@school.test'),
            department_id=department.id,
            due_date=due,
        )
        db.session.add(task)
        db.session.commit()
        return task.id

    return _make


def _status(task_id):
    from app.extensions import db
    from app.models.task import Task
    db.session.expire_all()
    return db.session.get(Task, task_id).status


def _reminders(task_id):
    from app.models.notification import Notification
    return Notification.query.filter_by(task_id=task_id, type='TASK_OVERDUE').all()


class TestEscalationRunEndpoint:
    """Tests for POST /api/escalations/run."""

    def test_requires_auth(self, client):
        resp = client.post('/api/escalations/run', json={})
        assert resp.status_code == 401

    def test_forbidden_for_regular(self, client, auth_headers):
        resp = client.post('/api/escalations/run', json={'hours_threshold': 48}, headers=auth_headers['regular'])
        assert resp.status_code == 403

    def test_director_can_run(self, client, auth_headers):
        resp = client.post('/api/escalations/run', json={'hours_threshold': 48}, headers=auth_headers['director'])
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_chairman_can_run(self, client, auth_headers):
        resp = client.post('/api/escalations/run', json={'hours_threshold': 48}, headers=auth_headers['chairman'])
        assert resp.status_code == 200

    def test_endpoint_uses_single_job_and_never_changes_status(self, client, auth_headers, make_overdue):
        task_id = make_overdue(status='IN_PROGRESS')
        resp = client.post('/api/escalations/run', json={'hours_threshold': 48}, headers=auth_headers['chairman'])
        assert resp.status_code == 200
        body = resp.get_json()['data']
        assert body['notified_count'] >= 1
        assert body['escalated_count'] == 0
        assert _status(task_id) == 'IN_PROGRESS'
        assert len(_reminders(task_id)) == 1

    def test_endpoint_accepts_empty_body(self, client, auth_headers):
        resp = client.post('/api/escalations/run', headers=auth_headers['chairman'])
        assert resp.status_code == 200

    def test_duplicated_job_logic_is_gone(self):
        import app.routes.escalations as mod
        assert not hasattr(mod, '_run_escalation_job')


class TestEscalationJobLogic:
    """Direct unit tests against run_escalation_job()."""

    def test_job_does_not_change_status(self, make_overdue):
        from app.tasks.escalation import run_escalation_job
        ids = {s: make_overdue(status=s) for s in ('PENDING', 'IN_PROGRESS', 'DELAYED')}
        run_escalation_job(hours_threshold=48)
        for status, task_id in ids.items():
            assert _status(task_id) == status

    @pytest.mark.parametrize('status', ['PENDING', 'IN_PROGRESS', 'DELAYED'])
    def test_assigner_gets_one_reminder(self, make_overdue, status):
        from app.tasks.escalation import run_escalation_job
        task_id = make_overdue(status=status, hours_overdue=72)
        run_escalation_job(hours_threshold=48)

        reminders = _reminders(task_id)
        assert len(reminders) == 1
        assert reminders[0].user_id == _uid('chairman-test@school.test')
        assert 'overdue by 72 hours' in reminders[0].message
        assert 'consider escalating' in reminders[0].message

    def test_rerun_does_not_duplicate_reminders(self, make_overdue):
        from app.tasks.escalation import run_escalation_job
        task_id = make_overdue(status='DELAYED')
        run_escalation_job(hours_threshold=48)
        run_escalation_job(hours_threshold=48)
        assert len(_reminders(task_id)) == 1

    def test_under_threshold_is_ignored(self, make_overdue):
        from app.tasks.escalation import run_escalation_job
        task_id = make_overdue(status='DELAYED', hours_overdue=10)
        run_escalation_job(hours_threshold=48)
        assert _reminders(task_id) == []

    def test_completed_and_escalated_tasks_ignored(self, make_overdue):
        from app.tasks.escalation import run_escalation_job
        done = make_overdue(status='COMPLETED')
        esc = make_overdue(status='ESCALATED')
        run_escalation_job(hours_threshold=48)
        assert _reminders(done) == [] and _reminders(esc) == []
        assert _status(done) == 'COMPLETED' and _status(esc) == 'ESCALATED'

    def test_task_without_due_date_ignored(self, make_overdue):
        from app.tasks.escalation import run_escalation_job
        task_id = make_overdue(status='PENDING', due_date=None)
        run_escalation_job(hours_threshold=48)
        assert _reminders(task_id) == []
        assert _status(task_id) == 'PENDING'

    def test_returns_number_of_new_reminders(self, make_overdue):
        from app.tasks.escalation import run_escalation_job
        run_escalation_job(hours_threshold=48)  # flush earlier leftovers
        make_overdue(status='PENDING')
        make_overdue(status='DELAYED')
        assert run_escalation_job(hours_threshold=48) == 2
        assert run_escalation_job(hours_threshold=48) == 0
