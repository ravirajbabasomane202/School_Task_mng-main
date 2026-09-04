import io
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, and_

from flask import Blueprint, Response, current_app, request, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.department import Department
from app.models.register import Register, RegisterOccurrence
from app.models.report import ReportHistory
from app.models.task import Task
from app.models.user import User
from app.routes.dashboard import _overall_performance, _staff_performance_rows
from app.routes.registers import _scope_to_user
from app.utils.response import error, success
from app.utils.decorators import roles_required

reports_bp = Blueprint('reports', __name__)
ALLOWED_REPORT_TYPES = {'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM', 'HOUSEKEEPING'}
ELEVATED_ROLES = ('CHAIRMAN', 'DIRECTOR')


def _parse_date(value):
    if not value:
        return None

    try:
        return datetime.strptime(value, '%Y-%m-%d')
    except ValueError:
        return None


def _get_tasks(
    date_from,
    date_to,
    dept_id=None,
    user=None,
    status=None,
    assigned_to=None,
    search=None,
    start_date_from=None,
    due_date_to=None
):
    query = Task.query

    # Scope to the user's department unless they are CHAIRMAN/DIRECTOR
    if user and user.role not in ELEVATED_ROLES:
        if dept_id and str(dept_id) != 'all':
            # Dept heads can only filter within their own department
            try:
                requested_dept = int(dept_id)
                if requested_dept != user.department_id:
                    return []  # Can't see other departments
                query = query.filter_by(department_id=requested_dept)
            except ValueError:
                pass
        elif user.department_id:
            query = query.filter_by(department_id=user.department_id)
    else:
        if dept_id and str(dept_id) != 'all':
            try:
                query = query.filter_by(department_id=int(dept_id))
            except ValueError:
                pass

        if status and status != 'ALL':
            query = query.filter_by(status=status)

        if assigned_to:
            try:
                query = query.filter_by(assigned_to=int(assigned_to))
            except ValueError:
                pass

        if search:
            query = query.filter(
                or_(Task.title.ilike(f'%{search}%'), Task.description.ilike(f'%{search}%'))
            )

        # Determine effective date range coming from either explicit date_from/date_to
        # or the monitoring filters start_date_from/due_date_to.
        eff_from = date_from or start_date_from
        eff_to = date_to or due_date_to

        if eff_from and eff_to:
            end_of_day = eff_to + timedelta(days=1)
            # Include tasks that either have due_date within range OR have start_date within range
            # (and possibly no due_date). This mirrors client-side monitoring filters
            query = query.filter(
                or_(
                    and_(
                        Task.start_date != None,
                        Task.start_date <= end_of_day,
                        or_(Task.due_date == None, Task.due_date >= eff_from)
                    ),
                    and_(
                        Task.due_date != None,
                        Task.due_date >= eff_from,
                        Task.due_date < end_of_day
                    )
                )
            )
        else:
            if date_from:
                query = query.filter(Task.due_date >= date_from)
            if date_to:
                end_of_day = date_to + timedelta(days=1)
                query = query.filter(Task.due_date < end_of_day)

    return query.order_by(Task.due_date.asc(), Task.created_at.desc()).all()


def _summary(tasks, include_performance=False):
    total = len(tasks)
    completed = sum(1 for task in tasks if task.status == 'COMPLETED')
    delayed = sum(1 for task in tasks if task.status == 'DELAYED')
    pending = sum(1 for task in tasks if task.status == 'PENDING')
    in_progress = sum(1 for task in tasks if task.status == 'IN_PROGRESS')
    escalated = sum(1 for task in tasks if task.status == 'ESCALATED')

    summary = {
        'total': total,
        'completed': completed,
        'delayed': delayed,
        'pending': pending,
        'inProgress': in_progress,
        'escalated': escalated
    }

    if include_performance:
        summary['performanceScore'] = round((completed / total) * 100) if total else 0

    return summary


def _department_stats(tasks):
    from collections import defaultdict

    dept_map = defaultdict(
        lambda: {
            'total': 0,
            'completed': 0,
            'delayed': 0,
            'pending': 0,
            'inProgress': 0,
            'escalated': 0
        }
    )

    for task in tasks:
        department_name = task.department.name if task.department else 'Unassigned'
        dept_map[department_name]['total'] += 1

        if task.status == 'COMPLETED':
            dept_map[department_name]['completed'] += 1
        elif task.status == 'DELAYED':
            dept_map[department_name]['delayed'] += 1
        elif task.status == 'IN_PROGRESS':
            dept_map[department_name]['inProgress'] += 1
        elif task.status == 'ESCALATED':
            dept_map[department_name]['escalated'] += 1
        else:
            dept_map[department_name]['pending'] += 1

    results = []
    for department_name, stats in dept_map.items():
        total = stats['total']
        completion_percentage = round((stats['completed'] / total) * 100) if total else 0
        delay_rate = round((stats['delayed'] / total) * 100) if total else 0
        performance_score = max(0, completion_percentage - delay_rate)
        results.append(
            {
                'department': department_name,
                **stats,
                'completionPercentage': completion_percentage,
                'performanceScore': performance_score
            }
        )

    return sorted(results, key=lambda row: row['department'])


def _task_rows(tasks):
    today = datetime.now(timezone.utc).date()
    rows = []

    for task in tasks:
        due_date = task.due_date.date() if task.due_date else None
        days_overdue = 0
        if due_date and task.status != 'COMPLETED' and due_date < today:
            days_overdue = (today - due_date).days

        rows.append(
            {
                'id': task.id,
                'task': task.title,
                'assignedTo': task.assignee.name if task.assignee else '',
                'priority': task.priority,
                'status': task.status,
                'dueDate': task.due_date.isoformat() if task.due_date else None,
                'department': task.department.name if task.department else '',
                'daysOverdue': days_overdue
            }
        )

    return rows


def _report_payload(tasks, include_performance=False):
    return {
        'summary': _summary(tasks, include_performance=include_performance),
        'departments': _department_stats(tasks),
        'tasks': _task_rows(tasks)
    }


def _performance_report_rows():
    """Department-wise rows for the Performance Report export: Department,
    Date, Task Performance (existing task completion %), Registry Performance
    (register completion %, same definition used on the Staff Performance
    page), Final Performance (the same combined score as "Overall
    Performance" there). This is a point-in-time snapshot, so every row
    shares today's date as the report generation date.
    """
    Task.mark_overdue_delayed()
    report_date = datetime.now(timezone.utc).date()

    all_tasks = Task.query.all()
    tasks_by_dept: dict = defaultdict(list)
    for task in all_tasks:
        tasks_by_dept[task.department_id].append(task)

    all_registers = Register.query.all()
    head_ids = {register.head_id for register in all_registers if register.head_id}
    heads = (
        {user.id: user for user in User.query.filter(User.id.in_(head_ids)).all()}
        if head_ids
        else {}
    )
    registers_by_dept: dict = defaultdict(list)
    for register in all_registers:
        head = heads.get(register.head_id)
        registers_by_dept[head.department_id if head else None].append(register)

    rows = []
    for department in Department.query.order_by(Department.name).all():
        dept_tasks = tasks_by_dept.get(department.id, [])
        total_tasks = len(dept_tasks)
        completed_tasks = sum(1 for task in dept_tasks if task.status == 'COMPLETED')
        task_performance = round((completed_tasks / total_tasks) * 100) if total_tasks else 0

        dept_registers = registers_by_dept.get(department.id, [])
        total_registers = len(dept_registers)
        completed_registers = sum(
            1 for register in dept_registers if register.computed_status() == 'COMPLETED'
        )
        registry_performance = (
            round((completed_registers / total_registers) * 100) if total_registers else 0
        )

        final_performance = _overall_performance(
            task_performance, bool(total_tasks), registry_performance, bool(total_registers)
        )

        rows.append(
            {
                'department': department.name,
                'date': report_date.isoformat(),
                'taskPerformance': task_performance,
                'registryPerformance': registry_performance,
                'finalPerformance': final_performance
            }
        )

    return rows


def _generate_performance_pdf(rows):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = [Paragraph('Performance Report', styles['Title']), Spacer(1, 12)]

    table_rows = [['Department', 'Date', 'Task Performance', 'Registry Performance', 'Final Performance']]
    for row in rows:
        table_rows.append(
            [
                row['department'],
                row['date'],
                f"{row['taskPerformance']}%",
                f"{row['registryPerformance']}%",
                f"{row['finalPerformance']}%"
            ]
        )

    table = Table(table_rows, hAlign='LEFT', repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                (
                    'ROWBACKGROUNDS',
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor('#F0F4F8')]
                )
            ]
        )
    )
    elements.append(table)

    doc.build(elements)
    buffer.seek(0)
    return buffer


def _generate_performance_excel(rows):
    def escape(value):
        return (
            str(value)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
        )

    html_rows = ['<html><head><meta charset="utf-8" /></head><body>']
    html_rows.append('<h2>Performance Report</h2>')
    html_rows.append('<table border="1">')
    html_rows.append(
        '<tr>'
        '<th>Department</th><th>Date</th><th>Task Performance</th>'
        '<th>Registry Performance</th><th>Final Performance</th>'
        '</tr>'
    )

    for row in rows:
        html_rows.append(
            '<tr>'
            f'<td>{escape(row["department"])}</td>'
            f'<td>{escape(row["date"])}</td>'
            f'<td>{row["taskPerformance"]}%</td>'
            f'<td>{row["registryPerformance"]}%</td>'
            f'<td>{row["finalPerformance"]}%</td>'
            '</tr>'
        )

    html_rows.append('</table></body></html>')
    buffer = io.BytesIO(''.join(html_rows).encode('utf-8'))
    buffer.seek(0)
    return buffer


def _generate_pdf(title, tasks, summary=None):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = [Paragraph(title, styles['Title']), Spacer(1, 12)]

    if summary:
        summary_rows = [
            ['Total', 'Completed', 'Delayed', 'Pending'],
            [
                str(summary['total']),
                str(summary['completed']),
                str(summary['delayed']),
                str(summary['pending'])
            ]
        ]
        table = Table(summary_rows, hAlign='LEFT')
        table.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
                ]
            )
        )
        elements.append(table)
        elements.append(Spacer(1, 12))

    if tasks:
        task_rows = [['Task', 'Assigned To', 'Priority', 'Status', 'Due Date', 'Department']]
        for task in tasks[:100]:
            task_rows.append(
                [
                    task.title[:40],
                    task.assignee.name if task.assignee else '',
                    task.priority,
                    task.status,
                    task.due_date.strftime('%Y-%m-%d') if task.due_date else '',
                    task.department.name if task.department else ''
                ]
            )

        table = Table(task_rows, hAlign='LEFT', repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2E75B6')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    (
                        'ROWBACKGROUNDS',
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor('#F0F4F8')]
                    )
                ]
            )
        )
        elements.append(table)

    doc.build(elements)
    buffer.seek(0)
    return buffer


def _generate_excel(title, tasks, summary=None):
    def escape(value):
        return (
            str(value)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
        )

    rows = ['<html><head><meta charset="utf-8" /></head><body>']
    rows.append(f'<h2>{escape(title)}</h2>')

    if summary:
        rows.append('<table border="1">')
        rows.append('<tr><th>Total</th><th>Completed</th><th>Delayed</th><th>Pending</th></tr>')
        rows.append(
            '<tr>'
            f'<td>{summary["total"]}</td>'
            f'<td>{summary["completed"]}</td>'
            f'<td>{summary["delayed"]}</td>'
            f'<td>{summary["pending"]}</td>'
            '</tr>'
        )
        rows.append('</table><br />')

    rows.append('<table border="1">')
    rows.append(
        '<tr>'
        '<th>Task</th><th>Assigned To</th><th>Priority</th><th>Status</th>'
        '<th>Due Date</th><th>Department</th>'
        '</tr>'
    )

    for task in tasks:
        rows.append(
            '<tr>'
            f'<td>{escape(task.title)}</td>'
            f'<td>{escape(task.assignee.name if task.assignee else "")}</td>'
            f'<td>{escape(task.priority)}</td>'
            f'<td>{escape(task.status)}</td>'
            f'<td>{escape(task.due_date.strftime("%Y-%m-%d") if task.due_date else "")}</td>'
            f'<td>{escape(task.department.name if task.department else "")}</td>'
            '</tr>'
        )

    rows.append('</table></body></html>')
    buffer = io.BytesIO(''.join(rows).encode('utf-8'))
    buffer.seek(0)
    return buffer


def _save_report_buffer(buffer, filename):
    reports_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'reports')
    os.makedirs(reports_dir, exist_ok=True)

    absolute_path = os.path.join(reports_dir, filename)
    with open(absolute_path, 'wb') as report_file:
        report_file.write(buffer.getvalue())

    project_root = os.path.dirname(os.path.abspath(current_app.config['UPLOAD_FOLDER']))
    relative_path = os.path.relpath(absolute_path, project_root).replace('\\', '/')
    return absolute_path, relative_path


@reports_bp.route('/daily', methods=['GET'])
@jwt_required()
def daily_report():
    user = db.session.get(User, int(get_jwt_identity()))
    date_from = _parse_date(request.args.get('date_from'))
    date_to = _parse_date(request.args.get('date_to'))
    dept_id = request.args.get('department_id')
    fmt = request.args.get('format')

    tasks = _get_tasks(date_from, date_to, dept_id, user=user)
    payload = _report_payload(tasks)

    if fmt == 'pdf':
        pdf = _generate_pdf('Daily Report', tasks, summary=payload['summary'])
        return Response(
            pdf.read(),
            mimetype='application/pdf',
            headers={'Content-Disposition': 'inline; filename=daily-report.pdf'}
        )

    return success(payload)


@reports_bp.route('/weekly', methods=['GET'])
@jwt_required()
def weekly_report():
    user = db.session.get(User, int(get_jwt_identity()))
    date_from = _parse_date(request.args.get('date_from'))
    date_to = _parse_date(request.args.get('date_to'))
    dept_id = request.args.get('department_id')

    tasks = _get_tasks(date_from, date_to, dept_id, user=user)
    return success(_report_payload(tasks))


@reports_bp.route('/monthly', methods=['GET'])
@jwt_required()
def monthly_report():
    user = db.session.get(User, int(get_jwt_identity()))
    date_from = _parse_date(request.args.get('date_from'))
    date_to = _parse_date(request.args.get('date_to'))
    dept_id = request.args.get('department_id')

    tasks = _get_tasks(date_from, date_to, dept_id, user=user)
    return success(_report_payload(tasks, include_performance=True))


@reports_bp.route('/export', methods=['GET'])
@jwt_required()
def export_report():
    user = db.session.get(User, int(get_jwt_identity()))
    fmt = request.args.get('format', 'pdf').lower()
    date_from = _parse_date(request.args.get('date_from'))
    date_to = _parse_date(request.args.get('date_to'))
    dept_id = request.args.get('department_id')
    status = request.args.get('status')
    assigned_to = request.args.get('assigned_to')
    search = request.args.get('search')
    start_date_from = _parse_date(request.args.get('start_date_from'))
    due_date_to = _parse_date(request.args.get('due_date_to'))
    report_type = request.args.get('type', 'DAILY').upper()

    if fmt not in ('pdf', 'excel'):
        return error('format must be pdf or excel', 400)
    if report_type not in ALLOWED_REPORT_TYPES:
        return error('type must be DAILY, WEEKLY, MONTHLY, CUSTOM, or HOUSEKEEPING', 400)

    # For HOUSEKEEPING reports, filter by the housekeeping department
    if report_type == 'HOUSEKEEPING':
        from app.models.department import Department
        hk_dept = Department.query.filter(
            Department.name.ilike('%housekeeping%')
        ).first()
        if hk_dept:
            dept_id = str(hk_dept.id)

    tasks = _get_tasks(
        date_from,
        date_to,
        dept_id,
        user=user,
        status=status,
        assigned_to=assigned_to,
        search=search,
        start_date_from=start_date_from,
        due_date_to=due_date_to
    )
    payload = _report_payload(tasks, include_performance=report_type in ('MONTHLY', 'CUSTOM'))
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    file_stem = f'{report_type.lower()}-{timestamp}'

    pdf_buffer = _generate_pdf(f'{report_type} Report', tasks, summary=payload['summary'])
    excel_buffer = _generate_excel(f'{report_type} Report', tasks, summary=payload['summary'])

    pdf_abs_path, pdf_rel_path = _save_report_buffer(pdf_buffer, f'{file_stem}.pdf')
    excel_abs_path, excel_rel_path = _save_report_buffer(excel_buffer, f'{file_stem}.xlsx')

    department_id = None
    if dept_id and str(dept_id) != 'all':
        try:
            department_id = int(dept_id)
        except ValueError:
            return error('Invalid department_id', 400)

    report_record = ReportHistory(
        type=report_type,
        department_id=department_id,
        date_from=date_from.date() if date_from else None,
        date_to=date_to.date() if date_to else None,
        pdf_path=pdf_rel_path,
        excel_path=excel_rel_path
    )
    db.session.add(report_record)
    db.session.commit()

    # Log and include the number of tasks exported to help debugging
    task_count = len(tasks)
    current_app.logger.info(
        f"Exporting report type={report_type} dept={department_id} date_from={date_from} date_to={date_to} tasks={task_count}"
    )

    if fmt == 'excel':
        resp = send_file(
            excel_abs_path,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name=f'{file_stem}.xlsx',
            as_attachment=True
        )
        resp.headers['X-Report-Task-Count'] = str(task_count)
        return resp

    resp = send_file(
        pdf_abs_path,
        mimetype='application/pdf',
        download_name=f'{file_stem}.pdf',
        as_attachment=True
    )
    resp.headers['X-Report-Task-Count'] = str(task_count)
    return resp


@reports_bp.route('/performance-export', methods=['GET'])
@jwt_required()
def export_performance_report():
    """Export the Performance Report with exactly 5 columns: Department,
    Date, Task Performance, Registry Performance, Final Performance — one
    row per department, as a point-in-time snapshot (today's date).
    Not logged to ReportHistory (that table/download flow is task-report
    specific); this is a standalone export, same as the CSV export already
    used elsewhere on the Performance page.
    """
    fmt = request.args.get('format', 'excel').lower()
    if fmt not in ('pdf', 'excel'):
        return error('format must be pdf or excel', 400)

    rows = _performance_report_rows()

    if fmt == 'pdf':
        buffer = _generate_performance_pdf(rows)
        return Response(
            buffer.read(),
            mimetype='application/pdf',
            headers={'Content-Disposition': 'attachment; filename=performance-report.pdf'}
        )

    buffer = _generate_performance_excel(rows)
    return Response(
        buffer.read(),
        mimetype='application/vnd.ms-excel',
        headers={'Content-Disposition': 'attachment; filename=performance-report.xls'}
    )


ROLE_LABELS = {
    'CHAIRMAN': 'Chairman',
    'DIRECTOR': 'School Director',
    'PROPERTY': 'Property & Maintenance Head',
    'FINANCE': 'Finance Head',
    'ADMIN': 'Admin Head',
    'PRINCIPAL': 'Principal',
    'ADMISSION': 'Admission Head',
    'HR': 'HR Head',
    'PURCHASE': 'Purchase Head',
    'IT': 'IT & ERP Head',
    'TRANSPORT': 'Transport Head',
    'HOUSEKEEPING': 'HouseKeeping Head',
    'FRONT_DESK': 'Front Desk / Reception'
}


def _registry_performance_summaries(user, date_from, date_to, cycle=None, status=None):
    """Per-register Completed/Missed/Rejected/Total counts within
    [date_from, date_to], computed the exact same way as the Performance
    screen (`RegistryPerformancePanel.tsx`): both walk the SAME
    `Register.generate_occurrences()` series used by the `/registers/calendar`
    endpoint, so an occurrence can never be counted differently here than on
    screen. Only past-or-today occurrences count as activity, matching the
    frontend's `event.date > today` guard.
    """
    today = datetime.now(timezone.utc).date()

    query = _scope_to_user(Register.query, user)
    if cycle and cycle.upper() != 'ALL':
        query = query.filter_by(cycle=cycle.upper())

    registers = query.all()

    register_ids = [r.id for r in registers]
    occurrence_maps = {r.id: {} for r in registers}
    if register_ids:
        all_occurrences = RegisterOccurrence.query.filter(
            RegisterOccurrence.register_id.in_(register_ids),
            RegisterOccurrence.occurrence_date >= date_from,
            RegisterOccurrence.occurrence_date <= date_to,
        ).all()
        for occ in all_occurrences:
            occurrence_maps[occ.register_id][occ.occurrence_date] = occ

    todays_occurrences = {}
    if register_ids:
        todays_occurrences = {
            occ.register_id: occ
            for occ in RegisterOccurrence.query.filter(
                RegisterOccurrence.register_id.in_(register_ids),
                RegisterOccurrence.occurrence_date == today,
            ).all()
        }

    summaries = []
    for register in registers:
        effective_status = register.effective_today_status(today, todays_occurrences.get(register.id))[0]
        if status and status.upper() != 'ALL' and effective_status != status.upper():
            continue

        completed = missed = rejected = 0
        for occ in register.generate_occurrences(date_from, date_to, today, occurrence_map=occurrence_maps[register.id]):
            if occ['date'] > today:
                continue
            if occ['status'] == 'COMPLETED':
                completed += 1
            elif occ['status'] == 'FAILED':
                rejected += 1
            elif occ['status'] == 'PENDING':
                missed += 1

        total = completed + missed + rejected
        completion_rate = round((completed / total) * 100) if total else 0
        summaries.append(
            {
                'register': register,
                'headName': register.head.name if register.head else register.head_name,
                'status': effective_status,
                'completed': completed,
                'missed': missed,
                'rejected': rejected,
                'total': total,
                'completionRate': completion_rate,
            }
        )

    return summaries


def _performance_export_data(user, date_from, date_to, head, cycle, status):
    """Build the exact dataset the Performance screen's export needs
    (Registration Performance, Task Performance, Performance Metrics,
    detailed records) using the SAME underlying computations as the
    on-screen `RegistryPerformancePanel` component and the
    `/dashboard/performance` endpoint, so the export can never disagree
    with what's on screen.
    """
    summaries = _registry_performance_summaries(user, date_from, date_to, cycle=cycle, status=status)
    if head and head.upper() != 'ALL':
        summaries = [s for s in summaries if s['headName'] == head]

    total_registers = len(summaries)
    checked = sum(1 for s in summaries if s['completed'] > 0)
    not_checked = total_registers - checked

    total_completed = sum(s['completed'] for s in summaries)
    total_missed = sum(s['missed'] for s in summaries)
    total_rejected = sum(s['rejected'] for s in summaries)
    total_due = total_completed + total_missed + total_rejected
    register_performance = round((total_completed / total_due) * 100) if total_due else 0
    # "Delayed" for registers mirrors the Task side's definition: occurrences
    # whose due date passed without being actioned (i.e. the same occurrence
    # count already captured as `total_missed`/"Not checked" activity above),
    # surfaced here as its own KPI to match the Task row's shape.
    register_delayed = total_missed

    staff_rows = _staff_performance_rows()
    if head and head.upper() != 'ALL':
        staff_rows = [row for row in staff_rows if row['name'] == head]

    total_tasks = sum(row['totalTasks'] for row in staff_rows)
    completed_tasks = sum(row['completedTasks'] for row in staff_rows)
    delayed_tasks = sum(row['delayedTasks'] for row in staff_rows)
    not_completed_tasks = total_tasks - completed_tasks
    task_performance = round((completed_tasks / total_tasks) * 100) if total_tasks else 0

    if total_tasks and total_registers:
        final_performance = round(task_performance * 0.5 + register_performance * 0.5)
    elif total_tasks:
        final_performance = task_performance
    elif total_registers:
        final_performance = register_performance
    else:
        final_performance = 0

    return {
        'registerTotals': {
            'totalRegisters': total_registers,
            'checked': checked,
            'notChecked': not_checked,
            'delayed': register_delayed,
        },
        'overall': {
            'totalCompleted': total_completed,
            'totalMissed': total_missed,
            'totalRejected': total_rejected,
            'totalDue': total_due,
            'completionRate': register_performance,
        },
        'taskTotals': {
            'totalTasks': total_tasks,
            'completedTasks': completed_tasks,
            'notCompletedTasks': not_completed_tasks,
            'delayedTasks': delayed_tasks,
            'taskPerformance': task_performance,
        },
        'finalPerformance': final_performance,
        'summaries': summaries,
        'staffRows': staff_rows,
    }


def _csv_cell(value):
    text = str(value)
    if any(ch in text for ch in (',', '"', '\n')):
        text = '"' + text.replace('"', '""') + '"'
    return text


def _performance_export_csv(data, date_from, date_to, head, cycle, status):
    import csv as csv_module

    output = io.StringIO()
    writer = csv_module.writer(output)

    head_label = head if head and head.upper() != 'ALL' else 'All heads'
    cycle_label = cycle if cycle and cycle.upper() != 'ALL' else 'All cycles'
    status_label = status if status and status.upper() != 'ALL' else 'All statuses'

    writer.writerow(['Performance Export'])
    writer.writerow([
        'Filters',
        f"Date: {date_from.date().isoformat()} to {date_to.date().isoformat()}",
        f'Head: {head_label}',
        f'Cycle: {cycle_label}',
        f'Status: {status_label}'
    ])
    writer.writerow([])

    writer.writerow(['Task Performance'])
    writer.writerow(['Total Task', 'Completed', 'Not Completed', 'Delayed', 'Performance'])
    writer.writerow([
        data['taskTotals']['totalTasks'],
        data['taskTotals']['completedTasks'],
        data['taskTotals']['notCompletedTasks'],
        data['taskTotals']['delayedTasks'],
        f"{data['taskTotals']['taskPerformance']}%"
    ])
    writer.writerow([])

    writer.writerow(['Registration Performance'])
    writer.writerow(['Total Register', 'Checked', 'Not Checked', 'Delayed', 'Performance'])
    writer.writerow([
        data['registerTotals']['totalRegisters'],
        data['registerTotals']['checked'],
        data['registerTotals']['notChecked'],
        data['registerTotals']['delayed'],
        f"{data['overall']['completionRate']}%"
    ])
    writer.writerow([])

    writer.writerow(['Performance Metrics'])
    writer.writerow(['Final Performance'])
    writer.writerow([f"{data['finalPerformance']}%"])
    writer.writerow([])

    writer.writerow(['Detailed Register Records'])
    writer.writerow([
        'Register', 'Register No', 'Head', 'Cycle', 'Status',
        'Completed (Changed)', 'Missed (Not Changed)', 'Rejected', 'Total Due', 'Completion %'
    ])
    for s in data['summaries']:
        register = s['register']
        writer.writerow([
            register.name,
            register.register_no,
            s['headName'],
            register.cycle,
            s['status'],
            s['completed'],
            s['missed'],
            s['rejected'],
            s['total'],
            s['completionRate']
        ])
    writer.writerow([])

    writer.writerow(['Detailed Task Performance Records'])
    writer.writerow(['Role', 'Total Tasks', 'Completed', 'Delayed', 'Delay Rate %', 'Task Performance %'])
    for row in data['staffRows']:
        writer.writerow([
            ROLE_LABELS.get(row['role'], row['role']),
            row['totalTasks'],
            row['completedTasks'],
            row['delayedTasks'],
            row['delayRate'],
            row['performanceScore']
        ])

    buffer = io.BytesIO(output.getvalue().encode('utf-8-sig'))
    buffer.seek(0)
    return buffer


@reports_bp.route('/performance/export', methods=['GET'])
@jwt_required()
def export_performance_filtered():
    """Backend-driven export for the Performance screen's Registry Performance
    panel, accepting the SAME filters the screen uses (date range, Head,
    Cycle, Status) and computed via the SAME shared functions
    (`_registry_performance_summaries`, `_staff_performance_rows`) the
    on-screen numbers use, so the exported file can never disagree with
    what's shown. See design notes in the project README/PR description
    for why CSV was chosen over Excel/PDF here.
    """
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return error('User not found', 401)

    today_iso = datetime.now(timezone.utc).date().isoformat()
    date_from = _parse_date(request.args.get('date_from')) or _parse_date(today_iso)
    date_to = _parse_date(request.args.get('date_to')) or _parse_date(today_iso)
    head = request.args.get('head')
    cycle = request.args.get('cycle')
    status = request.args.get('status')

    if date_from > date_to:
        return error('date_from must be before date_to', 400)

    data = _performance_export_data(user, date_from.date(), date_to.date(), head, cycle, status)
    buffer = _performance_export_csv(data, date_from, date_to, head, cycle, status)

    return Response(
        buffer.read(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename=performance_export_{today_iso}.csv'
        }
    )


@reports_bp.route('/history', methods=['GET'])
@jwt_required()
def report_history():
    records = ReportHistory.query.order_by(ReportHistory.created_at.desc()).all()
    return success([record.to_dict() for record in records])


@reports_bp.route('/download/<int:report_id>/<string:fmt>', methods=['GET'])
@jwt_required()
def download_report(report_id, fmt):
    record = ReportHistory.query.get_or_404(report_id)
    path = record.pdf_path if fmt == 'pdf' else record.excel_path
    if not path:
        return error('File not found', 404)

    upload_folder = current_app.config['UPLOAD_FOLDER']
    project_root = os.path.dirname(os.path.abspath(upload_folder))
    abs_path = os.path.abspath(os.path.join(project_root, path))

    if not abs_path.startswith(project_root):
        return error('Invalid path', 400)

    if not os.path.exists(abs_path):
        return error('File not found on disk', 404)

    mimetype = (
        'application/pdf'
        if fmt == 'pdf'
        else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    extension = 'pdf' if fmt == 'pdf' else 'xlsx'
    return send_file(
        abs_path,
        mimetype=mimetype,
        download_name=f'report-{report_id}.{extension}',
        as_attachment=True
    )
