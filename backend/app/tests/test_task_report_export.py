"""Tests for the Task Monitor export (title, completion-timing columns, row
colours, margins) and the restyled Performance export.

Run:  cd backend && python -m pytest app/tests/test_task_report_export.py -q
"""
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest

GREEN_BG = '#E3F6E8'
YELLOW_BG = '#FEF3C7'
RED_BG = '#FDE2E2'


def _user(app, role, email=None):
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        email = email or f'{role.lower()}-{uuid.uuid4().hex[:6]}@school.test'
        user = User(name=f'{role.title()} Head', email=email, role=role, is_active=True)
        user.set_password('x' * 12)
        db.session.add(user)
        db.session.commit()
        return user.id


def _task(app, assignee_id, title, status, due, completed=None, assigner_id=None):
    from app.extensions import db
    from app.models.task import Task

    with app.app_context():
        task = Task(
            title=title, assigned_by=assigner_id or assignee_id, assigned_to=assignee_id,
            status=status, priority='MEDIUM', due_date=due, completed_at=completed,
        )
        db.session.add(task)
        db.session.commit()
        return task.id


def _now():
    return datetime.now(timezone.utc)


def _export(client, headers, fmt, **params):
    params.update(format=fmt, type='CUSTOM')
    return client.get('/api/reports/export', headers=headers, query_string=params)


def _pdf_text(resp):
    import pdfplumber

    with pdfplumber.open(io.BytesIO(resp.data)) as pdf:
        return pdf, [page.extract_text() or '' for page in pdf.pages]


# ---------------------------------------------------------------- unit logic
def test_completion_category_rules(app):
    from app.models.task import Task
    from app.routes.reports import _completion_category

    due = _now()
    on_time = Task(status='COMPLETED', due_date=due, completed_at=due - timedelta(days=1))
    same_day = Task(status='COMPLETED', due_date=due, completed_at=due)
    late = Task(status='COMPLETED', due_date=due, completed_at=due + timedelta(days=2))
    no_due = Task(status='COMPLETED', due_date=None, completed_at=due)
    no_due_no_done = Task(status='COMPLETED', due_date=None, completed_at=None)
    no_done = Task(status='COMPLETED', due_date=due, completed_at=None, updated_at=None)
    naive = Task(status='COMPLETED', due_date=datetime(2026, 1, 10), completed_at=datetime(2026, 1, 12))

    assert _completion_category(on_time) == 'ON_TIME'
    assert _completion_category(same_day) == 'ON_TIME'
    assert _completion_category(late) == 'LATE'
    assert _completion_category(no_due) == 'ON_TIME'
    assert _completion_category(no_due_no_done) == 'ON_TIME'
    assert _completion_category(no_done) == 'ON_TIME'
    assert _completion_category(naive) == 'LATE'
    for status in ('PENDING', 'IN_PROGRESS', 'DELAYED', 'ESCALATED'):
        assert _completion_category(Task(status=status, due_date=due)) == 'PENDING'
        assert _completion_category(Task(status=status, due_date=None)) == 'PENDING'


# --------------------------------------------------------------------- titles
@pytest.mark.parametrize('role,expected', [
    ('ADMIN', 'Admin Head Task Report'),
    ('HR', 'HR Head Task Report'),
    ('IT', 'IT & ERP Head Task Report'),
])
def test_title_follows_selected_head(app, client, auth_headers, role, expected):
    head_id = _user(app, role)
    _task(app, head_id, f'{role} task', 'PENDING', _now() + timedelta(days=3))
    resp = _export(client, auth_headers['chairman'], 'pdf', assigned_to=head_id)
    assert resp.status_code == 200
    _, pages = _pdf_text(resp)
    assert expected in pages[0]
    assert 'Daily Report' not in pages[0] and 'CUSTOM Report' not in pages[0]


def test_title_all_heads_and_period(app, client, auth_headers):
    resp = _export(client, auth_headers['chairman'], 'pdf',
                   date_from='2026-01-01', date_to='2026-01-31')
    assert resp.status_code == 200
    _, pages = _pdf_text(resp)
    assert 'All Heads Task Report' in pages[0]
    assert 'Period: 01 Jan 2026 to 31 Jan 2026' in pages[0]


# ------------------------------------------- categories, colours and totals
def _seed_three(app):
    head = _user(app, 'FINANCE')
    due = _now() + timedelta(days=5)
    _task(app, head, 'GREEN done early', 'COMPLETED', due, completed=due - timedelta(days=2))
    _task(app, head, 'YELLOW done late', 'COMPLETED', due, completed=due + timedelta(days=3))
    _task(app, head, 'RED not done', 'IN_PROGRESS', due)
    _task(app, head, 'GREEN no due date', 'COMPLETED', None, completed=_now())
    return head


def test_excel_rows_colours_columns_and_totals(app, client, auth_headers):
    head = _seed_three(app)
    resp = _export(client, auth_headers['chairman'], 'excel', assigned_to=head)
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)

    assert 'Finance Head Task Report' in html
    for col in ('On Time Complete', 'Complete After Due Date', '<th'):
        assert col in html
    # existing columns still present, in order, new ones after them
    task_header = html[html.index('>Task</th>'):]
    order = ['>Task</th>', '>Assigned To</th>', '>Priority</th>', '>Status</th>', '>Due Date</th>',
             '>Department</th>', '>On Time Complete</th>', '>Complete After Due Date</th>', '>Pending</th>']
    positions = [task_header.index(c) for c in order]
    assert positions == sorted(positions)

    def row_for(title):
        start = html.index(title)
        return html[html.rindex('<tr>', 0, start):html.index('</tr>', start)]

    green, yellow, red, green2 = (row_for(t) for t in
                                  ('GREEN done early', 'YELLOW done late', 'RED not done', 'GREEN no due date'))
    assert GREEN_BG in green and green.count('&#10004;') == 1
    assert YELLOW_BG in yellow and yellow.count('&#10004;') == 1
    assert RED_BG in red and red.count('&#10004;') == 1
    assert GREEN_BG in green2 and green2.count('&#10004;') == 1

    def tick_cell(row):
        cells = row.split('</td>')
        # spacer + 9 data cells -> indicators are the last three cells
        return [('&#10004;' in c) for c in cells[-4:-1]]

    assert tick_cell(green) == [True, False, False]
    assert tick_cell(yellow) == [False, True, False]
    assert tick_cell(red) == [False, False, True]

    # legend + spacing
    assert 'Green = On Time Complete' in html
    assert 'Yellow = Complete After Due Date' in html
    assert 'Red = Pending' in html
    assert 'width:24px' in html  # left spacer column

    # totals match rows: 2 on time, 1 late, 1 pending, 4 total
    from app.routes.reports import _get_tasks, _summary
    from app.models.user import User
    with app.app_context():
        tasks = _get_tasks(None, None, None, user=User.query.filter_by(role='CHAIRMAN').first(),
                           assigned_to=head)
        summary = _summary(tasks)
    assert (summary['onTimeComplete'], summary['completedAfterDue'], summary['notCompleted']) == (2, 1, 1)
    assert summary['onTimeComplete'] + summary['completedAfterDue'] + summary['notCompleted'] == summary['total']
    totals_row = html[html.index('Pending (Not Completed)'):]
    assert '>2</td>' in totals_row and '>1</td>' in totals_row and '>4</td>' in totals_row


def test_pdf_has_colours_columns_legend_and_margins(app, client, auth_headers):
    import pdfplumber

    head = _seed_three(app)
    resp = _export(client, auth_headers['chairman'], 'pdf', assigned_to=head)
    assert resp.status_code == 200
    with pdfplumber.open(io.BytesIO(resp.data)) as pdf:
        page = pdf.pages[0]
        text = page.extract_text()
        for needle in ('Finance Head Task Report', 'On Time Complete', 'Complete After Due Date',
                       'Green = On Time Complete', 'Yellow = Complete After Due Date', 'Red = Pending'):
            assert needle in text

        fills = {tuple(round(c, 2) for c in r['non_stroking_color'])
                 for r in page.rects if isinstance(r.get('non_stroking_color'), tuple)}

        def rgb(h):
            h = h.lstrip('#')
            return tuple(round(int(h[i:i + 2], 16) / 255, 2) for i in (0, 2, 4))

        for bg in (GREEN_BG, YELLOW_BG, RED_BG):
            assert rgb(bg) in fills, f'{bg} fill missing from PDF'

        left_edge = min(w['x0'] for w in page.extract_words())
        assert left_edge >= 36  # not touching the page edge
        # 54pt bottom margin: nothing but the small page-number footer sits below it
        gap_zone = [w for w in page.extract_words() if 40 < page.height - w['bottom'] < 54]
        assert not gap_zone


def test_multi_page_pdf_keeps_margins_and_header(app, client, auth_headers):
    import pdfplumber

    head = _user(app, 'PURCHASE')
    due = _now() + timedelta(days=5)
    for i in range(70):
        _task(app, head, f'Bulk task {i:03d}', 'COMPLETED' if i % 2 else 'PENDING', due,
              completed=due - timedelta(days=1))
    resp = _export(client, auth_headers['chairman'], 'pdf', assigned_to=head)
    with pdfplumber.open(io.BytesIO(resp.data)) as pdf:
        assert len(pdf.pages) >= 2
        total_rows = 0
        for page in pdf.pages:
            words = page.extract_words()
            assert min(w['x0'] for w in words) >= 36
            assert max(w['x1'] for w in words) <= page.width - 36
            flat = ' '.join((page.extract_text() or '').split())
            assert 'Assigned To' in flat and 'Department' in flat  # header row repeated on every page
            total_rows += sum(1 for w in words if w['text'] == 'Bulk')
        assert total_rows == 70  # no 100-row cap truncation / nothing lost


# ------------------------------------------------------------------ preview
def test_preview_payload_additive_keys(app, client, auth_headers):
    head = _seed_three(app)
    resp = client.get('/api/reports/daily', headers=auth_headers['chairman'])
    assert resp.status_code == 200
    data = resp.get_json()['data']
    assert {'onTimeComplete', 'completedAfterDue', 'notCompleted'} <= set(data['summary'])
    assert all('completionCategory' in row for row in data['tasks'])
    # original keys untouched
    assert {'total', 'completed', 'delayed', 'pending', 'inProgress', 'escalated'} <= set(data['summary'])


# -------------------------------------------------------------- performance
def test_performance_pdf_restyled_same_data(app, client, auth_headers):
    import pdfplumber

    resp = client.get('/api/reports/performance-export?format=pdf', headers=auth_headers['chairman'])
    assert resp.status_code == 200
    with pdfplumber.open(io.BytesIO(resp.data)) as pdf:
        page = pdf.pages[0]
        text = page.extract_text()
        for col in ('Department', 'Date', 'Registry Performance'):
            assert col in text
        # registers only: no task data in the performance PDF
        assert 'Task Performance' not in text and 'Final Performance' not in text
        assert 'Performance Report' in text
        assert min(w['x0'] for w in page.extract_words()) >= 36
        fills = {tuple(round(c, 2) for c in r['non_stroking_color'])
                 for r in page.rects if isinstance(r.get('non_stroking_color'), tuple)}
        assert (0.18, 0.46, 0.71) in fills  # shared #2E75B6 header colour


def test_performance_excel_restyled_same_columns(app, client, auth_headers):
    resp = client.get('/api/reports/performance-export?format=excel', headers=auth_headers['chairman'])
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    cols = ['Department', 'Date', 'Registry Performance']
    pos = [html.index(f'>{c}</th>') for c in cols]
    assert pos == sorted(pos)
    assert 'Task Performance' not in html and 'Final Performance' not in html
    assert '#2E75B6' in html and '#1E3A5F' in html and 'width:24px' in html


def test_performance_report_works_with_registers_and_has_no_task_data(app, client, auth_headers):
    """Regression: the department report used a method that does not exist
    (Register.computed_status), so it crashed as soon as a department had a register."""
    import uuid
    from datetime import date
    from app.extensions import db
    from app.models.department import Department
    from app.models.register import Register
    from app.models.user import User

    with app.app_context():
        dept = Department(name='Reg Dept ' + uuid.uuid4().hex[:4])
        db.session.add(dept)
        db.session.commit()
        head = User(name='Dept Head', email=uuid.uuid4().hex[:6] + '@s.test', role='HR', is_active=True,
                    department_id=dept.id)
        head.set_password('x' * 12)
        db.session.add(head)
        db.session.commit()
        db.session.add(Register(name='R', register_no='R-' + uuid.uuid4().hex[:5], head_name='Dept Head',
                                head_id=head.id, cycle='WEEKLY', priority='HIGH',
                                start_date=date(2026, 9, 1), next_due_date=date(2026, 10, 12)))
        db.session.commit()
        dept_name = dept.name

    for fmt in ('excel', 'pdf'):
        resp = client.get(f'/api/reports/performance-export?format={fmt}', headers=auth_headers['chairman'])
        assert resp.status_code == 200, fmt
    html = client.get('/api/reports/performance-export?format=excel',
                      headers=auth_headers['chairman']).get_data(as_text=True)
    assert dept_name in html and 'Registry Performance' in html
    assert 'Task Performance' not in html and 'Final Performance' not in html
