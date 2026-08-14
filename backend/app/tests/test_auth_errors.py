def test_malformed_authorization_header_uses_json_error(client):
    response = client.get('/api/approvals', headers={'Authorization': 'Bearer invalid'})

    assert response.status_code == 401
    payload = response.get_json()
    assert payload['success'] is False
    assert payload['data'] is None
    message = payload['message'].lower()
    assert 'authorization' in message or 'token' in message or 'segments' in message


def test_school_info_endpoint_returns_school_details(client):
    response = client.get('/api/auth/school-info')

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['data']['schoolName']
    assert payload['data']['chairmanName']
    assert payload['data']['appName']
