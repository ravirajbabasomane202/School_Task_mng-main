"""
Backend route tests — GET /api/announcements/<id>

Verifies:
  * unauthenticated request -> 401
  * an ALL-target announcement is visible to anyone authenticated
  * a DEPARTMENT-target announcement is visible to users in that department,
    and to CHAIRMAN/DIRECTOR regardless of department, but NOT to users in a
    different department (403)
"""

import uuid

import pytest


def _make_department(app_context, name_prefix='Announce Dept'):
    from app.extensions import db
    from app.models.department import Department

    dept = Department(name=f'{name_prefix} {uuid.uuid4().hex[:10]}', description='For announcement tests')
    db.session.add(dept)
    db.session.commit()
    return dept


def _make_user(app, client, role='HR', department_id=None):
    from app.extensions import db
    from app.models.user import User

    email = f'announce-test-{uuid.uuid4().hex[:8]}@school.test'
    plain = str(uuid.uuid4())[:12]
    with app.app_context():
        user = User(
            name=f'{role} Announce Tester',
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


def _make_announcement(app, target='ALL', department_id=None, created_by=None, message='Test announcement'):
    from app.extensions import db
    from app.models.notification import Announcement
    from app.models.user import User

    with app.app_context():
        if created_by is None:
            creator = User.query.filter_by(role='CHAIRMAN').first()
            if creator is None:
                creator = User(
                    name='Chairman Seed',
                    email=f'chairman-seed-{uuid.uuid4().hex[:8]}@school.test',
                    role='CHAIRMAN',
                )
                creator.set_password('irrelevant')
                db.session.add(creator)
                db.session.commit()
            created_by = creator.id

        ann = Announcement(
            created_by=created_by,
            target=target,
            department_id=department_id,
            message=message,
        )
        db.session.add(ann)
        db.session.commit()
        ann_id = ann.id

    return ann_id


class TestGetAnnouncementRequiresAuth:
    def test_unauthenticated_request_returns_401(self, client, app, app_context):
        ann_id = _make_announcement(app, target='ALL')
        resp = client.get(f'/api/announcements/{ann_id}')
        assert resp.status_code in (401, 422)


class TestGetAnnouncementVisibility:
    def test_all_target_visible_to_any_authenticated_user(self, client, app, app_context):
        dept = _make_department(app_context)
        other_dept = _make_department(app_context, 'Announce Dept Other')
        ann_id = _make_announcement(app, target='ALL')

        _, headers = _make_user(app, client, role='IT', department_id=other_dept.id)
        resp = client.get(f'/api/announcements/{ann_id}', headers=headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['data']['id'] == ann_id

    def test_department_target_visible_to_own_department(self, client, app, app_context):
        dept = _make_department(app_context)
        ann_id = _make_announcement(app, target='DEPARTMENT', department_id=dept.id)

        _, headers = _make_user(app, client, role='IT', department_id=dept.id)
        resp = client.get(f'/api/announcements/{ann_id}', headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()['data']['id'] == ann_id

    def test_department_target_visible_to_chairman_and_director(self, client, app, app_context):
        dept = _make_department(app_context)
        ann_id = _make_announcement(app, target='DEPARTMENT', department_id=dept.id)

        _, chairman_headers = _make_user(app, client, role='CHAIRMAN')
        resp = client.get(f'/api/announcements/{ann_id}', headers=chairman_headers)
        assert resp.status_code == 200

        _, director_headers = _make_user(app, client, role='DIRECTOR')
        resp = client.get(f'/api/announcements/{ann_id}', headers=director_headers)
        assert resp.status_code == 200

    def test_department_target_forbidden_for_other_department(self, client, app, app_context):
        dept = _make_department(app_context, 'Announce Dept Owner')
        other_dept = _make_department(app_context, 'Announce Dept Outsider')
        ann_id = _make_announcement(app, target='DEPARTMENT', department_id=dept.id)

        _, outsider_headers = _make_user(app, client, role='IT', department_id=other_dept.id)
        resp = client.get(f'/api/announcements/{ann_id}', headers=outsider_headers)
        assert resp.status_code in (403, 404)

    def test_department_target_forbidden_for_user_without_department(self, client, app, app_context):
        dept = _make_department(app_context)
        ann_id = _make_announcement(app, target='DEPARTMENT', department_id=dept.id)

        _, no_dept_headers = _make_user(app, client, role='IT', department_id=None)
        resp = client.get(f'/api/announcements/{ann_id}', headers=no_dept_headers)
        assert resp.status_code in (403, 404)

    def test_missing_announcement_returns_404(self, client, app, app_context):
        _, headers = _make_user(app, client, role='HR')
        resp = client.get('/api/announcements/999999', headers=headers)
        assert resp.status_code == 404
