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

import pytest


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
