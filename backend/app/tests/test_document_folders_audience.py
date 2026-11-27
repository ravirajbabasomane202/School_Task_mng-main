"""Important Documents: per-user audience enforced server-side, folders and
subfolders, folder navigation permissions, and search/filters."""
import pytest
import io
import json
import uuid

import pytest

PDF = b'%PDF-1.7\nfolder audience test'

pytestmark = pytest.mark.usefixtures('cleanup_feature_data')


@pytest.fixture(autouse=True)
def _upload_dir(app, tmp_path):
    original = app.config['UPLOAD_FOLDER']
    app.config['UPLOAD_FOLDER'] = str(tmp_path / 'uploads')
    yield
    app.config['UPLOAD_FOLDER'] = original


def _person(client, chairman, role='HR', name=None):
    email = f'doc-{uuid.uuid4().hex[:8]}@school.test'
    created = client.post('/api/users', json={
        'name': name or f'Person {uuid.uuid4().hex[:4]}', 'email': email, 'password': 'password123', 'role': role,
    }, headers=chairman)
    assert created.status_code == 201
    login = client.post('/api/auth/login', json={'email': email, 'password': 'password123'})
    return {'id': created.get_json()['id'],
            'headers': {'Authorization': f"Bearer {login.get_json()['data']['accessToken']}"}}


def _upload(client, headers, name='Policy', category='Policies', filename='policy.pdf', **fields):
    data = {'name': name, 'description': 'desc', 'category': category, 'file': (io.BytesIO(PDF), filename)}
    for key, value in fields.items():
        data[key] = json.dumps(value) if isinstance(value, (list, dict)) else str(value)
    return client.post('/api/documents', data=data, headers=headers, content_type='multipart/form-data')


def _doc(client, headers, **kwargs):
    response = _upload(client, headers, **kwargs)
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()['data']


def _ids(response):
    return [d['id'] for d in response.get_json()['data']]


def _folder(client, headers, name, parent_id=None):
    response = client.post('/api/documents/folders', json={'name': name, 'parent_id': parent_id}, headers=headers)
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()['data']


# --------------------------------------------------------------- audience

def test_legacy_style_upload_stays_visible_to_everyone(client, auth_headers):
    doc = _doc(client, auth_headers['chairman'])
    assert doc['visible_to_all'] is True
    for role in ('hr', 'finance', 'director'):
        assert doc['id'] in _ids(client.get('/api/documents', headers=auth_headers[role]))


def test_restricted_document_is_enforced_by_the_backend(client, auth_headers):
    allowed = _person(client, auth_headers['chairman'])
    blocked = _person(client, auth_headers['chairman'])
    doc = _doc(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids=[allowed['id']])
    assert doc['visible_to_all'] is False
    assert doc['audience_user_ids'] == [allowed['id']]
    url = f"/api/documents/{doc['id']}"

    # allowed user: list, detail, download
    assert doc['id'] in _ids(client.get('/api/documents', headers=allowed['headers']))
    assert client.get(url, headers=allowed['headers']).status_code == 200
    download = client.get(url + '/download', headers=allowed['headers'])
    assert download.status_code == 200 and download.data == PDF
    download.close()

    # not selected: hidden from list/search AND blocked on direct requests
    assert doc['id'] not in _ids(client.get('/api/documents', headers=blocked['headers']))
    assert doc['id'] not in _ids(client.get('/api/documents?q=Policy', headers=blocked['headers']))
    assert client.get(url, headers=blocked['headers']).status_code == 403
    assert client.get(url + '/download', headers=blocked['headers']).status_code == 403

    # managers always see it; non-managers cannot edit/delete anyway
    assert client.get(url, headers=auth_headers['chairman']).status_code == 200
    assert client.put(url, json={'name': 'x'}, headers=blocked['headers']).status_code == 403
    assert client.delete(url, headers=blocked['headers']).status_code == 403


def test_uploader_keeps_access_to_their_own_restricted_document(client, auth_headers, principal_headers):
    other = _person(client, auth_headers['chairman'])
    doc = _doc(client, principal_headers, visible_to_all='false', audience_user_ids=[other['id']])
    assert client.get(f"/api/documents/{doc['id']}", headers=principal_headers).status_code == 200


def test_audience_can_be_updated_and_reopened_to_everyone(client, auth_headers):
    first = _person(client, auth_headers['chairman'])
    second = _person(client, auth_headers['chairman'])
    doc = _doc(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids=[first['id']])
    url = f"/api/documents/{doc['id']}"
    assert client.get(url, headers=second['headers']).status_code == 403

    changed = client.put(url, json={'audience_user_ids': [second['id']], 'visible_to_all': False},
                         headers=auth_headers['chairman'])
    assert changed.status_code == 200
    assert changed.get_json()['data']['audience_user_ids'] == [second['id']]
    assert client.get(url, headers=second['headers']).status_code == 200
    assert client.get(url, headers=first['headers']).status_code == 403

    opened = client.put(url, json={'visible_to_all': True}, headers=auth_headers['chairman'])
    assert opened.get_json()['data']['visible_to_all'] is True
    assert client.get(url, headers=first['headers']).status_code == 200


def test_audience_validation(client, auth_headers):
    empty = _upload(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids=[])
    assert empty.status_code == 400
    missing_user = _upload(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids=[987654])
    assert missing_user.status_code == 400
    garbage = _upload(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids='not-json')
    assert garbage.status_code == 400


def test_editing_details_does_not_reset_audience(client, auth_headers):
    member = _person(client, auth_headers['chairman'])
    doc = _doc(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids=[member['id']])
    edited = client.put(f"/api/documents/{doc['id']}", json={'name': 'Renamed'}, headers=auth_headers['chairman'])
    assert edited.get_json()['data']['audience_user_ids'] == [member['id']]
    assert edited.get_json()['data']['visible_to_all'] is False


def test_audience_ids_are_not_leaked_to_ordinary_users(client, auth_headers):
    member = _person(client, auth_headers['chairman'])
    doc = _doc(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids=[member['id']])
    seen = client.get(f"/api/documents/{doc['id']}", headers=member['headers']).get_json()['data']
    assert 'audience_user_ids' not in seen


def test_uploads_route_does_not_serve_document_files(client, auth_headers):
    doc = _doc(client, auth_headers['chairman'], visible_to_all='false', audience_user_ids=[1])
    stored = client.get(f"/api/documents/{doc['id']}", headers=auth_headers['chairman'])
    assert stored.status_code == 200
    assert client.get('/uploads/documents/anything.pdf', headers=auth_headers['hr']).status_code == 404


# ---------------------------------------------------------------- folders

def test_folder_and_subfolder_crud(client, auth_headers):
    root = _folder(client, auth_headers['chairman'], 'Academic Documents')
    child = _folder(client, auth_headers['chairman'], 'Academic Calendar', root['id'])
    assert child['parent_id'] == root['id']
    assert child['path'] == ['Academic Documents', 'Academic Calendar']

    duplicate = client.post('/api/documents/folders', json={'name': 'academic calendar', 'parent_id': root['id']},
                            headers=auth_headers['chairman'])
    assert duplicate.status_code == 409
    # same name under a different parent is fine
    other_root = _folder(client, auth_headers['chairman'], 'Administrative Documents')
    assert _folder(client, auth_headers['chairman'], 'Academic Calendar', other_root['id'])['parent_id'] == other_root['id']

    renamed = client.put(f"/api/documents/folders/{child['id']}", json={'name': 'Calendars'},
                         headers=auth_headers['chairman'])
    assert renamed.status_code == 200 and renamed.get_json()['data']['name'] == 'Calendars'

    deleted = client.delete(f"/api/documents/folders/{child['id']}", headers=auth_headers['chairman'])
    assert deleted.status_code == 200
    assert client.delete(f"/api/documents/folders/{child['id']}", headers=auth_headers['chairman']).status_code == 404


@pytest.mark.parametrize('payload', [{'name': ''}, {'name': '   '}, {'name': 'a/b'}, {'name': 'a\\b'}, {'name': 'x' * 151}, {}])
def test_invalid_folder_names_rejected(client, auth_headers, payload):
    assert client.post('/api/documents/folders', json=payload, headers=auth_headers['chairman']).status_code == 400


def test_unknown_parent_rejected(client, auth_headers):
    response = client.post('/api/documents/folders', json={'name': 'Orphan', 'parent_id': 999999},
                           headers=auth_headers['chairman'])
    assert response.status_code == 400


def test_only_managers_can_manage_folders(client, auth_headers, principal_headers):
    assert client.post('/api/documents/folders', json={'name': 'Nope'}, headers=auth_headers['hr']).status_code == 403
    folder = _folder(client, principal_headers, 'By Principal')
    assert client.put(f"/api/documents/folders/{folder['id']}", json={'name': 'x'}, headers=auth_headers['hr']).status_code == 403
    assert client.delete(f"/api/documents/folders/{folder['id']}", headers=auth_headers['hr']).status_code == 403
    assert client.post('/api/documents/folders', json={'name': 'Nope'}).status_code == 401


def test_cannot_delete_non_empty_folders(client, auth_headers):
    parent = _folder(client, auth_headers['chairman'], 'Parent')
    child = _folder(client, auth_headers['chairman'], 'Child', parent['id'])
    assert client.delete(f"/api/documents/folders/{parent['id']}", headers=auth_headers['chairman']).status_code == 409
    doc = _doc(client, auth_headers['chairman'], folder_id=child['id'])
    assert client.delete(f"/api/documents/folders/{child['id']}", headers=auth_headers['chairman']).status_code == 409
    client.delete(f"/api/documents/{doc['id']}", headers=auth_headers['chairman'])
    assert client.delete(f"/api/documents/folders/{child['id']}", headers=auth_headers['chairman']).status_code == 200
    assert client.delete(f"/api/documents/folders/{parent['id']}", headers=auth_headers['chairman']).status_code == 200


def test_moving_folders_blocks_cycles(client, auth_headers):
    a = _folder(client, auth_headers['chairman'], 'A')
    b = _folder(client, auth_headers['chairman'], 'B', a['id'])
    c = _folder(client, auth_headers['chairman'], 'C', b['id'])
    for target in (a['id'], b['id'], c['id']):
        response = client.put(f"/api/documents/folders/{a['id']}", json={'parent_id': target},
                              headers=auth_headers['chairman'])
        assert response.status_code == 400
    moved = client.put(f"/api/documents/folders/{c['id']}", json={'parent_id': None}, headers=auth_headers['chairman'])
    assert moved.status_code == 200 and moved.get_json()['data']['path'] == ['C']


def test_nesting_depth_is_limited(client, auth_headers):
    parent = None
    for level in range(8):
        parent = _folder(client, auth_headers['chairman'], f'Level {level}-{uuid.uuid4().hex[:4]}', parent['id'] if parent else None)
    too_deep = client.post('/api/documents/folders', json={'name': 'Too deep', 'parent_id': parent['id']},
                           headers=auth_headers['chairman'])
    assert too_deep.status_code == 400


def test_upload_into_folder_filter_by_folder_and_move_between_folders(client, auth_headers):
    parent = _folder(client, auth_headers['chairman'], f'Exams-{uuid.uuid4().hex[:4]}')
    sub = _folder(client, auth_headers['chairman'], 'Results', parent['id'])
    doc = _doc(client, auth_headers['chairman'], name='Result sheet', folder_id=sub['id'])
    assert doc['folder_id'] == sub['id'] and doc['folder_path'] == [parent['name'], 'Results']

    in_sub = client.get(f"/api/documents?folder_id={sub['id']}", headers=auth_headers['hr'])
    assert doc['id'] in _ids(in_sub)
    assert doc['id'] not in _ids(client.get(f"/api/documents?folder_id={parent['id']}", headers=auth_headers['hr']))
    assert doc['id'] in _ids(client.get(f"/api/documents?folder_id={parent['id']}&recursive=true", headers=auth_headers['hr']))

    moved = client.put(f"/api/documents/{doc['id']}", json={'folder_id': parent['id']}, headers=auth_headers['chairman'])
    assert moved.get_json()['data']['folder_id'] == parent['id']
    to_root = client.put(f"/api/documents/{doc['id']}", json={'folder_id': None}, headers=auth_headers['chairman'])
    assert to_root.get_json()['data']['folder_id'] is None
    assert doc['id'] in _ids(client.get('/api/documents?folder_id=root', headers=auth_headers['hr']))
    assert client.put(f"/api/documents/{doc['id']}", json={'folder_id': 999999}, headers=auth_headers['chairman']).status_code == 400
    assert _upload(client, auth_headers['chairman'], folder_id=999999).status_code == 400


def test_folder_navigation_respects_document_permissions(client, auth_headers):
    allowed = _person(client, auth_headers['chairman'])
    blocked = _person(client, auth_headers['chairman'])
    secret = _folder(client, auth_headers['chairman'], f'Secret-{uuid.uuid4().hex[:4]}')
    secret_child = _folder(client, auth_headers['chairman'], 'Inner', secret['id'])
    empty = _folder(client, auth_headers['chairman'], f'Empty-{uuid.uuid4().hex[:4]}')
    _doc(client, auth_headers['chairman'], folder_id=secret_child['id'], visible_to_all='false',
         audience_user_ids=[allowed['id']])

    def names(headers):
        return {f['name'] for f in client.get('/api/documents/folders', headers=headers).get_json()['data']}

    assert {secret['name'], 'Inner', empty['name']} <= names(auth_headers['chairman'])       # managers: everything
    seen_by_allowed = names(allowed['headers'])
    assert secret['name'] in seen_by_allowed and 'Inner' in seen_by_allowed                  # parent shown for navigation
    assert empty['name'] not in seen_by_allowed
    seen_by_blocked = names(blocked['headers'])
    assert secret['name'] not in seen_by_blocked and 'Inner' not in seen_by_blocked          # no leakage of names

    counts = {f['name']: f for f in client.get('/api/documents/folders', headers=allowed['headers']).get_json()['data']}
    assert counts['Inner']['document_count'] == 1 and counts[secret['name']]['total_document_count'] == 1
    assert counts[secret['name']]['subfolder_count'] == 1


# ----------------------------------------------------------------- search

def test_search_and_filters_only_return_permitted_documents(client, auth_headers):
    tag = uuid.uuid4().hex[:6]
    member = _person(client, auth_headers['chairman'])
    outsider = _person(client, auth_headers['chairman'])
    folder = _folder(client, auth_headers['chairman'], f'Circulars-{tag}')
    visible = _doc(client, auth_headers['chairman'], name=f'Fee circular {tag}', category=f'Admin-{tag}', folder_id=folder['id'])
    hidden = _doc(client, auth_headers['chairman'], name=f'Fee confidential {tag}', category=f'Admin-{tag}',
                  folder_id=folder['id'], visible_to_all='false', audience_user_ids=[member['id']])

    def search(headers, query):
        return _ids(client.get(f'/api/documents?{query}', headers=headers))

    assert set(search(member['headers'], f'q=Fee+{tag}'[:0] + f'q={tag}')) >= {visible['id'], hidden['id']}
    assert hidden['id'] not in search(outsider['headers'], f'q={tag}')
    assert visible['id'] in search(outsider['headers'], f'q={tag}')
    # by name, filename, category, folder name (and thereby its documents), file type, uploader
    assert search(outsider['headers'], f'q=circular+{tag}') == [visible['id']]
    assert visible['id'] in search(outsider['headers'], 'q=policy.pdf')
    assert visible['id'] in search(outsider['headers'], f'category=Admin-{tag}')
    assert hidden['id'] not in search(outsider['headers'], f'category=Admin-{tag}')
    assert visible['id'] in search(outsider['headers'], f'q=Circulars-{tag}')
    assert visible['id'] in search(outsider['headers'], f'folder_id={folder["id"]}&file_type=pdf')
    assert search(outsider['headers'], f'q={tag}&file_type=docx') == []
    uploader_id = visible['uploaded_by_id']
    assert visible['id'] in search(outsider['headers'], f'q={tag}&uploaded_by={uploader_id}')
    assert visible['id'] in search(outsider['headers'], f'q={tag}&uploaded_by=Chairman')
    assert search(outsider['headers'], f'q={tag}&uploaded_by=zzzznobody') == []


def test_search_treats_wildcards_literally_and_handles_no_results(client, auth_headers):
    tag = uuid.uuid4().hex[:6]
    _doc(client, auth_headers['chairman'], name=f'Plain name {tag}')
    assert _ids(client.get('/api/documents?q=%25', headers=auth_headers['hr'])) == []
    assert _ids(client.get(f'/api/documents?q=no-such-document-{tag}', headers=auth_headers['hr'])) == []


def test_date_filters_and_validation(client, auth_headers):
    tag = uuid.uuid4().hex[:6]
    doc = _doc(client, auth_headers['chairman'], name=f'Dated {tag}')
    from datetime import date, timedelta
    today, tomorrow, yesterday = date.today(), date.today() + timedelta(days=2), date.today() - timedelta(days=2)
    inside = client.get(f'/api/documents?q={tag}&date_from={yesterday}&date_to={tomorrow}', headers=auth_headers['hr'])
    assert doc['id'] in _ids(inside)
    after = client.get(f'/api/documents?q={tag}&date_from={tomorrow}', headers=auth_headers['hr'])
    assert _ids(after) == []
    before = client.get(f'/api/documents?q={tag}&date_to={yesterday}', headers=auth_headers['hr'])
    assert _ids(before) == []
    assert client.get('/api/documents?date_from=garbage', headers=auth_headers['hr']).status_code == 400
    assert client.get('/api/documents?page=abc', headers=auth_headers['hr']).status_code == 400
    assert client.get('/api/documents?folder_id=abc', headers=auth_headers['hr']).status_code == 400
    assert client.get('/api/documents?folder_id=999999', headers=auth_headers['hr']).status_code == 404


def test_pagination_meta(client, auth_headers):
    tag = uuid.uuid4().hex[:6]
    for index in range(5):
        _doc(client, auth_headers['chairman'], name=f'Paged {tag} {index}')
    first = client.get(f'/api/documents?q=Paged+{tag}&page_size=2&page=1', headers=auth_headers['hr']).get_json()
    assert len(first['data']) == 2 and first['meta'] == {'total': 5, 'page': 1, 'page_size': 2}
    last = client.get(f'/api/documents?q=Paged+{tag}&page_size=2&page=3', headers=auth_headers['hr']).get_json()
    assert len(last['data']) == 1
    seen = set()
    for page in (1, 2, 3):
        seen.update(_ids(client.get(f'/api/documents?q=Paged+{tag}&page_size=2&page={page}', headers=auth_headers['hr'])))
    assert len(seen) == 5
