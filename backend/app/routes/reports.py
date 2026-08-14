import io
import os
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, and_

from flask import Blueprint, Response, current_app, request, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.report import ReportHistory
from app.models.task import Task
from app.models.user import User
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
