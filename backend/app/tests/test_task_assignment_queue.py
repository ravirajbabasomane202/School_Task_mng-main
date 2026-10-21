"""
Assignment Queue (Task Assignment screen) — create / list / reassign / delete rules.

Covers the bugs found while reviewing the queue:
  * create accepted any priority/cadence, unparseable or missing dates (stored as NULL),
    inactive or non-numeric assignees (500), and silently created duplicate assignments
  * list filters crashed (500) on non-numeric ids and `to=<date>` dropped tasks due that day
  * LIKE wildcards in `search` matched everything
  * reassigning a task never told the new assignee
  * extending the due date of an auto-DELAYED task left it stuck on DELAYED
  * deleting a task that had notifications
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.task_catalog import TASK_CATALOG


_TASK_SELECTIONS = [
    (headline, sub_task)
    for headline, sub_tasks in TASK_CATALOG.items()
    for sub_task in sub_tasks
]
_TASK_MARKER_SELECTIONS = {}

@pytest.fixture(autouse=True)
def _fresh_session(app):
    """These tests read ORM objects through the same session the HTTP requests use.
    conftest's `auth_headers` resets seeded users' passwords in a *different*
    session, so drop anything cached here before and after each test or a later
    test's login would be checked against a stale password hash."""
    from app.extensions import db
    db.session.rollback()
    db.session.expire_all()
    yield
    db.session.rollback()
    db.session.expire_all()


def _uid(email):
    from app.models.user import User
    return User.query.filter_by(email=email).first().id


@pytest.fixture
def ids(auth_headers, app_context):
    return {
        'chairman': _uid('chairman-test@school.test'),
        'hr': _uid('hr-test@school.test'),
        'finance': _uid('finance-test@school.test'),
        'it': _uid('it-test@school.test'),
    }


def _payload(ids, **overrides):
    marker = overrides.pop('title', None)
    if marker is not None:
        marker_key = str(marker).strip().lower()
        if marker_key not in _TASK_MARKER_SELECTIONS:
            _TASK_MARKER_SELECTIONS[marker_key] = _TASK_SELECTIONS[
                len(_TASK_MARKER_SELECTIONS) % len(_TASK_SELECTIONS)
            ]
        headline, sub_task = _TASK_MARKER_SELECTIONS[marker_key]
    else:
        headline, sub_task = _TASK_SELECTIONS[0]
    body = {
        'task_headline': headline,
        'sub_task': sub_task,
        'assigned_to': ids['hr'],
        'priority': 'MEDIUM',
        'cadence': 'DAILY',
        'start_date': '2030-01-01',
        'due_date': '2030-01-05',
    }
    body.update(overrides)
    return body


def _create(client, headers, body):
    return client.post('/api/tasks', json=body, headers=headers)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

class TestCreateTask:
    def test_happy_path(self, client, auth_headers, ids):
        resp = _create(client, auth_headers['chairman'], _payload(ids, title='Happy path'))
        assert resp.status_code == 201
        data = resp.get_json()['data']
        assert data['status'] == 'PENDING'
        assert data['assigned_to'] == ids['hr']
        assert data['priority'] == 'MEDIUM' and data['cadence'] == 'DAILY'

    def test_multipart_string_assignee_is_accepted(self, client, auth_headers, ids):
        """The frontend sends multipart/form-data, where every value is a string."""
        form = {k: str(v) for k, v in _payload(ids, title='Multipart').items()}
        resp = client.post('/api/tasks', data=form, headers=auth_headers['chairman'],
                           content_type='multipart/form-data')
        assert resp.status_code == 201
        assert resp.get_json()['data']['assigned_to'] == ids['hr']

    def test_only_chairman_can_create(self, client, auth_headers, ids):
        assert _create(client, auth_headers['hr'], _payload(ids)).status_code == 403
        assert _create(client, auth_headers['director'], _payload(ids)).status_code == 403

    @pytest.mark.parametrize('field', ['task_headline', 'sub_task', 'assigned_to', 'priority', 'start_date', 'due_date'])
    def test_missing_required_field(self, client, auth_headers, ids, field):
        body = _payload(ids)
        body.pop(field)
        assert _create(client, auth_headers['chairman'], body).status_code == 400

    def test_blank_sub_task_rejected(self, client, auth_headers, ids):
        assert _create(client, auth_headers['chairman'], _payload(ids, sub_task='   ')).status_code == 400

    def test_legacy_title_payload_is_rejected(self, client, auth_headers, ids):
        body = _payload(ids)
        body['title'] = 'Legacy title'
        assert _create(client, auth_headers['chairman'], body).status_code == 400

    def test_sub_task_must_belong_to_selected_headline(self, client, auth_headers, ids):
        body = _payload(ids, task_headline='Finance Head', sub_task='Create Yearly Academic Plan')
        assert _create(client, auth_headers['chairman'], body).status_code == 400

    def test_non_numeric_assignee_is_400_not_500(self, client, auth_headers, ids):
        resp = _create(client, auth_headers['chairman'], _payload(ids, assigned_to='abc'))
        assert resp.status_code == 400

    def test_unknown_assignee_is_404(self, client, auth_headers, ids):
        assert _create(client, auth_headers['chairman'], _payload(ids, assigned_to=999999)).status_code == 404

    def test_inactive_assignee_rejected(self, client, auth_headers, ids, app):
        from app.extensions import db
        from app.models.user import User
        user = db.session.get(User, ids['finance'])
        user.is_active = False
        db.session.commit()
        try:
            resp = _create(client, auth_headers['chairman'], _payload(ids, assigned_to=ids['finance']))
            assert resp.status_code == 400
            assert 'inactive' in resp.get_json()['message'].lower()
        finally:
            user.is_active = True
            db.session.commit()

    @pytest.mark.parametrize('field,value', [('priority', 'URGENT'), ('cadence', 'YEARLY')])
    def test_invalid_enum_values_rejected(self, client, auth_headers, ids, field, value):
        assert _create(client, auth_headers['chairman'], _payload(ids, **{field: value})).status_code == 400

    @pytest.mark.parametrize('field', ['start_date', 'due_date'])
    def test_unparseable_dates_rejected(self, client, auth_headers, ids, field):
        assert _create(client, auth_headers['chairman'], _payload(ids, **{field: 'not-a-date'})).status_code == 400

    def test_due_before_start_rejected(self, client, auth_headers, ids):
        resp = _create(client, auth_headers['chairman'], _payload(ids, start_date='2030-02-10', due_date='2030-02-01'))
        assert resp.status_code == 400

    def test_unknown_department_rejected(self, client, auth_headers, ids):
        assert _create(client, auth_headers['chairman'], _payload(ids, department_id=999999)).status_code == 400

    def test_creating_notifies_assignee(self, client, auth_headers, ids):
        from app.models.notification import Notification
        resp = _create(client, auth_headers['chairman'], _payload(ids, title='Notify me'))
        task_id = resp.get_json()['data']['id']
        notif = Notification.query.filter_by(task_id=task_id, user_id=ids['hr'], type='TASK_ASSIGNED').first()
        assert notif is not None


class TestDuplicateAssignments:
    def test_exact_duplicate_is_409(self, client, auth_headers, ids):
        body = _payload(ids, title='Dup check')
        assert _create(client, auth_headers['chairman'], body).status_code == 201
        resp = _create(client, auth_headers['chairman'], body)
        assert resp.status_code == 409
        assert resp.get_json()['success'] is False

    def test_title_match_is_case_and_space_insensitive(self, client, auth_headers, ids):
        assert _create(client, auth_headers['chairman'], _payload(ids, title='Case Dup')).status_code == 201
        assert _create(client, auth_headers['chairman'], _payload(ids, title='  case dup ')).status_code == 409

    def test_same_title_other_assignee_is_allowed(self, client, auth_headers, ids):
        assert _create(client, auth_headers['chairman'], _payload(ids, title='Shared')).status_code == 201
        assert _create(client, auth_headers['chairman'], _payload(ids, title='Shared', assigned_to=ids['it'])).status_code == 201

    def test_same_title_other_dates_is_allowed(self, client, auth_headers, ids):
        """Recurring work (the same duty every week) is not a duplicate."""
        assert _create(client, auth_headers['chairman'], _payload(ids, title='Weekly')).status_code == 201
        later = _payload(ids, title='Weekly', start_date='2030-03-01', due_date='2030-03-07')
        assert _create(client, auth_headers['chairman'], later).status_code == 201

    def test_completed_task_does_not_block_reassigning(self, client, auth_headers, ids):
        from app.extensions import db
        from app.models.task import Task
        first = _create(client, auth_headers['chairman'], _payload(ids, title='Redo me')).get_json()['data']['id']
        task = db.session.get(Task, first)
        task.status = 'COMPLETED'
        db.session.commit()
        assert _create(client, auth_headers['chairman'], _payload(ids, title='Redo me')).status_code == 201


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

class TestListTasks:
    @pytest.mark.parametrize('param', ['department_id', 'assigned_to'])
    def test_non_numeric_id_filter_is_400_not_500(self, client, auth_headers, param):
        resp = client.get(f'/api/tasks?{param}=abc', headers=auth_headers['chairman'])
        assert resp.status_code == 400

    @pytest.mark.parametrize('param', ['from', 'to'])
    def test_bad_date_filter_is_400(self, client, auth_headers, param):
        assert client.get(f'/api/tasks?{param}=yesterday', headers=auth_headers['chairman']).status_code == 400

    def test_to_filter_includes_tasks_due_that_day(self, client, auth_headers, ids):
        task_id = _create(client, auth_headers['chairman'],
                          _payload(ids, title='Due on the 5th', start_date='2031-05-01', due_date='2031-05-05')
                          ).get_json()['data']['id']
        listed = client.get('/api/tasks?from=2031-05-05&to=2031-05-05', headers=auth_headers['chairman']).get_json()['data']
        assert task_id in [t['id'] for t in listed]
        before = client.get('/api/tasks?to=2031-05-04', headers=auth_headers['chairman']).get_json()['data']
        assert task_id not in [t['id'] for t in before]

    def test_status_filter_accepts_a_comma_list(self, client, auth_headers, ids):
        created = _create(client, auth_headers['chairman'], _payload(ids, title='Open one')).get_json()['data']['id']
        listed = client.get('/api/tasks?status=PENDING,IN_PROGRESS,DELAYED,ESCALATED',
                            headers=auth_headers['chairman']).get_json()['data']
        assert created in [t['id'] for t in listed]
        assert all(t['status'] != 'COMPLETED' for t in listed)

    def test_search_wildcards_match_literally(self, client, auth_headers, ids):
        _create(client, auth_headers['chairman'], _payload(ids, title='Collect 50% fees'))
        _create(client, auth_headers['chairman'], _payload(ids, title='Collect fees'))
        hits = client.get('/api/tasks?search=%25', headers=auth_headers['chairman']).get_json()['data']
        assert hits == []

    def test_newest_first_with_stable_order(self, client, auth_headers, ids):
        a = _create(client, auth_headers['chairman'], _payload(ids, title='Order A')).get_json()['data']['id']
        b = _create(client, auth_headers['chairman'], _payload(ids, title='Order B')).get_json()['data']['id']
        listed = [t['id'] for t in client.get('/api/tasks', headers=auth_headers['chairman']).get_json()['data']]
        assert listed.index(b) < listed.index(a)


# ---------------------------------------------------------------------------
# Update / reassign
# ---------------------------------------------------------------------------

class TestReassign:
    def _task(self, client, auth_headers, ids, **kw):
        return _create(client, auth_headers['chairman'], _payload(ids, **kw)).get_json()['data']['id']

    def test_reassign_notifies_new_and_old_assignee_and_logs_history(self, client, auth_headers, ids):
        from app.models.notification import Notification
        from app.models.task import TaskHistory
        task_id = self._task(client, auth_headers, ids, title='Move me')
        resp = client.put(f'/api/tasks/{task_id}', json={'assigned_to': ids['it']}, headers=auth_headers['chairman'])
        assert resp.status_code == 200
        assert resp.get_json()['data']['assigned_to'] == ids['it']
        assert Notification.query.filter_by(task_id=task_id, user_id=ids['it'], type='TASK_ASSIGNED').count() == 1
        assert Notification.query.filter_by(task_id=task_id, user_id=ids['hr'], type='TASK_UPDATED').count() == 1
        assert TaskHistory.query.filter(TaskHistory.task_id == task_id,
                                        TaskHistory.comment.like('Reassigned%')).count() == 1

    def test_reassign_to_unknown_user_rejected_and_task_unchanged(self, client, auth_headers, ids):
        task_id = self._task(client, auth_headers, ids, title='Stay put')
        resp = client.put(f'/api/tasks/{task_id}', json={'assigned_to': 999999}, headers=auth_headers['chairman'])
        assert resp.status_code == 404
        got = client.get(f'/api/tasks/{task_id}', headers=auth_headers['chairman']).get_json()['data']
        assert got['assigned_to'] == ids['hr']

    def test_reassign_non_numeric_is_400(self, client, auth_headers, ids):
        task_id = self._task(client, auth_headers, ids, title='Bad id')
        resp = client.put(f'/api/tasks/{task_id}', json={'assigned_to': 'abc'}, headers=auth_headers['chairman'])
        assert resp.status_code == 400

    def test_reassign_into_an_existing_duplicate_is_409(self, client, auth_headers, ids):
        self._task(client, auth_headers, ids, title='Clash', assigned_to=ids['it'])
        task_id = self._task(client, auth_headers, ids, title='Clash')
        resp = client.put(f'/api/tasks/{task_id}', json={'assigned_to': ids['it']}, headers=auth_headers['chairman'])
        assert resp.status_code == 409

    def test_saving_a_task_unchanged_is_not_a_duplicate_of_itself(self, client, auth_headers, ids):
        task_id = self._task(client, auth_headers, ids, title='Self')
        resp = client.put(f'/api/tasks/{task_id}', json=_payload(ids, title='Self'), headers=auth_headers['chairman'])
        assert resp.status_code == 200

    def test_task_selection_can_be_updated_as_a_valid_pair(self, client, auth_headers, ids):
        task_id = self._task(client, auth_headers, ids, title='Change selection')
        resp = client.put(
            f'/api/tasks/{task_id}',
            json={'task_headline': 'HR Head', 'sub_task': 'Training'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert data['task_headline'] == 'HR Head'
        assert data['sub_task'] == 'Training'

    def test_invalid_task_selection_update_does_not_change_task(self, client, auth_headers, ids):
        task_id = self._task(client, auth_headers, ids, title='Keep selection')
        resp = client.put(
            f'/api/tasks/{task_id}',
            json={'task_headline': 'Finance Head', 'sub_task': 'Create Yearly Academic Plan'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 400
        data = client.get(f'/api/tasks/{task_id}', headers=auth_headers['chairman']).get_json()['data']
        assert data['task_headline'] == _payload(ids, title='Keep selection')['task_headline']

    def test_invalid_priority_and_dates_rejected_on_update(self, client, auth_headers, ids):
        task_id = self._task(client, auth_headers, ids, title='Edit checks')
        h = auth_headers['chairman']
        assert client.put(f'/api/tasks/{task_id}', json={'priority': 'URGENT'}, headers=h).status_code == 400
        assert client.put(f'/api/tasks/{task_id}', json={'due_date': 'nope'}, headers=h).status_code == 400
        assert client.put(f'/api/tasks/{task_id}', json={'due_date': '2000-01-01'}, headers=h).status_code == 400


class TestExtendingDueDateRevivesDelayedTask:
    def test_delayed_task_goes_back_when_due_date_moves_into_the_future(self, client, auth_headers, ids):
        from app.extensions import db
        from app.models.task import Task, TaskHistory
        task_id = _create(client, auth_headers['chairman'],
                          _payload(ids, title='Late one', start_date='2020-01-01', due_date='2020-01-05')
                          ).get_json()['data']['id']
        task = db.session.get(Task, task_id)
        task.status = 'DELAYED'
        db.session.add(TaskHistory(task_id=task_id, updated_by=ids['chairman'],
                                   old_status='IN_PROGRESS', new_status='DELAYED', comment='auto'))
        db.session.commit()

        new_due = (datetime.now(timezone.utc) + timedelta(days=10)).strftime('%Y-%m-%d')
        resp = client.put(f'/api/tasks/{task_id}', json={'due_date': new_due}, headers=auth_headers['chairman'])
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'IN_PROGRESS'

    def test_delayed_task_stays_delayed_when_still_overdue(self, client, auth_headers, ids):
        from app.extensions import db
        from app.models.task import Task
        task_id = _create(client, auth_headers['chairman'],
                          _payload(ids, title='Still late', start_date='2020-01-01', due_date='2020-01-05')
                          ).get_json()['data']['id']
        task = db.session.get(Task, task_id)
        task.status = 'DELAYED'
        db.session.commit()
        resp = client.put(f'/api/tasks/{task_id}', json={'due_date': '2020-02-01'}, headers=auth_headers['chairman'])
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'DELAYED'


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

class TestDeleteTask:
    def test_delete_with_notifications_and_history(self, client, auth_headers, ids):
        from app.extensions import db
        from app.models.notification import Notification
        from app.models.task import Task, TaskHistory
        created = _create(client, auth_headers['chairman'], _payload(ids, title='Delete me')).get_json()['data']
        task_id = created['id']
        assert Notification.query.filter_by(task_id=task_id).count() >= 1

        resp = client.delete(f'/api/tasks/{task_id}', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        assert resp.get_json()['data'] == {'id': task_id}
        db.session.expire_all()
        assert db.session.get(Task, task_id) is None
        assert TaskHistory.query.filter_by(task_id=task_id).count() == 0
        # notifications are kept, just detached from the deleted task
        assert Notification.query.filter_by(task_id=task_id).count() == 0
        assert Notification.query.filter(Notification.message.like(f"%{created['sub_task']}%"),
                                         Notification.task_id.is_(None)).count() >= 1

    def test_only_chairman_or_director_can_delete(self, client, auth_headers, ids):
        task_id = _create(client, auth_headers['chairman'], _payload(ids, title='Protected')).get_json()['data']['id']
        assert client.delete(f'/api/tasks/{task_id}', headers=auth_headers['hr']).status_code == 403

    def test_unknown_task_is_404(self, client, auth_headers):
        assert client.delete('/api/tasks/999999', headers=auth_headers['chairman']).status_code == 404
