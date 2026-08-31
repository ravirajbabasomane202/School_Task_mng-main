from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func, or_

from app.extensions import db
from app.models.approval import Approval
from app.models.department import Department
from app.models.notification import Announcement
from app.models.register import Register
from app.models.task import Task
from app.models.user import TASK_ASSIGNABLE_ROLES, User
from app.utils.response import success, error

# Weighting used to combine Task Performance and Register Performance into a
# single "Overall Performance" score. If a staff member has no registers
# assigned (or, symmetrically, no tasks), the score falls back to whichever
# of the two actually applies to them instead of being dragged down by a
# metric that doesn't exist for that person.
TASK_PERFORMANCE_WEIGHT = 0.5
REGISTER_PERFORMANCE_WEIGHT = 0.5


def _overall_performance(task_performance, has_tasks, register_performance, has_registers):
    if has_tasks and has_registers:
        return round(
            task_performance * TASK_PERFORMANCE_WEIGHT
            + register_performance * REGISTER_PERFORMANCE_WEIGHT
        )
    if has_tasks:
        return round(task_performance)
    if has_registers:
        return round(register_performance)
    return 0

dashboard_bp = Blueprint('dashboard', __name__)

MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
]


def _health_color(percentage):
    if percentage >= 70:
        return '#22C55E'
    if percentage >= 40:
        return '#F59E0B'
    return '#EF4444'


def _task_stats(tasks):
    total = len(tasks)
    completed = sum(1 for task in tasks if task.status == 'COMPLETED')
    delayed = sum(1 for task in tasks if task.status == 'DELAYED')
    pending = sum(1 for task in tasks if task.status == 'PENDING')
    in_progress = sum(1 for task in tasks if task.status == 'IN_PROGRESS')
    escalated = sum(1 for task in tasks if task.status == 'ESCALATED')
    completion_percentage = round((completed / total) * 100) if total else 0
    return total, completed, delayed, pending, in_progress, escalated, completion_percentage


@dashboard_bp.route('/chairman', methods=['GET'])
@jwt_required()
def chairman_dashboard():
    Task.mark_overdue_delayed()
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or user.role not in ('CHAIRMAN', 'DIRECTOR'):
        return jsonify({'success': False, 'message': 'Forbidden', 'data': None}), 403

    from sqlalchemy.orm import joinedload

    all_tasks = Task.query.all()
    total, completed, delayed, pending, in_progress, escalated, completion_percentage = _task_stats(
        all_tasks
    )
    pending_approvals = Approval.query.filter_by(status='PENDING').count()

    # Group tasks by department_id in Python — avoids one query per department
    tasks_by_dept: dict = {}
    for t in all_tasks:
        tasks_by_dept.setdefault(t.department_id, []).append(t)

    department_rows = []
    for department in Department.query.order_by(Department.name).all():
        department_tasks = tasks_by_dept.get(department.id, [])
        _, _, _, _, _, _, department_completion = _task_stats(department_tasks)
        department_rows.append(
            {
                'name': department.name,
                'completionPct': department_completion,
                'healthColor': _health_color(department_completion)
            }
        )

    # Use joinedload to avoid per-task department lazy-load (N+1)
    alert_tasks = (
        Task.query
        .options(joinedload(Task.department))
        .filter(Task.status.in_(['DELAYED', 'ESCALATED']))
        .order_by(Task.updated_at.desc())
        .limit(10)
        .all()
    )
    alerts = [
        {
            'id': task.id,
            'title': task.title,
            'subLabel': task.department.name if task.department else 'N/A',
            'severity': 'Critical' if task.status == 'ESCALATED' else 'Delay'
        }
        for task in alert_tasks
    ]

    # Use joinedload for recent_tasks assigner/assignee/department to avoid lazy loads in to_dict()
    recent_tasks = (
        Task.query
        .options(joinedload(Task.assigner), joinedload(Task.assignee), joinedload(Task.department))
        .order_by(Task.created_at.desc())
        .limit(10)
        .all()
    )

    # Use joinedload for pending approvals to avoid lazy requester.department loads
    pending_approvals_list = []
    for approval in (
        Approval.query
        .options(joinedload(Approval.requester).joinedload(User.department))
        .filter_by(status='PENDING')
        .order_by(Approval.created_at.desc())
        .limit(10)
        .all()
    ):
        pending_approvals_list.append(
            {
                'id': approval.id,
                'title': approval.title,
                'submitter': approval.requester.name if approval.requester else '',
                'amount': f'Rs. {approval.amount:,.0f}' if approval.amount else 'N/A',
                'department': (
                    approval.requester.department.name
                    if approval.requester and approval.requester.department
                    else 'N/A'
                )
            }
        )

    return success(
        {
            'totalTasks': total,
            'completedTasks': completed,
            'completionPercentage': completion_percentage,
            'delayedTasks': delayed,
            'taskBreakdown': {
                'pending': pending,
                'inProgress': in_progress,
                'completed': completed,
                'delayed': delayed,
                'escalated': escalated
            },
            'pendingApprovals': pending_approvals,
            'departments': department_rows,
            'alerts': alerts,
            'recentTasks': [task.to_dict() for task in recent_tasks],
            'pendingApprovalsList': pending_approvals_list
        }
    )


@dashboard_bp.route('/dept/<int:dept_id>', methods=['GET'])
@jwt_required()
def dept_dashboard(dept_id):
    Task.mark_overdue_delayed()
    if not dept_id or dept_id <= 0:
        return success(
            {
                'myTasks': {
                    'total': 0,
                    'pending': 0,
                    'inProgress': 0,
                    'completed': 0,
                    'delayed': 0
                },
                'taskStatusData': [],
                'recentAnnouncements': [],
                'myTasksList': []
            }
        )

    tasks = Task.query.filter_by(department_id=dept_id).all()
    total, completed, delayed, pending, in_progress, escalated, _ = _task_stats(tasks)

    task_status_data = [
        {'name': 'Pending', 'value': pending, 'color': '#3B82F6'},
        {'name': 'In Progress', 'value': in_progress, 'color': '#F59E0B'},
        {'name': 'Completed', 'value': completed, 'color': '#22C55E'},
        {'name': 'Delayed', 'value': delayed, 'color': '#EF4444'},
        {'name': 'Escalated', 'value': escalated, 'color': '#8B5CF6'}
    ]

    announcements = (
        Announcement.query.filter(
            or_(Announcement.target == 'ALL', Announcement.department_id == dept_id)
        )
        .order_by(Announcement.created_at.desc())
        .limit(5)
        .all()
    )

    recent_announcements = [
        {
            'id': announcement.id,
            'title': announcement.message[:60],
            'sentTo': announcement.target,
            'date': announcement.created_at.isoformat() if announcement.created_at else None
        }
        for announcement in announcements
    ]

    return success(
        {
            'myTasks': {
                'total': total,
                'pending': pending,
                'inProgress': in_progress,
                'completed': completed,
                'delayed': delayed
            },
            'taskStatusData': task_status_data,
            'recentAnnouncements': recent_announcements,
            'myTasksList': [task.to_dict() for task in tasks]
        }
    )


@dashboard_bp.route('/performance', methods=['GET'])
@jwt_required()
def performance():
    Task.mark_overdue_delayed()
    rows = []
    department_users = User.query.filter(
        User.role.in_(TASK_ASSIGNABLE_ROLES),
        User.is_active == True
    ).all()

    # Load all tasks for these users in one query instead of one per user
    user_ids = [u.id for u in department_users]
    all_user_tasks = Task.query.filter(Task.assigned_to.in_(user_ids)).all() if user_ids else []

    tasks_by_user: dict = {}
    for task in all_user_tasks:
        tasks_by_user.setdefault(task.assigned_to, []).append(task)

    # Load all registers for these users in one query instead of one per user.
    all_user_registers = (
        Register.query.filter(Register.head_id.in_(user_ids)).all() if user_ids else []
    )
    registers_by_user: dict = {}
    for register in all_user_registers:
        registers_by_user.setdefault(register.head_id, []).append(register)

    for user in department_users:
        user_tasks = tasks_by_user.get(user.id, [])
        total = len(user_tasks)
        completed = sum(1 for task in user_tasks if task.status == 'COMPLETED')
        delayed = sum(1 for task in user_tasks if task.status == 'DELAYED')
        delay_rate = round((delayed / total) * 100) if total else 0
        task_performance = ((completed / total) * 100) * (1 - delay_rate / 100) if total else 0
        performance_score = round(task_performance) if total else 0

        user_registers = registers_by_user.get(user.id, [])
        total_registers = len(user_registers)
        completed_registers = sum(
            1 for register in user_registers if register.computed_status() == 'COMPLETED'
        )
        register_performance = (
            round((completed_registers / total_registers) * 100) if total_registers else 0
        )

        overall_performance = _overall_performance(
            task_performance, bool(total), register_performance, bool(total_registers)
        )

        rows.append(
            {
                'userId': user.id,
                'name': user.name,
                'role': user.role,
                'totalTasks': total,
                'completedTasks': completed,
                'delayedTasks': delayed,
                'performanceScore': performance_score,
                'delayRate': delay_rate,
                'totalRegisters': total_registers,
                'completedRegisters': completed_registers,
                'registerPerformance': register_performance,
                'overallPerformance': overall_performance
            }
        )

    return success(rows)


@dashboard_bp.route('/monthly-comparison', methods=['GET'])
@jwt_required()
def monthly_comparison():
    Task.mark_overdue_delayed()
    current_year = datetime.now().year
    rows = []

    for department in Department.query.order_by(Department.name).all():
        monthly_rates = []
        for month_number in range(1, 13):
            month_tasks = Task.query.filter(
                Task.department_id == department.id,
                func.extract('month', Task.due_date) == month_number,
                func.extract('year', Task.due_date) == current_year
            ).all()
            total = len(month_tasks)
            completed = sum(1 for task in month_tasks if task.status == 'COMPLETED')
            completion_rate = round((completed / total) * 100) if total else 0
            monthly_rates.append(
                {
                    'month': MONTH_NAMES[month_number - 1],
                    'completionRate': completion_rate,
                    'totalTasks': total,
                    'completedTasks': completed
                }
            )

        rows.append(
            {
                'departmentId': department.id,
                'name': department.name,
                'monthlyRates': monthly_rates
            }
        )

    return success(rows)


@dashboard_bp.route('/metrics', methods=['GET'])
@jwt_required()
def metrics():
    Task.mark_overdue_delayed()
    all_tasks = Task.query.all()
    total, completed, delayed, pending, _, _, completion_rate = _task_stats(all_tasks)
    return success(
        {
            'totalTasks': total,
            'completedTasks': completed,
            'delayedTasks': delayed,
            'pendingTasks': pending,
            'completionRate': completion_rate
        }
    )


@dashboard_bp.route('/director', methods=['GET'])
@jwt_required()
def director_dashboard():
    return chairman_dashboard()


@dashboard_bp.route('/analytics/<string:role>', methods=['GET'])
@jwt_required()
def role_analytics(role):
    """Generic analytics endpoint used by all department roles."""
    Task.mark_overdue_delayed()
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({'success': False, 'message': 'Unauthorized', 'data': None}), 401

    # Allow chairman/director to query any role; others only their own
    if user.role not in ('CHAIRMAN', 'DIRECTOR') and user.role != role.upper():
        return jsonify({'success': False, 'message': 'Forbidden', 'data': None}), 403

    dept_id = request.args.get('department_id') or (user.department_id if user else None)

    if dept_id:
        tasks = Task.query.filter_by(department_id=dept_id).all()
    else:
        tasks = Task.query.all()

    total, completed, delayed, pending, in_progress, escalated, completion_pct = _task_stats(tasks)

    # Monthly breakdown for current year
    from datetime import datetime as dt_class
    current_year = dt_class.now().year
    monthly = []
    for m in range(1, 13):
        month_tasks = [t for t in tasks if t.due_date and t.due_date.month == m and t.due_date.year == current_year]
        mtotal = len(month_tasks)
        mcompleted = sum(1 for t in month_tasks if t.status == 'COMPLETED')
        monthly.append({
            'month': MONTH_NAMES[m - 1],
            'total': mtotal,
            'completed': mcompleted,
            'completionRate': round((mcompleted / mtotal) * 100) if mtotal else 0
        })

    return success({
        'summary': {
            'total': total,
            'completed': completed,
            'delayed': delayed,
            'pending': pending,
            'inProgress': in_progress,
            'escalated': escalated,
            'completionPct': completion_pct
        },
        'monthly': monthly,
        'taskStatusData': [
            {'name': 'Pending', 'value': pending, 'color': '#3B82F6'},
            {'name': 'In Progress', 'value': in_progress, 'color': '#F59E0B'},
            {'name': 'Completed', 'value': completed, 'color': '#22C55E'},
            {'name': 'Delayed', 'value': delayed, 'color': '#EF4444'},
            {'name': 'Escalated', 'value': escalated, 'color': '#8B5CF6'},
        ]
    })
