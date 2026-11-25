"""The Principal cannot edit / check / delete a register whose Head is the
Principal. Every other combination keeps its existing behaviour."""
import uuid
from datetime import date

import pytest


def _uid(email):
    from app.models.user import User
    return User.query.filter_by(email=email).first().id


def _create(client, headers, head_id, **extra):
    body = {
        'name': f'Reg {uuid.uuid4().hex[:6]}', 'register_no': f'PR-{uuid.uuid4().hex[:8]}',
        'head_id': head_id, 'cycle': 'DAILY', 'priority': 'HIGH',
        'start_date': date.today().isoformat(),
    }
    body.update(extra)
    resp = client.post('/api/registers', json=body, headers=headers)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()['data']


@pytest.fixture
def setup(client, auth_headers, principal_headers, app_context):
    principal_id = _uid('principal-test@school.test')
    teacher_id = _uid('regular-test@school.test')
    own = _create(client, auth_headers['chairman'], principal_id)
    other = _create(client, auth_headers['chairman'], teacher_id)
    return {'own': own, 'other': other, 'headers': {'c': auth_headers['chairman'], 'p': principal_headers}}


def _writes(client, headers, register_id):
    return {
        'put': client.put(f'/api/registers/{register_id}', json={'name': 'Renamed'}, headers=headers).status_code,
        'status': client.patch(f'/api/registers/{register_id}/status', json={'status': 'OK'}, headers=headers).status_code,
        'occ': client.patch(
            f'/api/registers/{register_id}/occurrences/{date.today().isoformat()}/status',
            json={'status': 'OK'}, headers=headers).status_code,
        'delete': client.delete(f'/api/registers/{register_id}', headers=headers).status_code,
    }


def test_principal_blocked_on_own_register(client, setup):
    result = _writes(client, setup['headers']['p'], setup['own']['id'])
    assert result == {'put': 403, 'status': 403, 'occ': 403, 'delete': 403}
    resp = client.put(f"/api/registers/{setup['own']['id']}", json={'name': 'x'}, headers=setup['headers']['p'])
    assert 'Principal' in resp.get_json()['message']
    # nothing changed
    chk = client.get(f"/api/registers/{setup['own']['id']}", headers=setup['headers']['c']).get_json()['data']
    assert chk['name'] == setup['own']['name']


def test_principal_manages_other_registers(client, setup):
    rid = setup['other']['id']
    assert client.put(f'/api/registers/{rid}', json={'name': 'Renamed'}, headers=setup['headers']['p']).status_code == 200
    assert client.patch(
        f'/api/registers/{rid}/occurrences/{date.today().isoformat()}/status',
        json={'status': 'OK'}, headers=setup['headers']['p']).status_code == 200
    assert client.delete(f'/api/registers/{rid}', headers=setup['headers']['p']).status_code == 200


def test_chairman_keeps_full_control_of_principal_register(client, setup):
    rid = setup['own']['id']
    assert client.put(f'/api/registers/{rid}', json={'name': 'By Chairman'}, headers=setup['headers']['c']).status_code == 200
    assert client.patch(
        f'/api/registers/{rid}/occurrences/{date.today().isoformat()}/status',
        json={'status': 'OK'}, headers=setup['headers']['c']).status_code == 200
    assert client.delete(f'/api/registers/{rid}', headers=setup['headers']['c']).status_code == 200


def test_locked_flag_in_responses(client, setup):
    p, c = setup['headers']['p'], setup['headers']['c']
    rows = {r['id']: r for r in client.get('/api/registers', headers=p).get_json()['data']}
    assert rows[setup['own']['id']]['own_principal_locked'] is True
    assert rows[setup['other']['id']]['own_principal_locked'] is False
    rows_c = {r['id']: r for r in client.get('/api/registers', headers=c).get_json()['data']}
    assert rows_c[setup['own']['id']]['own_principal_locked'] is False
    detail = client.get(f"/api/registers/{setup['own']['id']}", headers=p).get_json()['data']
    assert detail['own_principal_locked'] is True


def test_legacy_head_name_principal_is_locked(client, auth_headers, principal_headers):
    reg = _create(client, auth_headers['chairman'], None, head_name='Principal')
    assert client.delete(f"/api/registers/{reg['id']}", headers=principal_headers).status_code == 403
