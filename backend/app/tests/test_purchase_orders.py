"""
Backend route tests — Purchase Orders module

Covers:
  GET  /api/purchase-orders               — list + filter
  GET  /api/purchase-orders/stats         — aggregate stats
  GET  /api/purchase-orders/<id>          — detail
  POST /api/purchase-orders               — create (PURCHASE / CHAIRMAN)
  POST /api/purchase-orders               — body validation (missing total_amount)
  PUT  /api/purchase-orders/<id>/submit   — submit workflow (PURCHASE only)
  PUT  /api/purchase-orders/<id>/finance-process  — approve/reject (FINANCE only)
  PUT  /api/purchase-orders/<id>/mark-ordered    — ORDERED transition
"""

import uuid
import pytest


def _po_payload(dept_id, title='Test PO', vendor='ACME Corp', total=1000):
    """Build a valid PO payload. department_id is required (NOT NULL in DB)."""
    return {
        'title': title,
        'vendor_name': vendor,
        'total_amount': total,
        'department_id': dept_id,
        'items': [
            {'item_name': 'Item A', 'quantity': 2, 'unit_price': 500, 'total_price': 1000},
        ],
    }


def _make_department(name_prefix='Dept'):
    """Create a uniquely-named department (avoids unique-name collisions
    with the shared `department` fixture / other tests in the session-scoped
    DB used by this suite)."""
    from app.models.department import Department
    from app.extensions import db
    dept = Department(name=f'{name_prefix} {uuid.uuid4().hex[:10]}', description='For department-scoping tests')
    db.session.add(dept)
    db.session.commit()
    return dept


@pytest.fixture
def scoping_department(app_context):
    """A department dedicated to the department-scoping tests below."""
    return _make_department('Scoping Own')


@pytest.fixture
def other_department(app_context):
    """A second, distinct department — used to prove cross-department
    isolation for the department-scoping tests below."""
    return _make_department('Scoping Other')


def _dept_head_headers(app, client, department_id, role='HR'):
    """Create (or reuse) a department-head user pinned to `department_id` and
    return bearer-token auth headers for them. `role` defaults to HR, a
    DEPARTMENT_HEAD_ROLES entry that is NOT one of the PO_ELEVATED_ROLES
    (CHAIRMAN/DIRECTOR/FINANCE), so it should always be force-scoped.
    """
    from app.extensions import db
    from app.models.user import User

    email = f'dept-head-{department_id}-{uuid.uuid4().hex[:8]}@school.test'
    plain = str(uuid.uuid4())[:12]
    with app.app_context():
        user = User(
            name=f'Dept Head {department_id}',
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


class TestDepartmentScoping:
    """A department-head (non-elevated) user must only ever see their own
    department's purchase orders, on both the list and stats endpoints —
    regardless of any department_id they try to pass as a query param.
    """

    def test_list_only_returns_own_department(self, app, client, auth_headers, scoping_department, other_department):
        # Seed one PO in `department` and one in `other_department`.
        client.post('/api/purchase-orders', json=_po_payload(scoping_department.id, title='Own Dept PO'), headers=auth_headers['purchase'])
        client.post('/api/purchase-orders', json=_po_payload(other_department.id, title='Other Dept PO'), headers=auth_headers['purchase'])

        head_headers = _dept_head_headers(app, client, scoping_department.id)

        resp = client.get('/api/purchase-orders', headers=head_headers)
        assert resp.status_code == 200
        rows = resp.get_json()['data']
        assert len(rows) >= 1
        assert all(row['department_id'] == scoping_department.id for row in rows)
        assert not any(row['department_id'] == other_department.id for row in rows)

    def test_list_ignores_client_supplied_department_id(self, app, client, auth_headers, scoping_department, other_department):
        client.post('/api/purchase-orders', json=_po_payload(scoping_department.id, title='Own Dept PO 2'), headers=auth_headers['purchase'])
        client.post('/api/purchase-orders', json=_po_payload(other_department.id, title='Other Dept PO 2'), headers=auth_headers['purchase'])

        head_headers = _dept_head_headers(app, client, scoping_department.id)

        # Even asking explicitly for the other department must not leak it.
        resp = client.get(f'/api/purchase-orders?department_id={other_department.id}', headers=head_headers)
        assert resp.status_code == 200
        rows = resp.get_json()['data']
        assert not any(row['department_id'] == other_department.id for row in rows)
        assert all(row['department_id'] == scoping_department.id for row in rows)

    def test_stats_only_counts_own_department(self, app, client, auth_headers, scoping_department, other_department):
        # Two POs for our department, one for the other department.
        client.post('/api/purchase-orders', json=_po_payload(scoping_department.id, title='Stats Own 1'), headers=auth_headers['purchase'])
        client.post('/api/purchase-orders', json=_po_payload(scoping_department.id, title='Stats Own 2'), headers=auth_headers['purchase'])
        client.post('/api/purchase-orders', json=_po_payload(other_department.id, title='Stats Other 1'), headers=auth_headers['purchase'])

        head_headers = _dept_head_headers(app, client, scoping_department.id)

        own_count = len(client.get('/api/purchase-orders', headers=head_headers).get_json()['data'])

        resp = client.get('/api/purchase-orders/stats', headers=head_headers)
        assert resp.status_code == 200
        stats = resp.get_json()['data']
        assert stats['total'] == own_count == 2

        # A second, independent department head shouldn't see the first
        # head's department in their stats either.
        other_head_headers = _dept_head_headers(app, client, other_department.id)
        other_resp = client.get('/api/purchase-orders/stats', headers=other_head_headers)
        other_stats = other_resp.get_json()['data']
        assert other_stats['total'] == 1


class TestListPOs:
    def test_requires_auth(self, client):
        resp = client.get('/api/purchase-orders')
        assert resp.status_code == 401

    def test_returns_list(self, client, auth_headers, department):
        client.post('/api/purchase-orders', json=_po_payload(department.id), headers=auth_headers['purchase'])
        resp = client.get('/api/purchase-orders', headers=auth_headers['purchase'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert isinstance(body['data'], list)


class TestPOStats:
    def test_requires_auth(self, client):
        resp = client.get('/api/purchase-orders/stats')
        assert resp.status_code == 401

    def test_returns_expected_keys(self, client, auth_headers):
        resp = client.get('/api/purchase-orders/stats', headers=auth_headers['purchase'])
        assert resp.status_code == 200
        body = resp.get_json()
        for key in ('total', 'pending', 'approved', 'rejected', 'ordered', 'draft'):
            assert key in body['data'], f"Missing key {key}"


class TestCreatePO:
    def test_requires_auth(self, client):
        resp = client.post('/api/purchase-orders', json={})
        assert resp.status_code == 401

    def test_forbidden_for_regular(self, client, auth_headers, department):
        resp = client.post(
            '/api/purchase-orders',
            json=_po_payload(department.id),
            headers=auth_headers['regular'],
        )
        assert resp.status_code == 403

    def test_requires_title(self, client, auth_headers, department):
        resp = client.post(
            '/api/purchase-orders',
            json={'vendor_name': 'ACME', 'department_id': department.id},
            headers=auth_headers['purchase'],
        )
        assert resp.status_code == 400

    def test_creates_draft(self, client, auth_headers, department):
        resp = client.post(
            '/api/purchase-orders',
            json=_po_payload(department.id),
            headers=auth_headers['purchase'],
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['data']['status'] == 'DRAFT'


class TestSubmitPO:
    def test_submit_moves_to_pending(self, client, auth_headers, department):
        created = client.post(
            '/api/purchase-orders',
            json=_po_payload(department.id),
            headers=auth_headers['purchase'],
        ).get_json()
        po_id = created['data']['id']

        resp = client.put(
            f'/api/purchase-orders/{po_id}/submit',
            headers=auth_headers['purchase'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'PENDING'

    def test_cannot_submit_non_draft(self, client, auth_headers, department):
        created = client.post(
            '/api/purchase-orders',
            json=_po_payload(department.id),
            headers=auth_headers['purchase'],
        ).get_json()
        po_id = created['data']['id']
        # transition to PENDING first
        client.put(f'/api/purchase-orders/{po_id}/submit', headers=auth_headers['purchase'])

        resp = client.put(
            f'/api/purchase-orders/{po_id}/submit',
            headers=auth_headers['purchase'],
        )
        assert resp.status_code == 400


class TestFinanceProcess:
    def test_finance_can_approve(self, client, auth_headers, department):
        created = client.post(
            '/api/purchase-orders',
            json=_po_payload(department.id),
            headers=auth_headers['purchase'],
        ).get_json()
        po_id = created['data']['id']
        client.put(f'/api/purchase-orders/{po_id}/submit', headers=auth_headers['purchase'])

        resp = client.put(
            f'/api/purchase-orders/{po_id}/finance-process',
            json={'status': 'APPROVED'},
            headers=auth_headers['finance'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'APPROVED'

    def test_finance_cannot_process_draft(self, client, auth_headers, department):
        created = client.post(
            '/api/purchase-orders',
            json=_po_payload(department.id),
            headers=auth_headers['purchase'],
        ).get_json()
        po_id = created['data']['id']

        resp = client.put(
            f'/api/purchase-orders/{po_id}/finance-process',
            json={'status': 'APPROVED'},
            headers=auth_headers['finance'],
        )
        assert resp.status_code == 400


class TestMarkOrdered:
    def test_orders_only_approved(self, client, auth_headers, department):
        created = client.post(
            '/api/purchase-orders',
            json=_po_payload(department.id),
            headers=auth_headers['purchase'],
        ).get_json()
        po_id = created['data']['id']
        client.put(f'/api/purchase-orders/{po_id}/submit', headers=auth_headers['purchase'])
        client.put(
            f'/api/purchase-orders/{po_id}/finance-process',
            json={'status': 'APPROVED'},
            headers=auth_headers['finance'],
        )

        resp = client.put(
            f'/api/purchase-orders/{po_id}/mark-ordered',
            headers=auth_headers['purchase'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['status'] == 'ORDERED'
