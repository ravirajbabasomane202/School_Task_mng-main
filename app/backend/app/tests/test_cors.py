ALLOWED_TUNNEL_ORIGIN = 'https://hrkpcr73-5173.inc1.devtunnels.ms'
DISALLOWED_ORIGIN = 'https://example.com'


def test_login_preflight_allows_devtunnel_frontend_origin(client):
    response = client.options(
        '/api/auth/login',
        headers={
            'Origin': ALLOWED_TUNNEL_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type',
        },
    )

    assert response.status_code == 200
    assert response.headers['Access-Control-Allow-Origin'] == ALLOWED_TUNNEL_ORIGIN
    assert response.headers['Access-Control-Allow-Credentials'] == 'true'
    assert response.headers['Access-Control-Allow-Headers'] == 'Content-Type'
    assert 'POST' in response.headers['Access-Control-Allow-Methods']


def test_login_response_includes_cors_headers_for_allowed_origin(client):
    response = client.post(
        '/api/auth/login',
        json={},
        headers={'Origin': ALLOWED_TUNNEL_ORIGIN},
    )

    assert response.status_code == 400
    assert response.headers['Access-Control-Allow-Origin'] == ALLOWED_TUNNEL_ORIGIN
    assert response.headers['Access-Control-Allow-Credentials'] == 'true'


def test_login_preflight_rejects_unconfigured_origin(client):
    response = client.options(
        '/api/auth/login',
        headers={
            'Origin': DISALLOWED_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type',
        },
    )

    assert response.status_code == 200
    assert 'Access-Control-Allow-Origin' not in response.headers
