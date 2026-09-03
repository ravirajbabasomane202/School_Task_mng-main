"""
Backend route tests — Salary Increments

Covers:
  GET  /api/salary-increments             — list (HR, FINANCE, CHAIRMAN, self)
  POST /api/salary-increments             — create (HR only)
  PUT  /api/salary-increments/<id>/hr-approve    — HR stage-gate
  PUT  /api/salary-increments/<id>/finance-process — Finance decision
"""

import pytest
import uuid


def _make_payload(employee_id: int, current: float = 50000, proposed: float = 60000) -> dict:
    return {
        'employee_id': employee_id,
        'current_salary': current,
        'proposed_salary': proposed,
        'reason': 'Annual review',
    }


def _seed_employee(client, auth_headers) -> dict:
    """Create an extra employee to own salary-increment records and return DB row."""
    from app.extensions import db
    from app.models.user import User

    email = f'emp-{uuid.uuid4().hex[:8]}@school.test'
    user = User(name='Test Employee', email=email, role='HR', is_active=True)
    user.set_password(str(uuid.uuid4())[:12])
    db.session.add(user)
    db.session.commit()
    return user


class TestListSalaryIncrements:
    def test_requires_auth(self, client):
        resp = client.get('/api/salary-increments')
        assert resp.status_code == 401

    def test_returns_list(self, client, auth_headers):
        resp = client.get('/api/salary-increments', headers=auth_headers['hr'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert isinstance(body['data'], list)


class TestCreateSalaryIncrement:
    def test_requires_auth(self, client):
        resp = client.post('/api/salary-increments', json={})
        assert resp.status_code == 401

    def test_forbidden_for_non_hr(self, client, auth_headers, department):
        resp = client.post(
            '/api/salary-increments',
            json={**_make_payload(1)},
            headers=auth_headers['finance'],
        )
        assert resp.status_code == 403

    def test_requires_required_fields(self, client, auth_headers):
        resp = client.post(
            '/api/salary-increments',
            json={},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 400
        body = resp.get_json()
        assert 'employee_id' in body['message']

    def test_creates_pending_hr(self, client, auth_headers, department):
        employee = _seed_employee(client, auth_headers)
        resp = client.post(
            '/api/salary-increments',
            json=_make_payload(employee.id),
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['data']['status'] == 'PENDING_HR'
        assert body['data']['increment_pct'] is not None


class TestHRApprove:
    def _create_pending(self, client, auth_headers) -> int:
        employee = _seed_employee(client, auth_headers)
        resp = client.post(
            '/api/salary-increments',
            json=_make_payload(employee.id),
            headers=auth_headers['hr'],
        )
        return resp.get_json()['data']['id']

    def test_hr_approve_moves_to_pending_finance(self, client, auth_headers):
        sid = self._create_pending(client, auth_headers)
        resp = client.put(
            f'/api/salary-increments/{sid}/hr-approve',
            json={'comment': 'Looks good'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'PENDING_FINANCE'


class TestFinanceProcess:
    def test_finance_approves(self, client, auth_headers):
        # Setup: create + HR approve
        employee = _seed_employee(client, auth_headers)
        created = client.post(
            '/api/salary-increments',
            json=_make_payload(employee.id),
            headers=auth_headers['hr'],
        ).get_json()
        sid = created['data']['id']
        client.put(
            f'/api/salary-increments/{sid}/hr-approve',
            headers=auth_headers['hr'],
        )

        resp = client.put(
            f'/api/salary-increments/{sid}/finance-process',
            json={'status': 'APPROVED', 'comment': 'Approved by finance'},
            headers=auth_headers['finance'],
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['status'] == 'APPROVED'
        assert body['data']['finance_approved_by'] is not None

    def test_finance_cannot_process_before_hr(self, client, auth_headers):
        employee = _seed_employee(client, auth_headers)
        created = client.post(
            '/api/salary-increments',
            json=_make_payload(employee.id),
            headers=auth_headers['hr'],
        ).get_json()
        sid = created['data']['id']

        resp = client.put(
            f'/api/salary-increments/{sid}/finance-process',
            json={'status': 'APPROVED'},
            headers=auth_headers['finance'],
        )
        assert resp.status_code == 400

    def test_finance_rejects(self, client, auth_headers):
        employee = _seed_employee(client, auth_headers)
        created = client.post(
            '/api/salary-increments',
            json=_make_payload(employee.id),
            headers=auth_headers['hr'],
        ).get_json()
        sid = created['data']['id']
        client.put(
            f'/api/salary-increments/{sid}/hr-approve',
            headers=auth_headers['hr'],
        )

        resp = client.put(
            f'/api/salary-increments/{sid}/finance-process',
            json={'status': 'REJECTED'},
            headers=auth_headers['finance'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'REJECTED'
