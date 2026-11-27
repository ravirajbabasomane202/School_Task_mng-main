"""Academic event responsibility, non-completion reasons, completion,
management approval (kept separate from completion) and the audit trail."""
import pytest
import json
import uuid
from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models.academic_event import AcademicEvent
from app.models.notification import Notification

pytestmark = pytest.mark.usefixtures('cleanup_feature_data')


@pytest.fixture(autouse=True)
def _upload_dir(app, tmp_path):
    original = app.config['UPLOAD_FOLDER']
    app.config['UPLOAD_FOLDER'] = str(tmp_path / 'uploads')
    yield
    app.config['UPLOAD_FOLDER'] = original


def _person(client, chairman, role='HR', name='Responsible Person'):
    email = f'ev-{uuid.uuid4().hex[:8]}@school.test'
    created = client.post('/api/users', json={
        'name': name, 'email': email, 'password': 'password123', 'role': role, 'head_type': f'{role} Head',
    }, headers=chairman)
    assert created.status_code == 201, created.get_data(as_text=True)
    login = client.post('/api/auth/login', json={'email': email, 'password': 'password123'})
    token = login.get_json()['data']['accessToken']
    return {'id': created.get_json()['id'], 'headers': {'Authorization': f'Bearer {token}'}, 'name': name}


def _create(client, headers, days_from_today=14, responsible=None, audience=None, **changes):
    day = (date.today() + timedelta(days=days_from_today)).isoformat()
    data = {
        'title': 'Annual Day', 'description': 'Programme', 'category': 'CELEBRATION',
        'start_date': day, 'end_date': day, 'start_time': '09:00', 'end_time': '11:00',
        'location': 'Hall', 'target_audience': json.dumps(audience or ['ALL']),
    }
    if responsible is not None:
        data['responsible_user_id'] = str(responsible)
    data.update(changes)
    return client.post('/api/academic-events', data=data, headers=headers, content_type='multipart/form-data')


def _event(client, headers, **kwargs):
    response = _create(client, headers, **kwargs)
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()['data']


def _get(client, headers, event_id):
    return client.get(f'/api/academic-events/{event_id}', headers=headers).get_json()['data']


def _history(client, headers, event_id):
    return client.get(f'/api/academic-events/{event_id}/history', headers=headers).get_json()['data']


def _notifications(app, user_id, type_):
    with app.app_context():
        return Notification.query.filter_by(user_id=user_id, type=type_).count()


# ---------------------------------------------------------------- creation

def test_event_stores_responsible_person_and_logs_creation(app, client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], responsible=person['id'])
    assert event['responsible_user_id'] == person['id']
    assert event['responsible_name'] == person['name']
    assert event['workflow_status'] == 'PLANNED'
    assert event['completion_status'] == 'PENDING'
    assert event['approval_status'] == 'PENDING'
    assert event['original_start_date'] == event['start_date']

    history = _history(client, auth_headers['chairman'], event['id'])
    assert history[0]['action'] == 'CREATED'
    assert history[0]['user_name']
    assert str(person['name']) in history[0]['summary']
    assert _notifications(app, person['id'], 'EVENT_ASSIGNED') == 1


def test_event_without_responsible_person_still_works(client, auth_headers):
    event = _event(client, auth_headers['chairman'])
    assert event['responsible_user_id'] is None
    assert event['responsible_name'] is None


@pytest.mark.parametrize('bad', ['abc', '999999'])
def test_invalid_responsible_person_is_rejected(client, auth_headers, bad):
    assert _create(client, auth_headers['chairman'], responsible=bad).status_code == 400


def test_inactive_responsible_person_is_rejected(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    client.delete(f"/api/users/{person['id']}", headers=auth_headers['chairman'])
    assert _create(client, auth_headers['chairman'], responsible=person['id']).status_code == 400


def test_responsible_person_sees_event_even_outside_its_audience(client, auth_headers):
    person = _person(client, auth_headers['chairman'], role='FINANCE')
    event = _event(client, auth_headers['chairman'], responsible=person['id'], audience=['HR'])
    assert client.get(f"/api/academic-events/{event['id']}", headers=person['headers']).status_code == 200
    other = _person(client, auth_headers['chairman'], role='FINANCE')
    assert client.get(f"/api/academic-events/{event['id']}", headers=other['headers']).status_code == 403


# ------------------------------------------------------------- overdue flag

def test_overdue_event_is_flagged_not_completed_and_notified_once(app, client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], days_from_today=-10, responsible=person['id'])

    data = _get(client, person['headers'], event['id'])
    assert data['is_overdue'] is True
    assert data['workflow_status'] == 'REASON_REQUIRED'
    assert data['completion_status'] == 'PENDING'          # time passing never completes it
    assert data['actual_completion_date'] is None

    # listing twice must not duplicate the alert
    client.get('/api/academic-events', headers=person['headers'])
    client.get('/api/academic-events', headers=person['headers'])
    assert _notifications(app, person['id'], 'EVENT_OVERDUE') == 1

    pending = client.get('/api/academic-events/pending-updates', headers=person['headers']).get_json()['data']
    assert [e['id'] for e in pending] == [event['id']]
    others = client.get('/api/academic-events/pending-updates', headers=auth_headers['hr']).get_json()['data']
    assert event['id'] not in [e['id'] for e in others]


def test_future_and_legacy_events_are_not_flagged(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    future = _event(client, auth_headers['chairman'], days_from_today=5, responsible=person['id'])
    assert future['is_overdue'] is False and future['workflow_status'] == 'PLANNED'
    legacy = _event(client, auth_headers['chairman'], days_from_today=-30)  # no responsible person
    assert legacy['is_overdue'] is False
    assert legacy['workflow_status'] == 'NOT_TRACKED'


# ------------------------------------------------------------------ reason

def test_responsible_person_submits_reason_and_it_is_saved_and_logged(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], days_from_today=-3, responsible=person['id'])
    response = client.post(f"/api/academic-events/{event['id']}/reason",
                           json={'reason': '  Heavy rain, ground unusable  '}, headers=person['headers'])
    assert response.status_code == 200
    data = response.get_json()['data']
    assert data['non_completion_reason'] == 'Heavy rain, ground unusable'
    assert data['reason_submitted_by_name'] == person['name']
    assert data['workflow_status'] == 'PENDING_COMPLETION'
    assert data['completion_status'] == 'PENDING'
    assert _get(client, auth_headers['chairman'], event['id'])['non_completion_reason'] == 'Heavy rain, ground unusable'
    actions = [h['action'] for h in _history(client, auth_headers['chairman'], event['id'])]
    assert 'REASON_SUBMITTED' in actions


def test_reason_validation_and_permissions(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    outsider = _person(client, auth_headers['chairman'], role='FINANCE')
    overdue = _event(client, auth_headers['chairman'], days_from_today=-3, responsible=person['id'])
    url = f"/api/academic-events/{overdue['id']}/reason"

    assert client.post(url, json={'reason': 'x'}, headers=outsider['headers']).status_code == 403
    assert client.post(url, json={'reason': '   '}, headers=person['headers']).status_code == 400
    assert client.post(url, json={}, headers=person['headers']).status_code == 400
    assert client.post(url, json={'reason': 'x' * 5001}, headers=person['headers']).status_code == 400
    assert client.post(url, json={'reason': 'ok'}, headers=auth_headers['chairman']).status_code == 200  # manager may

    future = _event(client, auth_headers['chairman'], days_from_today=7, responsible=person['id'])
    assert client.post(f"/api/academic-events/{future['id']}/reason", json={'reason': 'too early'},
                       headers=person['headers']).status_code == 400
    assert client.post(url).status_code == 401


# --------------------------------------------------------------- completion

def test_complete_on_time_keeps_approval_pending_and_separate(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], days_from_today=2, responsible=person['id'])
    response = client.post(f"/api/academic-events/{event['id']}/complete",
                           json={'remarks': 'Went well'}, headers=person['headers'])
    assert response.status_code == 200, response.get_data(as_text=True)
    data = response.get_json()['data']
    assert data['completion_status'] == 'COMPLETED'
    assert data['completed_by_name'] == person['name']
    assert data['completion_remarks'] == 'Went well'
    assert data['actual_completion_date'] == date.today().isoformat()
    assert data['approval_status'] == 'PENDING'            # never assumed
    assert data['workflow_status'] == 'AWAITING_APPROVAL'


def test_completing_late_requires_a_reason_on_record(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], days_from_today=-4, responsible=person['id'])
    url = f"/api/academic-events/{event['id']}/complete"

    missing = client.post(url, json={'remarks': 'done'}, headers=person['headers'])
    assert missing.status_code == 400
    assert _get(client, person['headers'], event['id'])['completion_status'] == 'PENDING'

    ok = client.post(url, json={'remarks': 'done', 'reason': 'Venue clash'}, headers=person['headers'])
    assert ok.status_code == 200
    assert ok.get_json()['data']['non_completion_reason'] == 'Venue clash'

    # a reason already submitted earlier is enough
    other = _event(client, auth_headers['chairman'], days_from_today=-4, responsible=person['id'])
    client.post(f"/api/academic-events/{other['id']}/reason", json={'reason': 'Exams'}, headers=person['headers'])
    assert client.post(f"/api/academic-events/{other['id']}/complete", json={}, headers=person['headers']).status_code == 200


def test_complete_validation_permissions_and_double_completion(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    outsider = _person(client, auth_headers['chairman'], role='FINANCE')
    event = _event(client, auth_headers['chairman'], days_from_today=1, responsible=person['id'])
    url = f"/api/academic-events/{event['id']}/complete"

    assert client.post(url, json={}, headers=outsider['headers']).status_code == 403
    assert client.post(url, json={'approval_status': 'MAYBE'}, headers=person['headers']).status_code == 400
    assert client.post(url, json={'actual_completion_date': 'garbage'}, headers=person['headers']).status_code == 400
    future_day = (date.today() + timedelta(days=3)).isoformat()
    assert client.post(url, json={'actual_completion_date': future_day}, headers=person['headers']).status_code == 400
    assert client.post(url, json={'remarks': 'x' * 5001}, headers=person['headers']).status_code == 400
    assert client.post(url, json={'approval_status': 'yes', 'approval_remarks': 'Director OK'},
                       headers=person['headers']).status_code == 200
    again = client.post(url, json={}, headers=person['headers'])
    assert again.status_code == 400


# ----------------------------------------------------------------- approval

def test_approval_is_separate_from_completion(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], days_from_today=1, responsible=person['id'])
    approval_url = f"/api/academic-events/{event['id']}/approval"

    # cannot approve before completion
    assert client.post(approval_url, json={'approval_status': 'YES'}, headers=person['headers']).status_code == 400

    client.post(f"/api/academic-events/{event['id']}/complete", json={'remarks': 'done'}, headers=person['headers'])
    before = _get(client, person['headers'], event['id'])

    yes = client.post(approval_url, json={'approval_status': 'YES', 'remarks': 'Approved by Chairman'},
                      headers=person['headers']).get_json()['data']
    assert yes['approval_status'] == 'YES' and yes['workflow_status'] == 'APPROVED'
    assert yes['approval_remarks'] == 'Approved by Chairman'
    for field in ('completion_status', 'completed_by', 'actual_completion_date', 'completion_remarks'):
        assert yes[field] == before[field]                   # completion untouched

    no = client.post(approval_url, json={'approval_status': 'NO'}, headers=auth_headers['chairman']).get_json()['data']
    assert no['workflow_status'] == 'NOT_APPROVED' and no['completion_status'] == 'COMPLETED'
    back = client.post(approval_url, json={'approval_status': 'PENDING'}, headers=auth_headers['chairman']).get_json()['data']
    assert back['workflow_status'] == 'AWAITING_APPROVAL'

    assert client.post(approval_url, json={'approval_status': 'bogus'}, headers=person['headers']).status_code == 400
    outsider = _person(client, auth_headers['chairman'], role='FINANCE')
    assert client.post(approval_url, json={'approval_status': 'YES'}, headers=outsider['headers']).status_code == 403


# ------------------------------------------------------------------ history

def test_history_records_schedule_and_responsibility_changes_with_user_and_time(client, auth_headers):
    first = _person(client, auth_headers['chairman'], name='First Owner')
    second = _person(client, auth_headers['chairman'], name='Second Owner')
    event = _event(client, auth_headers['chairman'], days_from_today=10, responsible=first['id'])
    new_day = (date.today() + timedelta(days=20)).isoformat()

    update = client.put(f"/api/academic-events/{event['id']}", data={
        'start_date': new_day, 'end_date': new_day, 'responsible_user_id': str(second['id']),
        'title': 'Annual Day 2',
    }, headers=auth_headers['chairman'], content_type='multipart/form-data')
    assert update.status_code == 200, update.get_data(as_text=True)
    data = update.get_json()['data']
    assert data['responsible_user_id'] == second['id']
    assert data['original_start_date'] == event['start_date']      # original schedule preserved
    assert data['start_date'] == new_day

    entries = _history(client, auth_headers['chairman'], event['id'])
    actions = [e['action'] for e in entries]
    assert actions[0] == 'CREATED'
    assert {'RESCHEDULED', 'RESPONSIBLE_CHANGED', 'UPDATED'} <= set(actions)
    assert all(e['created_at'] and e['user_name'] for e in entries)
    resched = next(e for e in entries if e['action'] == 'RESCHEDULED')
    assert resched['details']['from'][0] == event['start_date'] and resched['details']['to'][0] == new_day
    assert any('Second Owner' in e['summary'] for e in entries if e['action'] == 'RESPONSIBLE_CHANGED')


def test_full_lifecycle_appears_in_history_in_order(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], days_from_today=-2, responsible=person['id'])
    client.post(f"/api/academic-events/{event['id']}/reason", json={'reason': 'Delayed'}, headers=person['headers'])
    client.post(f"/api/academic-events/{event['id']}/complete", json={'remarks': 'Done now', 'approval_status': 'PENDING'},
                headers=person['headers'])
    client.post(f"/api/academic-events/{event['id']}/approval", json={'approval_status': 'YES', 'remarks': 'Fine'},
                headers=auth_headers['chairman'])
    actions = [e['action'] for e in _history(client, auth_headers['chairman'], event['id'])]
    assert actions == ['CREATED', 'REASON_SUBMITTED', 'COMPLETED', 'APPROVAL_UPDATED', 'APPROVAL_UPDATED']


def test_rescheduling_an_overdue_event_into_the_future_resets_the_flag(app, client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], days_from_today=-5, responsible=person['id'])
    client.get('/api/academic-events', headers=person['headers'])         # triggers the overdue alert
    assert _notifications(app, person['id'], 'EVENT_OVERDUE') == 1
    new_day = (date.today() + timedelta(days=9)).isoformat()
    updated = client.put(f"/api/academic-events/{event['id']}", data={'start_date': new_day, 'end_date': new_day},
                         headers=auth_headers['chairman'], content_type='multipart/form-data').get_json()['data']
    assert updated['is_overdue'] is False and updated['workflow_status'] == 'PLANNED'
    with app.app_context():
        assert db.session.get(AcademicEvent, event['id']).overdue_notified_at is None


def test_history_for_legacy_event_is_synthesised_and_requires_visibility(app, client, auth_headers):
    event = _event(client, auth_headers['chairman'], audience=['HR'])
    with app.app_context():
        from app.models.academic_event import AcademicEventHistory
        AcademicEventHistory.query.filter_by(event_id=event['id']).delete()
        db.session.commit()
    entries = _history(client, auth_headers['chairman'], event['id'])
    assert len(entries) == 1 and entries[0]['action'] == 'CREATED'
    assert client.get(f"/api/academic-events/{event['id']}/history", headers=auth_headers['finance']).status_code == 403


def test_deleting_event_removes_its_history(app, client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], responsible=person['id'])
    assert client.delete(f"/api/academic-events/{event['id']}", headers=auth_headers['chairman']).status_code == 200
    with app.app_context():
        from app.models.academic_event import AcademicEventHistory
        assert AcademicEventHistory.query.filter_by(event_id=event['id']).count() == 0


def test_manager_can_clear_the_responsible_person(client, auth_headers):
    person = _person(client, auth_headers['chairman'])
    event = _event(client, auth_headers['chairman'], responsible=person['id'])
    cleared = client.put(f"/api/academic-events/{event['id']}", data={'responsible_user_id': ''},
                         headers=auth_headers['chairman'], content_type='multipart/form-data')
    assert cleared.status_code == 200
    assert cleared.get_json()['data']['responsible_user_id'] is None
