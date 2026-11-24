"""
PRINCIPAL holds Chairman-level administrative authority, with one exception:
on a task assigned TO the Principal they are only the assignee.

Covers:
  1. Chairman can use every administrative feature
  2. Principal can use every Chairman-level administrative feature
  3. Chairman can assign a task to the Principal
  4. Principal can update + complete that task (status, comment, proof)
  5. Principal cannot edit the original details of that task
  6. Principal cannot reassign or delete that task
  7. Principal can still manage everyone else's tasks (create/edit/reassign/delete)
  8. Existing roles keep their previous permissions
Plus the safeguards that make Chairman-level power safe to share.
"""

import io
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

HEADLINE = 'Principal Test Headline'
SUBTASKS = ['Principal Sub A', 'Principal Sub B', 'Principal Sub C', 'Principal Sub D']


def _uid(email):
    from app.models.user import User
    return User.query.filter_by(email=email).first().id


@pytest.fixture
def ids(auth_headers, principal_headers, app_context):
    return {
        'chairman': _uid('chairman-test@school.test'),
        'principal': _uid('principal-test@school.test'),
        'teacher': _uid('regular-test@school.test'),   # generic department head
        'director': _uid('director-test@school.test'),
    }


@pytest.fixture(autouse=True)
def _fresh(app):
    from app.extensions import db
    db.session.rollback()
    db.session.expire_all()
    yield
    db.session.rollback()
    db.session.expire_all()


@pytest.fixture
def catalog(app_context):
    from app.extensions import db
    from app.models.task_catalog import TaskHeadline, TaskSubTask
    headline = TaskHeadline.query.filter_by(name=HEADLINE).first()
    if not headline:
        headline = TaskHeadline(name=HEADLINE)
        db.session.add(headline)
        db.session.flush()
        for name in SUBTASKS:
            db.session.add(TaskSubTask(headline_id=headline.id, name=name))
        db.session.commit()
    yield
    # Leave the shared test DB as found: other modules seed the catalog only
    # when it is empty, so a leftover row here would stop them from seeding.
    db.session.rollback()
    TaskHeadline.query.filter_by(name=HEADLINE).delete()
    TaskSubTask.query.filter(TaskSubTask.name.in_(SUBTASKS)).delete(synchronize_session=False)
    db.session.commit()


_counter = {'n': 0}


def _create(client, headers, assigned_to, **overrides):
    """POST /api/tasks with a unique sub-task/date so duplicate detection never fires."""
    _counter['n'] += 1
    start = date.today() + timedelta(days=_counter['n'])
    body = {
        'task_headline': HEADLINE,
        'sub_task': SUBTASKS[_counter['n'] % len(SUBTASKS)],
        'assigned_to': assigned_to,
        'priority': 'MEDIUM',
        'start_date': start.isoformat(),
        'due_date': (start + timedelta(days=30)).isoformat(),
        'description': 'Original description',
    }
    body.update(overrides)
    return client.post('/api/tasks', json=body, headers=headers)


def _task(task_id):
    from app.extensions import db
    from app.models.task import Task
    db.session.expire_all()
    return db.session.get(Task, task_id)


@pytest.fixture
def task_for_principal(client, auth_headers, ids, catalog):
    """A task the Chairman assigned directly to the Principal."""
    resp = _create(client, auth_headers['chairman'], ids['principal'])
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()['data']['id']


@pytest.fixture
def task_for_teacher(client, auth_headers, ids, catalog):
    resp = _create(client, auth_headers['chairman'], ids['teacher'])
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()['data']['id']


def _proof():
    return (io.BytesIO(b'%PDF-1.4 proof'), 'proof.pdf')


# ---------------------------------------------------------------------------
# 1 + 2. Both Chairman and Principal reach every administrative feature
# ---------------------------------------------------------------------------

ADMIN_GETS = [
    '/api/users',
    '/api/roles',
    '/api/departments',
    '/api/approvals',
    '/api/registers',
    '/api/registers/heads',
    '/api/meetings',
    '/api/announcements',
    '/api/leave',
    '/api/leave/resumption',
    '/api/dashboard/chairman',
    '/api/dashboard/performance',
    '/api/dashboard/metrics',
    '/api/dashboard/analytics/HR',
    '/api/tasks',
    '/api/tasks/catalog',
    '/api/recruitment',
    '/api/assets',
    '/api/purchase-orders',
    '/api/salary-increments',
]


@pytest.mark.parametrize('who', ['chairman', 'principal'])
@pytest.mark.parametrize('path', ADMIN_GETS)
def test_admin_read_endpoints(client, auth_headers, principal_headers, who, path):
    headers = auth_headers['chairman'] if who == 'chairman' else principal_headers
    resp = client.get(path, headers=headers)
    assert resp.status_code == 200, (who, path, resp.get_json())


@pytest.mark.parametrize('who', ['chairman', 'principal'])
def test_admin_write_endpoints(client, auth_headers, principal_headers, ids, who):
    headers = auth_headers['chairman'] if who == 'chairman' else principal_headers
    tag = uuid.uuid4().hex[:8]

    # user management
    resp = client.post('/api/users', headers=headers, json={
        'name': f'U {tag}', 'email': f'u-{tag}@school.test', 'password': 'password123', 'role': 'HR'})
    assert resp.status_code == 201, resp.get_json()
    new_id = resp.get_json()['id']
    assert client.put(f'/api/users/{new_id}', headers=headers, json={'name': 'Renamed'}).status_code == 200
    assert client.delete(f'/api/users/{new_id}', headers=headers).status_code == 200

    # roles + departments
    assert client.post('/api/roles', headers=headers, json={'name': f'Role {tag}'}).status_code == 201
    assert client.post('/api/departments', headers=headers, json={'name': f'Dept {tag}'}).status_code == 201

    # registers
    resp = client.post('/api/registers', headers=headers, json={
        'name': 'R', 'register_no': f'REG-{tag}', 'head_name': 'Jane', 'cycle': 'MONTHLY',
        'priority': 'HIGH', 'start_date': date.today().isoformat()})
    assert resp.status_code == 201, resp.get_json()
    reg_id = resp.get_json()['data']['id']
    assert client.delete(f'/api/registers/{reg_id}', headers=headers).status_code == 200

    # meetings + announcements
    resp = client.post('/api/meetings', headers=headers, json={
        'title': 'Staff meeting', 'meeting_date': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()})
    assert resp.status_code in (200, 201), resp.get_json()
    resp = client.post('/api/announcements', headers=headers, json={'message': f'Hello {tag}', 'target': 'ALL'})
    assert resp.status_code in (200, 201), resp.get_json()

    # task catalog
    resp = client.post('/api/tasks/catalog/headlines', headers=headers, json={'name': f'Headline {tag}'})
    assert resp.status_code == 201, resp.get_json()
    hid = resp.get_json()['data']['id']
    assert client.post(f'/api/tasks/catalog/headlines/{hid}/subtasks', headers=headers,
                       json={'name': 'Sub'}).status_code == 201
    assert client.delete(f'/api/tasks/catalog/headlines/{hid}', headers=headers).status_code == 200

    # escalation reminders
    assert client.post('/api/escalations/run', headers=headers, json={}).status_code == 200


@pytest.mark.parametrize('action', ['approve', 'reject', 'process'])
@pytest.mark.parametrize('who', ['chairman', 'principal'])
def test_approvals_can_be_processed(client, auth_headers, principal_headers, who, action):
    headers = auth_headers['chairman'] if who == 'chairman' else principal_headers
    created = client.post('/api/approvals', headers=auth_headers['regular'],
                          json={'type': 'BUDGET', 'title': 'Need money'}).get_json()['data']
    if action == 'process':
        resp = client.put(f"/api/approvals/{created['id']}/process", headers=headers, json={'status': 'APPROVED'})
    else:
        resp = client.put(f"/api/approvals/{created['id']}/{action}", headers=headers)
    assert resp.status_code == 200, resp.get_json()


def test_principal_sees_all_approvals_not_just_own(client, auth_headers, principal_headers):
    client.post('/api/approvals', headers=auth_headers['regular'], json={'type': 'BUDGET', 'title': 'Someone else'})
    resp = client.get('/api/approvals', headers=principal_headers)
    assert any(a['title'] == 'Someone else' for a in resp.get_json()['data'])


# ---------------------------------------------------------------------------
# 3. Chairman assigns a task to the Principal
# ---------------------------------------------------------------------------

def test_chairman_can_assign_task_to_principal(client, auth_headers, ids, catalog):
    resp = _create(client, auth_headers['chairman'], ids['principal'])
    assert resp.status_code == 201
    data = resp.get_json()['data']
    assert data['assigned_to'] == ids['principal'] and data['assigned_by'] == ids['chairman']


def test_principal_sees_task_assigned_to_them(client, principal_headers, task_for_principal):
    resp = client.get(f'/api/tasks/{task_for_principal}', headers=principal_headers)
    assert resp.status_code == 200
    mine = client.get('/api/tasks/my-tasks', headers=principal_headers).get_json()['data']
    assert task_for_principal in [t['id'] for t in mine]


# ---------------------------------------------------------------------------
# 4. Principal works on the task as an assignee
# ---------------------------------------------------------------------------

class TestPrincipalWorksOnAssignedTask:
    def test_can_start_with_comment(self, client, principal_headers, task_for_principal):
        resp = client.put(f'/api/tasks/{task_for_principal}/status', headers=principal_headers,
                          json={'status': 'IN_PROGRESS', 'comment': 'Started work'})
        assert resp.status_code == 200, resp.get_json()
        assert _task(task_for_principal).status == 'IN_PROGRESS'
        history = resp.get_json()['data']['history']
        assert any(h['comment'] == 'Started work' for h in history)

    def test_can_upload_proof_and_complete(self, client, principal_headers, task_for_principal):
        up = client.post(f'/api/tasks/{task_for_principal}/attachment', headers=principal_headers,
                         data={'attachment': _proof()}, content_type='multipart/form-data')
        assert up.status_code == 200, up.get_json()
        done = client.put(f'/api/tasks/{task_for_principal}/status', headers=principal_headers,
                          json={'status': 'COMPLETED', 'comment': 'All done'})
        assert done.status_code == 200, done.get_json()
        task = _task(task_for_principal)
        assert task.status == 'COMPLETED' and task.completed_at is not None

    def test_complete_through_put_with_proof_file(self, client, principal_headers, task_for_principal):
        resp = client.put(f'/api/tasks/{task_for_principal}', headers=principal_headers,
                          data={'status': 'COMPLETED', 'comment': 'Done', 'attachment': _proof()},
                          content_type='multipart/form-data')
        assert resp.status_code == 200, resp.get_json()
        task = _task(task_for_principal)
        assert task.status == 'COMPLETED' and task.proof_path

    def test_proof_never_overwrites_original_brief(self, client, auth_headers, principal_headers, ids, catalog):
        created = _create(client, auth_headers['chairman'], ids['principal'])
        task_id = created.get_json()['data']['id']
        from app.extensions import db
        task = _task(task_id)
        task.attachment_path = 'uploads/tasks/brief-original.pdf'
        db.session.commit()
        client.post(f'/api/tasks/{task_id}/attachment', headers=principal_headers,
                    data={'attachment': _proof()}, content_type='multipart/form-data')
        task = _task(task_id)
        assert task.attachment_path == 'uploads/tasks/brief-original.pdf'
        assert task.proof_path and task.proof_path != task.attachment_path

    def test_assignee_status_limits_still_apply(self, client, principal_headers, task_for_principal):
        client.put(f'/api/tasks/{task_for_principal}/status', headers=principal_headers,
                   json={'status': 'IN_PROGRESS'})
        for status in ('ESCALATED', 'PENDING', 'DELAYED'):
            resp = client.put(f'/api/tasks/{task_for_principal}/status', headers=principal_headers,
                              json={'status': status})
            assert resp.status_code == 403, status

    def test_completion_requires_proof(self, client, principal_headers, task_for_principal):
        resp = client.put(f'/api/tasks/{task_for_principal}/status', headers=principal_headers,
                          json={'status': 'COMPLETED'})
        assert resp.status_code == 400

    def test_chairman_is_notified_of_principal_update(self, client, auth_headers, principal_headers, ids, task_for_principal):
        client.put(f'/api/tasks/{task_for_principal}/status', headers=principal_headers,
                   json={'status': 'IN_PROGRESS'})
        from app.models.notification import Notification
        assert Notification.query.filter_by(
            user_id=ids['chairman'], task_id=task_for_principal, type='TASK_UPDATED').count() >= 1


# ---------------------------------------------------------------------------
# 5. Principal cannot edit the original details
# ---------------------------------------------------------------------------

class TestPrincipalCannotEditOriginalTask:
    @pytest.mark.parametrize('payload', [
        {'description': 'Rewritten by Principal'},
        {'priority': 'LOW'},
        {'due_date': '2099-01-01'},
        {'start_date': '2030-01-01'},
        {'cadence': 'DAILY'},
        {'task_headline': HEADLINE, 'sub_task': 'Principal Sub A'},
        {'department_id': 1},
    ])
    def test_protected_fields_rejected(self, client, principal_headers, auth_headers, ids, catalog, payload):
        # fresh task whose current title is deliberately not "Principal Sub A"
        created = _create(client, auth_headers['chairman'], ids['principal'], sub_task='Principal Sub B')
        task_id = created.get_json()['data']['id']
        before = _task(task_id).to_dict()
        resp = client.put(f'/api/tasks/{task_id}', headers=principal_headers, json=payload)
        if 'sub_task' in payload:
            payload = {'sub_task': 'Principal Sub A', 'task_headline': HEADLINE}
        assert resp.status_code == 403, (payload, resp.get_json())
        after = _task(task_id).to_dict()
        for key in ('description', 'priority', 'due_date', 'start_date', 'cadence',
                    'title', 'task_headline', 'department_id', 'assigned_to', 'assigned_by'):
            assert after[key] == before[key], key

    def test_title_field_still_rejected(self, client, principal_headers, task_for_principal):
        assert client.put(f'/api/tasks/{task_for_principal}', headers=principal_headers,
                          json={'title': 'x'}).status_code == 400

    def test_rejected_edit_does_not_apply_status_change(self, client, principal_headers, task_for_principal):
        resp = client.put(f'/api/tasks/{task_for_principal}', headers=principal_headers,
                          json={'status': 'IN_PROGRESS', 'priority': 'LOW'})
        assert resp.status_code == 403
        assert _task(task_for_principal).status == 'PENDING'

    def test_resending_unchanged_values_with_status_is_allowed(self, client, principal_headers, task_for_principal):
        task = _task(task_for_principal)
        resp = client.put(f'/api/tasks/{task_for_principal}', headers=principal_headers, json={
            'status': 'IN_PROGRESS', 'priority': task.priority, 'description': task.description,
            'assigned_to': task.assigned_to, 'task_headline': task.task_headline, 'sub_task': task.title,
            'due_date': task.due_date.isoformat(), 'start_date': task.start_date.isoformat()})
        assert resp.status_code == 200, resp.get_json()
        assert _task(task_for_principal).status == 'IN_PROGRESS'


# ---------------------------------------------------------------------------
# 6. Principal cannot reassign or delete that task
# ---------------------------------------------------------------------------

class TestPrincipalCannotReassignOrDelete:
    def test_cannot_reassign(self, client, principal_headers, ids, task_for_principal):
        resp = client.put(f'/api/tasks/{task_for_principal}', headers=principal_headers,
                          json={'assigned_to': ids['teacher']})
        assert resp.status_code == 403
        assert _task(task_for_principal).assigned_to == ids['principal']

    def test_cannot_delete(self, client, principal_headers, task_for_principal):
        resp = client.delete(f'/api/tasks/{task_for_principal}', headers=principal_headers)
        assert resp.status_code == 403
        assert _task(task_for_principal) is not None

    def test_cannot_escalate(self, client, principal_headers, task_for_principal):
        assert client.put(f'/api/tasks/{task_for_principal}/status', headers=principal_headers,
                          json={'status': 'ESCALATED'}).status_code == 403

    def test_chairman_can_still_delete_it(self, client, auth_headers, task_for_principal):
        assert client.delete(f'/api/tasks/{task_for_principal}', headers=auth_headers['chairman']).status_code == 200

    def test_chairman_can_still_edit_it(self, client, auth_headers, task_for_principal):
        resp = client.put(f'/api/tasks/{task_for_principal}', headers=auth_headers['chairman'],
                          json={'priority': 'HIGH', 'description': 'Chairman edit'})
        assert resp.status_code == 200
        assert _task(task_for_principal).priority == 'HIGH'

    def test_principal_cannot_self_assign_on_create(self, client, principal_headers, ids, catalog):
        resp = _create(client, principal_headers, ids['principal'])
        assert resp.status_code == 403

    def test_principal_cannot_reassign_another_task_to_self(self, client, principal_headers, ids, task_for_teacher):
        resp = client.put(f'/api/tasks/{task_for_teacher}', headers=principal_headers,
                          json={'assigned_to': ids['principal']})
        assert resp.status_code == 403
        assert _task(task_for_teacher).assigned_to == ids['teacher']

    def test_legacy_self_assigned_task_is_still_assignee_only(self, client, principal_headers, ids, department):
        """Even if old data lists the Principal as both assigner and assignee."""
        from app.extensions import db
        from app.models.task import Task
        task = Task(title='Legacy', assigned_by=ids['principal'], assigned_to=ids['principal'],
                    department_id=department.id, priority='LOW', status='PENDING',
                    due_date=datetime.now(timezone.utc) + timedelta(days=5))
        db.session.add(task)
        db.session.commit()
        assert client.delete(f'/api/tasks/{task.id}', headers=principal_headers).status_code == 403
        assert client.put(f'/api/tasks/{task.id}', headers=principal_headers,
                          json={'priority': 'HIGH'}).status_code == 403


# ---------------------------------------------------------------------------
# 7. Principal still manages other people's tasks
# ---------------------------------------------------------------------------

class TestPrincipalManagesOtherTasks:
    def test_can_create_and_assign_to_staff(self, client, principal_headers, ids, catalog):
        resp = _create(client, principal_headers, ids['teacher'])
        assert resp.status_code == 201, resp.get_json()
        assert resp.get_json()['data']['assigned_by'] == ids['principal']

    def test_can_monitor_all_tasks(self, client, principal_headers, task_for_teacher, task_for_principal):
        listed = {t['id'] for t in client.get('/api/tasks', headers=principal_headers).get_json()['data']}
        assert {task_for_teacher, task_for_principal} <= listed
        assert client.get(f'/api/tasks/{task_for_teacher}', headers=principal_headers).status_code == 200
        assert client.get(f'/api/tasks/{task_for_teacher}/history', headers=principal_headers).status_code == 200

    def test_can_edit_task_created_by_chairman(self, client, principal_headers, task_for_teacher):
        resp = client.put(f'/api/tasks/{task_for_teacher}', headers=principal_headers,
                          json={'priority': 'HIGH', 'description': 'Principal edit', 'due_date': '2099-01-01'})
        assert resp.status_code == 200, resp.get_json()
        task = _task(task_for_teacher)
        assert task.priority == 'HIGH' and task.description == 'Principal edit'

    def test_can_reassign(self, client, principal_headers, ids, task_for_teacher):
        resp = client.put(f'/api/tasks/{task_for_teacher}', headers=principal_headers,
                          json={'assigned_to': ids['director']})
        assert resp.status_code == 200, resp.get_json()
        assert _task(task_for_teacher).assigned_to == ids['director']

    @pytest.mark.parametrize('status', ['IN_PROGRESS', 'ESCALATED'])
    def test_can_set_any_status_as_assigner(self, client, principal_headers, task_for_teacher, status):
        resp = client.put(f'/api/tasks/{task_for_teacher}/status', headers=principal_headers, json={'status': status})
        assert resp.status_code == 200, resp.get_json()

    def test_can_delete(self, client, principal_headers, task_for_teacher):
        assert client.delete(f'/api/tasks/{task_for_teacher}', headers=principal_headers).status_code == 200
        assert _task(task_for_teacher) is None

    def test_cannot_touch_task_assigned_by_someone_else_just_like_chairman(self, client, auth_headers, principal_headers, ids, department):
        from app.extensions import db
        from app.models.task import Task
        task = Task(title='Director task', assigned_by=ids['director'], assigned_to=ids['teacher'],
                    department_id=department.id, priority='LOW', status='PENDING',
                    due_date=datetime.now(timezone.utc) + timedelta(days=3))
        db.session.add(task)
        db.session.commit()
        for headers in (principal_headers, auth_headers['chairman']):
            assert client.put(f'/api/tasks/{task.id}/status', headers=headers, json={'status': 'ESCALATED'}).status_code == 403
            assert client.put(f'/api/tasks/{task.id}', headers=headers, json={'priority': 'HIGH'}).status_code == 403

    def test_chairman_can_manage_task_created_by_principal(self, client, auth_headers, principal_headers, ids, catalog):
        task_id = _create(client, principal_headers, ids['teacher']).get_json()['data']['id']
        assert client.put(f'/api/tasks/{task_id}', headers=auth_headers['chairman'],
                          json={'priority': 'LOW'}).status_code == 200
        assert client.delete(f'/api/tasks/{task_id}', headers=auth_headers['chairman']).status_code == 200


# ---------------------------------------------------------------------------
# Safeguards that make sharing Chairman-level power safe
# ---------------------------------------------------------------------------

class TestSafeguards:
    def test_principal_cannot_modify_chairman_account(self, client, principal_headers, ids):
        before = _uid('chairman-test@school.test')
        for resp in (
            client.put(f'/api/users/{ids["chairman"]}', headers=principal_headers, json={'password': 'hijacked123'}),
            client.put(f'/api/users/{ids["chairman"]}', headers=principal_headers, json={'email': 'x@school.test'}),
            client.delete(f'/api/users/{ids["chairman"]}', headers=principal_headers),
        ):
            assert resp.status_code == 403
        from app.models.user import User
        assert User.query.get(before).is_active

    def test_principal_cannot_create_chairman_account(self, client, principal_headers):
        resp = client.post('/api/users', headers=principal_headers, json={
            'name': 'X', 'email': f'c-{uuid.uuid4().hex[:6]}@school.test', 'password': 'password123', 'role': 'CHAIRMAN'})
        assert resp.status_code == 403

    def test_cannot_deactivate_own_account(self, client, principal_headers, ids):
        assert client.delete(f'/api/users/{ids["principal"]}', headers=principal_headers).status_code == 400

    def test_chairman_cannot_deactivate_self_either(self, client, auth_headers, ids):
        assert client.delete(f'/api/users/{ids["chairman"]}', headers=auth_headers['chairman']).status_code == 400

    @pytest.mark.parametrize('action', ['approve', 'reject'])
    def test_principal_cannot_process_own_approval(self, client, principal_headers, action):
        created = client.post('/api/approvals', headers=principal_headers,
                              json={'type': 'BUDGET', 'title': 'Mine'}).get_json()['data']
        assert client.put(f"/api/approvals/{created['id']}/{action}", headers=principal_headers).status_code == 403
        assert client.put(f"/api/approvals/{created['id']}/process", headers=principal_headers,
                          json={'status': 'APPROVED'}).status_code == 403

    def test_chairman_can_process_principals_approval(self, client, auth_headers, principal_headers):
        created = client.post('/api/approvals', headers=principal_headers,
                              json={'type': 'BUDGET', 'title': 'Mine 2'}).get_json()['data']
        assert client.put(f"/api/approvals/{created['id']}/approve", headers=auth_headers['chairman']).status_code == 200

    def test_unauthenticated_requests_rejected(self, client):
        for path in ('/api/users', '/api/approvals', '/api/registers', '/api/tasks'):
            assert client.get(path).status_code == 401


# ---------------------------------------------------------------------------
# 8. Existing roles keep (and do not gain) permissions
# ---------------------------------------------------------------------------

class TestExistingRolesUnchanged:
    @pytest.mark.parametrize('role', ['regular', 'hr', 'finance', 'it', 'purchase'])
    def test_non_admin_roles_still_blocked(self, client, auth_headers, ids, catalog, role):
        headers = auth_headers[role]
        assert client.get('/api/users', headers=headers).status_code == 403
        assert client.post('/api/users', headers=headers, json={}).status_code == 403
        assert client.post('/api/registers', headers=headers, json={}).status_code == 403
        assert client.post('/api/meetings', headers=headers, json={'title': 'x', 'meeting_date': '2030-01-01'}).status_code == 403
        assert client.post('/api/announcements', headers=headers, json={'message': 'x'}).status_code == 403
        assert client.post('/api/escalations/run', headers=headers, json={}).status_code == 403
        assert client.post('/api/tasks/catalog/headlines', headers=headers, json={'name': 'nope'}).status_code == 403
        assert _create(client, headers, ids['teacher']).status_code == 403

    def test_non_admin_cannot_process_approvals(self, client, auth_headers, principal_headers):
        created = client.post('/api/approvals', headers=principal_headers,
                              json={'type': 'BUDGET', 'title': 'x'}).get_json()['data']
        assert client.put(f"/api/approvals/{created['id']}/approve", headers=auth_headers['regular']).status_code == 403

    def test_non_admin_sees_only_own_tasks_and_approvals(self, client, auth_headers, ids, task_for_principal):
        listed = client.get('/api/tasks', headers=auth_headers['finance']).get_json()['data']
        assert task_for_principal not in [t['id'] for t in listed]
        assert client.get(f'/api/tasks/{task_for_principal}', headers=auth_headers['finance']).status_code == 403

    def test_director_keeps_view_and_delete_but_not_create_or_user_admin(self, client, auth_headers, ids, task_for_teacher):
        director = auth_headers['director']
        assert client.get('/api/tasks', headers=director).status_code == 200
        assert client.get('/api/dashboard/chairman', headers=director).status_code == 200
        assert client.post('/api/meetings', headers=director, json={
            'title': 'Dir', 'meeting_date': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()}).status_code in (200, 201)
        assert client.get('/api/users', headers=director).status_code == 403
        assert client.post('/api/registers', headers=director, json={}).status_code == 403
        assert client.put(f"/api/approvals/1/approve", headers=director).status_code == 403
        assert client.put(f'/api/tasks/{task_for_teacher}', headers=director, json={'priority': 'LOW'}).status_code == 403
        assert client.delete(f'/api/tasks/{task_for_teacher}', headers=director).status_code == 200

    def test_assignee_teacher_keeps_assignee_rules(self, client, auth_headers, task_for_teacher):
        teacher = auth_headers['regular']
        assert client.put(f'/api/tasks/{task_for_teacher}/status', headers=teacher,
                          json={'status': 'ESCALATED'}).status_code == 403
        assert client.put(f'/api/tasks/{task_for_teacher}/status', headers=teacher,
                          json={'status': 'IN_PROGRESS'}).status_code == 200
        assert client.put(f'/api/tasks/{task_for_teacher}', headers=teacher,
                          json={'priority': 'LOW'}).status_code == 200  # silently ignored, as before
        assert _task(task_for_teacher).priority == 'MEDIUM'
        assert client.delete(f'/api/tasks/{task_for_teacher}', headers=teacher).status_code == 403

    def test_chairman_keeps_everything(self, client, auth_headers, task_for_teacher, ids):
        chairman = auth_headers['chairman']
        assert client.put(f'/api/tasks/{task_for_teacher}', headers=chairman,
                          json={'priority': 'HIGH', 'assigned_to': ids['director']}).status_code == 200
        assert client.delete(f'/api/tasks/{task_for_teacher}', headers=chairman).status_code == 200
