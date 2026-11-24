import io
import json
from datetime import date, timedelta

import pytest


@pytest.fixture
def event_upload_dir(app, tmp_path):
    original_upload_folder = app.config['UPLOAD_FOLDER']
    app.config['UPLOAD_FOLDER'] = str(tmp_path / 'uploads')
    try:
        yield app.config['UPLOAD_FOLDER']
    finally:
        app.config['UPLOAD_FOLDER'] = original_upload_folder


def _event_data(target_audience=None, **changes):
    start = date.today() + timedelta(days=14)
    data = {
        'title': 'First Unit Test',
        'description': 'Assessment for all classes',
        'category': 'EXAMINATION',
        'start_date': start.isoformat(),
        'end_date': start.isoformat(),
        'start_time': '09:00',
        'end_time': '11:00',
        'location': 'School Hall',
        'target_audience': target_audience or ['ALL'],
    }
    data.update(changes)
    return data


def _create_event(client, headers, target_audience=None, attachment=None, **changes):
    data = _event_data(target_audience, **changes)
    form_data = {key: value for key, value in data.items() if key != 'target_audience'}
    form_data['target_audience'] = json.dumps(data['target_audience'])
    if attachment:
        form_data['attachment'] = (io.BytesIO(attachment[1]), attachment[0])
    return client.post(
        '/api/academic-events',
        data=form_data,
        headers=headers,
        content_type='multipart/form-data',
    )


def test_chairman_can_create_edit_delete_and_dashboard_reflects_changes(
    client, auth_headers, event_upload_dir
):
    created = _create_event(client, auth_headers['chairman'])
    assert created.status_code == 201, created.get_data(as_text=True)
    event_id = created.get_json()['data']['id']

    upcoming = client.get('/api/academic-events?upcoming=true', headers=auth_headers['hr'])
    assert upcoming.status_code == 200
    assert any(event['id'] == event_id for event in upcoming.get_json()['data'])

    updated = client.put(
        f'/api/academic-events/{event_id}',
        data={'title': 'Updated Unit Test', 'category': 'ACADEMIC'},
        headers=auth_headers['chairman'],
        content_type='multipart/form-data',
    )
    assert updated.status_code == 200
    assert updated.get_json()['data']['title'] == 'Updated Unit Test'
    assert updated.get_json()['data']['category'] == 'ACADEMIC'

    upcoming = client.get('/api/academic-events?upcoming=true', headers=auth_headers['hr'])
    assert any(
        event['id'] == event_id and event['title'] == 'Updated Unit Test'
        for event in upcoming.get_json()['data']
    )
    assert client.get(
        f'/api/academic-events/{event_id}', headers=auth_headers['hr']
    ).status_code == 200

    deleted = client.delete(f'/api/academic-events/{event_id}', headers=auth_headers['chairman'])
    assert deleted.status_code == 200
    upcoming = client.get('/api/academic-events?upcoming=true', headers=auth_headers['hr'])
    assert all(event['id'] != event_id for event in upcoming.get_json()['data'])


def test_principal_can_create_edit_and_delete_events(
    client, principal_headers, event_upload_dir
):
    created = _create_event(client, principal_headers)
    assert created.status_code == 201, created.get_data(as_text=True)
    event_id = created.get_json()['data']['id']
    assert client.put(
        f'/api/academic-events/{event_id}',
        json={'title': 'Principal Updated'},
        headers=principal_headers,
    ).status_code == 200
    assert client.delete(
        f'/api/academic-events/{event_id}',
        headers=principal_headers,
    ).status_code == 200


@pytest.mark.parametrize('role_key', ['hr', 'director'])
def test_other_users_can_only_view_events(
    client, auth_headers, event_upload_dir, role_key
):
    created = _create_event(client, auth_headers['chairman'])
    event_id = created.get_json()['data']['id']
    headers = auth_headers[role_key]

    assert client.get('/api/academic-events', headers=headers).status_code == 200
    assert client.get(f'/api/academic-events/{event_id}', headers=headers).status_code == 200
    assert client.put(
        f'/api/academic-events/{event_id}',
        json={'title': 'Not Allowed'},
        headers=headers,
    ).status_code == 403
    assert client.delete(f'/api/academic-events/{event_id}', headers=headers).status_code == 403
    assert _create_event(client, headers).status_code == 403


def test_target_audience_filters_list_dashboard_and_details(
    client, auth_headers, principal_headers, event_upload_dir
):
    created = _create_event(
        client,
        auth_headers['chairman'],
        target_audience=['PRINCIPAL'],
        title='Principal-only Event',
    )
    event_id = created.get_json()['data']['id']

    assert all(
        event['id'] != event_id
        for event in client.get('/api/academic-events?upcoming=true', headers=auth_headers['hr']).get_json()['data']
    )
    assert client.get(
        f'/api/academic-events/{event_id}', headers=auth_headers['hr']
    ).status_code == 403
    assert any(
        event['id'] == event_id
        for event in client.get('/api/academic-events?upcoming=true', headers=principal_headers).get_json()['data']
    )


def test_event_attachment_is_optional_and_download_is_authenticated(
    client, auth_headers, event_upload_dir
):
    contents = b'%PDF-academic-event'
    created = _create_event(
        client,
        auth_headers['chairman'],
        attachment=('event.pdf', contents),
    )
    assert created.status_code == 201, created.get_data(as_text=True)
    event = created.get_json()['data']
    assert event['has_attachment'] is True
    download = client.get(
        f"/api/academic-events/{event['id']}/attachment",
        headers=auth_headers['hr'],
    )
    assert download.status_code == 200
    assert download.data == contents
    download.close()
    assert client.get(f"/api/academic-events/{event['id']}/attachment").status_code in (401, 422)


def test_invalid_dates_audiences_and_attachments_are_rejected(
    client, auth_headers, event_upload_dir
):
    start = date.today() + timedelta(days=14)
    invalid_dates = _create_event(
        client,
        auth_headers['chairman'],
        end_date=(start - timedelta(days=1)).isoformat(),
    )
    assert invalid_dates.status_code == 400

    invalid_audience = _create_event(
        client,
        auth_headers['chairman'],
        target_audience=['NOT_A_ROLE'],
    )
    assert invalid_audience.status_code == 400

    invalid_file = _create_event(
        client,
        auth_headers['chairman'],
        attachment=('script.exe', b'MZ'),
    )
    assert invalid_file.status_code == 400


def test_event_api_requires_authentication(client, event_upload_dir):
    assert client.get('/api/academic-events').status_code == 401
    assert client.post('/api/academic-events', json=_event_data()).status_code in (401, 422)
