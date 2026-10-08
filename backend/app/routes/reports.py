import io
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, and_

from flask import Blueprint, Response, current_app, request, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.department import Department
from app.models.register import Register, RegisterOccurrence, fetch_current_cycle_occurrences, fetch_occurrence_maps
from app.models.report import ReportHistory
from app.models.task import Task
from app.models.user import User
from app.routes.dashboard import _overall_performance, _staff_performance_rows
from app.routes.registers import _scope_to_user
from app.utils.response import error, success
from app.utils.decorators import roles_required
from app.models.register import _iso_utc
from app.utils.timezone import school_today
from app.utils.completion import CHECK_DELAYED, CHECK_LATE, CHECK_ON_TIME, CHECK_REJECTED
from app.utils.labels import (
    LABEL_CHECKED_AFTER_DUE, LABEL_DELAYED, LABEL_IN_PROGRESS, LABEL_NOT_CHECKED, LABEL_ON_TIME_CHECKED,
    LABEL_PENDING,
)
from app.utils.completion import (
    CAT_LATE, CAT_ON_TIME, CAT_PENDING, as_utc_date, register_completion_category,
    task_completion_category
)

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


def _apply_task_filters(
    query,
    status=None,
    assigned_to=None,
    search=None,
    date_from=None,
    date_to=None,
    start_date_from=None,
    due_date_to=None
):
    """Apply the status/assigned_to/search/date-range filters shared by every
    caller of `_get_tasks`, regardless of the requesting user's role.
    Department scoping is intentionally NOT handled here — the caller applies
    it afterwards, since who gets to see which department differs by role.
    """
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

    return query


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

    # Status/assigned_to/search/date-range filters ALWAYS apply, regardless
    # of role — department scoping (below) is what differs between elevated
    # and non-elevated users, not these filters.
    query = _apply_task_filters(
        query,
        status=status,
        assigned_to=assigned_to,
        search=search,
        date_from=date_from,
        date_to=date_to,
        start_date_from=start_date_from,
        due_date_to=due_date_to
    )

    # Department scoping applied last: forced to the user's own department
    # for non-elevated roles, an optional filter for CHAIRMAN/DIRECTOR.
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

    return query.order_by(Task.due_date.asc(), Task.created_at.desc()).all()


# Completion-category logic is shared with routes/dashboard.py; see utils/completion.py.
_as_utc_date = as_utc_date
_completion_category = task_completion_category


def _report_title(assigned_to=None):
    """Title for the Task Monitor export, driven by the selected Head."""
    if assigned_to not in (None, '', 'all'):
        try:
            head = db.session.get(User, int(assigned_to))
        except (TypeError, ValueError):
            head = None
        if head:
            label = role_label(head.role)
            if label:
                return f'{label} Task Report'
    return 'All Heads Task Report'


def _period_text(date_from, date_to):
    def fmt(value):
        return value.strftime('%d %b %Y')

    if date_from and date_to:
        return f'Period: {fmt(date_from)} to {fmt(date_to)}'
    if date_from:
        return f'Period: from {fmt(date_from)}'
    if date_to:
        return f'Period: up to {fmt(date_to)}'
    return None


def _summary(tasks, include_performance=False):
    total = len(tasks)
    completed = sum(1 for task in tasks if task.status == 'COMPLETED')
    delayed = sum(1 for task in tasks if task.status == 'DELAYED')
    pending = sum(1 for task in tasks if task.status == 'PENDING')
    in_progress = sum(1 for task in tasks if task.status == 'IN_PROGRESS')
    escalated = sum(1 for task in tasks if task.status == 'ESCALATED')

    categories = [_completion_category(task) for task in tasks]

    summary = {
        'total': total,
        'completed': completed,
        'delayed': delayed,
        'pending': pending,
        'inProgress': in_progress,
        'escalated': escalated,
        # Completion-timing buckets: every task falls in exactly one, so
        # onTimeComplete + completedAfterDue + notCompleted == total.
        'onTimeComplete': categories.count(CAT_ON_TIME),
        'completedAfterDue': categories.count(CAT_LATE),
        'notCompleted': categories.count(CAT_PENDING)
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
                'daysOverdue': days_overdue,
                'completionCategory': _completion_category(task)
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


# ---------------------------------------------------------------------------
# Shared report styling (Task Monitor report + Performance report)
# ---------------------------------------------------------------------------
BAND_COLOR = '#1E3A5F'      # main heading band
HEADER_COLOR = '#2E75B6'    # table header row
ROW_STYLES = {
    # soft background tint, dark readable text
    CAT_ON_TIME: {'bg': '#E3F6E8', 'fg': '#14532D', 'label': 'On Time Complete'},
    CAT_LATE: {'bg': '#FEF3C7', 'fg': '#78350F', 'label': 'Complete After Due Date'},
    CAT_PENDING: {'bg': '#FDE2E2', 'fg': '#7F1D1D', 'label': 'Pending'},
}
TASK_COLUMNS = [
    'Task', 'Assigned To', 'Priority', 'Status', 'Due Date', 'Department',
    'On Time Complete', 'Complete After Due Date', 'Pending'
]
CATEGORY_COLUMN = {CAT_ON_TIME: 6, CAT_LATE: 7, CAT_PENDING: 8}

# Page margins (points) applied identically on every page of the PDFs.
PDF_MARGIN_LEFT = 40
PDF_MARGIN_RIGHT = 40
PDF_MARGIN_TOP = 36
PDF_MARGIN_BOTTOM = 54


def _draw_page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(_hex('#64748B'))
    canvas.drawRightString(doc.pagesize[0] - PDF_MARGIN_RIGHT, 28, f'Page {doc.page}')
    canvas.restoreState()


def _hex(value):
    from reportlab.lib import colors
    return colors.HexColor(value)


_TICK_FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    'C:/Windows/Fonts/seguisym.ttf',
    'C:/Windows/Fonts/arialuni.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
]
_tick_markup = None


def _pdf_tick_markup():
    """Markup for the indicator mark in the PDF. Uses a check mark (✔) when a
    Unicode TrueType font is available on the machine; otherwise falls back to
    a bold "1" so the PDF never shows a missing-glyph box."""
    global _tick_markup
    if _tick_markup is None:
        _tick_markup = '<b>1</b>'
        try:
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont

            for path in _TICK_FONT_CANDIDATES:
                if os.path.exists(path):
                    pdfmetrics.registerFont(TTFont('ReportTick', path))
                    _tick_markup = '<font name="ReportTick">&#10004;</font>'
                    break
        except Exception:  # pragma: no cover - font problems must never break exports
            _tick_markup = '<b>1</b>'
    return _tick_markup


def _pdf_band(title, width, style_cls):
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import ParagraphStyle
    from xml.sax.saxutils import escape as xml_escape

    style = ParagraphStyle(
        'ReportBand', parent=style_cls['Title'], fontName='Helvetica-Bold', fontSize=17,
        leading=21, textColor=_hex('#FFFFFF'), alignment=0, spaceAfter=0
    )
    band = Table([[Paragraph(xml_escape(title), style)]], colWidths=[width], hAlign='LEFT')
    band.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), _hex(BAND_COLOR)),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 11),
    ]))
    return band


def _generate_performance_pdf(rows):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=PDF_MARGIN_LEFT, rightMargin=PDF_MARGIN_RIGHT,
        topMargin=PDF_MARGIN_TOP, bottomMargin=PDF_MARGIN_BOTTOM
    )
    usable = A4[0] - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT - 12  # minus the frame's 6pt padding each side
    styles = getSampleStyleSheet()
    elements = [_pdf_band('Performance Report', usable, styles), Spacer(1, 14)]

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

    col_widths = [usable * 0.24, usable * 0.14, usable * 0.19, usable * 0.23, usable * 0.20]
    table = Table(table_rows, colWidths=col_widths, hAlign='LEFT', repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), _hex(HEADER_COLOR)),
                ('TEXTCOLOR', (0, 0), (-1, 0), _hex('#FFFFFF')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8.5),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('TEXTCOLOR', (0, 1), (-1, -1), _hex('#1E293B')),
                ('GRID', (0, 0), (-1, -1), 0.5, _hex('#CBD5E1')),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [_hex('#FFFFFF'), _hex('#F0F4F8')])
            ]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 24))

    doc.build(elements, onFirstPage=_draw_page_footer, onLaterPages=_draw_page_footer)
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

    th = (
        f'style="background:{HEADER_COLOR};color:#FFFFFF;font-weight:bold;'
        'text-align:center;padding:6px 10px;border:1px solid #CBD5E1"'
    )
    td_left = 'style="text-align:left;padding:6px 10px;border:1px solid #CBD5E1;color:#1E293B"'
    td_center = 'style="text-align:center;padding:6px 10px;border:1px solid #CBD5E1;color:#1E293B"'
    spacer = '<td style="width:24px"></td>'

    html_rows = ['<html><head><meta charset="utf-8" /></head><body>']
    html_rows.append('<table border="0" cellspacing="0" cellpadding="0">')
    html_rows.append(f'<tr>{spacer}<td colspan="5" style="height:12px"></td></tr>')
    html_rows.append(
        f'<tr>{spacer}<td colspan="5" bgcolor="{BAND_COLOR}" '
        f'style="background:{BAND_COLOR};color:#FFFFFF;font-size:16pt;font-weight:bold;'
        'padding:10px 14px">Performance Report</td></tr>'
    )
    html_rows.append(f'<tr>{spacer}<td colspan="5" style="height:10px"></td></tr>')
    html_rows.append(
        f'<tr>{spacer}'
        f'<th bgcolor="{HEADER_COLOR}" {th}>Department</th>'
        f'<th bgcolor="{HEADER_COLOR}" {th}>Date</th>'
        f'<th bgcolor="{HEADER_COLOR}" {th}>Task Performance</th>'
        f'<th bgcolor="{HEADER_COLOR}" {th}>Registry Performance</th>'
        f'<th bgcolor="{HEADER_COLOR}" {th}>Final Performance</th>'
        '</tr>'
    )

    for index, row in enumerate(rows):
        tint = '#FFFFFF' if index % 2 == 0 else '#F0F4F8'
        bg = f'bgcolor="{tint}"'
        html_rows.append(
            f'<tr>{spacer}'
            f'<td {bg} {td_left}>{escape(row["department"])}</td>'
            f'<td {bg} {td_center}>{escape(row["date"])}</td>'
            f'<td {bg} {td_center}>{row["taskPerformance"]}%</td>'
            f'<td {bg} {td_center}>{row["registryPerformance"]}%</td>'
            f'<td {bg} {td_center}>{row["finalPerformance"]}%</td>'
            '</tr>'
        )

    html_rows.append(f'<tr>{spacer}<td colspan="5" style="height:18px"></td></tr>')
    html_rows.append('</table></body></html>')
    buffer = io.BytesIO(''.join(html_rows).encode('utf-8'))
    buffer.seek(0)
    return buffer


def _generate_pdf(title, tasks, summary=None, period=None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape as xml_escape

    page = landscape(A4)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=page,
        leftMargin=PDF_MARGIN_LEFT, rightMargin=PDF_MARGIN_RIGHT,
        topMargin=PDF_MARGIN_TOP, bottomMargin=PDF_MARGIN_BOTTOM
    )
    usable = page[0] - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT - 12  # minus the frame's 6pt padding each side
    styles = getSampleStyleSheet()

    elements = [_pdf_band(title, usable, styles)]
    if period:
        period_style = ParagraphStyle(
            'ReportPeriod', parent=styles['Normal'], fontSize=10, leading=13,
            textColor=_hex('#334155'), leftIndent=2
        )
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(xml_escape(period), period_style))
    elements.append(Spacer(1, 10))

    # Category counts: take them from the summary when provided, otherwise
    # derive them from the rows, so the totals always match the rows.
    categories = [_completion_category(task) for task in tasks]
    counts = {
        CAT_ON_TIME: categories.count(CAT_ON_TIME),
        CAT_LATE: categories.count(CAT_LATE),
        CAT_PENDING: categories.count(CAT_PENDING),
    }

    cell_style = ParagraphStyle('Cell', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10)
    head_style = ParagraphStyle(
        'CellHead', parent=cell_style, fontName='Helvetica-Bold', textColor=_hex('#FFFFFF'), alignment=1
    )

    # ---- legend -----------------------------------------------------------
    legend_style = ParagraphStyle('Legend', parent=cell_style, fontSize=8.5, alignment=1)
    legend_cells = []
    legend_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, _hex('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    for idx, cat in enumerate((CAT_ON_TIME, CAT_LATE, CAT_PENDING)):
        meta = ROW_STYLES[cat]
        cell = ParagraphStyle(f'Legend{idx}', parent=legend_style, textColor=_hex(meta['fg']))
        label = {
            CAT_ON_TIME: 'Green = On Time Complete',
            CAT_LATE: 'Yellow = Complete After Due Date',
            CAT_PENDING: 'Red = Pending',
        }[cat]
        legend_cells.append(Paragraph(f'<b>{label}</b>', cell))
        legend_cmds.append(('BACKGROUND', (idx, 0), (idx, 0), _hex(meta['bg'])))
    legend = Table([legend_cells], colWidths=[usable / 3.0] * 3, hAlign='LEFT')
    legend.setStyle(TableStyle(legend_cmds))

    # ---- summary ----------------------------------------------------------
    if summary:
        summary_header = [
            'Total', 'On Time Complete', 'Complete After Due Date', 'Pending (Not Completed)'
        ]
        summary_values = [
            str(len(tasks)),
            str(counts[CAT_ON_TIME]), str(counts[CAT_LATE]), str(counts[CAT_PENDING])
        ]
        summary_table = Table(
            [[Paragraph(h, head_style) for h in summary_header],
             [Paragraph(f'<b>{v}</b>', ParagraphStyle('SumVal', parent=cell_style, alignment=1, fontSize=10))
              for v in summary_values]],
            colWidths=[usable / len(summary_header)] * len(summary_header),
            hAlign='LEFT'
        )
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), _hex(HEADER_COLOR)),
            ('BACKGROUND', (1, 1), (1, 1), _hex(ROW_STYLES[CAT_ON_TIME]['bg'])),
            ('BACKGROUND', (2, 1), (2, 1), _hex(ROW_STYLES[CAT_LATE]['bg'])),
            ('BACKGROUND', (3, 1), (3, 1), _hex(ROW_STYLES[CAT_PENDING]['bg'])),
            ('GRID', (0, 0), (-1, -1), 0.5, _hex('#CBD5E1')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 10))

    elements.append(legend)
    elements.append(Spacer(1, 12))

    # ---- task table -------------------------------------------------------
    if tasks:
        left = ParagraphStyle('CellLeft', parent=cell_style, alignment=0)
        center = ParagraphStyle('CellCenter', parent=cell_style, alignment=1)
        tick = _pdf_tick_markup()

        data = [[Paragraph(h, head_style) for h in TASK_COLUMNS]]
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), _hex(HEADER_COLOR)),
            ('GRID', (0, 0), (-1, -1), 0.5, _hex('#CBD5E1')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]

        for row_index, (task, cat) in enumerate(zip(tasks, categories), start=1):
            meta = ROW_STYLES[cat]
            fg = _hex(meta['fg'])
            l_style = ParagraphStyle(f'L{row_index}', parent=left, textColor=fg)
            c_style = ParagraphStyle(f'C{row_index}', parent=center, textColor=fg)
            marks = ['', '', '']
            marks[CATEGORY_COLUMN[cat] - 6] = tick
            data.append([
                Paragraph(xml_escape(task.title or ''), l_style),
                Paragraph(xml_escape(task.assignee.name if task.assignee else ''), l_style),
                Paragraph(xml_escape(task.priority or ''), c_style),
                Paragraph(xml_escape(task.status or ''), c_style),
                Paragraph(task.due_date.strftime('%Y-%m-%d') if task.due_date else '', c_style),
                Paragraph(xml_escape(task.department.name if task.department else ''), l_style),
                Paragraph(marks[0], c_style),
                Paragraph(marks[1], c_style),
                Paragraph(marks[2], c_style),
            ])
            style_cmds.append(('BACKGROUND', (0, row_index), (-1, row_index), _hex(meta['bg'])))

        widths = [0.22, 0.13, 0.07, 0.10, 0.09, 0.12, 0.09, 0.11, 0.07]
        table = Table(data, colWidths=[usable * w for w in widths], hAlign='LEFT', repeatRows=1)
        table.setStyle(TableStyle(style_cmds))
        elements.append(table)

    # Empty space after the last row so content never touches the page end.
    elements.append(Spacer(1, 28))

    doc.build(elements, onFirstPage=_draw_page_footer, onLaterPages=_draw_page_footer)
    buffer.seek(0)
    return buffer


def _generate_excel(title, tasks, summary=None, period=None):
    def escape(value):
        return (
            str(value)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
        )

    categories = [_completion_category(task) for task in tasks]
    counts = {
        CAT_ON_TIME: categories.count(CAT_ON_TIME),
        CAT_LATE: categories.count(CAT_LATE),
        CAT_PENDING: categories.count(CAT_PENDING),
    }
    ncols = len(TASK_COLUMNS)
    spacer = '<td style="width:24px"></td>'
    cell_base = 'padding:6px 10px;border:1px solid #CBD5E1'
    th_style = (
        f'background:{HEADER_COLOR};color:#FFFFFF;font-weight:bold;text-align:center;{cell_base}'
    )

    def th(label):
        return f'<th bgcolor="{HEADER_COLOR}" style="{th_style}">{escape(label)}</th>'

    def gap(height=10):
        return f'<tr>{spacer}<td colspan="{ncols}" style="height:{height}px"></td></tr>'

    rows = ['<html><head><meta charset="utf-8" /></head><body>']
    rows.append('<table border="0" cellspacing="0" cellpadding="0">')
    rows.append(gap(12))  # top margin
    rows.append(
        f'<tr>{spacer}<td colspan="{ncols}" bgcolor="{BAND_COLOR}" '
        f'style="background:{BAND_COLOR};color:#FFFFFF;font-size:16pt;font-weight:bold;'
        f'padding:10px 14px">{escape(title)}</td></tr>'
    )
    if period:
        rows.append(
            f'<tr>{spacer}<td colspan="{ncols}" style="color:#334155;padding:6px 2px">'
            f'{escape(period)}</td></tr>'
        )
    rows.append(gap())

    # legend
    legend_label = {
        CAT_ON_TIME: 'Green = On Time Complete',
        CAT_LATE: 'Yellow = Complete After Due Date',
        CAT_PENDING: 'Red = Pending',
    }
    legend_cells = ''.join(
        f'<td bgcolor="{ROW_STYLES[c]["bg"]}" colspan="{span}" style="background:{ROW_STYLES[c]["bg"]};'
        f'color:{ROW_STYLES[c]["fg"]};font-weight:bold;text-align:center;{cell_base}">{legend_label[c]}</td>'
        for c, span in ((CAT_ON_TIME, 2), (CAT_LATE, 3), (CAT_PENDING, 2))
    )
    rows.append(f'<tr>{spacer}{legend_cells}</tr>')
    rows.append(gap())

    # summary / totals
    if summary:
        labels = [
            'Total', 'On Time Complete', 'Complete After Due Date', 'Pending (Not Completed)'
        ]
        values = [len(tasks), counts[CAT_ON_TIME], counts[CAT_LATE], counts[CAT_PENDING]]
        tints = [None, ROW_STYLES[CAT_ON_TIME], ROW_STYLES[CAT_LATE], ROW_STYLES[CAT_PENDING]]
        rows.append(f'<tr>{spacer}{"".join(th(label) for label in labels)}</tr>')
        value_cells = []
        for value, meta in zip(values, tints):
            bg = f'bgcolor="{meta["bg"]}" ' if meta else ''
            extra = f'background:{meta["bg"]};color:{meta["fg"]};' if meta else 'color:#1E293B;'
            value_cells.append(
                f'<td {bg}style="{extra}font-weight:bold;text-align:center;{cell_base}">{value}</td>'
            )
        rows.append(f'<tr>{spacer}{"".join(value_cells)}</tr>')
        rows.append(gap())

    # task table
    rows.append(f'<tr>{spacer}{"".join(th(label) for label in TASK_COLUMNS)}</tr>')
    for task, cat in zip(tasks, categories):
        meta = ROW_STYLES[cat]
        base = f'background:{meta["bg"]};color:{meta["fg"]};{cell_base}'
        bg = f'bgcolor="{meta["bg"]}"'
        left = f'<td {bg} style="{base};text-align:left">'
        center = f'<td {bg} style="{base};text-align:center">'
        marks = ['', '', '']
        marks[CATEGORY_COLUMN[cat] - 6] = '&#10004;'
        rows.append(
            f'<tr>{spacer}'
            f'{left}{escape(task.title or "")}</td>'
            f'{left}{escape(task.assignee.name if task.assignee else "")}</td>'
            f'{center}{escape(task.priority or "")}</td>'
            f'{center}{escape(task.status or "")}</td>'
            f'{center}{escape(task.due_date.strftime("%Y-%m-%d") if task.due_date else "")}</td>'
            f'{left}{escape(task.department.name if task.department else "")}</td>'
            f'{center}{marks[0]}</td>'
            f'{center}{marks[1]}</td>'
            f'{center}{marks[2]}</td>'
            '</tr>'
        )

    rows.append(gap(18))  # space after the last row
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

    report_title = _report_title(assigned_to)
    period = _period_text(date_from or start_date_from, date_to or due_date_to)

    pdf_buffer = _generate_pdf(report_title, tasks, summary=payload['summary'], period=period)
    excel_buffer = _generate_excel(report_title, tasks, summary=payload['summary'], period=period)

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


def role_label(role_key):
    """Display name of a role, read from the roles table (never hard-coded).
    Falls back to a prettified key if the role is missing."""
    if not role_key:
        return ''
    from app.models.role import sync_roles
    role = sync_roles().get(role_key)
    return role.name if role else str(role_key).replace('_', ' ').title()


def _registry_performance_summaries(user, date_from, date_to, cycle=None, status=None):
    """Per-register Completed/Missed/Rejected/Total counts within
    [date_from, date_to], computed the exact same way as the Performance
    screen (`RegistryPerformancePanel.tsx`): both walk the SAME
    `Register.generate_occurrences()` series used by the `/registers/calendar`
    endpoint, so an occurrence can never be counted differently here than on
    screen. Only past-or-today occurrences count as activity, matching the
    frontend's `event.date > today` guard.
    """
    today = school_today()

    query = _scope_to_user(Register.query, user)
    if cycle and cycle.upper() != 'ALL':
        query = query.filter_by(cycle=cycle.upper())

    registers = query.all()

    occurrence_maps = fetch_occurrence_maps(registers, date_from, date_to)

    # Match `register.status` on the Register Monitoring / calendar popup:
    # keyed by each register's OWN current-cycle occurrence date (today for
    # DAILY, the exact cyclic `next_due_date` otherwise), not a single
    # shared "today" for every register.
    current_occurrences = fetch_current_cycle_occurrences(registers, today)

    summaries = []
    for register in registers:
        effective_status = register.effective_today_status(today, current_occurrences.get(register.id))[0]
        if status and status.upper() != 'ALL' and effective_status != status.upper():
            continue

        completed = missed = rejected = open_periods = 0
        on_time = late = 0
        periods = []
        # Same rule as the dashboard: a period belongs to the range by its due
        # date, and the bucket is the one backend classification (`outcome`).
        for occ in register.generate_occurrences(
            date_from, date_to, today, occurrence_map=occurrence_maps[register.id], by_due_date=True
        ):
            outcome = occ['outcome']
            if outcome == CHECK_ON_TIME:
                completed += 1
                on_time += 1
            elif outcome == CHECK_LATE:
                completed += 1
                late += 1
            elif outcome == CHECK_REJECTED:
                rejected += 1
            elif outcome == CHECK_DELAYED:
                missed += 1
            else:
                open_periods += 1
            periods.append({
                'date': occ['date'].isoformat(),
                'due_date': occ['due_date'].isoformat(),
                'period_end': occ['period_end'].isoformat(),
                'outcome': outcome,
                'dot_color': occ['dot_color'],
                'check_timing': occ['check_timing'],
                'checked_at': _iso_utc(occ.get('completed_at')),
                'checked_at_unknown': occ['checked_at_unknown'],
            })

        total = completed + missed + rejected
        completion_rate = round((completed / total) * 100) if total else 0
        summaries.append(
            {
                'register': register,
                'headName': register.head.name if register.head else register.head_name,
                'headId': register.head_id,
                'status': effective_status,
                'completed': completed,
                'missed': missed,
                'rejected': rejected,
                # Completion-timing buckets; on-time + after-due + pending == total.
                'onTimeComplete': on_time,
                'completedAfterDue': late,
                'pending': missed + rejected,
                'total': total,
                'open': open_periods,
                'periods': periods,
                'completionRate': completion_rate,
            }
        )

    return summaries


def _json_summary(s):
    r = s['register']
    return {
        'register_id': r.id, 'name': r.name, 'register_no': r.register_no, 'cycle': r.cycle,
        'head_id': s['headId'], 'head_name': s['headName'], 'status': s['status'],
        'onTimeChecked': s['onTimeComplete'], 'checkedAfterDueDate': s['completedAfterDue'],
        'notChecked': s['pending'], 'totalPeriodsDue': s['total'], 'open': s['open'],
        'completionRate': s['completionRate'], 'periods': s['periods'],
    }


@reports_bp.route('/performance/registers', methods=['GET'])
@jwt_required()
def performance_registers_json():
    """Per-register performance for the Performance screen, from the SAME
    function the exports use. A period belongs to the range by its due date;
    On Time Checked + Checked After Due Date + Not Checked == Total Periods Due.
    The browser only displays these numbers, it never re-classifies a period."""
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return error('User not found', 401)
    today_iso = school_today().isoformat()
    date_from = _parse_date(request.args.get('date_from')) or _parse_date(today_iso)
    date_to = _parse_date(request.args.get('date_to')) or _parse_date(today_iso)
    if date_from > date_to:
        return error('date_from must be before date_to', 400)
    head, cycle, status = request.args.get('head'), request.args.get('cycle'), request.args.get('status')
    summaries = _registry_performance_summaries(user, date_from.date(), date_to.date(), cycle=cycle, status=status)
    if head and head.upper() != 'ALL':
        summaries = [s for s in summaries if _head_matches(head, s['headId'], s['headName'])]
    items = [_json_summary(s) for s in summaries]
    totals = {
        'onTimeChecked': sum(i['onTimeChecked'] for i in items),
        'checkedAfterDueDate': sum(i['checkedAfterDueDate'] for i in items),
        'notChecked': sum(i['notChecked'] for i in items),
        'totalPeriodsDue': sum(i['totalPeriodsDue'] for i in items),
        'open': sum(i['open'] for i in items),
        'totalRegisters': len(items),
    }
    return success({'summaries': items, 'totals': totals})


def _head_display(head):
    if not head or head.upper() == 'ALL':
        return 'All heads'
    if str(head).isdigit():
        user = db.session.get(User, int(head))
        return user.name if user else str(head)
    return head


def _head_matches(head, user_id, name):
    """The Head filter identifies a person by their user id. Matching on the
    name text is only kept for old clients that still send a name: names are
    free text (a register's head_name is a copy that can differ from the
    user's current name), which is why filtering by name dropped tasks."""
    if str(head).isdigit():
        return user_id is not None and int(head) == user_id
    return name == head


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
        summaries = [s for s in summaries if _head_matches(head, s['headId'], s['headName'])]

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

    staff_rows = _staff_performance_rows(date_from, date_to)
    if head and head.upper() != 'ALL':
        staff_rows = [row for row in staff_rows if _head_matches(head, row['userId'], row['name'])]

    total_tasks = sum(row['totalTasks'] for row in staff_rows)
    completed_tasks = sum(row['completedTasks'] for row in staff_rows)
    delayed_tasks = sum(row['delayedTasks'] for row in staff_rows)
    not_completed_tasks = total_tasks - completed_tasks
    on_time_tasks = sum(row['onTimeCompleteTasks'] for row in staff_rows)
    late_tasks = sum(row['completedAfterDueTasks'] for row in staff_rows)
    pending_tasks = sum(row['pendingTasks'] for row in staff_rows)
    in_progress_tasks = sum(row['inProgressTasks'] for row in staff_rows)
    escalated_tasks = sum(row['escalatedTasks'] for row in staff_rows)
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
            # Period-level numbers (what the screen cards show):
            'onTimeChecked': sum(s['onTimeComplete'] for s in summaries),
            'checkedAfterDueDate': sum(s['completedAfterDue'] for s in summaries),
            'notCheckedPeriods': sum(s['pending'] for s in summaries),
            'totalPeriodsDue': total_due,
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
            'onTimeCompleteTasks': on_time_tasks,
            'completedAfterDueTasks': late_tasks,
            'pendingTasks': pending_tasks,
            'inProgressTasks': in_progress_tasks,
            'escalatedTasks': escalated_tasks,
            'taskPerformance': task_performance,
        },
        'finalPerformance': final_performance,
        'summaries': summaries,
        'staffRows': staff_rows,
    }


def _performance_excel(data, date_from, date_to, head, cycle, status):
    """Styled Excel (.xls, HTML table) for the Performance screen, built from
    the SAME dataset as the screen (`_performance_export_data`) and styled like
    the Task Monitor Excel: header band, blue table header, left spacer column,
    soft green/yellow/red category cells, legend, centered numbers, a totals row
    under every table and empty space at the end.
    """
    def escape(value):
        return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    ncols = 9
    spacer = '<td style="width:24px"></td>'
    cell_base = 'padding:6px 10px;border:1px solid #CBD5E1'
    th_style = f'background:{HEADER_COLOR};color:#FFFFFF;font-weight:bold;text-align:center;{cell_base}'
    cat_cols = {  # column index (within a table) -> category style
        CAT_ON_TIME: ROW_STYLES[CAT_ON_TIME],
        CAT_LATE: ROW_STYLES[CAT_LATE],
        CAT_PENDING: ROW_STYLES[CAT_PENDING],
    }

    def th(label):
        return f'<th bgcolor="{HEADER_COLOR}" style="{th_style}">{escape(label)}</th>'

    def gap(height=10):
        return f'<tr>{spacer}<td colspan="{ncols}" style="height:{height}px"></td></tr>'

    def section_title(text):
        return (
            f'<tr>{spacer}<td colspan="{ncols}" style="color:#1E3A5F;font-weight:bold;'
            f'font-size:12pt;padding:4px 2px">{escape(text)}</td></tr>'
        )

    def td(value, align='center', cat=None, bold=False, total=False):
        meta = cat_cols.get(cat)
        if meta:
            bg, fg = meta['bg'], meta['fg']
        elif total:
            bg, fg = '#E2E8F0', '#1E293B'
        else:
            bg, fg = '#FFFFFF', '#1E293B'
        weight = 'font-weight:bold;' if (bold or total) else ''
        return (
            f'<td bgcolor="{bg}" style="background:{bg};color:{fg};{weight}'
            f'text-align:{align};{cell_base}">{escape(value)}</td>'
        )

    def table(headers, body_rows, total_row, cat_for_col, left_cols=(0,)):
        """headers: labels; body_rows/total_row: lists of values; cat_for_col:
        {col_index: CAT_*} for the three category columns."""
        out = [f'<tr>{spacer}{"".join(th(h) for h in headers)}</tr>']
        for row in body_rows:
            cells = [
                td(v, 'left' if i in left_cols else 'center', cat_for_col.get(i))
                for i, v in enumerate(row)
            ]
            out.append(f'<tr>{spacer}{"".join(cells)}</tr>')
        cells = [
            td(v, 'left' if i in left_cols else 'center', cat_for_col.get(i), total=True)
            for i, v in enumerate(total_row)
        ]
        out.append(f'<tr>{spacer}{"".join(cells)}</tr>')
        return out

    head_label = _head_display(head)
    cycle_label = cycle if cycle and cycle.upper() != 'ALL' else 'All cycles'
    status_label = status if status and status.upper() != 'ALL' else 'All statuses'
    filters = (
        f"Period: {date_from.strftime('%d %b %Y')} to {date_to.strftime('%d %b %Y')}  |  "
        f'Head: {head_label}  |  Cycle: {cycle_label}  |  Status: {status_label}'
    )

    rows = ['<html><head><meta charset="utf-8" /></head><body>']
    rows.append('<table border="0" cellspacing="0" cellpadding="0">')
    rows.append(gap(12))
    rows.append(
        f'<tr>{spacer}<td colspan="{ncols}" bgcolor="{BAND_COLOR}" '
        f'style="background:{BAND_COLOR};color:#FFFFFF;font-size:16pt;font-weight:bold;'
        'padding:10px 14px">Performance Report</td></tr>'
    )
    rows.append(
        f'<tr>{spacer}<td colspan="{ncols}" style="color:#334155;padding:6px 2px">'
        f'{escape(filters)}</td></tr>'
    )
    rows.append(gap())

    legend_label = {
        CAT_ON_TIME: f'Green = {LABEL_ON_TIME_CHECKED}',
        CAT_LATE: f'Yellow = {LABEL_CHECKED_AFTER_DUE}',
        CAT_PENDING: f'Red = {LABEL_PENDING}',
    }
    legend_cells = ''.join(
        f'<td bgcolor="{ROW_STYLES[c]["bg"]}" colspan="{span}" style="background:{ROW_STYLES[c]["bg"]};'
        f'color:{ROW_STYLES[c]["fg"]};font-weight:bold;text-align:center;{cell_base}">{legend_label[c]}</td>'
        for c, span in ((CAT_ON_TIME, 3), (CAT_LATE, 3), (CAT_PENDING, 3))
    )
    rows.append(f'<tr>{spacer}{legend_cells}</tr>')
    rows.append(gap())

    staff = data['staffRows']

    # ---- Task performance (per role) ---------------------------------------
    t_total = sum(r['totalTasks'] for r in staff)
    t_done = sum(r['completedTasks'] for r in staff)
    t_on = sum(r['onTimeCompleteTasks'] for r in staff)
    t_late = sum(r['completedAfterDueTasks'] for r in staff)
    t_pend = sum(r['pendingTasks'] for r in staff)
    t_prog = sum(r['inProgressTasks'] for r in staff)
    t_esc = sum(r['escalatedTasks'] for r in staff)
    t_delayed = sum(r['delayedTasks'] for r in staff)
    t_delay_rate = round((t_delayed / t_total) * 100) if t_total else 0
    t_score = round(((t_done / t_total) * 100) * (1 - t_delay_rate / 100)) if t_total else 0
    rows.append(section_title('Task Performance'))
    rows.extend(table(
        ['Role', 'Total Tasks', LABEL_ON_TIME_CHECKED, LABEL_CHECKED_AFTER_DUE, LABEL_PENDING,
         LABEL_IN_PROGRESS, LABEL_DELAYED, 'Escalated', 'Task Performance %'],
        [
            [r['roleName'], r['totalTasks'], r['onTimeCompleteTasks'],
             r['completedAfterDueTasks'], r['pendingTasks'], r['inProgressTasks'],
             r['delayedTasks'], r['escalatedTasks'], f"{r['performanceScore']}%"]
            for r in staff
        ],
        ['Total', t_total, t_on, t_late, t_pend, t_prog, t_delayed, t_esc, f'{t_score}%'],
        {2: CAT_ON_TIME, 3: CAT_LATE, 4: CAT_PENDING},
    ))
    rows.append(gap())

    # ---- Register performance (per role) -----------------------------------
    r_total = sum(r['totalRegisters'] for r in staff)
    r_on = sum(r['onTimeCompleteRegisters'] for r in staff)
    r_late = sum(r['completedAfterDueRegisters'] for r in staff)
    r_pend = sum(r['pendingRegisters'] for r in staff)
    r_due = r_on + r_late + r_pend
    r_perf = round(((r_on + r_late) / r_due) * 100) if r_due else 0
    r_overall = _overall_performance(t_score, bool(t_total), r_perf, bool(r_total))
    rows.append(section_title('Register Performance'))
    rows.extend(table(
        ['Role', 'Total Registers', 'Checking Cycle', LABEL_ON_TIME_CHECKED,
         LABEL_CHECKED_AFTER_DUE, LABEL_NOT_CHECKED, 'Total Periods Due',
         'Register Performance %', 'Overall Performance %'],
        [
            [r['roleName'], r['totalRegisters'],
             ', '.join(r['checkingCycles']) or 'N/A', r['onTimeCompleteRegisters'],
             r['completedAfterDueRegisters'], r['pendingRegisters'],
             r['onTimeCompleteRegisters'] + r['completedAfterDueRegisters'] + r['pendingRegisters'],
             f"{r['registerPerformance']}%", f"{r['overallPerformance']}%"]
            for r in staff
        ],
        ['Total', r_total, '', r_on, r_late, r_pend, r_due, f'{r_perf}%', f'{r_overall}%'],
        {3: CAT_ON_TIME, 4: CAT_LATE, 5: CAT_PENDING},
    ))
    rows.append(gap())

    # ---- Register activity report (per register) ---------------------------
    summaries = data['summaries']
    d_on = sum(s['onTimeComplete'] for s in summaries)
    d_late = sum(s['completedAfterDue'] for s in summaries)
    d_pend = sum(s['pending'] for s in summaries)
    d_total = sum(s['total'] for s in summaries)
    d_rate = round(((d_on + d_late) / d_total) * 100) if d_total else 0
    rows.append(section_title('Register Activity Report'))
    rows.extend(table(
        ['Register Name', 'Register No', 'Head Name', 'Checking Cycle', LABEL_ON_TIME_CHECKED,
         LABEL_CHECKED_AFTER_DUE, LABEL_NOT_CHECKED, 'Total Periods Due', 'Completion %'],
        [
            [s['register'].name, s['register'].register_no, s['headName'], s['register'].cycle,
             s['onTimeComplete'], s['completedAfterDue'], s['pending'], s['total'],
             f"{s['completionRate']}%"]
            for s in summaries
        ],
        ['Total', f'{len(summaries)} registers', '', '', d_on, d_late, d_pend, d_total, f'{d_rate}%'],
        {4: CAT_ON_TIME, 5: CAT_LATE, 6: CAT_PENDING},
        left_cols=(0, 1, 2, 3),
    ))
    rows.append(gap())

    rows.append(
        f'<tr>{spacer}<td colspan="{ncols}" style="color:#1E293B;font-weight:bold;padding:4px 2px">'
        f"Final Performance: {data['finalPerformance']}%</td></tr>"
    )
    rows.append(gap(18))  # space after the last row
    rows.append('</table></body></html>')
    buffer = io.BytesIO(''.join(rows).encode('utf-8'))
    buffer.seek(0)
    return buffer


def _csv_cell(value):
    text = str(value)
    if any(ch in text for ch in (',', '"', '\n')):
        text = '"' + text.replace('"', '""') + '"'
    return text


def _performance_export_csv(data, date_from, date_to, head, cycle, status):
    import csv as csv_module

    output = io.StringIO()
    writer = csv_module.writer(output)

    head_label = _head_display(head)
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
    # On Time Checked + Checked After Due Date + Not Checked == Total Periods Due
    writer.writerow(['Total Registers', LABEL_ON_TIME_CHECKED, LABEL_CHECKED_AFTER_DUE,
                     LABEL_NOT_CHECKED, 'Total Periods Due', 'Performance'])
    writer.writerow([
        data['registerTotals']['totalRegisters'],
        data['registerTotals']['onTimeChecked'],
        data['registerTotals']['checkedAfterDueDate'],
        data['registerTotals']['notCheckedPeriods'],
        data['registerTotals']['totalPeriodsDue'],
        f"{data['overall']['completionRate']}%"
    ])
    writer.writerow([])

    writer.writerow(['Performance Metrics'])
    writer.writerow(['Final Performance'])
    writer.writerow([f"{data['finalPerformance']}%"])
    writer.writerow([])

    # Register Report columns use the shared Performance labels and add up:
    # On Time Checked + Checked After Due Date + Not Checked = Total Periods Due.
    # (Not Checked = periods that ended unchecked + rejected checks; periods that
    # are still open are not counted yet.) No per-register Status column.
    writer.writerow(['Detailed Register Records'])
    writer.writerow([
        'Register Name', 'Register No', 'Head Name', 'Checking Cycle',
        LABEL_ON_TIME_CHECKED, LABEL_CHECKED_AFTER_DUE, LABEL_NOT_CHECKED,
        'Total Periods Due', 'Completion %'
    ])
    for s in data['summaries']:
        register = s['register']
        writer.writerow([
            register.name,
            register.register_no,
            s['headName'],
            register.cycle,
            s['onTimeComplete'],
            s['completedAfterDue'],
            s['pending'],
            s['total'],
            s['completionRate']
        ])
    writer.writerow([])

    writer.writerow(['Detailed Task Performance Records'])
    writer.writerow(['Role', 'Total Tasks', 'Completed', LABEL_IN_PROGRESS, LABEL_PENDING, LABEL_DELAYED, 'Task Performance %'])
    for row in data['staffRows']:
        writer.writerow([
            row['roleName'],
            row['totalTasks'],
            row['completedTasks'],
            row['inProgressTasks'],
            row['pendingTasks'],
            row['delayedTasks'],
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

    today_iso = school_today().isoformat()
    date_from = _parse_date(request.args.get('date_from')) or _parse_date(today_iso)
    date_to = _parse_date(request.args.get('date_to')) or _parse_date(today_iso)
    head = request.args.get('head')
    cycle = request.args.get('cycle')
    status = request.args.get('status')

    if date_from > date_to:
        return error('date_from must be before date_to', 400)

    fmt = (request.args.get('format') or 'csv').lower()
    if fmt not in ('csv', 'excel'):
        return error('format must be csv or excel', 400)

    data = _performance_export_data(user, date_from.date(), date_to.date(), head, cycle, status)

    if fmt == 'excel':
        buffer = _performance_excel(data, date_from, date_to, head, cycle, status)
        return Response(
            buffer.read(),
            mimetype='application/vnd.ms-excel',
            headers={
                'Content-Disposition': f'attachment; filename=performance_export_{today_iso}.xls'
            }
        )

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
