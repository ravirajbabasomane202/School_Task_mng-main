"""Imp Notification: CRUD, permissions, recurrence cycles and reminders."""
import uuid
from datetime import date, timedelta

import pytest

from app.models.imp_notification import (
    ImpNotification, ImpNotificationReminder, advance_due_date, next_due_date_after,
)

BASE = '/api/imp-notifications'


def _uid(email):
    from app.models.user import User
    return User.query.filter_by(email=email).first().id


@pytest.fixture(autouse=True)
def _fresh(app):
    from app.extensions import db
    from app.models.notification import Notification
    db.session.rollback()
    # The test DB is shared for the whole session: start every test with no
    # other Imp Notifications so reminder counts are exact.
    Notification.query.filter(Notification.imp_notification_id.isnot(None)).delete(synchronize_session=False)
    for row in ImpNotification.query.all():
        db.session.delete(row)
    db.session.commit()
    db.session.expire_all()
    yield
    db.session.rollback()
    db.session.expire_all()


@pytest.fixture
def hr_id(auth_headers, app_context):
    return _uid('hr-test@school.test')


def _create(client, headers, hr_id, **over):
    body = {
        'title': f'Academic Calendar {uuid.uuid4().hex[:5]}', 'description': 'Finalise it',
        'due_date': '2027-06-25', 'start_date': '2027-06-20', 'recurrence': 'YEARLY',
        'priority': 'HIGH', 'assigned_user_ids': [hr_id], 'assigned_roles': [],
    }
    body.update(over)
    resp = client.post(BASE, json=body, headers=headers)
    return resp


def _reminders(app, nid, user_id):
    from app.models.notification import Notification
    with app.app_context():
        return Notification.query.filter_by(imp_notification_id=nid, user_id=user_id).count()


# ---- recurrence maths ------------------------------------------------------

def test_month_end_and_leap_year_rules():
    assert advance_due_date(date(2027, 1, 31), 'MONTHLY', 31) == date(2027, 2, 28)
    assert advance_due_date(date(2027, 2, 28), 'MONTHLY', 31) == date(2027, 3, 31)
    assert advance_due_date(date(2028, 1, 31), 'MONTHLY', 31) == date(2028, 2, 29)
    assert advance_due_date(date(2028, 2, 29), 'YEARLY', 29) == date(2029, 2, 28)
    assert advance_due_date(date(2031, 2, 28), 'YEARLY', 29) == date(2032, 2, 29)  # back on the leap day
    assert advance_due_date(date(2027, 6, 25), 'YEARLY', 25) == date(2028, 6, 25)
    assert advance_due_date(date(2027, 6, 25), 'WEEKLY', 25) == date(2027, 7, 2)
    assert advance_due_date(date(2027, 6, 25), 'DAILY', 25) == date(2027, 6, 26)
    assert next_due_date_after(date(2027, 6, 25), 'ONE_TIME', 25, date(2027, 6, 25)) is None


def test_late_completion_skips_past_occurrences():
    # Daily cycle due 1 Jun finished on 4 Jun: next is 5 Jun, not 2 Jun.
    assert next_due_date_after(date(2027, 6, 1), 'DAILY', 1, date(2027, 6, 4)) == date(2027, 6, 5)
    # Yearly finished early: next year, not the same year.
    assert next_due_date_after(date(2027, 6, 25), 'YEARLY', 25, date(2027, 6, 1)) == date(2028, 6, 25)


# ---- CRUD & permissions ----------------------------------------------------

def test_create_validation_and_permissions(client, auth_headers, principal_headers, hr_id):
    assert _create(client, auth_headers['hr'], hr_id).status_code == 403
    assert _create(client, auth_headers['director'], hr_id).status_code == 403
    assert _create(client, auth_headers['chairman'], hr_id, title='  ').status_code == 400
    assert _create(client, auth_headers['chairman'], hr_id, due_date='2027-02-30').status_code == 400
    assert _create(client, auth_headers['chairman'], hr_id, recurrence='HOURLY').status_code == 400
    assert _create(client, auth_headers['chairman'], hr_id, priority='URGENT').status_code == 400
    assert _create(client, auth_headers['chairman'], hr_id, start_date='2027-07-01').status_code == 400
    assert _create(client, auth_headers['chairman'], hr_id, assigned_user_ids=[], assigned_roles=[]).status_code == 400
    ok = _create(client, principal_headers, hr_id)
    assert ok.status_code == 201
    data = ok.get_json()['data']
    assert data['status'] == 'PENDING' and data['cycle']['cycle_number'] == 1
    assert data['history'][-1]['status'] == 'UPCOMING'
    assert client.get(BASE, headers={}).status_code == 401


def test_visibility_edit_delete_rules(client, auth_headers, hr_id):
    nid = _create(client, auth_headers['chairman'], hr_id).get_json()['data']['id']
    assert nid in [r['id'] for r in client.get(BASE, headers=auth_headers['hr']).get_json()['data']]
    assert nid not in [r['id'] for r in client.get(BASE, headers=auth_headers['finance']).get_json()['data']]
    assert client.get(f'{BASE}/{nid}', headers=auth_headers['finance']).status_code == 403
    assert client.put(f'{BASE}/{nid}', json={'title': 'x'}, headers=auth_headers['hr']).status_code == 403
    assert client.delete(f'{BASE}/{nid}', headers=auth_headers['hr']).status_code == 403
    assert client.patch(f'{BASE}/{nid}/active', json={'is_active': False}, headers=auth_headers['hr']).status_code == 403
    assert client.patch(f'{BASE}/{nid}/status', json={'status': 'DONE'}, headers=auth_headers['finance']).status_code == 403
    assert client.put(f'{BASE}/{nid}', json={'title': 'Renamed'}, headers=auth_headers['chairman']).status_code == 200
    assert client.delete(f'{BASE}/{nid}', headers=auth_headers['chairman']).status_code == 200
    assert client.get(f'{BASE}/{nid}', headers=auth_headers['chairman']).status_code == 404


def test_role_assignment_resolves_to_users(client, auth_headers, hr_id):
    nid = _create(client, auth_headers['chairman'], hr_id, assigned_user_ids=[], assigned_roles=['FINANCE']).get_json()['data']['id']
    assert nid in [r['id'] for r in client.get(BASE, headers=auth_headers['finance']).get_json()['data']]
    assert nid not in [r['id'] for r in client.get(BASE, headers=auth_headers['hr']).get_json()['data']]


# ---- cycles ----------------------------------------------------------------

def test_yearly_completion_creates_next_cycle_and_keeps_history(client, auth_headers, hr_id):
    nid = _create(client, auth_headers['chairman'], hr_id).get_json()['data']['id']
    assert client.patch(f'{BASE}/{nid}/status', json={'status': 'IN_PROGRESS'}, headers=auth_headers['hr']).status_code == 200
    resp = client.patch(f'{BASE}/{nid}/status', json={'status': 'DONE'}, headers=auth_headers['hr'])
    assert resp.status_code == 200
    data = resp.get_json()['data']
    hist = data['history']
    assert [h['status'] for h in hist] == ['DONE', 'PENDING', 'UPCOMING']
    assert hist[0]['due_date'] == '2027-06-25' and hist[0]['completed_by_name']
    assert hist[0]['completed_at']
    # next cycle is a year later, same day, no duplicate config row
    assert hist[1]['due_date'] > '2027-06-25' and hist[1]['due_date'][5:] == '06-25'
    assert data['status'] == 'PENDING'
    # cannot complete the same cycle twice / done cycle not reopenable via the first cycle
    again = client.patch(f'{BASE}/{nid}/status', json={'status': 'DONE'}, headers=auth_headers['hr'])
    assert again.status_code == 200  # completes the NEW current cycle
    assert len(client.get(f'{BASE}/{nid}', headers=auth_headers['hr']).get_json()['data']['history']) == 4


def test_one_time_stops_permanently(client, auth_headers, hr_id):
    nid = _create(client, auth_headers['chairman'], hr_id, recurrence='ONE_TIME').get_json()['data']['id']
    data = client.patch(f'{BASE}/{nid}/status', json={'status': 'DONE'}, headers=auth_headers['hr']).get_json()['data']
    assert [h['status'] for h in data['history']] == ['DONE']
    assert data['status'] == 'DONE' and data['next_reminder'] is None
    assert client.patch(f'{BASE}/{nid}/status', json={'status': 'DONE'}, headers=auth_headers['hr']).status_code == 409
    assert client.patch(f'{BASE}/{nid}/status', json={'status': 'PENDING'}, headers=auth_headers['hr']).status_code == 409


def test_edit_due_date_moves_current_cycle(client, auth_headers, hr_id):
    nid = _create(client, auth_headers['chairman'], hr_id).get_json()['data']['id']
    data = client.put(f'{BASE}/{nid}', json={'due_date': '2027-07-10', 'start_date': '2027-07-01'},
                      headers=auth_headers['chairman']).get_json()['data']
    assert data['cycle']['due_date'] == '2027-07-10' and len(data['history']) == 2


# ---- reminders -------------------------------------------------------------

def test_reminder_lifecycle(app, client, auth_headers, hr_id):
    from app.services.imp_notifications import run_imp_reminders
    nid = _create(client, auth_headers['chairman'], hr_id).get_json()['data']['id']
    with app.app_context():
        d = date(2027, 6, 25)
        assert run_imp_reminders(d - timedelta(days=10)) == 0          # before start date
        assert run_imp_reminders(d - timedelta(days=5)) == 1           # heads-up on start date
        assert run_imp_reminders(d - timedelta(days=5)) == 0           # same day: no duplicate
        assert run_imp_reminders(d - timedelta(days=2)) == 0           # only one heads-up before due
        assert run_imp_reminders(d) == 1                               # due day
        assert run_imp_reminders(d) == 0
        for i in (1, 2, 3):                                            # daily while overdue
            assert run_imp_reminders(d + timedelta(days=i)) == 1
            assert run_imp_reminders(d + timedelta(days=i)) == 0
    assert _reminders(app, nid, hr_id) == 5

    client.patch(f'{BASE}/{nid}/status', json={'status': 'DONE'}, headers=auth_headers['hr'])
    with app.app_context():
        # current cycle closed -> nothing for 2027; next cycle not reminded yet
        assert run_imp_reminders(date(2027, 6, 29)) == 0
        assert run_imp_reminders(date(2027, 12, 1)) == 0
        assert run_imp_reminders(date(2028, 6, 19)) == 0
        assert run_imp_reminders(date(2028, 6, 20)) == 1               # next year's heads-up
    # completion marked earlier reminders as read
    from app.models.notification import Notification
    with app.app_context():
        old = Notification.query.filter_by(imp_notification_id=nid, is_read=False).count()
        assert old == 1


def test_inactive_and_unassigned_get_no_reminders(app, client, auth_headers, hr_id):
    from app.services.imp_notifications import run_imp_reminders
    nid = _create(client, auth_headers['chairman'], hr_id, recurrence='ONE_TIME').get_json()['data']['id']
    client.patch(f'{BASE}/{nid}/active', json={'is_active': False}, headers=auth_headers['chairman'])
    with app.app_context():
        assert run_imp_reminders(date(2027, 6, 26)) == 0
    client.patch(f'{BASE}/{nid}/active', json={'is_active': True}, headers=auth_headers['chairman'])
    with app.app_context():
        assert run_imp_reminders(date(2027, 6, 26)) == 1
        assert run_imp_reminders(date(2027, 6, 26)) == 0
    assert _reminders(app, nid, hr_id) == 1
    assert _reminders(app, nid, _uid_fin(app)) == 0


def _uid_fin(app):
    with app.app_context():
        return _uid('finance-test@school.test')


def test_reminder_log_unique_constraint(app, client, auth_headers, hr_id):
    from sqlalchemy.exc import IntegrityError
    from app.extensions import db
    nid = _create(client, auth_headers['chairman'], hr_id).get_json()['data']['id']
    with app.app_context():
        cycle = db.session.get(ImpNotification, nid).current_cycle()
        db.session.add(ImpNotificationReminder(cycle_id=cycle.id, reminder_date=date(2027, 6, 25), kind='DUE'))
        db.session.commit()
        db.session.add(ImpNotificationReminder(cycle_id=cycle.id, reminder_date=date(2027, 6, 25), kind='DUE'))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_manual_trigger_permissions(client, auth_headers):
    assert client.post(f'{BASE}/run-reminders', headers=auth_headers['hr']).status_code == 403
    assert client.post(f'{BASE}/run-reminders', headers=auth_headers['chairman']).status_code == 200


def test_reminder_exposes_link_in_notification_api(app, client, auth_headers, hr_id):
    from app.services.imp_notifications import run_imp_reminders
    nid = _create(client, auth_headers['chairman'], hr_id, recurrence='ONE_TIME').get_json()['data']['id']
    with app.app_context():
        run_imp_reminders(date(2027, 6, 25))
    rows = client.get('/api/notifications', headers=auth_headers['hr']).get_json()['data']
    mine = [r for r in rows if r.get('imp_notification_id') == nid]
    assert mine and mine[0]['type'] == 'IMP_REMINDER'
