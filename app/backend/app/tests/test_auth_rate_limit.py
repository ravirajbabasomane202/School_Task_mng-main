from app.extensions import db
from app.models.login_attempt import LoginAttempt


def _clear_login_attempts():
    LoginAttempt.query.delete(synchronize_session=False)
    db.session.commit()


def test_login_rate_limit_allows_more_than_five_attempts_when_configured(app, client):
    with app.app_context():
        _clear_login_attempts()

    original_max = app.config['LOGIN_MAX_ATTEMPTS']
    original_window = app.config['LOGIN_RATE_LIMIT_WINDOW_SECONDS']
    app.config['LOGIN_MAX_ATTEMPTS'] = 10
    app.config['LOGIN_RATE_LIMIT_WINDOW_SECONDS'] = 900

    try:
        for _ in range(5):
            response = client.post(
                '/api/auth/login',
                json={'email': 'missing@school.com', 'password': 'wrong-password'},
            )
            assert response.status_code == 401
    finally:
        app.config['LOGIN_MAX_ATTEMPTS'] = original_max
        app.config['LOGIN_RATE_LIMIT_WINDOW_SECONDS'] = original_window
        with app.app_context():
            _clear_login_attempts()


def test_login_rate_limit_returns_429_after_configured_attempt_count(app, client):
    with app.app_context():
        _clear_login_attempts()

    original_max = app.config['LOGIN_MAX_ATTEMPTS']
    original_window = app.config['LOGIN_RATE_LIMIT_WINDOW_SECONDS']
    app.config['LOGIN_MAX_ATTEMPTS'] = 2
    app.config['LOGIN_RATE_LIMIT_WINDOW_SECONDS'] = 900

    try:
        first = client.post(
            '/api/auth/login',
            json={'email': 'missing@school.com', 'password': 'wrong-password'},
        )
        second = client.post(
            '/api/auth/login',
            json={'email': 'missing@school.com', 'password': 'wrong-password'},
        )
        third = client.post(
            '/api/auth/login',
            json={'email': 'missing@school.com', 'password': 'wrong-password'},
        )

        assert first.status_code == 401
        assert second.status_code == 401
        assert third.status_code == 429
    finally:
        app.config['LOGIN_MAX_ATTEMPTS'] = original_max
        app.config['LOGIN_RATE_LIMIT_WINDOW_SECONDS'] = original_window
        with app.app_context():
            _clear_login_attempts()
