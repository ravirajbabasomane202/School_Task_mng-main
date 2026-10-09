"""Register 'checked after due date' data flow, end to end.

due_date = first day of the period (stored once); checked_at = the actual
moment of the check, compared as a SCHOOL (IST) calendar day.

Run:  cd backend && python -m pytest app/tests/test_register_check_flow.py -q
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.extensions import db
from app.models.register import Register, RegisterOccurrence, period_bounds
from app.models.user import User
from app.utils.completion import (
    CHECK_DELAYED, CHECK_LATE, CHECK_ON_TIME, classify_register_period,
)
from app.utils.timezone import school_today, school_tz

IST = school_tz()
D = date


def _head(app):
    """A fresh head user per call, so counts are not polluted by other tests."""
    with app.app_context():
        u = User(name=f'Head {uuid.uuid4().hex[:6]}', email=f'{uuid.uuid4().hex[:8]}@school.test',
                 role='HR', is_active=True)
        u.set_password('x' * 12)
        db.session.add(u)
        db.session.commit()
        return u.id


def _make(client, headers, head_id=None, start=D(2026, 9, 1)):
    resp = client.post('/api/registers', json={
        'name': 'Flow Register', 'register_no': f'FL-{uuid.uuid4().hex[:8]}', 'head_name': 'Jane',
        'head_id': head_id, 'cycle': 'WEEKLY', 'priority': 'HIGH', 'start_date': start.isoformat(),
    }, headers=headers)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()['data']['id']


def _pin(monkeypatch, today, now_ist):
    monkeypatch.setattr('app.routes.registers._today', lambda: today)
    monkeypatch.setattr('app.routes.registers._now', lambda: now_ist.astimezone(timezone.utc))


def _check(client, headers, reg, day):
    return client.patch(f'/api/registers/{reg}/occurrences/{day.isoformat()}/status',
                        json={'status': 'OK'}, headers=headers)


def _event(client, headers, reg, period_start):
    events = client.get('/api/registers/calendar', headers=headers, query_string={
        'start': (period_start - timedelta(days=7)).isoformat(),
        'end': (period_start + timedelta(days=14)).isoformat()}).get_json()['data']
    return next(e for e in events if e['register_id'] == reg and e['date'] == period_start.isoformat())


# --- check on the due date ---------------------------------------------------

def test_check_on_due_date_is_green_on_time(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _make(client, h)
    _pin(monkeypatch, D(2026, 10, 5), datetime(2026, 10, 5, 10, 42, tzinfo=IST))
    assert _check(client, h, reg, D(2026, 10, 5)).status_code == 200
    ev = _event(client, h, reg, D(2026, 10, 5))
    assert ev['dot_color'] == 'green' and ev['check_timing'] == 'ON_TIME' and ev['outcome'] == CHECK_ON_TIME
    assert ev['due_date'] == '2026-10-05' and ev['checked_at'] is not None


# --- check 3 days later: yellow, due_date kept, checked_at everywhere --------

def test_check_three_days_later_is_yellow_and_exposes_checked_at(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _make(client, h)
    _pin(monkeypatch, D(2026, 10, 8), datetime(2026, 10, 8, 10, 42, tzinfo=IST))
    resp = _check(client, h, reg, D(2026, 10, 8))
    assert resp.status_code == 200
    occ = resp.get_json()['data']['occurrence']
    assert occ['due_date'] == '2026-10-05' and occ['dot_color'] == 'yellow'
    assert occ['check_timing'] == 'LATE' and occ['checked_at'].endswith('+00:00')

    # stored separately: due_date untouched, checked_at saved (10:42 IST == 05:12 UTC)
    with app.app_context():
        row = RegisterOccurrence.query.filter_by(register_id=reg).one()
        assert row.due_date == D(2026, 10, 5)
        assert row.completed_at.replace(tzinfo=timezone.utc) == datetime(2026, 10, 8, 5, 12, tzinfo=timezone.utc)

    # returned by EVERY register API the pages use
    ev = _event(client, h, reg, D(2026, 10, 5))
    assert ev['dot_color'] == 'yellow' and ev['check_timing'] == 'LATE'
    assert ev['due_date'] == '2026-10-05' and ev['checked_at'] == occ['checked_at']
    assert ev['register']['due_date'] == '2026-10-05' and ev['register']['checked_at'] == occ['checked_at']
    assert ev['register']['check_timing'] == 'LATE'

    one = client.get(f'/api/registers/{reg}', headers=h).get_json()['data']
    assert one['checked_at'] == occ['checked_at'] and one['due_date'] == '2026-10-05'
    listed = next(r for r in client.get('/api/registers', headers=h).get_json()['data'] if r['id'] == reg)
    assert listed['checked_at'] == occ['checked_at'] and listed['check_timing'] == 'LATE'
    cal = client.get(f'/api/registers/{reg}/calendar', headers=h,
                     query_string={'month': '2026-10'}).get_json()['data']['entries']
    entry = next(e for e in cal if e['date'] == '2026-10-05')
    assert entry['checked_at'] == occ['checked_at'] and entry['check_timing'] == 'LATE'


def test_checked_at_survives_other_updates(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _make(client, h)
    _pin(monkeypatch, D(2026, 10, 8), datetime(2026, 10, 8, 10, 42, tzinfo=IST))
    _check(client, h, reg, D(2026, 10, 8))
    # a second check is refused, a cycle edit and a rejected re-check must not touch it
    assert _check(client, h, reg, D(2026, 10, 8)).status_code == 409
    assert client.patch(f'/api/registers/{reg}/occurrences/2026-10-08/status',
                        json={'status': 'REJECTED'}, headers=h).status_code == 409
    client.put(f'/api/registers/{reg}', json={'priority': 'LOW'}, headers=h)
    with app.app_context():
        row = RegisterOccurrence.query.filter_by(register_id=reg).one()
        assert row.status == 'OK' and row.due_date == D(2026, 10, 5)
        assert row.completed_at.replace(tzinfo=timezone.utc) == datetime(2026, 10, 8, 5, 12, tzinfo=timezone.utc)


# --- never checked -----------------------------------------------------------

def test_never_checked_after_window_is_not_checked_outline(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _make(client, h)
    monkeypatch.setattr('app.routes.registers._today', lambda: D(2026, 10, 13))
    ev = _event(client, h, reg, D(2026, 10, 5))
    assert ev['outcome'] == CHECK_DELAYED and ev['dot_color'] == 'outline' and ev['checked_at'] is None
    monkeypatch.setattr('app.routes.registers._today', lambda: D(2026, 10, 8))  # window still open
    ev = _event(client, h, reg, D(2026, 10, 5))
    assert ev['outcome'] == 'OPEN' and ev['dot_color'] == 'gray'


# --- time zone edge cases ----------------------------------------------------

@pytest.mark.parametrize('checked_ist,expected', [
    (datetime(2026, 10, 5, 23, 30, tzinfo=IST), CHECK_ON_TIME),   # 18:00 UTC on the 5th
    (datetime(2026, 10, 6, 0, 30, tzinfo=IST), CHECK_LATE),       # 19:00 UTC on the 5th: UTC date says "on time"
    (datetime(2026, 10, 5, 0, 15, tzinfo=IST), CHECK_ON_TIME),    # 18:45 UTC on the 4th
])
def test_midnight_boundaries_use_school_time_zone(checked_ist, expected):
    checked_utc_naive = checked_ist.astimezone(timezone.utc).replace(tzinfo=None)  # how the DB stores it
    cls = classify_register_period('OK', D(2026, 10, 5), D(2026, 10, 11), checked_utc_naive, D(2026, 10, 20))
    assert cls['outcome'] == expected


def test_midnight_boundary_through_the_api(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _make(client, h)
    _pin(monkeypatch, D(2026, 10, 6), datetime(2026, 10, 6, 0, 30, tzinfo=IST))
    assert _check(client, h, reg, D(2026, 10, 6)).status_code == 200
    assert _event(client, h, reg, D(2026, 10, 5))['dot_color'] == 'yellow'


# --- next due date -----------------------------------------------------------

def test_next_due_date_comes_from_schedule_not_checked_at(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _make(client, h)
    _pin(monkeypatch, D(2026, 10, 9), datetime(2026, 10, 9, 18, 0, tzinfo=IST))
    _check(client, h, reg, D(2026, 10, 9))
    with app.app_context():
        assert Register.query.get(reg).next_due_date == D(2026, 10, 12)   # next period start, not 9 Oct + 7


# --- performance numbers -----------------------------------------------------

def _periods(n):
    """The last n COMPLETED weekly periods (start dates), oldest first."""
    cur = period_bounds('WEEKLY', school_today())[0]
    return [cur - timedelta(days=7 * i) for i in range(n, 0, -1)]


def _row(app, head, start, end):
    from app.routes.dashboard import _staff_performance_rows
    with app.app_context():
        return next(r for r in _staff_performance_rows(start, end) if r['userId'] == head)


def _seed(app, reg, start, status, checked_ist=None):
    with app.app_context():
        db.session.add(RegisterOccurrence(
            register_id=reg, occurrence_date=start, status=status, due_date=start,
            completed_at=checked_ist.astimezone(timezone.utc).replace(tzinfo=None) if checked_ist else None))
        db.session.commit()


def test_performance_totals_add_up_and_late_check_after_range_counts_in_its_period(app, client, auth_headers):
    h = auth_headers['chairman']
    head = _head(app)
    p1, p2, p3, p4 = _periods(4)
    reg = _make(client, h, head_id=head, start=p1)
    at = lambda d, hh=10: datetime(d.year, d.month, d.day, hh, 0, tzinfo=IST)
    _seed(app, reg, p1, 'OK', at(p1))                                  # on time (due day)
    _seed(app, reg, p2, 'OK', at(p2 + timedelta(days=3)))              # after due date
    _seed(app, reg, p3, 'REJECTED', at(p3))                            # rejected -> not checked
    # p4: never checked, window ended -> not checked / delayed
    row = _row(app, head, p1, p4 + timedelta(days=6))
    assert (row['onTimeCompleteRegisters'], row['completedAfterDueRegisters'], row['pendingRegisters']) == (1, 1, 2)
    assert row['registersDue'] == 4
    assert (row['onTimeCompleteRegisters'] + row['completedAfterDueRegisters']
            + row['pendingRegisters']) == row['registersDue']

    # range = just p2's due day: the period is counted by its due date, and its
    # check made 3 days AFTER the range end is still attributed to that period
    only_p2 = _row(app, head, p2, p2)
    assert (only_p2['completedAfterDueRegisters'], only_p2['registersDue']) == (1, 1)
    # range starting mid-period p2 does not pull p2 in (it is due before the range)
    mid = _row(app, head, p2 + timedelta(days=2), p3 - timedelta(days=1))
    assert mid['registersDue'] == 0


def test_ok_row_without_check_time_is_on_time_and_not_invented(app, client, auth_headers):
    h = auth_headers['chairman']
    head = _head(app)
    (p1,) = _periods(1)
    reg = _make(client, h, head_id=head, start=p1)
    _seed(app, reg, p1, 'OK', None)
    row = _row(app, head, p1, p1)
    assert row['onTimeCompleteRegisters'] == 1
    ev = _event(client, h, reg, p1)
    assert ev['checked_at'] is None and ev['checked_at_unknown'] is True and ev['dot_color'] == 'green'


def test_performance_registers_endpoint_adds_up_and_matches_by_head_id(app, client, auth_headers):
    """Four buckets, counted per checking period, all computed by the backend:
    On Time Checked + Checked After Due Date + Not Checked + Delayed = Total Periods Due.
    Not Checked = unchecked period whose window is still open + rejected checks.
    Delayed     = unchecked period whose window has ended."""
    h = auth_headers['chairman']
    head, other = _head(app), _head(app)
    p1, p2, p3, p4 = _periods(4)
    current = period_bounds('WEEKLY', school_today())[0]
    at = lambda d, hh=10: datetime(d.year, d.month, d.day, hh, 0, tzinfo=IST)
    mine = _make(client, h, head_id=head, start=p1)
    _seed(app, mine, p1, 'OK', at(p1))                              # On Time Checked
    _seed(app, mine, p2, 'OK', at(p2 + timedelta(days=2)))          # Checked After Due Date
    _seed(app, mine, p3, 'REJECTED', at(p3))                        # rejected -> Not Checked
    #                                                              # p4 never checked, ended -> Delayed
    #                                                              # current period unchecked, open -> Not Checked
    theirs = _make(client, h, head_id=other, start=p1)
    _seed(app, theirs, p1, 'OK', at(p1))

    resp = client.get('/api/reports/performance/registers', headers=h, query_string={
        'date_from': p1.isoformat(), 'date_to': school_today().isoformat(), 'head': str(head)})
    data = resp.get_json()['data']
    assert [s['register_id'] for s in data['summaries']] == [mine]
    t = data['totals']
    assert (t['onTimeChecked'], t['checkedAfterDueDate'], t['notChecked'], t['delayed']) == (1, 1, 2, 1)
    assert t['onTimeChecked'] + t['checkedAfterDueDate'] + t['notChecked'] + t['delayed'] == t['totalPeriodsDue'] == 5
    by_date = {p['date']: p for p in data['summaries'][0]['periods']}
    assert by_date[p2.isoformat()]['check_timing'] == 'LATE' and by_date[p2.isoformat()]['dot_color'] == 'yellow'
    assert by_date[p2.isoformat()]['checked_at'] is not None
    assert by_date[p4.isoformat()]['outcome'] == 'DELAYED'
    assert by_date[current.isoformat()]['outcome'] == 'OPEN'


def test_future_periods_are_not_due_yet(app, client, auth_headers):
    h = auth_headers['chairman']
    head = _head(app)
    reg = _make(client, h, head_id=head, start=_periods(1)[0])
    resp = client.get('/api/reports/performance/registers', headers=h, query_string={
        'date_from': school_today().isoformat(),
        'date_to': (school_today() + timedelta(days=60)).isoformat(), 'head': str(head)})
    summary = resp.get_json()['data']['summaries'][0]
    assert all(p['date'] <= school_today().isoformat() for p in summary['periods'])  # nothing in the future
    assert summary['totalPeriodsDue'] == summary['notChecked'] + summary['delayed'] + summary['onTimeChecked'] \
        + summary['checkedAfterDueDate']


def test_dashboard_rows_carry_the_four_buckets(app, client, auth_headers):
    h = auth_headers['chairman']
    head = _head(app)
    p1, p2, p3, p4 = _periods(4)
    reg = _make(client, h, head_id=head, start=p1)
    at = lambda d, hh=10: datetime(d.year, d.month, d.day, hh, 0, tzinfo=IST)
    _seed(app, reg, p1, 'OK', at(p1))
    _seed(app, reg, p2, 'OK', at(p2 + timedelta(days=2)))
    _seed(app, reg, p3, 'REJECTED', at(p3))
    row = _row(app, head, p1, school_today())
    assert (row['onTimeCompleteRegisters'], row['completedAfterDueRegisters'],
            row['notCheckedRegisters'], row['delayedRegisters']) == (1, 1, 2, 1)
    assert row['totalPeriodsDue'] == 5
    assert row['pendingRegisters'] == 2   # unchanged legacy field: delayed + rejected (open periods excluded)
