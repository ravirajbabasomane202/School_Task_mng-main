"""
Task status rules: assigner vs assignee.

* Assigner (task.assigned_by) may set any of the 5 statuses.
* Assignee (task.assigned_to) may set only IN_PROGRESS / COMPLETED, and may not
  touch a task that is already COMPLETED or ESCALATED.
* Anyone else (even a Director) cannot change status.
* PENDING / DELAYED are system statuses; DELAYED is applied automatically when overdue.
"""

from datetime import datetime, timedelta, timezone

import pytest

ALL_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED']


def _uid(email):
    from app.models.user import User
    return User.query.filter_by(email=email).first().id


@pytest.fixture
def users(auth_headers, app_context):
    """ids: chairman = assigner, regular = assignee, director = unrelated user."""
    return {
        'assigner': _uid('chairman-test@school.test'),
        'assignee': _uid('regular-test@school.test'),
        'other': _uid('director-test@school.test'),
    }


@pytest.fixture
def make_task(users, department):
    from app.extensions import db
    from app.models.task import Task

    def _make(status='PENDING', proof=True, due_in_hours=24, **kwargs):
        task = Task(
            title='Status rules task',
            assigned_by=users['assigner'],
            assigned_to=users['assignee'],
            department_id=department.id,
            priority='HIGH',
            status=status,
            due_date=datetime.now(timezone.utc) + timedelta(hours=due_in_hours),
            proof_path='uploads/tasks/0/proof.pdf' if proof else None,
            **kwargs,
        )
        db.session.add(task)
        db.session.commit()
        return task.id

    return _make


def _set_status(client, headers, task_id, status, endpoint='status'):
    if endpoint == 'status':
        return client.put(f'/api/tasks/{task_id}/status', json={'status': status}, headers=headers)
    return client.put(f'/api/tasks/{task_id}', json={'status': status}, headers=headers)


def _current_status(task_id):
    from app.extensions import db
    from app.models.task import Task
    db.session.expire_all()
    return db.session.get(Task, task_id).status


ENDPOINTS = ['status', 'put']


class TestAssignerRights:
    @pytest.mark.parametrize('endpoint', ENDPOINTS)
    @pytest.mark.parametrize('new_status', ALL_STATUSES)
    def test_assigner_can_set_every_status(self, client, auth_headers, make_task, endpoint, new_status):
        # Start from a status different from the target
        start = 'IN_PROGRESS' if new_status != 'IN_PROGRESS' else 'PENDING'
        task_id = make_task(status=start)
        resp = _set_status(client, auth_headers['chairman'], task_id, new_status, endpoint)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert _current_status(task_id) == new_status

    def test_assigner_can_change_a_completed_or_escalated_task(self, client, auth_headers, make_task):
        for locked in ('COMPLETED', 'ESCALATED'):
            task_id = make_task(status=locked)
            resp = _set_status(client, auth_headers['chairman'], task_id, 'IN_PROGRESS')
            assert resp.status_code == 200

    def test_assigner_completed_still_needs_proof(self, client, auth_headers, make_task):
        task_id = make_task(status='IN_PROGRESS', proof=False)
        resp = _set_status(client, auth_headers['chairman'], task_id, 'COMPLETED')
        assert resp.status_code == 400
        assert 'Proof of completion' in resp.get_json()['message']

    def test_escalated_only_by_assigner(self, client, auth_headers, make_task):
        task_id = make_task(status='IN_PROGRESS')
        assert _set_status(client, auth_headers['regular'], task_id, 'ESCALATED').status_code == 403
        assert _set_status(client, auth_headers['director'], task_id, 'ESCALATED').status_code == 403
        assert _current_status(task_id) == 'IN_PROGRESS'
        assert _set_status(client, auth_headers['chairman'], task_id, 'ESCALATED').status_code == 200

    def test_no_op_change_is_rejected(self, client, auth_headers, make_task):
        task_id = make_task(status='IN_PROGRESS')
        resp = _set_status(client, auth_headers['chairman'], task_id, 'IN_PROGRESS')
        assert resp.status_code == 400

    def test_invalid_status_is_rejected(self, client, auth_headers, make_task):
        task_id = make_task()
        resp = _set_status(client, auth_headers['chairman'], task_id, 'BOGUS')
        assert resp.status_code == 400


class TestAssigneeRights:
    @pytest.mark.parametrize('endpoint', ENDPOINTS)
    @pytest.mark.parametrize('new_status', ['IN_PROGRESS', 'COMPLETED'])
    def test_assignee_can_set_in_progress_and_completed(
        self, client, auth_headers, make_task, endpoint, new_status
    ):
        start = 'PENDING' if new_status == 'IN_PROGRESS' else 'IN_PROGRESS'
        task_id = make_task(status=start)
        resp = _set_status(client, auth_headers['regular'], task_id, new_status, endpoint)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert _current_status(task_id) == new_status

    @pytest.mark.parametrize('endpoint', ENDPOINTS)
    @pytest.mark.parametrize('new_status', ['DELAYED', 'PENDING', 'ESCALATED'])
    def test_assignee_gets_403_for_system_and_escalated(
        self, client, auth_headers, make_task, endpoint, new_status
    ):
        task_id = make_task(status='IN_PROGRESS')
        resp = _set_status(client, auth_headers['regular'], task_id, new_status, endpoint)
        assert resp.status_code == 403
        assert 'automatically' in resp.get_json()['message']
        assert _current_status(task_id) == 'IN_PROGRESS'

    @pytest.mark.parametrize('new_status', ['IN_PROGRESS', 'COMPLETED'])
    def test_assignee_can_move_delayed_task(self, client, auth_headers, make_task, new_status):
        task_id = make_task(status='DELAYED')
        resp = _set_status(client, auth_headers['regular'], task_id, new_status)
        assert resp.status_code == 200
        assert _current_status(task_id) == new_status

    @pytest.mark.parametrize('locked', ['COMPLETED', 'ESCALATED'])
    @pytest.mark.parametrize('endpoint', ENDPOINTS)
    def test_assignee_cannot_change_completed_or_escalated(
        self, client, auth_headers, make_task, locked, endpoint
    ):
        task_id = make_task(status=locked)
        resp = _set_status(client, auth_headers['regular'], task_id, 'IN_PROGRESS', endpoint)
        assert resp.status_code == 403
        assert 'assigner' in resp.get_json()['message']
        assert _current_status(task_id) == locked

    @pytest.mark.parametrize('endpoint', ENDPOINTS)
    def test_completed_requires_proof(self, client, auth_headers, make_task, endpoint):
        task_id = make_task(status='IN_PROGRESS', proof=False)
        resp = _set_status(client, auth_headers['regular'], task_id, 'COMPLETED', endpoint)
        assert resp.status_code == 400
        assert 'Proof of completion' in resp.get_json()['message']
        assert _current_status(task_id) == 'IN_PROGRESS'

    def test_assignee_cannot_edit_assigner_only_fields(self, client, auth_headers, make_task):
        task_id = make_task()
        resp = client.put(
            f'/api/tasks/{task_id}',
            json={'title': 'Hijacked', 'priority': 'LOW'},
            headers=auth_headers['regular'],
        )
        assert resp.status_code == 200
        from app.extensions import db
        from app.models.task import Task
        db.session.expire_all()
        task = db.session.get(Task, task_id)
        assert task.title == 'Status rules task'
        assert task.priority == 'HIGH'


class TestOtherUsersViewOnly:
    @pytest.mark.parametrize('endpoint', ENDPOINTS)
    @pytest.mark.parametrize('new_status', ALL_STATUSES)
    def test_non_assigner_director_gets_403(self, client, auth_headers, make_task, endpoint, new_status):
        task_id = make_task(status='IN_PROGRESS')
        resp = _set_status(client, auth_headers['director'], task_id, new_status, endpoint)
        assert resp.status_code == 403
        assert _current_status(task_id) == 'IN_PROGRESS'

    def test_unrelated_non_elevated_user_gets_403(self, client, auth_headers, make_task):
        task_id = make_task(status='IN_PROGRESS')
        resp = _set_status(client, auth_headers['finance'], task_id, 'COMPLETED')
        assert resp.status_code == 403

    def test_director_cannot_edit_fields(self, client, auth_headers, make_task):
        task_id = make_task()
        resp = client.put(f'/api/tasks/{task_id}', json={'title': 'x'}, headers=auth_headers['director'])
        assert resp.status_code == 403


class TestStatusNotifications:
    def _notified(self, task_id):
        from app.models.notification import Notification
        return {n.user_id for n in Notification.query.filter_by(task_id=task_id).all()}

    def test_assigner_change_notifies_assignee_only(self, client, auth_headers, make_task, users):
        task_id = make_task(status='PENDING')
        assert _set_status(client, auth_headers['chairman'], task_id, 'IN_PROGRESS').status_code == 200
        assert self._notified(task_id) == {users['assignee']}

    def test_assignee_change_notifies_assigner_only(self, client, auth_headers, make_task, users):
        task_id = make_task(status='PENDING')
        assert _set_status(client, auth_headers['regular'], task_id, 'IN_PROGRESS').status_code == 200
        assert self._notified(task_id) == {users['assigner']}

    def test_history_row_records_actor(self, client, auth_headers, make_task, users):
        from app.models.task import TaskHistory
        task_id = make_task(status='PENDING')
        _set_status(client, auth_headers['chairman'], task_id, 'ESCALATED')
        row = TaskHistory.query.filter_by(task_id=task_id).one()
        assert (row.old_status, row.new_status, row.updated_by) == ('PENDING', 'ESCALATED', users['assigner'])


class TestAutoDelayed:
    def test_overdue_task_becomes_delayed_with_history_and_notifications(self, make_task, users):
        from app.models.notification import Notification
        from app.models.task import Task, TaskHistory

        task_id = make_task(status='IN_PROGRESS', due_in_hours=-2)
        assert Task.mark_overdue_delayed() >= 1
        assert _current_status(task_id) == 'DELAYED'

        row = TaskHistory.query.filter_by(task_id=task_id).one()
        assert row.old_status == 'IN_PROGRESS'
        assert row.new_status == 'DELAYED'
        assert row.updated_by == users['assigner']
        assert row.comment == 'Auto-marked delayed: due date passed'

        notified = {n.user_id for n in Notification.query.filter_by(task_id=task_id, type='TASK_DELAYED')}
        assert notified == {users['assignee'], users['assigner']}

    def test_not_overdue_and_terminal_tasks_untouched(self, make_task):
        from app.models.task import Task
        future = make_task(status='PENDING', due_in_hours=5)
        done = make_task(status='COMPLETED', due_in_hours=-5)
        escalated = make_task(status='ESCALATED', due_in_hours=-5)
        Task.mark_overdue_delayed()
        assert _current_status(future) == 'PENDING'
        assert _current_status(done) == 'COMPLETED'
        assert _current_status(escalated) == 'ESCALATED'

    def test_get_route_triggers_auto_delay(self, client, auth_headers, make_task):
        task_id = make_task(status='PENDING', due_in_hours=-3)
        assert client.get(f'/api/tasks/{task_id}', headers=auth_headers['chairman']).status_code == 200
        assert _current_status(task_id) == 'DELAYED'
