"""Tests for the Performance screen's On Time / After Due / Pending columns,
the styled Performance Excel export, and the simplified Task Monitor summary.

Run:  cd backend && python -m pytest app/tests/test_performance_categories.py -q
"""
import uuid
from datetime import date, datetime, timedelta, timezone

GREEN_BG = '#E3F6E8'
YELLOW_BG = '#FEF3C7'
RED_BG = '#FDE2E2'


def _head(app, role='HR'):
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        user = User(name=f'Head {uuid.uuid4().hex[:5]}', email=f'{uuid.uuid4().hex[:8]}@school.test',
                    role=role, is_active=True)
        user.set_password('x' * 12)
        db.session.add(user)
        db.session.commit()
        return user.id, user.name


def _task(app, uid, status, due, completed=None):
    from app.extensions import db
    from app.models.task import Task

    with app.app_context():
        db.session.add(Task(title=f'T-{uuid.uuid4().hex[:5]}', assigned_by=uid, assigned_to=uid,
                            status=status, priority='MEDIUM', due_date=due, completed_at=completed))
        db.session.commit()


def _register(app, uid, name, cycle='DAILY', days_ago=10):
    from app.extensions import db
    from app.models.register import Register, calculate_next_due_date
    from app.models.user import User

    with app.app_context():
        head = db.session.get(User, uid)
        start = date.today() - timedelta(days=days_ago)
        reg = Register(name=name, register_no=f'REG-{uuid.uuid4().hex[:8]}', head_id=uid,
                       head_name=head.name, cycle=cycle, priority='MEDIUM', status='IDLE',
                       start_date=start, next_due_date=calculate_next_due_date(start, cycle))
        db.session.add(reg)
        db.session.commit()
        return reg.id


def _check(app, reg_id, occ_date, status, completed_at):
    from app.extensions import db
    from app.models.register import RegisterOccurrence

    with app.app_context():
        db.session.add(RegisterOccurrence(register_id=reg_id, occurrence_date=occ_date,
                                          status=status, completed_at=completed_at))
        db.session.commit()


def test_register_category_rules():
    from app.utils.completion import register_completion_category as cat

    from app.utils.timezone import school_tz
    tz = school_tz()  # check times are compared as SCHOOL calendar days, not UTC
    due = date(2026, 1, 10)
    assert cat('COMPLETED', due, datetime(2026, 1, 10, 23, 0, tzinfo=tz)) == 'ON_TIME'
    assert cat('COMPLETED', due, datetime(2026, 1, 11, 1, 0, tzinfo=tz)) == 'LATE'
    assert cat('COMPLETED', None, datetime(2026, 1, 11)) == 'ON_TIME'   # no due date
    assert cat('COMPLETED', due, None) == 'ON_TIME'                     # no completion time
    assert cat('PENDING', due, None) == 'PENDING'                       # missed
    assert cat('FAILED', due, None) == 'PENDING'                        # rejected


def test_staff_rows_categories_sum_to_totals(app):
    from app.routes.dashboard import _staff_performance_rows

    uid, _ = _head(app)
    now = datetime.now(timezone.utc)
    _task(app, uid, 'COMPLETED', now + timedelta(days=2), now)
    _task(app, uid, 'COMPLETED', now - timedelta(days=3), now)
    _task(app, uid, 'IN_PROGRESS', now + timedelta(days=2))
    reg = _register(app, uid, 'Cat Register', days_ago=4)
    # Register days are SCHOOL calendar days (not the server's local date), and a
    # check time is compared as a school day too.
    from app.utils.timezone import school_today, school_tz
    today = school_today()
    at = lambda d, hh=10: datetime(d.year, d.month, d.day, hh, 0, tzinfo=school_tz())
    _check(app, reg, today - timedelta(days=1), 'OK', at(today - timedelta(days=1)))            # on time (due day)
    _check(app, reg, today - timedelta(days=2), 'OK', at(today - timedelta(days=1)))            # late (next day)
    _check(app, reg, today - timedelta(days=3), 'REJECTED', at(today - timedelta(days=3)))      # pending

    with app.app_context():
        row = next(r for r in _staff_performance_rows() if r['userId'] == uid)

    # pendingTasks is now the real PENDING status count; the one unfinished task here is IN_PROGRESS.
    assert (row['onTimeCompleteTasks'], row['completedAfterDueTasks'], row['pendingTasks']) == (1, 1, 0)
    assert row['inProgressTasks'] == 1
    assert (row['completedTasks'] + row['inProgressTasks'] + row['pendingTasks']
            + row['delayedTasks'] + row['escalatedTasks']) == row['totalTasks']
    assert row['onTimeCompleteTasks'] + row['completedAfterDueTasks'] == row['completedTasks']

    assert row['onTimeCompleteRegisters'] == 1
    assert row['completedAfterDueRegisters'] == 1
    due_total = row['completedRegisters'] + row['missedRegisters'] + row['rejectedRegisters']
    assert row['onTimeCompleteRegisters'] + row['completedAfterDueRegisters'] + row['pendingRegisters'] == due_total
    assert row['pendingRegisters'] == row['missedRegisters'] + row['rejectedRegisters']
    # Performance % is unchanged: still completed / due.
    assert row['registerPerformance'] == round(row['completedRegisters'] / due_total * 100)


def test_performance_excel_export(app, client, auth_headers):
    uid, name = _head(app)
    now = datetime.now(timezone.utc)
    _task(app, uid, 'COMPLETED', now + timedelta(days=1), now)
    _register(app, uid, 'Excel Register')

    resp = client.get('/api/reports/performance/export', headers=auth_headers['chairman'],
                      query_string={'format': 'excel', 'head': name,
                                    'date_from': (date.today() - timedelta(days=30)).isoformat(),
                                    'date_to': date.today().isoformat()})
    assert resp.status_code == 200
    assert resp.mimetype == 'application/vnd.ms-excel'
    assert resp.headers['Content-Disposition'].endswith('.xls')
    body = resp.get_data(as_text=True)

    for label in ('On Time Checked', 'Checked After Due Date', 'Pending', 'In Progress'):
        assert label in body
    for gone in ('On Time Complete', 'Complete After Due Date', 'Delay Rate', 'Missed Checking', 'Total Delayed', '>Completed<'):
        assert gone not in body
    assert 'Excel Register' in body
    assert 'Performance Report' in body
    assert '#1E3A5F' in body and '#2E75B6' in body                    # band + blue header
    assert GREEN_BG in body and YELLOW_BG in body and RED_BG in body  # tints + legend
    assert 'Green = On Time Checked' in body and 'Red = Pending' in body
    assert body.count('>Total<') == 3                                  # totals row per table
    assert name in body or 'All heads' not in body                     # head filter reflected
    assert f'Head: {name}' in body


def test_performance_export_requires_auth_excel(client):
    assert client.get('/api/reports/performance/export', query_string={'format': 'excel'}).status_code == 401


def test_performance_export_rejects_unknown_format(client, auth_headers):
    resp = client.get('/api/reports/performance/export', headers=auth_headers['chairman'],
                      query_string={'format': 'xml'})
    assert resp.status_code == 400


def test_task_monitor_excel_summary_simplified(app, client, auth_headers):
    uid, _ = _head(app)
    now = datetime.now(timezone.utc)
    _task(app, uid, 'COMPLETED', now + timedelta(days=1), now)
    _task(app, uid, 'PENDING', now + timedelta(days=1))

    resp = client.get('/api/reports/export', headers=auth_headers['chairman'],
                      query_string={'format': 'excel', 'type': 'CUSTOM', 'assigned_to': uid})
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    summary = body[body.index('>Total<'):body.index('>Task<')]
    for label in ('On Time Complete', 'Complete After Due Date', 'Pending (Not Completed)'):
        assert label in summary
    for gone in ('>Completed<', '>Delayed<', '>Pending<'):
        assert gone not in summary
    # Values: Total 2, On time 1, Late 0, Pending 1
    import re
    values = re.findall(r'font-weight:bold;text-align:center;[^>]*>(\d+)</td>', summary)
    assert values == ['2', '1', '0', '1']
