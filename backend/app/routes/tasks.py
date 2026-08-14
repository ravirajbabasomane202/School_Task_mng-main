from datetime import datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import or_
from app.extensions import db
from app.models.notification import Notification
from app.models.task import Task, TaskHistory
from app.models.user import User
from app.sockets.emitter import emit_notification, emit_task_updated
from app.utils.file_utils import save_task_attachment
from app.utils.response import error, success

tasks_bp = Blueprint('tasks', __name__)

ELEVATED_ROLES = {'CHAIRMAN', 'DIRECTOR'}
VALID_STATUSES = {'PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'}
# Non-elevated (assigned) users may only move a task to these statuses
ASSIGNEE_STATUSES = {'IN_PROGRESS', 'COMPLETED', 'DELAYED'}


def _parse_date(value):
    """Parse a date string that may be YYYY-MM-DD or a full ISO datetime.

    Date-only values are treated as end-of-day in UTC so that tasks due today
    do not become overdue immediately at midnight.
    """
    if not value:
        return None
    try:
        clean = value.strip()
        if clean.endswith('Z'):
            clean = clean[:-1] + '+00:00'

        # Try ISO parsing first since it handles timezone offsets and fractional seconds.
        try:
            parsed = datetime.fromisoformat(clean)
        except ValueError:
            parsed = None

        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed

        # Fallback for pure date strings.
        for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
            try:
                parsed = datetime.strptime(clean, fmt)
                if fmt == '%Y-%m-%d':
                    return datetime(parsed.year, parsed.month, parsed.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
                return parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None
    except Exception:
        return None


def _create_notification(user_id, notif_type, message, task_id=None):
    notif = Notification(user_id=user_id, type=notif_type, message=message, task_id=task_id)
    db.session.add(notif)
    return notif


def _current_user():
    return db.session.get(User, int(get_jwt_identity()))


def _is_elevated(user):
    return bool(user and user.role in ELEVATED_ROLES)


def _apply_overdue_delay():
    Task.mark_overdue_delayed()


def _task_scope_query(user):
    if _is_elevated(user):
        return Task.query

    filters = [Task.assigned_to == user.id]
    if user.department_id:
        filters.append(Task.department_id == user.department_id)

    return Task.query.filter(or_(*filters))


def _can_view_task(user, task):
    if _is_elevated(user):
        return True
    if task.assigned_to == user.id:
        return True
    return bool(user.department_id and task.department_id == user.department_id)


def _can_edit_task(user, task):
    if _is_elevated(user):
        return True
    return task.assigned_to == user.id


@tasks_bp.route('/my-tasks', methods=['GET'])
@jwt_required()
def my_tasks():
    _apply_overdue_delay()
    user_id = get_jwt_identity()
    tasks = Task.query.filter_by(assigned_to=user_id).order_by(Task.created_at.desc()).all()
    return success([t.to_dict() for t in tasks])


@tasks_bp.route('/dept/<int:dept_id>', methods=['GET'])
@jwt_required()
def tasks_by_dept(dept_id):
    _apply_overdue_delay()
    user = _current_user()
    if not user:
        return error('User not found', 401)

    if not _is_elevated(user) and user.department_id != dept_id:
        return error('Forbidden', 403)

    tasks = Task.query.filter_by(department_id=dept_id).order_by(Task.created_at.desc()).all()
    return success([t.to_dict() for t in tasks])


@tasks_bp.route('', methods=['GET'])
@jwt_required()
def list_tasks():
    _apply_overdue_delay()
    user = _current_user()
    if not user:
        return error('User not found', 401)

    query = _task_scope_query(user)

    status_param = request.args.get('status', '')
    if status_param and status_param != 'ALL':
        statuses = [s.strip() for s in status_param.split(',') if s.strip()]
        if statuses:
            query = query.filter(Task.status.in_(statuses))

    priority = request.args.get('priority')
    if priority and priority != 'ALL':
        query = query.filter_by(priority=priority)

    dept_id = request.args.get('department_id')
    if dept_id:
        query = query.filter_by(department_id=int(dept_id))

    assigned_to = request.args.get('assigned_to')
    if assigned_to:
        query = query.filter_by(assigned_to=int(assigned_to))

    date_from = request.args.get('from')
    if date_from:
        query = query.filter(Task.due_date >= date_from)

    date_to = request.args.get('to')
    if date_to:
        query = query.filter(Task.due_date <= date_to)

    search = request.args.get('search')
    if search:
        query = query.filter(
            or_(Task.title.ilike(f'%{search}%'), Task.description.ilike(f'%{search}%'))
        )

    tasks = query.order_by(Task.created_at.desc()).all()
    return success([t.to_dict() for t in tasks])


@tasks_bp.route('/<int:task_id>', methods=['GET'])
@jwt_required()
def get_task(task_id):
    _apply_overdue_delay()
    user = _current_user()
    if not user:
        return error('User not found', 401)

    task = Task.query.get_or_404(task_id)
    if not _can_view_task(user, task):
        return error('Forbidden', 403)

    return success(task.to_dict(include_history=True))


@tasks_bp.route('/<int:task_id>/history', methods=['GET'])
@jwt_required()
def get_task_history(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    task = Task.query.get_or_404(task_id)
    if not _can_view_task(user, task):
        return error('Forbidden', 403)

    history = (
        TaskHistory.query.filter_by(task_id=task_id)
        .order_by(TaskHistory.updated_at.desc())
        .all()
    )
    return success([h.to_dict() for h in history])


@tasks_bp.route('', methods=['POST'])
@jwt_required()
def create_task():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user or user.role != 'CHAIRMAN':
        return error('Only Chairman can create tasks', 403)

    if request.content_type and 'multipart' in request.content_type:
        data = request.form.to_dict()
    else:
        data = request.get_json() or {}

    required = ['title', 'assigned_to', 'priority', 'start_date', 'due_date']
    for field in required:
        if not data.get(field):
            return error(f'{field} is required', 400)

    assignee = db.session.get(User, data['assigned_to'])
    if not assignee:
        return error('Assigned user not found', 404)

    task = Task(
        title=data['title'],
        description=data.get('description'),
        assigned_by=user_id,
        assigned_to=int(data['assigned_to']),
        department_id=int(data['department_id']) if data.get('department_id') else None,
        priority=data['priority'],
        status='PENDING',
        cadence=data.get('cadence'),
        start_date=_parse_date(data.get('start_date')),
        due_date=_parse_date(data.get('due_date'))
    )

    # Validate date ordering
    if task.start_date and task.due_date and task.due_date < task.start_date:
        return error('due_date must be on or after start_date', 400)
    db.session.add(task)
    db.session.flush()

    file = request.files.get('attachment')
    if file:
        task.attachment_path = save_task_attachment(file, task.id)

    history = TaskHistory(
        task_id=task.id,
        updated_by=user_id,
        old_status=None,
        new_status='PENDING',
        comment='Task created'
    )
    db.session.add(history)

    notif = _create_notification(assignee.id, 'TASK_ASSIGNED', f'New task assigned: {task.title}', task.id)
    db.session.commit()

    emit_notification(assignee.id, notif.to_dict())
    return success(task.to_dict(include_history=True), 'Task created', 201)


@tasks_bp.route('/<int:task_id>', methods=['PUT'])
@jwt_required()
def update_task(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    task = Task.query.get_or_404(task_id)
    if not _can_edit_task(user, task):
        return error('Forbidden', 403)

    if request.content_type and 'multipart' in request.content_type:
        data = request.form.to_dict()
        file = request.files.get('attachment')
    else:
        data = request.get_json() or {}
        file = None

    old_status = task.status

    if 'status' in data and data['status'] != old_status and user.role == 'CHAIRMAN':
        if data['status'] != 'ESCALATED':
            return error('Chairman can only change task status to Escalated', 403)

    if 'title' in data and _is_elevated(user):
        task.title = data['title']
    if 'description' in data:
        task.description = data['description']
    if 'assigned_to' in data and _is_elevated(user):
        task.assigned_to = int(data['assigned_to'])
    if 'department_id' in data and _is_elevated(user):
        task.department_id = int(data['department_id']) if data['department_id'] else None
    if 'priority' in data and _is_elevated(user):
        task.priority = data['priority']
    if 'start_date' in data and data['start_date'] and _is_elevated(user):
        task.start_date = _parse_date(data['start_date'])
    if 'due_date' in data and data['due_date'] and _is_elevated(user):
        task.due_date = _parse_date(data['due_date'])

    # Validate date ordering after any update
    if task.start_date and task.due_date and task.due_date < task.start_date:
        return error('due_date must be on or after start_date', 400)
    if 'cadence' in data and _is_elevated(user):
        task.cadence = data['cadence']

    if 'status' in data and data['status'] != old_status:
        new_status = data['status']
        if new_status not in VALID_STATUSES:
            return error(f'Invalid status. Must be one of: {", ".join(sorted(VALID_STATUSES))}', 400)
        if not _is_elevated(user) and new_status not in ASSIGNEE_STATUSES:
            return error(f'You can only set status to: {", ".join(sorted(ASSIGNEE_STATUSES))}', 403)
        if new_status == 'COMPLETED' and not task.attachment_path and not task.proof_path and not file:
            return error('Proof of completion (attachment) is required to mark a task as Completed.', 400)
        task.status = new_status
        if new_status == 'COMPLETED':
            task.completed_at = datetime.now(timezone.utc)
        history = TaskHistory(
            task_id=task.id,
            updated_by=user.id,
            old_status=old_status,
            new_status=new_status,
            comment=data.get('comment')
        )
        db.session.add(history)

    if file:
        # If the task is being marked complete, save as proof; otherwise replace the brief attachment
        if data.get('status') == 'COMPLETED' or task.status == 'COMPLETED':
            task.proof_path = save_task_attachment(file, task.id)
        else:
            task.attachment_path = save_task_attachment(file, task.id)

    db.session.commit()
    emit_task_updated(task.to_dict())
    return success(task.to_dict(include_history=True), 'Task updated')


@tasks_bp.route('/<int:task_id>/status', methods=['PUT'])
@jwt_required()
def update_task_status(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    task = Task.query.get_or_404(task_id)
    if not _can_edit_task(user, task):
        return error('Forbidden', 403)

    data = request.get_json()
    if not data or not data.get('status'):
        return error('Status is required', 400)

    old_status = task.status
    new_status = data['status']
    comment = data.get('comment')

    if new_status not in VALID_STATUSES:
        return error(f'Invalid status. Must be one of: {", ".join(sorted(VALID_STATUSES))}', 400)

    # Chairman can only set status to ESCALATED
    if user.role == 'CHAIRMAN' and new_status != 'ESCALATED':
        return error('Chairman can only change task status to Escalated', 403)

    # Non-elevated users (the assignee) cannot self-escalate a task
    if not _is_elevated(user) and new_status not in ASSIGNEE_STATUSES:
        return error(f'You can only set status to: {", ".join(sorted(ASSIGNEE_STATUSES))}', 403)

    if new_status == 'COMPLETED' and not task.attachment_path and not task.proof_path:
        return error('Proof of completion (attachment) is required to mark a task as Completed.', 400)

    task.status = new_status
    if new_status == 'COMPLETED':
        task.completed_at = datetime.now(timezone.utc)

    history = TaskHistory(
        task_id=task.id,
        updated_by=user.id,
        old_status=old_status,
        new_status=new_status,
        comment=comment
    )
    db.session.add(history)

    notif_type = 'TASK_UPDATED'
    if new_status == 'DELAYED':
        notif_type = 'TASK_DELAYED'
    elif new_status == 'ESCALATED':
        notif_type = 'TASK_ESCALATED'

    notif_msg = f'Task "{task.title}" status updated to {new_status} by {user.name}'
    notif = _create_notification(task.assigned_by, notif_type, notif_msg, task.id)
    db.session.flush()

    # Also notify the assignee if they are not the one making the update
    if task.assigned_to and task.assigned_to != user.id and task.assigned_to != task.assigned_by:
        assignee_notif = _create_notification(task.assigned_to, notif_type, notif_msg, task.id)
        db.session.commit()
        emit_notification(task.assigned_by, notif.to_dict())
        emit_notification(task.assigned_to, assignee_notif.to_dict())
    else:
        db.session.commit()
        emit_notification(task.assigned_by, notif.to_dict())
    emit_task_updated(task.to_dict())
    return success(task.to_dict(include_history=True), 'Status updated')


@tasks_bp.route('/<int:task_id>', methods=['DELETE'])
@jwt_required()
def delete_task(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    task = Task.query.get_or_404(task_id)
    if not _is_elevated(user):
        return error('Only Chairman or Director can delete tasks', 403)

    db.session.delete(task)
    db.session.commit()
    return success({'id': task_id}, 'Task deleted')


@tasks_bp.route('/<int:task_id>/attachment', methods=['POST'])
@jwt_required()
def upload_attachment(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    task = Task.query.get_or_404(task_id)
    if not _can_edit_task(user, task):
        return error('Forbidden', 403)

    file = request.files.get('attachment')
    if not file:
        return error('No file provided', 400)

    # Save as proof if the task is already completed, otherwise as the brief attachment
    if task.status == 'COMPLETED':
        task.proof_path = save_task_attachment(file, task.id)
        db.session.commit()
        return success({'proof_path': task.proof_path}, 'Proof uploaded')
    else:
        task.attachment_path = save_task_attachment(file, task.id)
        db.session.commit()
        return success({'attachment_path': task.attachment_path}, 'Attachment uploaded')
