"""
Backend route tests — Asset Management

Covers:
  GET  /api/assets            — list + filter, unauth
  GET  /api/assets/stats      — aggregate stats
  POST /api/assets            — create (IT only)
  PUT  /api/assets/<id>       — update (IT only)
  DELETE /api/assets/<id>     — delete (IT only)
  Role-guard enforcement
"""

import json
import uuid

import pytest


def _header(role: str) -> dict:
    return {'Authorization': f'Bearer {role}'}  # replaced by real token in tests


# Test subclasses keep tests grouped by scenario for shorter names

class TestListAssets:
    def test_requires_auth(self, client):
        resp = client.get('/api/assets')
        assert resp.status_code == 401

    def test_returns_empty_list(self, client, auth_headers):
        resp = client.get('/api/assets', headers=auth_headers['it'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert isinstance(body['data'], list)

    def test_filter_by_status(self, client, auth_headers):
        # Create two assets
        for _ in range(2):
            client.post(
                '/api/assets',
                json={
                    'name': 'Test Asset',
                    'category': 'HARDWARE',
                    'condition': 'GOOD',
                    'status': 'ACTIVE',
                },
                headers=auth_headers['it'],
            )

        resp = client.get('/api/assets?status=ACTIVE', headers=auth_headers['it'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert all(a['status'] == 'ACTIVE' for a in body['data'])


class TestAssetStats:
    def test_requires_auth(self, client):
        resp = client.get('/api/assets/stats')
        assert resp.status_code == 401

    def test_returns_expected_keys(self, client, auth_headers):
        resp = client.get('/api/assets/stats', headers=auth_headers['it'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert 'total' in body['data']
        assert 'by_category' in body['data']
        assert 'by_condition' in body['data']
        assert 'by_status' in body['data']


class TestCreateAsset:
    def test_requires_auth(self, client):
        resp = client.post('/api/assets', json={})
        assert resp.status_code == 401

    def test_forbidden_for_finance(self, client, auth_headers):
        resp = client.post(
            '/api/assets',
            json={'name': 'Laptop', 'category': 'HARDWARE', 'condition': 'GOOD', 'status': 'ACTIVE'},
            headers=auth_headers['finance'],
        )
        assert resp.status_code == 403

    def test_requires_name(self, client, auth_headers):
        resp = client.post(
            '/api/assets',
            json={'category': 'HARDWARE', 'condition': 'GOOD'},
            headers=auth_headers['it'],
        )
        assert resp.status_code == 400

    def test_creates_asset(self, client, auth_headers):
        resp = client.post(
            '/api/assets',
            json={
                'name': 'Dell Laptop',
                'category': 'HARDWARE',
                'serial_number': 'SN12345',
                'condition': 'EXCELLENT',
                'status': 'ACTIVE',
            },
            headers=auth_headers['it'],
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['success'] is True
        assert body['data']['name'] == 'Dell Laptop'


class TestUpdateAsset:
    def test_updates_asset(self, client, auth_headers):
        created = client.post(
            '/api/assets',
            json={'name': 'Old Name', 'category': 'HARDWARE', 'condition': 'GOOD', 'status': 'ACTIVE'},
            headers=auth_headers['it'],
        ).get_json()
        asset_id = created['data']['id']

        resp = client.put(
            f'/api/assets/{asset_id}',
            json={'name': 'New Name'},
            headers=auth_headers['it'],
        )
        assert resp.status_code == 200
        assert resp.get_json()['data']['name'] == 'New Name'


class TestDeleteAsset:
    def test_deletes_asset(self, client, auth_headers):
        created = client.post(
            '/api/assets',
            json={'name': 'To Delete', 'category': 'HARDWARE', 'condition': 'GOOD', 'status': 'ACTIVE'},
            headers=auth_headers['it'],
        ).get_json()
        asset_id = created['data']['id']

        resp = client.delete(f'/api/assets/{asset_id}', headers=auth_headers['it'])
        assert resp.status_code == 200
        # Verify deletion
        get_resp = client.get(f'/api/assets/{asset_id}', headers=auth_headers['it'])
        assert get_resp.status_code == 404
