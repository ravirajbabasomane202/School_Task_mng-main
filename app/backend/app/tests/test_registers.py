"""
Backend route tests — Register Management

Covers:
  GET    /api/registers                 — list + filters, unauth
  GET    /api/registers/calendar        — calendar events
  GET    /api/registers/<id>            — detail
  POST   /api/registers                 — create (CHAIRMAN only), duplicate check
  PUT    /api/registers/<id>            — update (CHAIRMAN only)
  DELETE /api/registers/<id>            — delete (CHAIRMAN only)
  PATCH  /api/registers/<id>/status     — status update + next-due-date recalculation
  Role-guard enforcement
"""

import uuid
from datetime import date, timedelta


def _payload(**overrides):
    base = {
        'name': 'Attendance Register',
        'register_no': f'REG-{uuid.uuid4().hex[:8]}',
        'head_name': 'Jane Doe',
        'cycle': 'MONTHLY',
        'priority': 'HIGH',
        'start_date': date.today().isoformat(),
    }
    base.update(overrides)
    return base


class TestListRegisters:
    def test_requires_auth(self, client):
        resp = client.get('/api/registers')
        assert resp.status_code == 401

    def test_returns_list(self, client, auth_headers):
        resp = client.get('/api/registers', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert isinstance(body['data'], list)

    def test_view_only_role_can_list(self, client, auth_headers):
        # Non-chairman roles have view access to the register list
        resp = client.get('/api/registers', headers=auth_headers['hr'])
        assert resp.status_code == 200

    def test_filter_by_cycle_and_priority(self, client, auth_headers):
        client.post('/api/registers', json=_payload(cycle='WEEKLY', priority='LOW'), headers=auth_headers['chairman'])
        resp = client.get('/api/registers?cycle=WEEKLY&priority=LOW', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert all(r['cycle'] == 'WEEKLY' and r['priority'] == 'LOW' for r in body['data'])

    def test_search_by_name_or_number(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(name='Unique Search Register'), headers=auth_headers['chairman']).get_json()
        reg_no = created['data']['register_no']

        resp = client.get('/api/registers?search=Unique Search', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        assert any(r['register_no'] == reg_no for r in resp.get_json()['data'])


class TestCalendarEvents:
    def test_requires_auth(self, client):
        resp = client.get('/api/registers/calendar')
        assert resp.status_code == 401

    def test_returns_events_with_color(self, client, auth_headers):
        client.post('/api/registers', json=_payload(), headers=auth_headers['chairman'])
        resp = client.get('/api/registers/calendar', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        for event in body['data']:
            assert event['color'] in ('gray', 'green', 'red')
            assert 'register' in event


class TestCreateRegister:
    def test_requires_auth(self, client):
        resp = client.post('/api/registers', json={})
        assert resp.status_code == 401

    def test_forbidden_for_non_chairman(self, client, auth_headers):
        resp = client.post('/api/registers', json=_payload(), headers=auth_headers['hr'])
        assert resp.status_code == 403

    def test_requires_all_fields(self, client, auth_headers):
        resp = client.post('/api/registers', json={'name': 'Incomplete'}, headers=auth_headers['chairman'])
        assert resp.status_code == 400

    def test_creates_register_with_next_due_date(self, client, auth_headers):
        resp = client.post('/api/registers', json=_payload(cycle='DAILY'), headers=auth_headers['chairman'])
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['success'] is True
        assert body['data']['status'] == 'IDLE'
        expected_due = (date.today() + timedelta(days=1)).isoformat()
        assert body['data']['next_due_date'] == expected_due

    def test_creates_register_with_fifteen_day_cycle(self, client, auth_headers):
        resp = client.post('/api/registers', json=_payload(cycle='15_DAYS'), headers=auth_headers['chairman'])
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['success'] is True
        assert body['data']['cycle'] == '15_DAYS'
        expected_due = (date.today() + timedelta(days=15)).isoformat()
        assert body['data']['next_due_date'] == expected_due

    def test_duplicate_register_no_rejected(self, client, auth_headers):
        payload = _payload()
        client.post('/api/registers', json=payload, headers=auth_headers['chairman'])
        resp = client.post('/api/registers', json=payload, headers=auth_headers['chairman'])
        assert resp.status_code == 409
        assert resp.get_json()['success'] is False


class TestUpdateRegister:
    def test_forbidden_for_non_chairman(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        resp = client.put(f"/api/registers/{created['data']['id']}", json={'name': 'x'}, headers=auth_headers['hr'])
        assert resp.status_code == 403

    def test_updates_register(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        register_id = created['data']['id']

        resp = client.put(
            f'/api/registers/{register_id}',
            json={'name': 'Renamed Register', 'head_name': 'New Head'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['name'] == 'Renamed Register'
        assert body['data']['head_name'] == 'New Head'

    def test_updating_to_duplicate_register_no_is_rejected(self, client, auth_headers):
        first = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        second = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()

        resp = client.put(
            f"/api/registers/{second['data']['id']}",
            json={'register_no': first['data']['register_no']},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 409


class TestDeleteRegister:
    def test_forbidden_for_non_chairman(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        resp = client.delete(f"/api/registers/{created['data']['id']}", headers=auth_headers['hr'])
        assert resp.status_code == 403

    def test_deletes_register(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        register_id = created['data']['id']

        resp = client.delete(f'/api/registers/{register_id}', headers=auth_headers['chairman'])
        assert resp.status_code == 200

        get_resp = client.get(f'/api/registers/{register_id}', headers=auth_headers['chairman'])
        assert get_resp.status_code == 404


class TestUpdateStatus:
    def test_forbidden_for_non_chairman(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        resp = client.patch(
            f"/api/registers/{created['data']['id']}/status",
            json={'status': 'OK'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 403

    def test_invalid_status_rejected(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        resp = client.patch(
            f"/api/registers/{created['data']['id']}/status",
            json={'status': 'BOGUS'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 400

    def test_status_update_recalculates_next_due_date(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(cycle='WEEKLY'), headers=auth_headers['chairman']).get_json()
        register_id = created['data']['id']
        old_due_date = created['data']['next_due_date']

        resp = client.patch(
            f'/api/registers/{register_id}/status',
            json={'status': 'OK'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['status'] == 'OK'
        # The next check is now due in the NEXT weekly period (next Monday).
        this_monday = date.today() - timedelta(days=date.today().weekday())
        assert body['data']['next_due_date'] == (this_monday + timedelta(days=7)).isoformat()
        assert body['data']['can_check'] is False


class TestRegisterHeads:
    def test_requires_auth(self, client):
        resp = client.get('/api/registers/heads')
        assert resp.status_code == 401

    def test_returns_active_department_head_users(self, client, auth_headers):
        resp = client.get('/api/registers/heads', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        # Every seeded department-head-role test user (hr, finance, it, purchase, regular) should appear.
        names = {u['name'] for u in body['data']}
        assert 'Hr Test' in names


class TestCreateRegisterWithHeadId:
    def test_creates_register_using_head_id(self, client, auth_headers):
        from app.models.user import User

        head = User.query.filter_by(email='hr-test@school.test').first()
        resp = client.post(
            '/api/registers',
            json=_payload(head_id=head.id, head_name=None),
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['data']['head_id'] == head.id
        assert body['data']['head_name'] == head.name
        assert body['data']['checking_cycle'] == body['data']['cycle']

    def test_rejects_inactive_or_missing_head_id(self, client, auth_headers):
        resp = client.post(
            '/api/registers',
            json=_payload(head_id=999999, head_name=None),
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 400


class TestRegisterCalendarPopup:
    def test_returns_entries_for_single_register(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(), headers=auth_headers['chairman']).get_json()
        register_id = created['data']['id']

        resp = client.get(f'/api/registers/{register_id}/calendar', headers=auth_headers['chairman'])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['data']['register']['id'] == register_id
        assert isinstance(body['data']['entries'], list)


class TestUpdateOccurrenceStatus:
    """Authorization / validation of the check endpoint. The once-per-period
    behaviour itself is covered by TestPeriodBasedChecking below."""

    def test_forbidden_for_non_chairman(self, client, auth_headers):
        created = client.post(
            '/api/registers', json=_payload(cycle='WEEKLY', start_date=(date.today() - timedelta(days=21)).isoformat()),
            headers=auth_headers['chairman'],
        ).get_json()
        register_id = created['data']['id']
        occ_date = created['data']['start_date']
        resp = client.patch(
            f'/api/registers/{register_id}/occurrences/{occ_date}/status',
            json={'status': 'OK'},
            headers=auth_headers['hr'],
        )
        assert resp.status_code == 403

    def test_invalid_status_rejected(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(cycle='WEEKLY'), headers=auth_headers['chairman']).get_json()
        register_id = created['data']['id']
        occ_date = created['data']['start_date']
        resp = client.patch(
            f'/api/registers/{register_id}/occurrences/{occ_date}/status',
            json={'status': 'BOGUS'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 400

    def test_idle_is_not_a_check(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(cycle='WEEKLY'), headers=auth_headers['chairman']).get_json()
        resp = client.patch(
            f"/api/registers/{created['data']['id']}/occurrences/{date.today().isoformat()}/status",
            json={'status': 'IDLE'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 400

    def test_invalid_date_rejected(self, client, auth_headers):
        created = client.post('/api/registers', json=_payload(cycle='WEEKLY'), headers=auth_headers['chairman']).get_json()
        resp = client.patch(
            f"/api/registers/{created['data']['id']}/occurrences/not-a-date/status",
            json={'status': 'OK'},
            headers=auth_headers['chairman'],
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Period-based checking: one check per checking period, not one exact date
# ---------------------------------------------------------------------------

import pytest  # noqa: E402

from app.models.register import (  # noqa: E402
    Register,
    RegisterOccurrence,
    next_period_start,
    period_bounds,
)

D = date  # short alias for the tables below


def _pin_today(monkeypatch, day):
    """Make every register endpoint believe today is `day`."""
    monkeypatch.setattr('app.routes.registers._today', lambda: day)


def _make_register(client, headers, cycle, start=D(2025, 1, 1), **overrides):
    resp = client.post(
        '/api/registers',
        json=_payload(cycle=cycle, start_date=start.isoformat(), **overrides),
        headers=headers,
    )
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()['data']['id']


def _check(client, headers, register_id, day, status='OK'):
    return client.patch(
        f'/api/registers/{register_id}/occurrences/{day.isoformat()}/status',
        json={'status': status},
        headers=headers,
    )


def _get(client, headers, register_id):
    return client.get(f'/api/registers/{register_id}', headers=headers).get_json()['data']


def _row_count(app, register_id):
    with app.app_context():
        return RegisterOccurrence.query.filter_by(register_id=register_id).count()


class TestPeriodBounds:
    @pytest.mark.parametrize('cycle,day,expected', [
        ('DAILY', D(2026, 10, 6), (D(2026, 10, 6), D(2026, 10, 6))),
        ('WEEKLY', D(2026, 10, 5), (D(2026, 10, 5), D(2026, 10, 11))),   # Monday
        ('WEEKLY', D(2026, 10, 8), (D(2026, 10, 5), D(2026, 10, 11))),   # Thursday
        ('WEEKLY', D(2026, 10, 11), (D(2026, 10, 5), D(2026, 10, 11))),  # Sunday
        ('WEEKLY', D(2026, 12, 31), (D(2026, 12, 28), D(2027, 1, 3))),   # crosses the year
        ('15_DAYS', D(2026, 10, 15), (D(2026, 10, 1), D(2026, 10, 15))),
        ('15_DAYS', D(2026, 10, 16), (D(2026, 10, 16), D(2026, 10, 31))),
        ('15_DAYS', D(2026, 2, 20), (D(2026, 2, 16), D(2026, 2, 28))),
        ('MONTHLY', D(2026, 2, 10), (D(2026, 2, 1), D(2026, 2, 28))),
        ('MONTHLY', D(2028, 2, 10), (D(2028, 2, 1), D(2028, 2, 29))),    # leap year
        ('QUARTERLY', D(2026, 8, 31), (D(2026, 7, 1), D(2026, 9, 30))),
        ('HALF_YEARLY', D(2026, 6, 30), (D(2026, 1, 1), D(2026, 6, 30))),
        ('HALF_YEARLY', D(2026, 7, 1), (D(2026, 7, 1), D(2026, 12, 31))),
        ('YEARLY', D(2026, 5, 5), (D(2026, 1, 1), D(2026, 12, 31))),
    ])
    def test_bounds(self, cycle, day, expected):
        assert period_bounds(cycle, day) == expected

    def test_next_period_start(self):
        assert next_period_start('WEEKLY', D(2026, 10, 8)) == D(2026, 10, 12)
        assert next_period_start('MONTHLY', D(2026, 12, 15)) == D(2027, 1, 1)
        assert next_period_start('DAILY', D(2026, 10, 6)) == D(2026, 10, 7)


class TestPeriodBasedChecking:
    def test_daily(self, app, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'DAILY')

        _pin_today(monkeypatch, D(2026, 10, 6))
        assert _get(client, h, reg)['can_check'] is True
        assert _check(client, h, reg, D(2026, 10, 6)).status_code == 200      # check today -> allowed
        assert _check(client, h, reg, D(2026, 10, 6)).status_code == 409      # again today -> blocked
        state = _get(client, h, reg)
        assert state['can_check'] is False and state['checked_in_current_period'] is True
        assert state['status'] == 'OK'

        _pin_today(monkeypatch, D(2026, 10, 7))                               # tomorrow
        state = _get(client, h, reg)
        assert state['can_check'] is True and state['status'] == 'IDLE'       # re-enabled automatically
        assert _check(client, h, reg, D(2026, 10, 7)).status_code == 200
        assert _row_count(app, reg) == 2

    def test_weekly_any_day_of_the_week_but_only_once(self, app, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')

        # Monday 5 Oct 2026 - Sunday 11 Oct 2026. Unchecked all week -> enabled every day.
        for day in range(5, 12):
            _pin_today(monkeypatch, D(2026, 10, day))
            assert _get(client, h, reg)['can_check'] is True, f'day {day}'

        _pin_today(monkeypatch, D(2026, 10, 5))                               # Monday
        assert _check(client, h, reg, D(2026, 10, 5)).status_code == 200

        for day in (6, 7, 8, 9, 10, 11):                                      # Tue..Sun -> blocked
            _pin_today(monkeypatch, D(2026, 10, day))
            state = _get(client, h, reg)
            assert state['can_check'] is False, f'day {day}'
            assert _check(client, h, reg, D(2026, 10, day)).status_code == 409, f'day {day}'

        _pin_today(monkeypatch, D(2026, 10, 12))                              # next Monday
        assert _get(client, h, reg)['can_check'] is True
        assert _check(client, h, reg, D(2026, 10, 12)).status_code == 200
        assert _row_count(app, reg) == 2

    def test_weekly_can_be_checked_late_in_the_week(self, app, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        _pin_today(monkeypatch, D(2026, 10, 9))                               # Friday
        resp = _check(client, h, reg, D(2026, 10, 9))
        assert resp.status_code == 200
        # Stored once against the period (its Monday), with the real check time kept.
        occ = resp.get_json()['data']['occurrence']
        assert occ['occurrence_date'] == '2026-10-05'
        assert occ['completed_at'] is not None

    def test_monthly(self, app, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'MONTHLY')

        _pin_today(monkeypatch, D(2026, 10, 5))
        assert _check(client, h, reg, D(2026, 10, 5)).status_code == 200      # 5th -> allowed
        _pin_today(monkeypatch, D(2026, 10, 20))
        assert _check(client, h, reg, D(2026, 10, 20)).status_code == 409     # 20th -> blocked
        assert _get(client, h, reg)['can_check'] is False
        _pin_today(monkeypatch, D(2026, 11, 2))                               # next month
        assert _get(client, h, reg)['can_check'] is True
        assert _check(client, h, reg, D(2026, 11, 2)).status_code == 200

    @pytest.mark.parametrize('cycle,first,later_same_period,next_period', [
        ('DAILY',       D(2026, 10, 6), D(2026, 10, 6),  D(2026, 10, 7)),
        ('WEEKLY',      D(2026, 10, 6), D(2026, 10, 11), D(2026, 10, 12)),
        ('15_DAYS',     D(2026, 10, 3), D(2026, 10, 15), D(2026, 10, 16)),
        ('MONTHLY',     D(2026, 10, 5), D(2026, 10, 31), D(2026, 11, 1)),
        ('QUARTERLY',   D(2026, 8, 10), D(2026, 9, 30),  D(2026, 10, 1)),
        ('HALF_YEARLY', D(2026, 2, 10), D(2026, 6, 30),  D(2026, 7, 1)),
        ('YEARLY',      D(2026, 3, 10), D(2026, 12, 31), D(2027, 1, 1)),
    ])
    def test_every_cycle_allows_one_check_per_period(
        self, app, client, auth_headers, monkeypatch, cycle, first, later_same_period, next_period
    ):
        h = auth_headers['chairman']
        reg = _make_register(client, h, cycle)

        _pin_today(monkeypatch, first)
        assert _get(client, h, reg)['can_check'] is True
        assert _check(client, h, reg, first).status_code == 200

        _pin_today(monkeypatch, later_same_period)                            # last day of the same period
        assert _get(client, h, reg)['can_check'] is False
        assert _check(client, h, reg, later_same_period).status_code == 409

        _pin_today(monkeypatch, next_period)                                  # first day of the next one
        assert _get(client, h, reg)['can_check'] is True
        assert _check(client, h, reg, next_period).status_code == 200
        assert _row_count(app, reg) == 2

    def test_rejected_check_also_uses_up_the_period(self, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        _pin_today(monkeypatch, D(2026, 10, 6))
        assert _check(client, h, reg, D(2026, 10, 6), 'REJECTED').status_code == 200
        assert _check(client, h, reg, D(2026, 10, 7), 'OK').status_code == 409
        state = _get(client, h, reg)
        assert state['status'] == 'REJECTED' and state['can_check'] is False

    def test_duplicate_blocked_whatever_date_inside_the_period_is_sent(self, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        _pin_today(monkeypatch, D(2026, 10, 7))
        assert _check(client, h, reg, D(2026, 10, 7)).status_code == 200
        for day in (5, 6, 7, 8, 9, 10, 11):                                   # incl. the period start key
            assert _check(client, h, reg, D(2026, 10, day)).status_code == 409

    def test_series_status_endpoint_cannot_bypass_the_rule(self, app, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        _pin_today(monkeypatch, D(2026, 10, 6))
        assert client.patch(f'/api/registers/{reg}/status', json={'status': 'OK'}, headers=h).status_code == 200
        assert client.patch(f'/api/registers/{reg}/status', json={'status': 'OK'}, headers=h).status_code == 409
        assert _check(client, h, reg, D(2026, 10, 7)).status_code == 409
        assert _row_count(app, reg) == 1

    def test_only_the_current_period_can_be_checked(self, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        _pin_today(monkeypatch, D(2026, 10, 6))
        assert _check(client, h, reg, D(2026, 10, 4)).status_code == 400      # last week: closed
        assert _check(client, h, reg, D(2026, 10, 12)).status_code == 400     # next week: not started
        assert _get(client, h, reg)['can_check'] is True                      # nothing was recorded

    def test_register_that_has_not_started_cannot_be_checked(self, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY', start=D(2026, 11, 1))
        _pin_today(monkeypatch, D(2026, 10, 6))
        state = _get(client, h, reg)
        assert state['can_check'] is False and state['current_period_start'] is None
        assert _check(client, h, reg, D(2026, 10, 6)).status_code == 400

    def test_legacy_row_on_an_old_exact_date_counts_for_its_period(self, app, client, auth_headers, monkeypatch):
        """Rows written before this change sit on the old scheduled date
        (mid-period). They must still block a second check in that period."""
        from app.extensions import db
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        with app.app_context():
            db.session.add(RegisterOccurrence(register_id=reg, occurrence_date=D(2026, 10, 7), status='OK'))
            db.session.commit()

        _pin_today(monkeypatch, D(2026, 10, 9))
        state = _get(client, h, reg)
        assert state['can_check'] is False and state['status'] == 'OK'
        assert _check(client, h, reg, D(2026, 10, 9)).status_code == 409
        _pin_today(monkeypatch, D(2026, 10, 12))
        assert _get(client, h, reg)['can_check'] is True

    def test_unchecked_placeholder_row_does_not_block(self, app, client, auth_headers, monkeypatch):
        from app.extensions import db
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        with app.app_context():
            db.session.add(RegisterOccurrence(register_id=reg, occurrence_date=D(2026, 10, 5), status='IDLE'))
            db.session.commit()
        _pin_today(monkeypatch, D(2026, 10, 6))
        assert _get(client, h, reg)['can_check'] is True
        assert _check(client, h, reg, D(2026, 10, 6)).status_code == 200
        assert _row_count(app, reg) == 1                                       # reused, not duplicated

    def test_refreshing_or_listing_never_creates_records(self, app, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        _pin_today(monkeypatch, D(2026, 10, 6))
        assert _check(client, h, reg, D(2026, 10, 6)).status_code == 200
        for _ in range(3):
            _get(client, h, reg)
            client.get('/api/registers', headers=h)
            client.get(f'/api/registers/{reg}/calendar?month=2026-10', headers=h)
            client.get('/api/registers/calendar?start=2026-09-01&end=2026-10-31', headers=h)
        assert _row_count(app, reg) == 1

    def test_list_exposes_period_fields(self, client, auth_headers, monkeypatch):
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY')
        _pin_today(monkeypatch, D(2026, 10, 7))
        row = next(r for r in client.get('/api/registers', headers=h).get_json()['data'] if r['id'] == reg)
        assert row['current_period_start'] == '2026-10-05'
        assert row['current_period_end'] == '2026-10-11'
        assert row['can_check'] is True and row['checked_in_current_period'] is False
        _check(client, h, reg, D(2026, 10, 7))
        row = next(r for r in client.get('/api/registers', headers=h).get_json()['data'] if r['id'] == reg)
        assert row['can_check'] is False and row['status'] == 'OK'

    def test_history_is_kept_per_period(self, app, client, auth_headers, monkeypatch):
        """Week 1 checked, week 2 checked, week 3 missed, week 4 checked."""
        h = auth_headers['chairman']
        reg = _make_register(client, h, 'WEEKLY', start=D(2026, 9, 7))
        ids = {}
        for week_start, check_day in ((D(2026, 9, 7), D(2026, 9, 8)),
                                      (D(2026, 9, 14), D(2026, 9, 17)),
                                      (D(2026, 9, 28), D(2026, 9, 30))):    # week of 21 Sep skipped
            _pin_today(monkeypatch, check_day)
            resp = _check(client, h, reg, check_day)
            assert resp.status_code == 200
            ids[week_start] = resp.get_json()['data']['occurrence']['id']

        _pin_today(monkeypatch, D(2026, 10, 7))                               # a later week
        entries = client.get(f'/api/registers/{reg}/calendar?month=2026-09', headers=h).get_json()['data']['entries']
        by_start = {e['period_start']: e for e in entries}
        assert by_start['2026-09-07']['status'] == 'COMPLETED'
        assert by_start['2026-09-14']['status'] == 'COMPLETED'
        assert by_start['2026-09-21']['status'] == 'PENDING'                  # missed
        assert by_start['2026-09-28']['status'] == 'COMPLETED'
        assert by_start['2026-09-07']['occurrence_id'] == ids[D(2026, 9, 7)]  # untouched, not overwritten
        assert _row_count(app, reg) == 3


class TestMissedPeriodsAndCounts:
    """Pure model tests (no HTTP): how periods turn into Completed / Missed /
    Rejected, which feeds the Register Report, dashboard and performance."""

    @staticmethod
    def _register(cycle='WEEKLY', start=D(2026, 9, 7)):
        return Register(id=1, name='R', register_no='R-1', head_name='H', cycle=cycle,
                        priority='LOW', start_date=start, next_due_date=start)

    @staticmethod
    def _tally(register, rows, today, range_start, range_end):
        occ_map = {row.occurrence_date: row for row in rows}
        counts = {'COMPLETED': 0, 'PENDING': 0, 'FAILED': 0, 'UPCOMING': 0}
        for occ in register.generate_occurrences(range_start, range_end, today, occurrence_map=occ_map):
            counts[occ['status']] += 1
        return counts

    def test_missed_only_counts_after_the_period_has_ended(self):
        reg = self._register()
        rows = [
            RegisterOccurrence(register_id=1, occurrence_date=D(2026, 9, 7), status='OK'),
            RegisterOccurrence(register_id=1, occurrence_date=D(2026, 9, 16), status='OK'),       # legacy mid-week row
            RegisterOccurrence(register_id=1, occurrence_date=D(2026, 9, 28), status='REJECTED'),
        ]
        # Today is Tue 6 Oct: weeks of 7, 14, 21, 28 Sep are closed; week of 5 Oct is open.
        counts = self._tally(reg, rows, D(2026, 10, 6), D(2026, 9, 1), D(2026, 10, 6))
        assert counts == {'COMPLETED': 2, 'PENDING': 1, 'FAILED': 1, 'UPCOMING': 1}
        # Unchecked-but-still-open week is not "missed" yet; checking it completes it.
        rows.append(RegisterOccurrence(register_id=1, occurrence_date=D(2026, 10, 5), status='OK'))
        counts = self._tally(reg, rows, D(2026, 10, 6), D(2026, 9, 1), D(2026, 10, 6))
        assert counts == {'COMPLETED': 3, 'PENDING': 1, 'FAILED': 1, 'UPCOMING': 0}

    def test_open_period_is_flagged_and_status_resets_each_period(self):
        reg = self._register()
        checked = RegisterOccurrence(register_id=1, occurrence_date=D(2026, 10, 5), status='OK')
        assert reg.effective_today_status(D(2026, 10, 9), checked)[0] == 'OK'
        # The next week the same (now stale) row is not passed in -> IDLE again.
        assert reg.effective_today_status(D(2026, 10, 12), None)[0] == 'IDLE'

    def test_period_straddling_the_range_start_is_still_counted(self):
        reg = self._register()
        rows = [RegisterOccurrence(register_id=1, occurrence_date=D(2026, 9, 28), status='OK')]
        # Range starts mid-week (Wed 30 Sep); that week overlaps the range.
        counts = self._tally(reg, rows, D(2026, 10, 6), D(2026, 9, 30), D(2026, 10, 6))
        assert counts['COMPLETED'] == 1

    def test_first_period_includes_the_start_date(self):
        reg = self._register(cycle='MONTHLY', start=D(2026, 9, 20))
        periods = reg.periods_in_range(D(2026, 1, 1), D(2026, 10, 31))
        assert periods[0] == (D(2026, 9, 1), D(2026, 9, 30))
        assert periods[-1] == (D(2026, 10, 1), D(2026, 10, 31))
