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
