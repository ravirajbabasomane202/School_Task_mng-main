import io

import pytest


PDF_BYTES = b'%PDF-1.7\nimportant document test'


@pytest.fixture
def document_upload_dir(app, tmp_path):
    original_upload_folder = app.config['UPLOAD_FOLDER']
    app.config['UPLOAD_FOLDER'] = str(tmp_path / 'uploads')
    try:
        yield app.config['UPLOAD_FOLDER']
    finally:
        app.config['UPLOAD_FOLDER'] = original_upload_folder


def _upload(client, headers, filename='policy.pdf', content=PDF_BYTES):
    return client.post(
        '/api/documents',
        data={
            'name': 'School Policy',
            'description': 'Current policy',
            'category': 'Policies',
            'file': (io.BytesIO(content), filename),
        },
        headers=headers,
        content_type='multipart/form-data',
    )


def test_chairman_can_upload_edit_download_and_delete_document(
    app, client, auth_headers, document_upload_dir
):
    upload_response = _upload(client, auth_headers['chairman'])
    assert upload_response.status_code == 201
    document = upload_response.get_json()['data']

    update_response = client.put(
        f"/api/documents/{document['id']}",
        json={'name': 'Updated Policy', 'description': 'Revised policy', 'category': 'Governance'},
        headers=auth_headers['chairman'],
    )
    assert update_response.status_code == 200
    assert update_response.get_json()['data']['name'] == 'Updated Policy'

    download_response = client.get(
        f"/api/documents/{document['id']}/download",
        headers=auth_headers['chairman'],
    )
    assert download_response.status_code == 200
    assert download_response.data == PDF_BYTES
    download_response.close()

    delete_response = client.delete(
        f"/api/documents/{document['id']}",
        headers=auth_headers['chairman'],
    )
    assert delete_response.status_code == 200
    assert client.get('/api/documents', headers=auth_headers['chairman']).get_json()['data'] == []


def test_principal_can_manage_documents(client, principal_headers, document_upload_dir):
    upload_response = _upload(client, principal_headers)
    assert upload_response.status_code == 201
    document = upload_response.get_json()['data']

    assert client.put(
        f"/api/documents/{document['id']}",
        json={'name': 'Principal Revision'},
        headers=principal_headers,
    ).status_code == 200
    assert client.get(
        f"/api/documents/{document['id']}/download",
        headers=principal_headers,
    ).status_code == 200
    assert client.delete(
        f"/api/documents/{document['id']}",
        headers=principal_headers,
    ).status_code == 200


@pytest.mark.parametrize('role_key', ['hr', 'director'])
def test_other_authenticated_users_can_view_and_download_but_not_manage(
    client, auth_headers, document_upload_dir, role_key
):
    upload_response = _upload(client, auth_headers['chairman'])
    document_id = upload_response.get_json()['data']['id']

    listing = client.get('/api/documents', headers=auth_headers[role_key])
    assert listing.status_code == 200
    assert any(item['id'] == document_id for item in listing.get_json()['data'])
    assert client.get(
        f'/api/documents/{document_id}/download',
        headers=auth_headers[role_key],
    ).status_code == 200

    assert _upload(client, auth_headers[role_key]).status_code == 403
    assert client.put(
        f'/api/documents/{document_id}',
        json={'name': 'Forbidden edit'},
        headers=auth_headers[role_key],
    ).status_code == 403
    assert client.delete(
        f'/api/documents/{document_id}',
        headers=auth_headers[role_key],
    ).status_code == 403


@pytest.mark.parametrize(
    ('filename', 'contents'),
    [
        ('malware.exe', b'MZ'),
        ('mislabelled.pdf', b'not a PDF'),
        ('empty.pdf', b''),
    ],
)
def test_upload_rejects_unsupported_or_malformed_files(
    client, auth_headers, document_upload_dir, filename, contents
):
    response = _upload(client, auth_headers['chairman'], filename, contents)
    assert response.status_code == 400


def test_upload_rejects_files_over_ten_megabytes(
    client, auth_headers, document_upload_dir
):
    response = _upload(
        client,
        auth_headers['chairman'],
        content=b'%PDF-' + (b'x' * (10 * 1024 * 1024)),
    )
    assert response.status_code == 413


def test_document_api_requires_authentication(client, document_upload_dir):
    assert client.get('/api/documents').status_code == 401
    assert client.post(
        '/api/documents',
        data={'name': 'Policy', 'category': 'Policies'},
    ).status_code in (401, 422)
