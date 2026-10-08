"""Register "checked after due date" data flow, end to end.

Definitions under test
  period     checking window of a register (weekly Mon 5 Oct - Sun 11 Oct 2026)
  due_date   FIRST day of the period, stored once, never overwritten
  checked_at actual moment of the check, stored apart from due_date
  checked_at <= due_date -> On Time Checked        (green)
  checked_at >  due_date -> Checked After Due Date (yellow)
  unchecked and period over -> Not Checked / Delayed (its own marker, not yellow)
  unchecked and period still running -> open

Run:  cd backend && python -m pytest app/tests/test_register_check_timing.py -q
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.extensions import db
from app.models.register import Register, RegisterOccurrence
from app.models.user import User

D = date
UTC = timezone.utc
IST = timezone(timedelta(hours=5, minutes=30))

# Period under test: Monday 5 Oct 2026 - Sunday 11 Oct 2026 (WEEKLY).
DUE = D(2026, 10, 5)
PERIOD_END = D(2026, 10, 11)


def ist(day, hour=10, minute=0):
    """An IST wall-clock moment, as the timezone-aware UTC value stored in the DB."""
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST).astimezone(UTC)


def _head(app, role='HR'):
    with app.app_context():
        user = User(name=f'Head {uuid.uuid4().hex[:5]}', email=f'{uuid.uuid4().hex[:8]}@school.test',
                    role=role, is_active=True)
        user.set_password('x' * 12)
        db.session.add(user)
        db.session.commit()
        return user.id


def _register(app, head_id=None, cycle='WEEKLY', start=D(2026, 9, 1)):
    from app.models.register import calculate_next_due_date
    with app.app_context():
        reg = Register(name='Timing Register', register_no=f'TM-{uuid.uuid4().hex[:8]}',
                       head_id=head_id, head_name='Head', cycle=cycle, priority='HIGH',
                       status='IDLE', start_date=start,
                       next_due_date=calculate_next_due_date(start, cycle))
        db.session.add(reg)
        db.session.commit()
        return reg.id


_SAME = object()  # due=_SAME -> due date equals the period start; due=None -> NULL


def _row(app, reg_id, period_start, status='OK', checked_at=None, due=_SAME):
    with app.app_context():
        db.session.add(RegisterOccurrence(
            register_id=reg_id, occurrence_date=period_start, status=status,
            due_date=period_start if due is _SAME else due, completed_at=checked_at))
        db.session.commit()


def _pin(monkeypatch, today, now=None):
    monkeypatch.setattr('app.routes.registers._today', lambda: today)
    if now is not None:
        monkeypatch.setattr('app.routes.registers._now', lambda: now)


def _calendar_event(client, headers, reg_id, day='2026-10-05'):
    events = client.get('/api/registers/calendar', headers=headers,
                        query_string={'start': '2026-10-01', 'end': '2026-10-31'}).get_json()['data']
    mine = [e for e in events if e['register_id'] == reg_id and e['date'] == day]
    assert mine, events
    return mine[0]


# ---------------------------------------------------------------------------
# 1. on the due date -> green / On Time Checked
# ---------------------------------------------------------------------------

def test_check_on_due_date_is_green_and_on_time(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _register(app)
    _pin(monkeypatch, DUE, now=ist(DUE, 10, 42))
    resp = client.patch(f'/api/registers/{reg}/occurrences/2026-10-05/status', json={'status': 'OK'}, headers=h)
    assert resp.status_code == 200, resp.get_json()
    event = _calendar_event(client, h, reg)
    assert event['dot_color'] == 'green'
    assert event['check_outcome'] == 'ON_TIME'
    assert event['check_timing'] == 'ON_TIME'
    assert event['due_date'] == '2026-10-05'
    assert event['checked_at'] is not None


# ---------------------------------------------------------------------------
# 2. three days late in the same period -> yellow, everything visible in every API
# ---------------------------------------------------------------------------

def test_late_check_is_yellow_and_checked_at_is_returned_by_every_api(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _register(app)
    checked = ist(D(2026, 10, 8), 10, 42)
    _pin(monkeypatch, D(2026, 10, 8), now=checked)
    resp = client.patch(f'/api/registers/{reg}/occurrences/2026-10-08/status', json={'status': 'OK'}, headers=h)
    assert resp.status_code == 200, resp.get_json()

    with app.app_context():
        row = RegisterOccurrence.query.filter_by(register_id=reg).one()
        assert row.due_date == DUE                      # never replaced by the late check
        assert row.occurrence_date == DUE
        assert row.completed_at is not None

    body = resp.get_json()['data']
    assert body['occurrence']['due_date'] == '2026-10-05'
    assert body['occurrence']['checked_at'] is not None
    assert body['occurrence']['check_outcome'] == 'LATE'
    assert body['register']['current_checked_at'] is not None

    # /registers/calendar
    event = _calendar_event(client, h, reg)
    assert (event['dot_color'], event['check_outcome']) == ('yellow', 'LATE')
    assert event['due_date'] == '2026-10-05' and event['checked_at'] is not None
    assert event['register']['current_checked_at'] is not None

    # /registers/<id>/calendar  (the popup)
    popup = client.get(f'/api/registers/{reg}/calendar', headers=h, query_string={'month': '2026-10'}).get_json()['data']
    entry = next(e for e in popup['entries'] if e['date'] == '2026-10-05')
    assert entry['dot_color'] == 'yellow' and entry['check_outcome'] == 'LATE'
    assert entry['due_date'] == '2026-10-05' and entry['checked_at'] is not None

    # /registers (list) and /registers/<id>
    listed = next(r for r in client.get('/api/registers', headers=h).get_json()['data'] if r['id'] == reg)
    single = client.get(f'/api/registers/{reg}', headers=h).get_json()['data']
    for r in (listed, single):
        assert r['dot_color'] == 'yellow'
        assert r['current_due_date'] == '2026-10-05'
        assert r['current_checked_at'] is not None
        assert r['current_check_outcome'] == 'LATE'

    # next due date comes from the schedule, not from the day the check was made
    assert single['next_due_date'] == '2026-10-12'


def test_late_check_reaches_performance_and_exports(app, client, auth_headers):
    from app.routes.dashboard import _staff_performance_rows
    uid = _head(app)
    reg = _register(app, head_id=uid)
    _row(app, reg, DUE, 'OK', ist(D(2026, 10, 8), 10, 42))
    today = D(2026, 10, 9)
    with app.app_context():
        row = next(r for r in _staff_performance_rows(D(2026, 10, 1), D(2026, 10, 31), today=today) if r['userId'] == uid)
    assert row['completedAfterDueRegisters'] == 1
    assert row['onTimeCompleteRegisters'] == 0


# ---------------------------------------------------------------------------
# 3. never checked
# ---------------------------------------------------------------------------

def test_never_checked_after_window_is_not_checked_with_its_own_marker(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _register(app)
    _pin(monkeypatch, D(2026, 10, 14))
    event = _calendar_event(client, h, reg)
    assert event['check_outcome'] == 'DELAYED'
    assert event['dot_color'] == 'missed'            # not yellow: yellow means "checked after due date"
    assert event['checked_at'] is None


def test_open_period_is_still_open_and_not_missed(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _register(app)
    _pin(monkeypatch, D(2026, 10, 8))
    event = _calendar_event(client, h, reg)
    assert event['check_outcome'] == 'UPCOMING'
    assert event['dot_color'] == 'gray'


# ---------------------------------------------------------------------------
# 4. time zone: the school is in India (IST), checked_at is stored in UTC
# ---------------------------------------------------------------------------

def test_school_today_uses_school_time_zone():
    from app.utils.timezone import school_today
    # 19:00 UTC on the 11th is 00:30 IST on the 12th.
    assert school_today(datetime(2026, 10, 11, 19, 0, tzinfo=UTC)) == D(2026, 10, 12)
    assert school_today(datetime(2026, 10, 11, 18, 0, tzinfo=UTC)) == D(2026, 10, 11)


def test_check_at_2330_ist_on_due_day_is_on_time():
    from app.utils.completion import CHECK_ON_TIME, register_check_outcome
    checked = ist(DUE, 23, 30)                       # 18:00 UTC on the 5th
    assert register_check_outcome(DUE, checked, D(2026, 10, 20), PERIOD_END) == CHECK_ON_TIME


def test_check_at_0030_ist_the_day_after_is_late_even_though_utc_date_is_still_the_due_day():
    from app.utils.completion import CHECK_LATE, register_check_outcome
    checked = ist(D(2026, 10, 6), 0, 30)             # 19:00 UTC on the 5th
    assert checked.date() == DUE                     # the UTC calendar day would say "on time"
    assert register_check_outcome(DUE, checked, D(2026, 10, 20), PERIOD_END) == CHECK_LATE


def test_check_at_0030_ist_on_due_day_is_on_time():
    from app.utils.completion import CHECK_ON_TIME, register_check_outcome
    checked = ist(DUE, 0, 30)                        # 19:00 UTC on the 4th
    assert register_check_outcome(DUE, checked, D(2026, 10, 20), PERIOD_END) == CHECK_ON_TIME


def test_naive_stored_datetimes_are_read_as_utc():
    """SQLite hands back naive datetimes; they were stored as UTC."""
    from app.utils.completion import CHECK_LATE, register_check_outcome
    naive_utc = ist(D(2026, 10, 6), 0, 30).replace(tzinfo=None)
    assert register_check_outcome(DUE, naive_utc, D(2026, 10, 20), PERIOD_END) == CHECK_LATE


def test_midnight_boundary_is_classified_the_same_by_every_api(app, client, auth_headers, monkeypatch):
    from app.routes.dashboard import _staff_performance_rows
    h = auth_headers['chairman']
    uid = _head(app)
    on_time_reg = _register(app, head_id=uid)
    late_reg = _register(app, head_id=uid)
    _row(app, on_time_reg, DUE, 'OK', ist(DUE, 23, 30))
    _row(app, late_reg, DUE, 'OK', ist(D(2026, 10, 6), 0, 30))
    _pin(monkeypatch, D(2026, 10, 9))
    assert _calendar_event(client, h, on_time_reg)['dot_color'] == 'green'
    assert _calendar_event(client, h, late_reg)['dot_color'] == 'yellow'
    with app.app_context():
        row = next(r for r in _staff_performance_rows(D(2026, 10, 1), D(2026, 10, 31), today=D(2026, 10, 9))
                   if r['userId'] == uid)
    assert (row['onTimeCompleteRegisters'], row['completedAfterDueRegisters']) == (1, 1)


def test_school_time_zone_is_configurable(app, monkeypatch):
    from app.utils import timezone as tzmod
    app.config['SCHOOL_TIMEZONE'] = 'UTC'
    try:
        with app.app_context():
            assert tzmod.school_today(datetime(2026, 10, 11, 19, 0, tzinfo=UTC)) == D(2026, 10, 11)
    finally:
        app.config.pop('SCHOOL_TIMEZONE', None)


# ---------------------------------------------------------------------------
# 5. next due date follows the schedule
# ---------------------------------------------------------------------------

def test_next_due_date_never_follows_checked_at(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _register(app)
    _pin(monkeypatch, D(2026, 10, 10), now=ist(D(2026, 10, 10), 9, 0))
    assert client.patch(f'/api/registers/{reg}/occurrences/2026-10-10/status', json={'status': 'OK'},
                        headers=h).status_code == 200
    with app.app_context():
        assert db.session.get(Register, reg).next_due_date == D(2026, 10, 12)
    _pin(monkeypatch, D(2026, 10, 12))
    event = _calendar_event(client, h, reg, day='2026-10-12')
    assert event['due_date'] == '2026-10-12'          # next period is due on its own first day


# ---------------------------------------------------------------------------
# 6. totals add up, ranges use due_date
# ---------------------------------------------------------------------------

def _mixed_register(app, uid):
    """Weekly register: on time (Sep 7), late (Sep 14), never checked (Sep 21), rejected (Sep 28)."""
    reg = _register(app, head_id=uid, start=D(2026, 9, 1))
    _row(app, reg, D(2026, 9, 7), 'OK', ist(D(2026, 9, 7), 9))
    _row(app, reg, D(2026, 9, 14), 'OK', ist(D(2026, 9, 17), 9))
    _row(app, reg, D(2026, 9, 28), 'REJECTED', ist(D(2026, 9, 28), 9))
    return reg


def test_performance_totals_add_up_everywhere(app, client, auth_headers):
    from app.routes.dashboard import _staff_performance_rows
    from app.routes.reports import _performance_export_data
    uid = _head(app)
    _mixed_register(app, uid)
    today = D(2026, 10, 6)                           # Oct 5 period is open: not counted yet
    start, end = D(2026, 9, 1), D(2026, 10, 6)
    with app.app_context():
        row = next(r for r in _staff_performance_rows(start, end, today=today) if r['userId'] == uid)
        assert row['onTimeCompleteRegisters'] == 1
        assert row['completedAfterDueRegisters'] == 1
        assert row['notCheckedRegisters'] == 1
        assert row['rejectedRegisters'] == 1
        assert row['registerChecksDue'] == 4
        assert (row['onTimeCompleteRegisters'] + row['completedAfterDueRegisters']
                + row['notCheckedRegisters'] + row['rejectedRegisters']) == row['registerChecksDue']

        chairman = User.query.filter_by(role='CHAIRMAN').first()
        data = _performance_export_data(chairman, start, end, str(uid), 'ALL', 'ALL', today=today)
    totals = data['registerTotals']
    assert totals['onTimeChecked'] == 1 and totals['checkedAfterDue'] == 1
    assert totals['notChecked'] == 1 and totals['rejected'] == 1
    assert totals['totalChecks'] == totals['onTimeChecked'] + totals['checkedAfterDue'] + totals['notChecked'] + totals['rejected']
    summary_total = sum(s['total'] for s in data['summaries'])
    assert summary_total == totals['totalChecks']
    for s in data['summaries']:
        assert s['onTimeComplete'] + s['completedAfterDue'] + s['notChecked'] + s['rejected'] == s['total']


def test_range_membership_is_by_due_date_and_late_checks_stay_with_their_period(app):
    from app.routes.dashboard import _staff_performance_rows
    uid = _head(app)
    reg = _register(app, head_id=uid, start=D(2026, 9, 1))
    # Period 28 Sep - 4 Oct, due 28 Sep, checked 3 Oct (after the range end below).
    _row(app, reg, D(2026, 9, 28), 'OK', ist(D(2026, 10, 3), 9))
    today = D(2026, 10, 6)
    with app.app_context():
        in_range = next(r for r in _staff_performance_rows(D(2026, 9, 28), D(2026, 9, 30), today=today)
                        if r['userId'] == uid)
        later = next(r for r in _staff_performance_rows(D(2026, 9, 30), D(2026, 10, 3), today=today)
                     if r['userId'] == uid)
    assert in_range['completedAfterDueRegisters'] == 1      # attributed to its original period
    assert in_range['registerChecksDue'] == 1
    assert later['registerChecksDue'] == 0                   # period overlaps the range but is not due in it


def test_head_filter_matches_by_user_id_never_by_name(app, client, auth_headers):
    from app.routes.reports import _head_matches
    assert _head_matches('42', 42, 'Anyone')
    assert not _head_matches('42', 43, 'Anyone')
    assert not _head_matches('Jane Doe', 42, 'Jane Doe')     # name text is never a key


# ---------------------------------------------------------------------------
# 7. data repair
# ---------------------------------------------------------------------------

def test_repair_fixes_due_dates_and_reports_unknown_check_times(app):
    from app.services.register_repair import repair_register_occurrences
    reg = _register(app)
    _row(app, reg, D(2026, 9, 7), 'OK', ist(D(2026, 9, 7), 9), due=None)           # NULL due date
    _row(app, reg, D(2026, 9, 14), 'OK', ist(D(2026, 9, 17), 9), due=D(2026, 9, 20))  # backfilled with period END
    _row(app, reg, D(2026, 9, 21), 'OK', ist(D(2026, 9, 21), 9), due=D(2026, 9, 21))  # already right
    _row(app, reg, D(2026, 9, 28), 'OK', None, due=D(2026, 9, 28))                 # OK, check time unknown
    with app.app_context():
        report = repair_register_occurrences(db.session, dry_run=False)
        assert report['due_date_null'] >= 1
        assert report['due_date_wrong'] >= 1
        assert report['checked_without_time'] >= 1
        rows = {r.occurrence_date: r for r in RegisterOccurrence.query.filter_by(register_id=reg)}
        assert rows[D(2026, 9, 7)].due_date == D(2026, 9, 7)
        assert rows[D(2026, 9, 14)].due_date == D(2026, 9, 14)
        assert rows[D(2026, 9, 21)].due_date == D(2026, 9, 21)
        assert rows[D(2026, 9, 28)].completed_at is None        # a date is never invented
        again = repair_register_occurrences(db.session, dry_run=False)
        assert again['due_date_null'] == 0 and again['due_date_wrong'] == 0   # idempotent


def test_ok_row_without_check_time_counts_as_on_time_checked_with_unknown_date(app, client, auth_headers, monkeypatch):
    h = auth_headers['chairman']
    reg = _register(app)
    _row(app, reg, DUE, 'OK', None)
    _pin(monkeypatch, D(2026, 10, 9))
    event = _calendar_event(client, h, reg)
    assert event['check_outcome'] == 'ON_TIME'
    assert event['dot_color'] == 'green'
    assert event['checked_at'] is None
    assert event['checked_at_unknown'] is True
