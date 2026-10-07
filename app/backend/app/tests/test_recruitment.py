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
import uuid

import pytest


@pytest.fixture
def department(app_context, department):
    # already created by the shared fixture — just pass through
    return department


def _make_department(name_prefix='Recruit Dept'):
    """Create a uniquely-named department, avoiding unique-name collisions
    with the shared `department` fixture used elsewhere in this file."""
    from app.models.department import Department
    from app.extensions import db
    dept = Department(name=f'{name_prefix} {uuid.uuid4().hex[:10]}', description='For department-scoping tests')
    db.session.add(dept)
    db.session.commit()
    return dept


@pytest.fixture
def scoping_department(app_context):
    return _make_department('Recruit Scoping Own')


@pytest.fixture
def other_scoping_department(app_context):
    return _make_department('Recruit Scoping Other')


def _dept_head_headers(app, client, department_id, role='IT'):
    """Create a department-head user pinned to `department_id` and return
    bearer-token auth headers for them. `role` defaults to IT, a
    DEPARTMENT_HEAD_ROLES entry that is NOT one of the
    RECRUITMENT_ELEVATED_ROLES (CHAIRMAN/DIRECTOR/HR), so it should always
    be force-scoped to its own department.
    """
    from app.extensions import db
    from app.models.user import User

    email = f'recruit-dept-head-{department_id}-{uuid.uuid4().hex[:8]}@school.test'
    plain = str(uuid.uuid4())[:12]
    with app.app_context():
        user = User(
            name=f'Recruit Dept Head {department_id}',
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


# ── helpers ─────────────────────────────────────────────────────────────────

def _auth(auth_headers, role: str) -> dict:
    return auth_headers.get(role, {})


# ── Department scoping (Finding 12-style fix) ────────────────────────────────

class TestDepartmentScoping:
    """A department-head (non-elevated) user must only ever see recruitment
    postings — and their applications — for their own department, on
    GET /recruitment and the applications sub-resource, regardless of any
    department_id they try to pass as a query param.
    """

    def test_list_only_returns_own_department(self, client, auth_headers, app, scoping_department, other_scoping_department):
        client.post(
            '/api/recruitment',
            json={'position_title': 'Own Dept Role', 'department_id': scoping_department.id},
            headers=_auth(auth_headers, 'hr'),
        )
        client.post(
            '/api/recruitment',
            json={'position_title': 'Other Dept Role', 'department_id': other_scoping_department.id},
            headers=_auth(auth_headers, 'hr'),
        )

        head_headers = _dept_head_headers(app, client, scoping_department.id)

        resp = client.get('/api/recruitment', headers=head_headers)
        assert resp.status_code == 200
        rows = resp.get_json()['data']
        assert len(rows) >= 1
        assert all(r['department_id'] == scoping_department.id for r in rows)
        assert not any(r['department_id'] == other_scoping_department.id for r in rows)

    def test_list_ignores_client_supplied_department_id(self, client, auth_headers, app, scoping_department, other_scoping_department):
        client.post(
            '/api/recruitment',
            json={'position_title': 'Own Dept Role 2', 'department_id': scoping_department.id},
            headers=_auth(auth_headers, 'hr'),
        )
        client.post(
            '/api/recruitment',
            json={'position_title': 'Other Dept Role 2', 'department_id': other_scoping_department.id},
            headers=_auth(auth_headers, 'hr'),
        )

        head_headers = _dept_head_headers(app, client, scoping_department.id)

        # Even asking explicitly for the other department must not leak it.
        resp = client.get(f'/api/recruitment?department_id={other_scoping_department.id}', headers=head_headers)
        assert resp.status_code == 200
        rows = resp.get_json()['data']
        assert not any(r['department_id'] == other_scoping_department.id for r in rows)
        assert all(r['department_id'] == scoping_department.id for r in rows)

    def test_applications_scoped_through_parent_department(self, client, auth_headers, app, scoping_department, other_scoping_department):
        # Postings in each department, each with one applicant.
        own_posting = client.post(
            '/api/recruitment',
            json={'position_title': 'Own Dept Posting', 'department_id': scoping_department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()['data']
        other_posting = client.post(
            '/api/recruitment',
            json={'position_title': 'Other Dept Posting', 'department_id': other_scoping_department.id},
            headers=_auth(auth_headers, 'hr'),
        ).get_json()['data']

        client.post(
            f"/api/recruitment/{own_posting['id']}/applications",
            data={'applicant_name': 'Own Dept Candidate', 'email': 'own-candidate@test.com'},
            headers=_auth(auth_headers, 'hr'),
        )
        client.post(
            f"/api/recruitment/{other_posting['id']}/applications",
            data={'applicant_name': 'Other Dept Candidate', 'email': 'other-candidate@test.com'},
            headers=_auth(auth_headers, 'hr'),
        )

        head_headers = _dept_head_headers(app, client, scoping_department.id)

        # Own department's posting: applications are visible.
        own_resp = client.get(f"/api/recruitment/{own_posting['id']}/applications", headers=head_headers)
        assert own_resp.status_code == 200
        own_apps = own_resp.get_json()['data']
        assert len(own_apps) == 1
        assert own_apps[0]['applicant_name'] == 'Own Dept Candidate'

        # Other department's posting: candidate data must not be reachable,
        # even though it's requested by a valid recruitment_id — the sub-
        # resource is scoped through the PARENT posting's department, not
        # independently trusted.
        other_resp = client.get(f"/api/recruitment/{other_posting['id']}/applications", headers=head_headers)
        assert other_resp.status_code == 403


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
