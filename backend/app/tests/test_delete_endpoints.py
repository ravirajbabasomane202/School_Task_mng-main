"""
Backend route tests — DELETE endpoints

  DELETE /api/announcements/<id>   CHAIRMAN / DIRECTOR only
  DELETE /api/notifications/<id>   owner only
  DELETE /api/approvals/<id>       CHAIRMAN only

Each endpoint is checked for: unauthenticated (401), wrong role / not owner
(403), unknown id (404), success (200 + `{success, message, data: {id}}`) and
that the row is really gone afterwards.
"""

import uuid

import pytest


@pytest.fixture(autouse=True)
def _fresh_session(app):
    """These tests read ORM objects through the same session the HTTP requests use.
    conftest's `auth_headers` resets seeded users' passwords in a *different*
    session, so drop anything cached here before and after each test or a later
    test's login would be checked against a stale password hash."""
    from app.extensions import db
    db.session.rollback()
    db.session.expire_all()
    yield
    db.session.rollback()
    db.session.expire_all()


def _user_id(email):
    from app.models.user import User
    return User.query.filter_by(email=email).first().id


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

def _make_announcement(message='Delete me'):
    from app.extensions import db
    from app.models.notification import Announcement

    ann = Announcement(created_by=_user_id('chairman-test@school.test'), target='ALL', message=message)
    db.session.add(ann)
    db.session.commit()
    return ann.id


class TestDeleteAnnouncement:
    def test_requires_auth(self, client, auth_headers, app_context):
        ann_id = _make_announcement()
        resp = client.delete(f'/api/announcements/{ann_id}')
        assert resp.status_code in (401, 422)

    @pytest.mark.parametrize('role', ['hr', 'finance', 'it', 'purchase', 'regular'])
    def test_other_roles_forbidden_and_row_kept(self, client, auth_headers, app_context, role):
        from app.extensions import db
        from app.models.notification import Announcement

        ann_id = _make_announcement()
        resp = client.delete(f'/api/announcements/{ann_id}', headers=auth_headers[role])
        assert resp.status_code == 403
        assert resp.get_json()['success'] is False
        assert db.session.get(Announcement, ann_id) is not None

    @pytest.mark.parametrize('role', ['chairman', 'director'])
    def test_chairman_and_director_can_delete(self, client, auth_headers, app_context, role):
        from app.extensions import db
        from app.models.notification import Announcement

        ann_id = _make_announcement()
        resp = client.delete(f'/api/announcements/{ann_id}', headers=auth_headers[role])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['data'] == {'id': ann_id}
        db.session.expire_all()
        assert db.session.get(Announcement, ann_id) is None

    def test_deleted_announcement_no_longer_listed(self, client, auth_headers, app_context):
        ann_id = _make_announcement(f'gone-{uuid.uuid4().hex[:6]}')
        client.delete(f'/api/announcements/{ann_id}', headers=auth_headers['chairman'])
        listed = client.get('/api/announcements', headers=auth_headers['chairman']).get_json()['data']
        assert ann_id not in [a['id'] for a in listed]

    def test_unknown_id_returns_404(self, client, auth_headers, app_context):
        resp = client.delete('/api/announcements/999999', headers=auth_headers['chairman'])
        assert resp.status_code == 404
        assert resp.get_json()['success'] is False

    def test_second_delete_returns_404(self, client, auth_headers, app_context):
        ann_id = _make_announcement()
        assert client.delete(f'/api/announcements/{ann_id}', headers=auth_headers['chairman']).status_code == 200
        assert client.delete(f'/api/announcements/{ann_id}', headers=auth_headers['chairman']).status_code == 404

    def test_non_integer_id_is_not_routed(self, client, auth_headers, app_context):
        resp = client.delete('/api/announcements/abc', headers=auth_headers['chairman'])
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def _make_notification(email, message='Delete me', task_id=None):
    from app.extensions import db
    from app.models.notification import Notification

    notif = Notification(user_id=_user_id(email), type='ANNOUNCEMENT', message=message, task_id=task_id)
    db.session.add(notif)
    db.session.commit()
    return notif.id


class TestDeleteNotification:
    def test_requires_auth(self, client, auth_headers, app_context):
        notif_id = _make_notification('hr-test@school.test')
        resp = client.delete(f'/api/notifications/{notif_id}')
        assert resp.status_code in (401, 422)

    def test_owner_can_delete(self, client, auth_headers, app_context):
        from app.extensions import db
        from app.models.notification import Notification

        notif_id = _make_notification('hr-test@school.test')
        resp = client.delete(f'/api/notifications/{notif_id}', headers=auth_headers['hr'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['data'] == {'id': notif_id}
        db.session.expire_all()
        assert db.session.get(Notification, notif_id) is None

    def test_cannot_delete_someone_elses_notification(self, client, auth_headers, app_context):
        from app.extensions import db
        from app.models.notification import Notification

        notif_id = _make_notification('hr-test@school.test')
        resp = client.delete(f'/api/notifications/{notif_id}', headers=auth_headers['finance'])
        assert resp.status_code == 403
        assert db.session.get(Notification, notif_id) is not None

    def test_chairman_cannot_delete_someone_elses_notification(self, client, auth_headers, app_context):
        notif_id = _make_notification('hr-test@school.test')
        resp = client.delete(f'/api/notifications/{notif_id}', headers=auth_headers['chairman'])
        assert resp.status_code == 403

    def test_unknown_id_returns_404(self, client, auth_headers, app_context):
        resp = client.delete('/api/notifications/999999', headers=auth_headers['hr'])
        assert resp.status_code == 404
        assert resp.get_json()['success'] is False

    def test_deleted_notification_no_longer_listed(self, client, auth_headers, app_context):
        keep = _make_notification('it-test@school.test', 'keep')
        gone = _make_notification('it-test@school.test', 'gone')
        client.delete(f'/api/notifications/{gone}', headers=auth_headers['it'])
        ids = [n['id'] for n in client.get('/api/notifications', headers=auth_headers['it']).get_json()['data']]
        assert gone not in ids and keep in ids

    def test_mark_read_works_for_owner_and_is_forbidden_for_others(self, client, auth_headers, app_context):
        """The owner check compared an int column to the JWT's *string* identity,
        so even the owner got 403 on PUT /<id>/read."""
        notif_id = _make_notification('purchase-test@school.test')
        assert client.put(f'/api/notifications/{notif_id}/read', headers=auth_headers['purchase']).status_code == 200
        assert client.put(f'/api/notifications/{notif_id}/read', headers=auth_headers['hr']).status_code == 403


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------

def _make_approval(status='PENDING', title='Delete me'):
    from app.extensions import db
    from app.models.approval import Approval

    approval = Approval(
        type='PURCHASE',
        title=title,
        status=status,
        requested_by=_user_id('hr-test@school.test'),
        approved_by=_user_id('chairman-test@school.test') if status != 'PENDING' else None,
    )
    db.session.add(approval)
    db.session.commit()
    return approval.id


class TestDeleteApproval:
    def test_requires_auth(self, client, auth_headers, app_context):
        approval_id = _make_approval()
        resp = client.delete(f'/api/approvals/{approval_id}')
        assert resp.status_code in (401, 422)

    @pytest.mark.parametrize('role', ['director', 'hr', 'finance', 'regular'])
    def test_non_chairman_forbidden_and_row_kept(self, client, auth_headers, app_context, role):
        from app.extensions import db
        from app.models.approval import Approval

        approval_id = _make_approval()
        resp = client.delete(f'/api/approvals/{approval_id}', headers=auth_headers[role])
        assert resp.status_code == 403
        assert db.session.get(Approval, approval_id) is not None

    @pytest.mark.parametrize('status', ['PENDING', 'APPROVED', 'REJECTED'])
    def test_chairman_can_delete_in_any_status(self, client, auth_headers, app_context, status):
        from app.extensions import db
        from app.models.approval import Approval

        approval_id = _make_approval(status=status)
        resp = client.delete(f'/api/approvals/{approval_id}', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['data'] == {'id': approval_id}
        db.session.expire_all()
        assert db.session.get(Approval, approval_id) is None

    def test_users_are_not_touched(self, client, auth_headers, app_context):
        """The approval points at users (requester / approver) — deleting it must
        never cascade the other way."""
        from app.models.user import User

        approval_id = _make_approval(status='APPROVED')
        client.delete(f'/api/approvals/{approval_id}', headers=auth_headers['chairman'])
        assert User.query.filter_by(email='hr-test@school.test').first() is not None
        assert User.query.filter_by(email='chairman-test@school.test').first() is not None

    def test_deleted_pending_approval_leaves_dashboard_counts(self, client, auth_headers, app_context):
        from app.models.approval import Approval

        approval_id = _make_approval(status='PENDING')
        before = Approval.query.filter_by(status='PENDING').count()
        client.delete(f'/api/approvals/{approval_id}', headers=auth_headers['chairman'])
        assert Approval.query.filter_by(status='PENDING').count() == before - 1
        listed = client.get('/api/approvals', headers=auth_headers['chairman']).get_json()['data']
        assert approval_id not in [a['id'] for a in listed]

    def test_unknown_id_returns_404(self, client, auth_headers, app_context):
        resp = client.delete('/api/approvals/999999', headers=auth_headers['chairman'])
        assert resp.status_code == 404
        assert resp.get_json()['success'] is False

    def test_cannot_process_after_delete(self, client, auth_headers, app_context):
        approval_id = _make_approval()
        client.delete(f'/api/approvals/{approval_id}', headers=auth_headers['chairman'])
        resp = client.put(
            f'/api/approvals/{approval_id}/process',
            json={'status': 'APPROVED'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 404
