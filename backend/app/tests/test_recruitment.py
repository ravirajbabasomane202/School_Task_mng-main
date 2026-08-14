"""
Backend route tests — Recruitment module
(backend/app/tests/test_recruitment_routes.py)

Covers:
  • GET  /api/recruitment          — list, filter, unauth
  • POST /api/recruitment         — create (HR/STAFF only)
  • GET  /api/recruitment/<id>    — detail
  • PUT  /api/recruitment/<id>    — update
  • GET  /api/recruitment/<id>/applications
  • POST /api/recruitment/<id>/applications  — multipart resume upload
  • PUT  /api/recruitment/<id>/applications/<app_id> — stage transition
"""

import io
import os

import pytest


@pytest.fixture
def department(app_context, department):
    # already created by the shared fixture — just pass through
    return department


# ── helpers ─────────────────────────────────────────────────────────────────

def _auth(auth_headers, role: str) -> dict:
    return auth_headers.get(role, {})


# ── GET /api/recruitment ──────────────────────────────────────────────────────

class TestListRecruitments:
    def test_requires_auth(self, client):
        resp = client.get('/api/recruitment')
        assert resp.status_code == 401

    def test_returns_list(self, client, auth_headers, department):
        client.post(
            '/api/recruitment',
            json={'position_title': 'Math Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        )
        resp = client.get('/api/recruitment', headers=_auth(auth_headers, 'hr'))
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert len(body['data']) >= 1

    def test_filter_by_status(self, client, auth_headers, department):
        client.post(
            '/api/recruitment',
            json={'position_title': 'Physics Teacher', 'status': 'OPEN'},
            headers=_auth(auth_headers, 'hr'),
        )
        resp = client.get('/api/recruitment?status=OPEN', headers=_auth(auth_headers, 'hr'))
        assert resp.status_code == 200
        body = resp.get_json()
        assert all(r['status'] == 'OPEN' for r in body['data'])


# ── POST /api/recruitment ─────────────────────────────────────────────────────

class TestCreateRecruitment:
    def test_requires_auth(self, client):
        resp = client.post('/api/recruitment', json={})
        assert resp.status_code == 401

    def test_forbidden_for_non_hr(self, client, auth_headers):
        resp = client.post(
            '/api/recruitment',
            json={'position_title': 'Any Role'},
            headers=_auth(auth_headers, 'regular'),
        )
        assert resp.status_code == 403

    def test_requires_position_title(self, client, auth_headers):
        resp = client.post(
            '/api/recruitment',
            json={},
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 400
        body = resp.get_json()
        assert 'position_title' in body['message']

    def test_creates_recruitment(self, client, auth_headers, department):
        resp = client.post(
            '/api/recruitment',
            json={
                'position_title': 'Chemistry Teacher',
                'department_id': department.id,
                'vacancies': 2,
                'description': 'Teach chemistry',
                'status': 'OPEN',
            },
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['success'] is True
        assert body['data']['position_title'] == 'Chemistry Teacher'


# ── GET /api/recruitment/<id> ─────────────────────────────────────────────────

class TestGetRecruitment:
    def test_requires_auth(self, client):
        resp = client.get('/api/recruitment/1')
        assert resp.status_code == 401

    def test_returns_404_for_missing(self, client, auth_headers):
        resp = client.get('/api/recruitment/99999', headers=_auth(auth_headers, 'hr'))
        assert resp.status_code == 404


# ── PUT /api/recruitment/<id> ────────────────────────────────────────────────

class TestUpdateRecruitment:
    def test_forbidden_for_non_hr(self, client, auth_headers, department):
        created = client.post(
            '/api/recruitment',
            json={'position_title': 'Biology Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()
        rid = created['data']['id']

        resp = client.put(
            f'/api/recruitment/{rid}',
            json={'status': 'CLOSED'},
            headers=_auth(auth_headers, 'finance'),
        )
        assert resp.status_code == 403

    def test_updates_status(self, client, auth_headers, department):
        created = client.post(
            '/api/recruitment',
            json={'position_title': 'Physics Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()
        rid = created['data']['id']

        resp = client.put(
            f'/api/recruitment/{rid}',
            json={'status': 'CLOSED'},
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['status'] == 'CLOSED'


# ── POST /api/recruitment/<id>/applications ──────────────────────────────────

class TestCreateApplication:
    def test_requires_name_and_email(self, client, auth_headers, department):
        created = client.post(
            '/api/recruitment',
            json={'position_title': 'History Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()
        rid = created['data']['id']

        resp = client.post(
            f'/api/recruitment/{rid}/applications',
            data={},
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 400

    def test_rejects_invalid_file_extension(self, client, auth_headers, department):
        created = client.post(
            '/api/recruitment',
            json={'position_title': 'History Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()
        rid = created['data']['id']

        data = {
            'applicant_name': 'Jane Doe',
            'email': 'jane@test.com',
        }
        file = (io.BytesIO(b'fake-pdf\x00exe'), 'malware.exe')
        resp = client.post(
            f'/api/recruitment/{rid}/applications',
            data={**data, 'resume': file},
            content_type='multipart/form-data',
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 400
        assert 'Invalid file type' in resp.get_json()['message']

    def test_creates_application_with_valid_resume(
        self, client, auth_headers, department, tmp_path
    ):
        created = client.post(
            '/api/recruitment',
            json={'position_title': 'History Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()
        rid = created['data']['id']

        dummy_pdf = tmp_path / 'resume.pdf'
        dummy_pdf.write_bytes(b'%PDF-1.4 fake content')

        resp = client.post(
            f'/api/recruitment/{rid}/applications',
            data={
                'applicant_name': 'Jane Doe',
                'email': 'jane@test.com',
                'resume': (open(dummy_pdf, 'rb'), 'resume.pdf'),
            },
            content_type='multipart/form-data',
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['success'] is True
        assert body['data']['applicant_name'] == 'Jane Doe'


# ── PUT /api/recruitment/applications/<app_id> ───────────────────────────────

class TestUpdateApplication:
    def test_updates_stage(self, client, auth_headers, department):
        created = client.post(
            '/api/recruitment',
            json={'position_title': 'Geography Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()
        rid = created['data']['id']

        app_resp = client.post(
            f'/api/recruitment/{rid}/applications',
            data={'applicant_name': 'John Smith', 'email': 'john@test.com'},
            headers=_auth(auth_headers, 'hr'),
        )
        app_id = app_resp.get_json()['data']['id']

        resp = client.put(
            f'/api/recruitment/applications/{app_id}',
            json={'stage': 'SHORTLISTED'},
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['stage'] == 'SHORTLISTED'

    def test_rejects_invalid_stage(self, client, auth_headers, department):
        created = client.post(
            '/api/recruitment',
            json={'position_title': 'Geography Teacher', 'department_id': department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()
        rid = created['data']['id']

        app_resp = client.post(
            f'/api/recruitment/{rid}/applications',
            data={'applicant_name': 'John Smith', 'email': 'john@test.com'},
            headers=_auth(auth_headers, 'hr'),
        )
        app_id = app_resp.get_json()['data']['id']

        resp = client.put(
            f'/api/recruitment/applications/{app_id}',
            json={'stage': 'INVALID_STAGE'},
            headers=_auth(auth_headers, 'hr'),
        )
        assert resp.status_code == 400
