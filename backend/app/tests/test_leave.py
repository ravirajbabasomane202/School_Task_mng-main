"""
Backend route tests — Leave management

Covers:
  GET    /api/leave                  — list leave requests
  POST   /api/leave                  — submit leave request
  PUT    /api/leave/<id>/process     — approve / reject
  GET    /api/leave/resumption       — list resumption requests
  POST   /api/leave/resumption       — submit resumption
  PUT    /api/leave/resumption/<id>/process — approve/reject resumption
"""

import uuid

import pytest


def _make_department(app_context, name_prefix='Leave Dept'):
    from app.extensions import db
    from app.models.department import Department

    dept = Department(name=f'{name_prefix} {uuid.uuid4().hex[:10]}', description='For leave scoping tests')
    db.session.add(dept)
    db.session.commit()
    return dept


def _make_user(app, client, role, department_id=None):
    from app.extensions import db
    from app.models.user import User

    email = f'leave-test-{uuid.uuid4().hex[:8]}@school.test'
    plain = str(uuid.uuid4())[:12]
    with app.app_context():
        user = User(
            name=f'{role} Leave Tester',
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
    return user_id, {'Authorization': f'Bearer {token}'}


def _leave_payload(user_id: int, start: str = '2026-06-01', end: str = '2026-06-05') -> dict:
    return {
        'user_id': user_id,
        'start_date': start,
        'end_date': end,
        'reason': 'Annual leave',
        'leave_type': 'ANNUAL',
    }


class TestListLeaveRequests:
    def test_requires_auth(self, client):
        resp = client.get('/api/leave')
        assert resp.status_code == 401

    def test_returns_list(self, client, auth_headers):
        resp = client.get('/api/leave', headers=auth_headers['hr'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert isinstance(body['data'], list)


class TestLeaveDepartmentScoping:
    """HOUSEKEEPING/FRONT_DESK are ordinary department-head roles, not
    cross-department reviewers like CHAIRMAN/DIRECTOR/HR — they must only
    ever see their own leave/resumption requests, never another
    department's (or another user's, even within the same department,
    since leave.py's non-elevated branch scopes to the requester)."""

    def test_housekeeping_only_sees_own_requests(self, client, app, app_context):
        dept = _make_department(app_context, 'Leave Dept Housekeeping')
        other_dept = _make_department(app_context, 'Leave Dept Other')

        hk_user_id, hk_headers = _make_user(app, client, 'HOUSEKEEPING', department_id=dept.id)
        _, other_headers = _make_user(app, client, 'IT', department_id=other_dept.id)

        # A leave request from a user in a different department.
        client.post('/api/leave', json=_leave_payload(0), headers=other_headers)
        # The HOUSEKEEPING user's own leave request.
        own_resp = client.post('/api/leave', json=_leave_payload(0), headers=hk_headers)
        own_id = own_resp.get_json()['data']['id']

        resp = client.get('/api/leave', headers=hk_headers)
        assert resp.status_code == 200
        rows = resp.get_json()['data']
        assert all(r['user_id'] == hk_user_id for r in rows)
        assert any(r['id'] == own_id for r in rows)

    def test_front_desk_only_sees_own_requests(self, client, app, app_context):
        dept = _make_department(app_context, 'Leave Dept FrontDesk')
        other_dept = _make_department(app_context, 'Leave Dept Other 2')

        fd_user_id, fd_headers = _make_user(app, client, 'FRONT_DESK', department_id=dept.id)
        _, other_headers = _make_user(app, client, 'IT', department_id=other_dept.id)

        client.post('/api/leave', json=_leave_payload(0), headers=other_headers)
        own_resp = client.post('/api/leave', json=_leave_payload(0), headers=fd_headers)
        own_id = own_resp.get_json()['data']['id']

        resp = client.get('/api/leave', headers=fd_headers)
        assert resp.status_code == 200
        rows = resp.get_json()['data']
        assert all(r['user_id'] == fd_user_id for r in rows)
        assert any(r['id'] == own_id for r in rows)

    def test_housekeeping_only_sees_own_resumption_requests(self, client, app, app_context):
        dept = _make_department(app_context, 'Leave Dept Housekeeping Resumption')
        other_dept = _make_department(app_context, 'Leave Dept Other Resumption')

        hk_user_id, hk_headers = _make_user(app, client, 'HOUSEKEEPING', department_id=dept.id)
        _, other_headers = _make_user(app, client, 'IT', department_id=other_dept.id)

        client.post(
            '/api/leave/resumption',
            json={'resumption_date': '2026-06-10', 'notes': 'other dept'},
            headers=other_headers,
        )
        own_resp = client.post(
            '/api/leave/resumption',
            json={'resumption_date': '2026-06-11', 'notes': 'own'},
            headers=hk_headers,
        )
        own_id = own_resp.get_json()['data']['id']

        resp = client.get('/api/leave/resumption', headers=hk_headers)
        assert resp.status_code == 200
        rows = resp.get_json()['data']
        assert all(r['user_id'] == hk_user_id for r in rows)
        assert any(r['id'] == own_id for r in rows)


class TestSubmitLeave:
    def test_requires_auth(self, client):
        resp = client.post('/api/leave', json={})
        assert resp.status_code == 401

    def test_submit_leave(self, client, auth_headers, department):
        resp = client.post(
            '/api/leave',
            json=_leave_payload(1),
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['success'] is True


class TestProcessLeave:
    def _submit_leave(self, client, auth_headers) -> int:
        resp = client.post(
            '/api/leave',
            json=_leave_payload(1),
            headers=auth_headers['hr'],
        )
        return resp.get_json()['data']['id']

    def test_approve_leave(self, client, auth_headers):
        leave_id = self._submit_leave(client, auth_headers)
        resp = client.put(
            f'/api/leave/{leave_id}/process',
            json={'action': 'APPROVED', 'comment': 'Enjoy your leave'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['status'] == 'APPROVED'

    def test_reject_leave(self, client, auth_headers):
        leave_id = self._submit_leave(client, auth_headers)
        resp = client.put(
            f'/api/leave/{leave_id}/process',
            json={'action': 'REJECTED'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'REJECTED'

    def test_requires_auth(self, client):
        resp = client.put('/api/leave/1/process', json={'action': 'APPROVED'})
        assert resp.status_code == 401


class TestResumptionList:
    def test_requires_auth(self, client):
        resp = client.get('/api/leave/resumption')
        assert resp.status_code == 401

    def test_returns_list(self, client, auth_headers):
        resp = client.get('/api/leave/resumption', headers=auth_headers['hr'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert isinstance(body['data'], list)


class TestSubmitResumption:
    def test_submit_resumption(self, client, auth_headers):
        resp = client.post(
            '/api/leave/resumption',
            json={'leave_id': 1, 'actual_return_date': '2026-06-10'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['success'] is True


class TestProcessResumption:
    def _create_resumption(self, client, auth_headers) -> int:
        resp = client.post(
            '/api/leave/resumption',
            json={'leave_id': 1, 'actual_return_date': '2026-06-10'},
            headers=auth_headers['hr'],
        )
        return resp.get_json()['data']['id']

    def test_approve_resumption(self, client, auth_headers):
        res_id = self._create_resumption(client, auth_headers)
        resp = client.put(
            f'/api/leave/resumption/{res_id}/process',
            json={'action': 'APPROVED'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['status'] == 'APPROVED'

    def test_reject_resumption(self, client, auth_headers):
        res_id = self._create_resumption(client, auth_headers)
        resp = client.put(
            f'/api/leave/resumption/{res_id}/process',
            json={'action': 'REJECTED'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'REJECTED'
