"""
Backend route tests — Dashboard module

Covers:
  GET /api/dashboard/dept/<dept_id> — cross-department authorization guard,
  mirroring the check already present on GET /api/tasks/dept/<dept_id>:
  non-elevated users may only request their own department_id; CHAIRMAN/
  DIRECTOR bypass the check.
"""

import uuid

import pytest


def _make_department(name_prefix='Dashboard Dept'):
    """Create a uniquely-named department, avoiding unique-name collisions
    with the shared `department` fixture used elsewhere in the suite."""
    from app.models.department import Department
    from app.extensions import db
    dept = Department(name=f'{name_prefix} {uuid.uuid4().hex[:10]}', description='For dashboard scoping tests')
    db.session.add(dept)
    db.session.commit()
    return dept


@pytest.fixture
def own_department(app_context):
    return _make_department('Dashboard Own')


@pytest.fixture
def foreign_department(app_context):
    return _make_department('Dashboard Foreign')


def _dept_head_headers(app, client, department_id, role='IT'):
    """Create a non-elevated department-head user pinned to `department_id`
    and return bearer-token auth headers for them."""
    from app.extensions import db
    from app.models.user import User

    email = f'dash-dept-head-{department_id}-{uuid.uuid4().hex[:8]}@school.test'
    plain = str(uuid.uuid4())[:12]
    with app.app_context():
        user = User(
            name=f'Dashboard Dept Head {department_id}',
            email=email,
            role=role,
            department_id=department_id,
            is_active=True,
        )
        user.set_password(plain)
        db.session.add(user)
        db.session.commit()

    resp = client.post('/api/auth/login', json={'email': email, 'password': plain})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    token = resp.get_json()['data']['accessToken']
    return {'Authorization': f'Bearer {token}'}


class TestDeptDashboardScoping:
    def test_requires_auth(self, client):
        resp = client.get('/api/dashboard/dept/1')
        assert resp.status_code == 401

    def test_own_department_is_allowed(self, app, client, own_department):
        headers = _dept_head_headers(app, client, own_department.id)
        resp = client.get(f'/api/dashboard/dept/{own_department.id}', headers=headers)
        assert resp.status_code == 200

    def test_foreign_department_is_forbidden(self, app, client, own_department, foreign_department):
        headers = _dept_head_headers(app, client, own_department.id)

        # A direct API call for a department that isn't the caller's own
        # must be rejected, even though the UI never sends this today.
        resp = client.get(f'/api/dashboard/dept/{foreign_department.id}', headers=headers)
        assert resp.status_code == 403

    def test_elevated_roles_bypass_the_check(self, client, auth_headers, foreign_department):
        resp = client.get(f'/api/dashboard/dept/{foreign_department.id}', headers=auth_headers['chairman'])
        assert resp.status_code == 200

        resp = client.get(f'/api/dashboard/dept/{foreign_department.id}', headers=auth_headers['director'])
        assert resp.status_code == 200


class TestRoleAnalyticsScoping:
    """GET /api/dashboard/analytics/<role>: non-elevated users may only
    request their own department_id; CHAIRMAN/DIRECTOR may pass any
    department_id.
    """

    def test_requires_auth(self, client):
        resp = client.get('/api/dashboard/analytics/it')
        assert resp.status_code == 401

    def test_own_department_is_allowed(self, app, client, own_department):
        headers = _dept_head_headers(app, client, own_department.id, role='IT')
        resp = client.get(
            f'/api/dashboard/analytics/it?department_id={own_department.id}',
            headers=headers,
        )
        assert resp.status_code == 200

    def test_no_department_id_falls_back_to_own(self, app, client, own_department):
        headers = _dept_head_headers(app, client, own_department.id, role='IT')
        resp = client.get('/api/dashboard/analytics/it', headers=headers)
        assert resp.status_code == 200

    def test_foreign_department_id_is_forbidden(self, app, client, own_department, foreign_department):
        headers = _dept_head_headers(app, client, own_department.id, role='IT')
        resp = client.get(
            f'/api/dashboard/analytics/it?department_id={foreign_department.id}',
            headers=headers,
        )
        assert resp.status_code == 403

    def test_elevated_roles_may_pass_any_department_id(self, client, auth_headers, foreign_department):
        resp = client.get(
            f'/api/dashboard/analytics/it?department_id={foreign_department.id}',
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 200

        resp = client.get(
            f'/api/dashboard/analytics/it?department_id={foreign_department.id}',
            headers=auth_headers['director'],
        )
        assert resp.status_code == 200


def _make_task(app, department_id, assigned_to_user_id, status='PENDING'):
    """Create a bare-minimum Task row directly via the DB, sidestepping
    POST /tasks role/payload requirements."""
    from app.extensions import db
    from app.models.task import Task

    with app.app_context():
        task = Task(
            title=f'Task for dept {department_id}',
            assigned_by=assigned_to_user_id,
            assigned_to=assigned_to_user_id,
            department_id=department_id,
            status=status,
        )
        db.session.add(task)
        db.session.commit()
        return task.id


class TestMetricsScoping:
    """GET /api/dashboard/metrics: CHAIRMAN/DIRECTOR see school-wide stats;
    everyone else is scoped to their own department_id.
    """

    def test_requires_auth(self, client):
        resp = client.get('/api/dashboard/metrics')
        assert resp.status_code == 401

    def test_non_elevated_user_only_sees_own_department(self, app, client, own_department, foreign_department):
        headers = _dept_head_headers(app, client, own_department.id, role='IT')

        # Resolve the dept head's own user id to satisfy the assigned_by/
        # assigned_to FK columns on Task.
        from app.extensions import db
        from app.models.user import User
        with app.app_context():
            dept_user = User.query.filter_by(department_id=own_department.id).first()
            dept_user_id = dept_user.id
            other_user = User(
                name='Foreign Assignee', email=f'foreign-{uuid.uuid4().hex[:8]}@school.test',
                role='HR', department_id=foreign_department.id, is_active=True,
            )
            other_user.set_password('x' * 12)
            db.session.add(other_user)
            db.session.commit()
            other_user_id = other_user.id

        _make_task(app, own_department.id, dept_user_id, status='COMPLETED')
        _make_task(app, own_department.id, dept_user_id, status='PENDING')
        _make_task(app, foreign_department.id, other_user_id, status='COMPLETED')

        resp = client.get('/api/dashboard/metrics', headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert data['totalTasks'] == 2
        assert data['completedTasks'] == 1
        assert data['pendingTasks'] == 1
        assert data['scope'] == 'DEPARTMENT'

    def test_elevated_role_sees_school_wide_stats(self, app, client, auth_headers, own_department, foreign_department):
        from app.extensions import db
        from app.models.user import User
        with app.app_context():
            u1 = User(name='U1', email=f'u1-{uuid.uuid4().hex[:8]}@school.test', role='IT', department_id=own_department.id, is_active=True)
            u1.set_password('x' * 12)
            u2 = User(name='U2', email=f'u2-{uuid.uuid4().hex[:8]}@school.test', role='HR', department_id=foreign_department.id, is_active=True)
            u2.set_password('x' * 12)
            db.session.add_all([u1, u2])
            db.session.commit()
            u1_id, u2_id = u1.id, u2.id

        _make_task(app, own_department.id, u1_id, status='COMPLETED')
        _make_task(app, foreign_department.id, u2_id, status='PENDING')

        resp = client.get('/api/dashboard/metrics', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert data['totalTasks'] >= 2  # school-wide, includes tasks from both departments
        assert data['scope'] == 'SCHOOL_WIDE'
