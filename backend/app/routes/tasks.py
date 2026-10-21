from datetime import datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func, or_
from app.extensions import db
from app.models.department import Department
from app.models.notification import Notification
from app.models.task import Task, TaskHistory
from app.models.user import User
from app.task_catalog import is_valid_task_selection
from app.sockets.emitter import emit_notification, emit_task_updated
from app.utils.file_utils import save_task_attachment
from app.utils.response import error, success

tasks_bp = Blueprint('tasks', __name__)

ELEVATED_ROLES = {'CHAIRMAN', 'DIRECTOR'}
VALID_STATUSES = {'PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'}
# The assignee may only move a task to these statuses. PENDING and DELAYED are
# system-managed; ESCALATED is the assigner's decision.
ASSIGNEE_STATUSES = {'IN_PROGRESS', 'COMPLETED'}
# The assignee cannot change a task that is already in one of these states.
ASSIGNEE_LOCKED_STATUSES = {'COMPLETED', 'ESCALATED'}
VALID_PRIORITIES = {'HIGH', 'MEDIUM', 'LOW'}
VALID_CADENCES = {'DAILY', 'WEEKLY', 'MONTHLY'}


def _to_int(value):
    """``int(value)`` for a clean integer (int or numeric string), else ``None``."""
    if isinstance(value, bool):
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _range_bound(value, end_of_day):
    """Parse a ``from`` / ``to`` filter. A bare ``YYYY-MM-DD`` covers the whole day:
    start-of-day for ``from``, end-of-day for ``to`` (task due dates are stored as
    end-of-day, so ``to=2026-05-10`` must still include a task due on the 10th)."""
    if not value:
        return None
    value = value.strip()
    try:
        day = datetime.strptime(value, '%Y-%m-%d')
    except ValueError:
        return _parse_date(value)
    if end_of_day:
        return day.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
    return day.replace(tzinfo=timezone.utc)


def _aware(moment):
    """Treat a naive datetime (some databases drop tzinfo) as UTC so values compare."""
    if moment is not None and moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment


def _is_future(moment):
    return moment is not None and _aware(moment) > datetime.now(timezone.utc)


def _find_duplicate(task_headline, sub_task, assigned_to, start_date, due_date, exclude_id=None):
    """An open task with the same headline, subtask, assignee and dates."""
    query = Task.query.filter(
        Task.assigned_to == assigned_to,
        Task.task_headline == task_headline,
        func.lower(Task.title) == (sub_task or '').strip().lower(),
        Task.start_date == start_date,
        Task.due_date == due_date,
        Task.status != 'COMPLETED',
    )
    if exclude_id is not None:
        query = query.filter(Task.id != exclude_id)
    return query.first()


def _validate_assignee(assigned_to):
    """Return ``(assignee, None)`` or ``(None, (message, status))``."""
    user_id = _to_int(assigned_to)
    if user_id is None:
        return None, ('assigned_to must be a valid user id', 400)
    assignee = db.session.get(User, user_id)
    if not assignee:
        return None, ('Assigned user not found', 404)
    if not assignee.is_active:
        return None, ('Assigned user is inactive and cannot receive tasks', 400)
    return assignee, None


def _validate_department(department_id):
    """Return ``(department_id | None, None)`` or ``(None, (message, status))``."""
    if department_id in (None, '', 0, '0'):
        return None, None
    dept_id = _to_int(department_id)
    if dept_id is None or not db.session.get(Department, dept_id):
        return None, ('department_id does not match an existing department', 400)
    return dept_id, None


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


def _is_assigner(user, task):
    return bool(user and task.assigned_by == user.id)


def _is_assignee(user, task):
    return bool(user and task.assigned_to == user.id)


def _can_edit_task(user, task):
    """Only the task's assigner or assignee may modify it (never decided by role alone)."""
    return _is_assigner(user, task) or _is_assignee(user, task)


def _validate_status_change(user, task, new_status, has_proof=False):
    """Single source of truth for who may move a task to which status.

    Returns ``None`` when the change is allowed, otherwise an ``(message, http_status)``
    tuple. ``has_proof`` is True when a proof file is being supplied with this request.
    """
    if new_status not in VALID_STATUSES:
        return (f'Invalid status. Must be one of: {", ".join(sorted(VALID_STATUSES))}', 400)

    if new_status == task.status:
        return (f'Task is already {new_status}', 400)

    if _is_assigner(user, task):
        pass  # the assigner may set any status
    elif _is_assignee(user, task):
        if task.status in ASSIGNEE_LOCKED_STATUSES:
            return (
                f'This task is {task.status} and can only be changed by the assigner.',
                403,
            )
        if new_status not in ASSIGNEE_STATUSES:
            return (
                'You can only set status to In Progress or Completed. '
                'Pending and Delayed are set automatically; Escalated is set by the assigner.',
                403,
            )
    else:
        return ('Only the task assigner or assignee can change the status of this task.', 403)

    if new_status == 'COMPLETED' and not (task.attachment_path or task.proof_path or has_proof):
        return ('Proof of completion (attachment) is required to mark a task as Completed.', 400)

    return None


def _notify_status_change(user, task, new_status):
    """Assigner's change notifies the assignee only; assignee's change notifies the assigner only."""
    if _is_assigner(user, task):
        target_id = task.assigned_to
    else:
        target_id = task.assigned_by
    if not target_id or target_id == user.id:
        return None

    notif_type = {'DELAYED': 'TASK_DELAYED', 'ESCALATED': 'TASK_ESCALATED'}.get(new_status, 'TASK_UPDATED')
    message = f'Task "{task.title}" status updated to {new_status} by {user.name}'
    notif = _create_notification(target_id, notif_type, message, task.id)
    db.session.flush()
    return notif


@tasks_bp.route('/my-tasks', methods=['GET'])
@jwt_required()
def my_tasks():
    _apply_overdue_delay()
    user_id = get_jwt_identity()
    tasks = Task.query.filter_by(assigned_to=user_id).order_by(Task.created_at.desc(), Task.id.desc()).all()
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

    tasks = Task.query.filter_by(department_id=dept_id).order_by(Task.created_at.desc(), Task.id.desc()).all()
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
        dept_id = _to_int(dept_id)
        if dept_id is None:
            return error('department_id must be an integer', 400)
        query = query.filter_by(department_id=dept_id)

    assigned_to = request.args.get('assigned_to')
    if assigned_to:
        assigned_to = _to_int(assigned_to)
        if assigned_to is None:
            return error('assigned_to must be an integer', 400)
        query = query.filter_by(assigned_to=assigned_to)

    date_from = _range_bound(request.args.get('from'), end_of_day=False)
    if request.args.get('from') and date_from is None:
        return error('from must be a valid date (YYYY-MM-DD)', 400)
    if date_from:
        query = query.filter(Task.due_date >= date_from)

    date_to = _range_bound(request.args.get('to'), end_of_day=True)
    if request.args.get('to') and date_to is None:
        return error('to must be a valid date (YYYY-MM-DD)', 400)
    if date_to:
        query = query.filter(Task.due_date <= date_to)

    search = (request.args.get('search') or '').strip()
    if search:
        # Escape LIKE wildcards so a search for "50%" or "a_b" matches literally.
        escaped = search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        pattern = f'%{escaped}%'
        query = query.filter(
            or_(
                Task.title.ilike(pattern, escape='\\'),
                Task.description.ilike(pattern, escape='\\'),
            )
        )

    # id is a tie-breaker so ordering is stable when created_at values collide.
    tasks = query.order_by(Task.created_at.desc(), Task.id.desc()).all()
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
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user or user.role != 'CHAIRMAN':
        return error('Only Chairman can create tasks', 403)

    if request.content_type and 'multipart' in request.content_type:
        data = request.form.to_dict()
    else:
        data = request.get_json() or {}

    if 'title' in data:
        return error('Use task_headline and sub_task instead of title', 400)

    required = ['task_headline', 'sub_task', 'assigned_to', 'priority', 'start_date', 'due_date']
    for field in required:
        if not data.get(field):
            return error(f'{field} is required', 400)

    task_headline = str(data['task_headline']).strip()
    sub_task = str(data['sub_task']).strip()
    if not is_valid_task_selection(task_headline, sub_task):
        return error('sub_task must belong to the selected task_headline', 400)

    assignee, problem = _validate_assignee(data['assigned_to'])
    if problem:
        return error(problem[0], problem[1])

    priority = str(data['priority']).upper()
    if priority not in VALID_PRIORITIES:
        return error(f"priority must be one of: {', '.join(sorted(VALID_PRIORITIES))}", 400)

    cadence = str(data['cadence']).upper() if data.get('cadence') else None
    if cadence and cadence not in VALID_CADENCES:
        return error(f"cadence must be one of: {', '.join(sorted(VALID_CADENCES))}", 400)

    department_id, problem = _validate_department(data.get('department_id'))
    if problem:
        return error(problem[0], problem[1])

    start_date = _parse_date(data.get('start_date'))
    due_date = _parse_date(data.get('due_date'))
    if start_date is None or due_date is None:
        return error('start_date and due_date must be valid dates (YYYY-MM-DD)', 400)
    if due_date < start_date:
        return error('due_date must be on or after start_date', 400)

    # Same assignee + same headline/subtask + same dates while still open is a
    # duplicate submission rather than a new assignment.
    if _find_duplicate(task_headline, sub_task, assignee.id, start_date, due_date):
        return error(
            f'"{sub_task}" is already assigned to {assignee.name} with the same dates',
            409,
        )

    task = Task(
        title=sub_task,
        task_headline=task_headline,
        description=data.get('description'),
        assigned_by=user_id,
        assigned_to=assignee.id,
        department_id=department_id,
        priority=priority,
        status='PENDING',
        cadence=cadence,
        start_date=start_date,
        due_date=due_date
    )
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

    if 'title' in data:
        return error('Use task_headline and sub_task instead of title', 400)

    old_status = task.status
    is_assigner = _is_assigner(user, task)

    # Validate the status change up front, before touching any field, so a rejected
    # request leaves the task untouched. An unchanged status (e.g. a full-form edit
    # that echoes the current value) is not a status change.
    status_changing = 'status' in data and data['status'] != old_status
    if status_changing:
        problem = _validate_status_change(user, task, data['status'], has_proof=bool(file))
        if problem:
            return error(problem[0], problem[1])

    # ---- validate everything first, so a rejected request changes nothing ----
    new_assignee = None
    if 'assigned_to' in data and is_assigner and _to_int(data['assigned_to']) != task.assigned_to:
        new_assignee, problem = _validate_assignee(data['assigned_to'])
        if problem:
            return error(problem[0], problem[1])

    if 'priority' in data and is_assigner:
        if str(data['priority']).upper() not in VALID_PRIORITIES:
            return error(f"priority must be one of: {', '.join(sorted(VALID_PRIORITIES))}", 400)

    if 'cadence' in data and is_assigner and data['cadence']:
        if str(data['cadence']).upper() not in VALID_CADENCES:
            return error(f"cadence must be one of: {', '.join(sorted(VALID_CADENCES))}", 400)

    if is_assigner and ('task_headline' in data or 'sub_task' in data):
        task_headline = str(data.get('task_headline', task.task_headline or '')).strip()
        sub_task = str(data.get('sub_task', task.title or '')).strip()
        if not task_headline or not sub_task:
            return error('task_headline and sub_task are both required when changing task selection', 400)
        if not is_valid_task_selection(task_headline, sub_task):
            return error('sub_task must belong to the selected task_headline', 400)
    else:
        task_headline = task.task_headline
        sub_task = task.title

    new_department_id = task.department_id
    if 'department_id' in data and is_assigner:
        new_department_id, problem = _validate_department(data['department_id'])
        if problem:
            return error(problem[0], problem[1])

    new_start, new_due = task.start_date, task.due_date
    if 'start_date' in data and data['start_date'] and is_assigner:
        new_start = _parse_date(data['start_date'])
        if new_start is None:
            return error('start_date must be a valid date (YYYY-MM-DD)', 400)
    if 'due_date' in data and data['due_date'] and is_assigner:
        new_due = _parse_date(data['due_date'])
        if new_due is None:
            return error('due_date must be a valid date (YYYY-MM-DD)', 400)
    if new_start and new_due and _aware(new_due) < _aware(new_start):
        return error('due_date must be on or after start_date', 400)

    if is_assigner:
        final_assignee_id = new_assignee.id if new_assignee else task.assigned_to
        schedule_changed = (
            new_assignee is not None
            or ('task_headline' in data and task_headline != task.task_headline)
            or ('sub_task' in data and sub_task != task.title)
            or _aware(new_start) != _aware(task.start_date)
            or _aware(new_due) != _aware(task.due_date)
        )
        if schedule_changed and task.status != 'COMPLETED' and _find_duplicate(
            task_headline, sub_task, final_assignee_id, new_start, new_due, exclude_id=task.id
        ):
            return error(
                'Another open task with the same Task Headline, Sub Task, assignee and dates already exists',
                409,
            )

    # ---- apply ----
    if is_assigner and ('task_headline' in data or 'sub_task' in data):
        task.task_headline = task_headline
        task.title = sub_task
    if 'description' in data:
        task.description = data['description']
    previous_assignee = task.assignee
    if new_assignee is not None:
        task.assigned_to = new_assignee.id
    if 'department_id' in data and is_assigner:
        task.department_id = new_department_id
    if 'priority' in data and is_assigner:
        task.priority = str(data['priority']).upper()
    due_changed = _aware(new_due) != _aware(task.due_date)
    task.start_date = new_start
    task.due_date = new_due
    if 'cadence' in data and is_assigner:
        task.cadence = str(data['cadence']).upper() if data['cadence'] else None

    extra_notifications = []
    if new_assignee is not None:
        db.session.add(TaskHistory(
            task_id=task.id,
            updated_by=user.id,
            old_status=task.status,
            new_status=task.status,
            comment=f'Reassigned from {previous_assignee.name if previous_assignee else "unknown"} to {new_assignee.name}',
        ))
        extra_notifications.append(_create_notification(
            new_assignee.id, 'TASK_ASSIGNED', f'New task assigned: {task.title}', task.id))
        if previous_assignee and previous_assignee.id != user.id:
            extra_notifications.append(_create_notification(
                previous_assignee.id, 'TASK_UPDATED',
                f'Task "{task.title}" was reassigned to {new_assignee.name}', task.id))

    # An overdue task is auto-marked DELAYED. If the assigner pushes the due date
    # into the future (and isn't setting a status themselves), put it back to the
    # status it had before it was auto-delayed instead of leaving it stuck DELAYED.
    if (due_changed and is_assigner and not status_changing
            and task.status == 'DELAYED' and _is_future(task.due_date)):
        last_delay = (TaskHistory.query
                      .filter_by(task_id=task.id, new_status='DELAYED')
                      .order_by(TaskHistory.updated_at.desc(), TaskHistory.id.desc())
                      .first())
        restored = last_delay.old_status if last_delay and last_delay.old_status in ('PENDING', 'IN_PROGRESS') else 'PENDING'
        db.session.add(TaskHistory(
            task_id=task.id,
            updated_by=user.id,
            old_status='DELAYED',
            new_status=restored,
            comment='Due date extended: status restored',
        ))
        task.status = restored

    status_notif = None
    if status_changing:
        new_status = data['status']
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
        status_notif = _notify_status_change(user, task, new_status)

    if file:
        # If the task is being marked complete, save as proof; otherwise replace the brief attachment
        if data.get('status') == 'COMPLETED' or task.status == 'COMPLETED':
            task.proof_path = save_task_attachment(file, task.id)
        else:
            task.attachment_path = save_task_attachment(file, task.id)

    db.session.commit()
    if status_notif:
        emit_notification(status_notif.user_id, status_notif.to_dict())
    for notif in extra_notifications:
        emit_notification(notif.user_id, notif.to_dict())
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

    problem = _validate_status_change(user, task, new_status)
    if problem:
        return error(problem[0], problem[1])

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

    notif = _notify_status_change(user, task, new_status)
    db.session.commit()

    if notif:
        emit_notification(notif.user_id, notif.to_dict())
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

    # Keep each person's notification history but detach it from the deleted task
    # (task_id is nullable), so the delete can't trip the foreign key. Task history
    # rows are removed with the task (cascade).
    Notification.query.filter_by(task_id=task.id).update({'task_id': None}, synchronize_session=False)
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
