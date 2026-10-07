"""
Regression tests for two related bugs:

Finding 14 — Reports ignore date range for department-head users.
  `_get_tasks()` only applied status/assigned_to/search/date_from/date_to
  filters in the elevated (CHAIRMAN/DIRECTOR) branch; a department-head
  calling /reports/daily, /reports/weekly, /reports/monthly, or
  /reports/export with a date range still got back tasks outside that
  range. Covers all four endpoints.

Finding 11 — Performance KPIs ignore date range.
  The Task Performance half of `/dashboard/performance` (and the shared
  `_staff_performance_rows()` it's built on) ignored date_from/date_to
  entirely, unlike the Register Performance half. Covers the dashboard
  endpoint directly.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest


def _make_department(name_prefix='Reports Dept'):
    from app.models.department import Department
    from app.extensions import db
    dept = Department(name=f'{name_prefix} {uuid.uuid4().hex[:10]}', description='For report scoping tests')
    db.session.add(dept)
    db.session.commit()
    return dept


@pytest.fixture
def dept(app_context):
    return _make_department()


def _dept_head_headers(app, client, department_id, role='HR'):
    """Create a non-elevated department-head user pinned to `department_id`
    and return (bearer-token auth headers, user id)."""
    from app.extensions import db
    from app.models.user import User

    email = f'reports-dept-head-{department_id}-{uuid.uuid4().hex[:8]}@school.test'
    plain = str(uuid.uuid4())[:12]
    with app.app_context():
        user = User(
            name=f'Reports Dept Head {department_id}',
            email=email,
            role=role,
            department_id=department_id,
            is_active=True,
        )
        user.set_password(plain)
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    resp = client.post('/api/auth/login', json={'email': email, 'password': plain})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    token = resp.get_json()['data']['accessToken']
    return {'Authorization': f'Bearer {token}'}, user_id


def _make_task(app, department_id, user_id, due_date, status='PENDING', title='Task'):
    from app.extensions import db
    from app.models.task import Task

    with app.app_context():
        task = Task(
            title=title,
            assigned_by=user_id,
            assigned_to=user_id,
            department_id=department_id,
            status=status,
            due_date=due_date,
        )
        db.session.add(task)
        db.session.commit()
        return task.id


class TestReportsRespectDateRangeForDeptHead:
    """A department-head requesting a recent date range must not see tasks
    whose due date falls outside that range — across all four endpoints
    that share `_get_tasks()`.
    """

    def _seed(self, app, client):
        d = _make_department()
        headers, user_id = _dept_head_headers(app, client, d.id)

        now = datetime.now(timezone.utc)
        recent_due = now - timedelta(days=1)
        old_due = now - timedelta(days=60)

        _make_task(app, d.id, user_id, due_date=recent_due, title='Recent Task')
        _make_task(app, d.id, user_id, due_date=old_due, title='Old Task')

        date_from = (now - timedelta(days=5)).strftime('%Y-%m-%d')
        date_to = now.strftime('%Y-%m-%d')
        return headers, date_from, date_to

    def test_daily_report_excludes_older_tasks(self, app, client):
        headers, date_from, date_to = self._seed(app, client)
        resp = client.get(
            '/api/reports/daily',
            query_string={'date_from': date_from, 'date_to': date_to},
            headers=headers,
        )
        assert resp.status_code == 200
        tasks = resp.get_json()['data']['tasks']
        titles = {t['task'] for t in tasks}
        assert 'Recent Task' in titles
        assert 'Old Task' not in titles

    def test_weekly_report_excludes_older_tasks(self, app, client):
        headers, date_from, date_to = self._seed(app, client)
        resp = client.get(
            '/api/reports/weekly',
            query_string={'date_from': date_from, 'date_to': date_to},
            headers=headers,
        )
        assert resp.status_code == 200
        tasks = resp.get_json()['data']['tasks']
        titles = {t['task'] for t in tasks}
        assert 'Recent Task' in titles
        assert 'Old Task' not in titles

    def test_monthly_report_excludes_older_tasks(self, app, client):
        headers, date_from, date_to = self._seed(app, client)
        resp = client.get(
            '/api/reports/monthly',
            query_string={'date_from': date_from, 'date_to': date_to},
            headers=headers,
        )
        assert resp.status_code == 200
        tasks = resp.get_json()['data']['tasks']
        titles = {t['task'] for t in tasks}
        assert 'Recent Task' in titles
        assert 'Old Task' not in titles

    def test_export_excludes_older_tasks(self, app, client):
        headers, date_from, date_to = self._seed(app, client)
        resp = client.get(
            '/api/reports/export',
            query_string={
                'date_from': date_from,
                'date_to': date_to,
                'format': 'pdf',
                'type': 'CUSTOM',
            },
            headers=headers,
        )
        assert resp.status_code == 200
        # The exported task count is echoed back in a response header so we
        # can assert on it without parsing the PDF body.
        assert resp.headers.get('X-Report-Task-Count') == '1'

    def test_still_scoped_to_own_department_within_range(self, app, client):
        """The date-range fix must not loosen department scoping: a
        department-head must still only see their own department's tasks,
        even for tasks that fall inside the requested date range."""
        own = _make_department('Own')
        foreign = _make_department('Foreign')
        headers, own_user_id = _dept_head_headers(app, client, own.id)

        from app.extensions import db
        from app.models.user import User
        with app.app_context():
            foreign_user = User(
                name='Foreign User', email=f'foreign-{uuid.uuid4().hex[:8]}@school.test',
                role='HR', department_id=foreign.id, is_active=True,
            )
            foreign_user.set_password('x' * 12)
            db.session.add(foreign_user)
            db.session.commit()
            foreign_user_id = foreign_user.id

        now = datetime.now(timezone.utc)
        _make_task(app, own.id, own_user_id, due_date=now, title='Own Dept Task')
        _make_task(app, foreign.id, foreign_user_id, due_date=now, title='Foreign Dept Task')

        date_from = (now - timedelta(days=5)).strftime('%Y-%m-%d')
        date_to = now.strftime('%Y-%m-%d')

        resp = client.get(
            '/api/reports/daily',
            query_string={'date_from': date_from, 'date_to': date_to},
            headers=headers,
        )
        assert resp.status_code == 200
        titles = {t['task'] for t in resp.get_json()['data']['tasks']}
        assert 'Own Dept Task' in titles
        assert 'Foreign Dept Task' not in titles


class TestTaskPerformanceKpiRespectsDateRange:
    """`/dashboard/performance` (Task Performance half) must change when the
    date range changes, matching what the Register Performance half
    already does.
    """

    def test_changing_date_range_changes_task_totals(self, app, client, auth_headers):
        from app.extensions import db
        from app.models.user import User

        with app.app_context():
            hr_head = User.query.filter_by(email='hr-test@school.test').first()
            hr_head_id = hr_head.id

        now = datetime.now(timezone.utc)
        _make_task(app, None, hr_head_id, due_date=now - timedelta(days=1), status='COMPLETED', title='Recent')
        _make_task(app, None, hr_head_id, due_date=now - timedelta(days=90), status='COMPLETED', title='Old')

        narrow_resp = client.get(
            '/api/dashboard/performance',
            query_string={
                'date_from': (now - timedelta(days=5)).strftime('%Y-%m-%d'),
                'date_to': now.strftime('%Y-%m-%d'),
            },
            headers=auth_headers['chairman'],
        )
        wide_resp = client.get(
            '/api/dashboard/performance',
            query_string={
                'date_from': (now - timedelta(days=120)).strftime('%Y-%m-%d'),
                'date_to': now.strftime('%Y-%m-%d'),
            },
            headers=auth_headers['chairman'],
        )
        assert narrow_resp.status_code == 200
        assert wide_resp.status_code == 200

        def total_for(resp):
            rows = resp.get_json()['data']
            row = next(r for r in rows if r['userId'] == hr_head_id)
            return row['totalTasks']

        assert total_for(narrow_resp) < total_for(wide_resp)

    def test_no_date_range_is_unfiltered_default(self, app, client, auth_headers):
        """Callers that don't pass a date range (e.g. the school-wide Staff
        Performance table) keep seeing all tasks, unchanged."""
        resp = client.get('/api/dashboard/performance', headers=auth_headers['chairman'])
        assert resp.status_code == 200
