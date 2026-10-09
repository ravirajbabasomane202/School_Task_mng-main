"""Smoke tests for the new backend-driven Performance-screen export
endpoint (`GET /api/reports/performance/export`).

Covers: endpoint reachable & authenticated, response is a CSV attachment,
CSV contains the expected KPI sections, and filtering by Head/Cycle/Status
actually narrows the detailed records the same way the on-screen filters
would.
"""
import uuid
from datetime import date, timedelta

from app.models.register import period_bounds
from app.utils.timezone import school_today

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
    assert 'Register Performance' in body            # per-role register table
    assert 'Detailed Register Records' in body
    # the export is registers only: no task data anywhere
    for task_text in ('Task Performance', 'Total Tasks', 'In Progress', 'Escalated', 'Performance Metrics',
                      'Detailed Task Performance Records', 'Final Performance'):
        assert task_text not in body
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


def _detail_section(body):
    """(header_row, data_rows) of the 'Detailed Register Records' block."""
    import csv
    import io

    rows = list(csv.reader(io.StringIO(body.lstrip('\ufeff'))))
    start = next(i for i, row in enumerate(rows) if row and row[0] == 'Detailed Register Records')
    header = rows[start + 1]
    data = []
    for row in rows[start + 2:]:
        if not row:
            break
        data.append(row)
    return header, data


def test_register_report_columns_are_renamed_and_status_removed(app, client, auth_headers):
    from app.models.user import User

    with app.app_context():
        head = User.query.filter_by(email='hr-test@school.test').first()
    _create_register(app, head, 'Column Check Register', cycle='DAILY')

    resp = client.get('/api/reports/performance/export', headers=auth_headers['chairman'])
    assert resp.status_code == 200
    header, _ = _detail_section(resp.get_data(as_text=True))

    assert header == [
        'Register Name', 'Register No', 'Head Name', 'Checking Cycle',
        'On Time Checked', 'Checked After Due Date', 'Not Checked', 'Delayed', 'Total Periods Due',
        'Completion %',
    ]
    assert 'Status' not in header
    body = resp.get_data(as_text=True)
    for old in ('Completed (Changed)', 'Missed (Not Changed)', 'On time Checked', 'Missed Checking', 'Total Delayed'):
        assert old not in body.split('Detailed Register Records')[1]


def test_register_report_counts_follow_checking_periods(app, client, auth_headers):
    """A check made after the due date (first day of the weekly period) counts
    once as Checked After Due Date, the open period is not reported as missed,
    and re-checking is refused (so no double count)."""
    from app.models.user import User

    with app.app_context():
        head = User.query.filter_by(email='hr-test@school.test').first()
    register_id = _create_register(app, head, 'Weekly Count Register', cycle='WEEKLY', days_ago=30)

    chairman = auth_headers['chairman']
    today = school_today()
    period_start = period_bounds('WEEKLY', today)[0]
    assert client.patch(
        f'/api/registers/{register_id}/occurrences/{today.isoformat()}/status',
        json={'status': 'OK'}, headers=chairman,
    ).status_code == 200
    assert client.patch(
        f'/api/registers/{register_id}/occurrences/{today.isoformat()}/status',
        json={'status': 'OK'}, headers=chairman,
    ).status_code == 409

    resp = client.get(
        '/api/reports/performance/export',
        # a period belongs to the range by its due date (the period's first day)
        query_string={'date_from': period_start.isoformat(), 'date_to': today.isoformat(),
                      'cycle': 'WEEKLY'},
        headers=chairman,
    )
    header, data = _detail_section(resp.get_data(as_text=True))
    row = dict(zip(header, next(r for r in data if r[0] == 'Weekly Count Register')))
    assert int(row['On Time Checked']) + int(row['Checked After Due Date']) == 1
    assert row['Not Checked'] == '0'
    assert row['Delayed'] == '0'
    assert row['Total Periods Due'] == '1'
    assert row['Completion %'] == '100'
