"""Key Responsibilities: storage, permissions, per-user isolation, templates."""
import uuid

import pytest

from app.extensions import db
from app.models.user import User

pytestmark = pytest.mark.usefixtures('cleanup_feature_data')


def _user_id(app, email):
    with app.app_context():
        return User.query.filter_by(email=email).first().id


def _new_user(client, headers, **extra):
    payload = {
        'name': 'Test Person',
        'email': f'kr-{uuid.uuid4().hex[:8]}@school.test',
        'password': 'password123',
        'role': 'HR',
        'head_type': 'HR Head',
    }
    payload.update(extra)
    return client.post('/api/users', json=payload, headers=headers)


def test_create_user_with_responsibilities_and_list_returns_them_in_order(client, auth_headers):
    response = _new_user(client, auth_headers['chairman'], key_responsibilities=['  First  ', '', 'Second', 'Third'],
                         responsibility_summary='Runs the office')
    assert response.status_code == 201
    body = response.get_json()
    assert [r['description'] for r in body['key_responsibilities']] == ['First', 'Second', 'Third']
    assert body['responsibility_summary'] == 'Runs the office'

    listing = client.get('/api/users', headers=auth_headers['chairman']).get_json()['data']
    row = next(u for u in listing if u['id'] == body['id'])
    assert [r['description'] for r in row['key_responsibilities']] == ['First', 'Second', 'Third']


def test_update_replaces_responsibilities_and_omitting_field_keeps_them(client, auth_headers):
    created = _new_user(client, auth_headers['chairman'], key_responsibilities=['A', 'B']).get_json()
    uid = created['id']

    kept = client.put(f'/api/users/{uid}', json={'name': 'Renamed'}, headers=auth_headers['chairman'])
    assert kept.status_code == 200
    assert [r['description'] for r in kept.get_json()['key_responsibilities']] == ['A', 'B']

    replaced = client.put(f'/api/users/{uid}', json={'key_responsibilities': ['Only one']},
                          headers=auth_headers['chairman'])
    assert [r['description'] for r in replaced.get_json()['key_responsibilities']] == ['Only one']

    cleared = client.put(f'/api/users/{uid}', json={'key_responsibilities': []}, headers=auth_headers['chairman'])
    assert cleared.get_json()['key_responsibilities'] == []


def test_invalid_responsibility_payloads_are_rejected(client, auth_headers):
    uid = _new_user(client, auth_headers['chairman']).get_json()['id']
    too_long = client.put(f'/api/users/{uid}', json={'key_responsibilities': ['x' * 2001]},
                          headers=auth_headers['chairman'])
    assert too_long.status_code == 400
    not_list = client.put(f'/api/users/{uid}', json={'key_responsibilities': 'oops'},
                          headers=auth_headers['chairman'])
    assert not_list.status_code == 400
    bad_item = client.put(f'/api/users/{uid}', json={'key_responsibilities': [5]}, headers=auth_headers['chairman'])
    assert bad_item.status_code == 400


def test_only_chairman_level_can_assign_responsibilities(client, auth_headers, principal_headers):
    for headers in (auth_headers['hr'], auth_headers['director'], auth_headers['finance']):
        assert _new_user(client, headers, key_responsibilities=['x']).status_code == 403
    assert _new_user(client, principal_headers, key_responsibilities=['x']).status_code == 201


def test_me_endpoint_returns_only_the_callers_responsibilities(app, client, auth_headers):
    a = _new_user(client, auth_headers['chairman'], key_responsibilities=['Alpha duty']).get_json()
    b = _new_user(client, auth_headers['chairman'], key_responsibilities=['Beta duty']).get_json()
    # log in as each created user
    tokens = {}
    for user, email in ((a, a['email']), (b, b['email'])):
        login = client.post('/api/auth/login', json={'email': email, 'password': 'password123'})
        assert login.status_code == 200
        tokens[user['id']] = {'Authorization': f"Bearer {login.get_json()['data']['accessToken']}"}

    mine_a = client.get('/api/key-responsibilities/me', headers=tokens[a['id']]).get_json()['data']
    mine_b = client.get('/api/key-responsibilities/me', headers=tokens[b['id']]).get_json()['data']
    assert [i['description'] for i in mine_a['items']] == ['Alpha duty']
    assert [i['description'] for i in mine_b['items']] == ['Beta duty']
    assert mine_a['user_id'] == a['id']

    # a client-supplied user id is ignored on /me
    spoof = client.get(f"/api/key-responsibilities/me?user_id={b['id']}", headers=tokens[a['id']]).get_json()['data']
    assert [i['description'] for i in spoof['items']] == ['Alpha duty']


def test_me_endpoint_empty_state_and_auth_required(client, auth_headers):
    fresh = _new_user(client, auth_headers['chairman']).get_json()
    login = client.post('/api/auth/login', json={'email': fresh['email'], 'password': 'password123'})
    headers = {'Authorization': f"Bearer {login.get_json()['data']['accessToken']}"}
    data = client.get('/api/key-responsibilities/me', headers=headers).get_json()['data']
    assert data['items'] == [] and data['summary'] is None
    assert client.get('/api/key-responsibilities/me').status_code == 401


def test_user_responsibilities_by_id_is_self_or_manager_only(client, auth_headers):
    a = _new_user(client, auth_headers['chairman'], key_responsibilities=['Secret duty']).get_json()
    assert client.get(f"/api/key-responsibilities/users/{a['id']}", headers=auth_headers['chairman']).status_code == 200
    assert client.get(f"/api/key-responsibilities/users/{a['id']}", headers=auth_headers['hr']).status_code == 403
    login = client.post('/api/auth/login', json={'email': a['email'], 'password': 'password123'})
    own = {'Authorization': f"Bearer {login.get_json()['data']['accessToken']}"}
    assert client.get(f"/api/key-responsibilities/users/{a['id']}", headers=own).status_code == 200


def test_templates_cover_the_six_kra_roles_and_are_manager_only(client, auth_headers):
    assert client.get('/api/key-responsibilities/templates', headers=auth_headers['hr']).status_code == 403
    data = client.get('/api/key-responsibilities/templates', headers=auth_headers['chairman']).get_json()['data']
    assert set(data) == {'DIRECTOR', 'PRINCIPAL', 'ADMIN', 'FINANCE', 'ADMISSION', 'HR'}
    assert len(data['ADMISSION']['items']) == 15
    assert len(data['ADMIN']['items']) == 11
    assert len(data['FINANCE']['items']) == 4
    assert len(data['HR']['items']) == 7
    assert len(data['DIRECTOR']['items']) == 8
    assert len(data['PRINCIPAL']['items']) == 10


def test_apply_template_never_overwrites_existing_responsibilities(app, client, auth_headers):
    from app.key_responsibility_templates import apply_template
    created = _new_user(client, auth_headers['chairman'], role='FINANCE', key_responsibilities=['Mine']).get_json()
    with app.app_context():
        user = db.session.get(User, created['id'])
        assert apply_template(user) is False
        db.session.commit()
        assert [r.description for r in user.key_responsibilities] == ['Mine']

    empty = _new_user(client, auth_headers['chairman'], role='FINANCE').get_json()
    with app.app_context():
        user = db.session.get(User, empty['id'])
        assert apply_template(user) is True
        db.session.commit()
        assert len(user.key_responsibilities) == 4


def test_deleting_user_row_cascades_responsibilities(app, client, auth_headers):
    from app.models.key_responsibility import UserKeyResponsibility
    created = _new_user(client, auth_headers['chairman'], key_responsibilities=['gone soon']).get_json()
    with app.app_context():
        user = db.session.get(User, created['id'])
        db.session.delete(user)
        db.session.commit()
        assert UserKeyResponsibility.query.filter_by(user_id=created['id']).count() == 0
