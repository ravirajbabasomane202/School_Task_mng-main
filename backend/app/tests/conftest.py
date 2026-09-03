"""
Shared pytest fixtures for the Flask application.

Inject ``app``, ``client`` and ``auth_headers`` directly:

    def test_something(client, auth_headers):
        resp = client.get('/api/...', headers=auth_headers['hr'])
        ...

Supported auth_headers keys:

    chairman   – JWT with CHAIRMAN role
    director   – JWT with DIRECTOR role
    hr         – JWT with HR role
    finance    – JWT with FINANCE role
    it         – JWT with IT role
    purchase   – JWT with PURCHASE role
    regular    – JWT with a generic department-head role
"""

import uuid
import pytest


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

@pytest.fixture(scope='session')
def app():
    """Create and configure the Flask app (SQLite in-memory for tests)."""
    from app import create_app
    _app = create_app('testing')  # TestingConfig now defined in config.py

    with _app.app_context():
        from app.extensions import db
        db.create_all()
        yield _app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """Return a Flask test client bound to the session app."""
    return app.test_client()


@pytest.fixture
def app_context(app):
    """Push an application context; tear it down after the test."""
    with app.app_context():
        yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ROLES = [
    ('chairman',   'CHAIRMAN',   'chairman-test@school.test'),
    ('director',   'DIRECTOR',   'director-test@school.test'),
    ('hr',         'HR',         'hr-test@school.test'),
    ('finance',    'FINANCE',    'finance-test@school.test'),
    ('it',         'IT',         'it-test@school.test'),
    ('purchase',   'PURCHASE',   'purchase-test@school.test'),
    ('regular',    'HR',         'regular-test@school.test'),
]


def _login(client, email: str, password: str) -> dict:
    """POST /api/auth/login and return the parsed JSON body."""
    resp = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert resp.status_code == 200, (
        f"Login failed for {email}: status={resp.status_code} "
        f"body={resp.get_data(as_text=True)}"
    )
    return resp.get_json()


def _seed_user_and_token(app, client, role: str, email: str) -> dict:
    """Create a user in the DB (if not exists) and return a bearer-token header dict."""
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        existing = User.query.filter_by(email=email).first()
        if not existing:
            plain = str(uuid.uuid4())[:12]
            user = User(name=f'{role.title()} Test', email=email, role=role, is_active=True)
            user.set_password(plain)
            db.session.add(user)
            db.session.commit()
        else:
            # Reuse; generate a fresh password so we can log in
            plain = str(uuid.uuid4())[:12]
            existing.set_password(plain)
            db.session.commit()

    result = _login(client, email, plain)
    token = result['data']['accessToken']
    return {'Authorization': f'Bearer {token}'}


# ---------------------------------------------------------------------------
# Auth-token header fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def auth_headers(app, client):
    """Return ``{role: {Authorization: 'Bearer …'}}`` for every seeding role."""
    return {
        key: _seed_user_and_token(app, client, role, email)
        for key, role, email in ROLES
    }


# ---------------------------------------------------------------------------
# Department seed
# ---------------------------------------------------------------------------

@pytest.fixture
def department(app_context):
    """Create a single 'Test Dept' and return the DB row."""
    from app.models.department import Department
    from app.extensions import db
    dept = Department(name='Test Dept', description='For unit tests')
    db.session.add(dept)
    db.session.commit()
    return dept
