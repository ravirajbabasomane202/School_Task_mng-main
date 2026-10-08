"""Bug 7: a late check must not overwrite the scheduled due date.

Run:  cd backend && python -m pytest app/tests/test_register_due_dates.py -q
"""
import uuid
from datetime import date, datetime, timedelta, timezone

from app.models.register import (
    Register, RegisterOccurrence, schedule_next_due_date, scheduled_due_date,
)
from app.utils.completion import (
    CHECK_DELAYED, CHECK_LATE, CHECK_ON_TIME, CHECK_UPCOMING, register_check_outcome,
)

D = date


def _make(client, headers, cycle, start):
    resp = client.post('/api/registers', json={
        'name': 'Due Date Register', 'register_no': f'DD-{uuid.uuid4().hex[:8]}',
        'head_name': 'Jane', 'cycle': cycle, 'priority': 'HIGH', 'start_date': start.isoformat(),
    }, headers=headers)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()['data']['id']


def _pin(monkeypatch, day):
    monkeypatch.setattr('app.routes.registers._today', lambda: day)


# --- status rules (pure) ---------------------------------------------------

def test_on_time_check():
    due = D(2026, 10, 11)
    assert register_check_outcome(due, datetime(2026, 10, 11, 23, 0), D(2026, 10, 20)) == CHECK_ON_TIME
    assert register_check_outcome(due, datetime(2026, 10, 7, 9, 0), D(2026, 10, 20)) == CHECK_ON_TIME


def test_late_check():
    due = D(2026, 10, 11)
    assert register_check_outcome(due, datetime(2026, 10, 12, 0, 1), D(2026, 10, 20)) == CHECK_LATE


def test_never_checked():
    due = D(2026, 10, 11)
    assert register_check_outcome(due, None, D(2026, 10, 12)) == CHECK_DELAYED
    assert register_check_outcome(due, None, D(2026, 10, 11)) == CHECK_UPCOMING


def test_next_due_is_calculated_from_schedule_not_check_date():
    # Weekly period Mon 5 Oct - Sun 11 Oct 2026: whatever day the check was made,
    # the next due date is the next period (Mon 12 Oct) / its end (Sun 18 Oct).
    assert scheduled_due_date('WEEKLY', D(2026, 10, 5)) == D(2026, 10, 11)
    assert schedule_next_due_date('WEEKLY', D(2026, 10, 5)) == D(2026, 10, 12)
    assert schedule_next_due_date('MONTHLY', D(2026, 1, 1)) == D(2026, 2, 1)
    assert schedule_next_due_date('QUARTERLY', D(2026, 10, 1)) == D(2027, 1, 1)


# --- the stored rows (the actual bug) ---------------------------------------

def test_check_keeps_due_date_and_stores_check_time_separately(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _make(client, h, 'WEEKLY', D(2026, 9, 1))
    _pin(monkeypatch, D(2026, 10, 11))  # last day of the period: checked right at the deadline
    resp = client.patch(f'/api/registers/{reg}/occurrences/2026-10-11/status', json={'status': 'OK'}, headers=h)
    assert resp.status_code == 200
    with app.app_context():
        row = RegisterOccurrence.query.filter_by(register_id=reg).one()
        assert row.occurrence_date == D(2026, 10, 5)
        assert row.due_date == D(2026, 10, 11)          # scheduled, untouched by the check
        assert row.completed_at is not None             # actual check time, its own field
        assert Register.query.get(reg).next_due_date == D(2026, 10, 12)
    body = resp.get_json()['data']['occurrence']
    assert body['due_date'] == '2026-10-11' and body['checked_at'] is not None


def test_due_date_is_never_overwritten(app, client, auth_headers, monkeypatch):
    from app.extensions import db
    h = auth_headers['chairman']
    reg = _make(client, h, 'WEEKLY', D(2026, 9, 1))
    with app.app_context():  # an unchecked placeholder that already carries its scheduled due date
        db.session.add(RegisterOccurrence(register_id=reg, occurrence_date=D(2026, 10, 5),
                                          status='IDLE', due_date=D(2026, 10, 11)))
        db.session.commit()
    _pin(monkeypatch, D(2026, 10, 9))
    assert client.patch(f'/api/registers/{reg}/occurrences/2026-10-09/status',
                        json={'status': 'OK'}, headers=h).status_code == 200
    with app.app_context():
        row = RegisterOccurrence.query.filter_by(register_id=reg).one()
        assert row.due_date == D(2026, 10, 11)


def test_late_check_is_reported_as_checked_after_due_date(app, client, auth_headers):
    """A row whose check time is after its stored due date is 'after due date',
    and the due date used is the stored one."""
    from app.extensions import db
    from app.routes.dashboard import _staff_performance_rows
    from app.models.user import User
    h = auth_headers['chairman']
    reg = _make(client, h, 'WEEKLY', D(2026, 9, 1))
    today = date.today()
    start, due = today - timedelta(days=21), today - timedelta(days=15)
    with app.app_context():
        head = User.query.filter_by(email='hr-test@school.test').first()
        Register.query.get(reg).head_id = head.id
        db.session.add(RegisterOccurrence(
            register_id=reg, occurrence_date=start - timedelta(days=start.weekday()), status='OK',
            due_date=due, completed_at=datetime.now(timezone.utc) - timedelta(days=10)))
        db.session.commit()
        rows = [r for r in _staff_performance_rows(today - timedelta(days=60), today) if r['userId'] == head.id]
        assert rows[0]['completedAfterDueRegisters'] >= 1
