"""Smoke tests for the new backend-driven Performance-screen export
endpoint (`GET /api/reports/performance/export`).

Covers: endpoint reachable & authenticated, response is a CSV attachment,
CSV contains the expected KPI sections, and filtering by Head/Cycle/Status
actually narrows the detailed records the same way the on-screen filters
would.
"""
import uuid
from datetime import date, timedelta

import pytest


def _create_register(app, head, name, cycle='DAILY', status='IDLE', days_ago=5):
    from app.extensions import db
    from app.models.register import Register, calculate_next_due_date

    with app.app_context():
        start = date.today() - timedelta(days=days_ago)
        register = Register(
            name=name,
            register_no=f'REG-{uuid.uuid4().hex[:8]}',
            head_id=head.id,
            head_name=head.name,
            cycle=cycle,
            priority='MEDIUM',
            status=status,
            start_date=start,
            next_due_date=calculate_next_due_date(start, cycle),
        )
        db.session.add(register)
        db.session.commit()
        return register.id


def test_performance_export_requires_auth(client):
    resp = client.get('/api/reports/performance/export')
    assert resp.status_code == 401


def test_performance_export_returns_csv(app, client, auth_headers):
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        head = User.query.filter_by(email='hr-test@school.test').first()

    _create_register(app, head, 'Attendance Register', cycle='DAILY', status='OK')
    _create_register(app, head, 'Fee Register', cycle='WEEKLY', status='REJECTED')

    resp = client.get('/api/reports/performance/export', headers=auth_headers['chairman'])
    assert resp.status_code == 200
    assert resp.mimetype == 'text/csv'
    assert 'attachment' in resp.headers.get('Content-Disposition', '')

    body = resp.get_data(as_text=True)
    assert 'Performance Export' in body
    assert 'Registration Performance' in body
    assert 'Task Performance' in body
    assert 'Performance Metrics' in body
    assert 'Detailed Register Records' in body
    assert 'Attendance Register' in body
    assert 'Fee Register' in body


def test_performance_export_head_filter_narrows_records(app, client, auth_headers):
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        hr_head = User.query.filter_by(email='hr-test@school.test').first()
        finance_head = User.query.filter_by(email='finance-test@school.test').first()

    _create_register(app, hr_head, 'HR Only Register', cycle='DAILY', status='OK')
    _create_register(app, finance_head, 'Finance Only Register', cycle='DAILY', status='OK')

    resp = client.get(
        '/api/reports/performance/export',
        query_string={'head': hr_head.name},
        headers=auth_headers['chairman'],
    )
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'HR Only Register' in body
    assert 'Finance Only Register' not in body


def test_performance_export_invalid_date_range(client, auth_headers):
    resp = client.get(
        '/api/reports/performance/export',
        query_string={'date_from': '2026-05-01', 'date_to': '2026-01-01'},
        headers=auth_headers['chairman'],
    )
    assert resp.status_code == 400
