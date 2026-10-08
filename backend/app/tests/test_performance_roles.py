"""Roles from the backend + the 'Admission Head shows 1 task, there are 2' bug.

Run:  cd backend && python -m pytest app/tests/test_performance_roles.py -q
"""
import uuid
from datetime import date, datetime, timedelta, timezone


def _user(app, role, name=None):
    from app.extensions import db
    from app.models.user import User
    with app.app_context():
        u = User(name=name or f'U {uuid.uuid4().hex[:6]}', email=f'{uuid.uuid4().hex[:8]}@school.test',
                 role=role, is_active=True)
        u.set_password('x' * 12)
        db.session.add(u)
        db.session.commit()
        return u.id


def _task(app, uid, status='PENDING', due=None, created=None):
    from app.extensions import db
    from app.models.task import Task
    with app.app_context():
        t = Task(title=f'T-{uuid.uuid4().hex[:5]}', assigned_by=uid, assigned_to=uid, status=status,
                 priority='MEDIUM', due_date=due)
        if created:
            t.created_at = created
        db.session.add(t)
        db.session.commit()


def _rows(app, **kw):
    from app.routes.dashboard import _staff_performance_rows
    with app.app_context():
        return _staff_performance_rows(**kw)


def test_two_tasks_for_one_role_total_two(app):
    """Two Admission Heads (different people), one task each -> role total is 2,
    including a task with no due date while a date range is applied."""
    now = datetime.now(timezone.utc)
    a = _user(app, 'ADMISSION', 'Anita Rao')
    b = _user(app, 'ADMISSION', 'Admission Head')
    _task(app, a, due=now + timedelta(days=3))
    _task(app, b, due=None)                       # no due date: used to vanish under a date range
    rows = _rows(app, date_from=date.today() - timedelta(days=5), date_to=date.today() + timedelta(days=10))
    mine = [r for r in rows if r['userId'] in (a, b)]
    assert len({r['roleId'] for r in mine}) == 1          # one role identity...
    assert sum(r['totalTasks'] for r in mine) == 2        # ...and both tasks counted


def test_buckets_add_up_to_total(app):
    now = datetime.now(timezone.utc)
    uid = _user(app, 'ADMISSION')
    for status in ('COMPLETED', 'IN_PROGRESS', 'PENDING', 'DELAYED', 'ESCALATED'):
        _task(app, uid, status=status, due=now + timedelta(days=5) if status != 'DELAYED' else None)
    row = next(r for r in _rows(app) if r['userId'] == uid)
    assert row['totalTasks'] == 5
    assert (row['completedTasks'] + row['inProgressTasks'] + row['pendingTasks']
            + row['delayedTasks'] + row['escalatedTasks']) == row['totalTasks']
    assert row['inProgressTasks'] == 1


def test_new_role_appears_without_code_change_and_rename_keeps_working(app, client, auth_headers):
    h = auth_headers['chairman']
    resp = client.post('/api/roles', json={'name': 'Librarian'}, headers=h)
    assert resp.status_code in (201, 409)
    role = next(r for r in client.get('/api/roles', headers=h).get_json() if r['name'] == 'Librarian')
    assert role['key'] == 'Librarian'

    uid = _user(app, role['key'])
    _task(app, uid, status='IN_PROGRESS')
    row = next(r for r in _rows(app) if r['userId'] == uid)
    assert row['roleId'] == role['id'] and row['roleName'] == 'Librarian'

    # Admin renames the role: identity (id/key) is unchanged, label follows.
    assert client.put(f"/api/roles/{role['id']}", json={'name': 'Library Head'}, headers=h).status_code == 200
    row = next(r for r in _rows(app) if r['userId'] == uid)
    assert row['roleId'] == role['id'] and row['role'] == 'Librarian' and row['roleName'] == 'Library Head'
    assert row['totalTasks'] == 1


def test_roles_endpoint_lists_builtin_roles_from_backend(client, auth_headers):
    roles = client.get('/api/roles', headers=auth_headers['chairman']).get_json()
    keys = {r['key'] for r in roles}
    assert {'ADMISSION', 'HR'} <= keys
    assert all('id' in r and 'name' in r for r in roles)


def test_export_head_filter_uses_user_id(app, client, auth_headers):
    now = datetime.now(timezone.utc)
    uid = _user(app, 'ADMISSION', 'Someone Else')
    _task(app, uid, due=now + timedelta(days=2))
    resp = client.get('/api/reports/performance/export', headers=auth_headers['chairman'],
                      query_string={'format': 'csv', 'head': str(uid),
                                    'date_from': (date.today() - timedelta(days=3)).isoformat(),
                                    'date_to': (date.today() + timedelta(days=5)).isoformat()})
    assert resp.status_code == 200
