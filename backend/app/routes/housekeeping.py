from datetime import datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.extensions import db
from app.models.housekeeping import HousekeepingTask
from app.models.user import User
from app.utils.response import error, success

housekeeping_bp = Blueprint('housekeeping', __name__)

ELEVATED_ROLES = {'CHAIRMAN', 'DIRECTOR', 'PROPERTY'}


def _current_user():
    return db.session.get(User, int(get_jwt_identity()))


@housekeeping_bp.route('', methods=['GET'])
@jwt_required()
def list_tasks():
    user = _current_user()
    if not user:
        return error('User not found', 401)

    query = HousekeepingTask.query

    status_filter = request.args.get('status')
    if status_filter and status_filter != 'ALL':
        query = query.filter_by(status=status_filter)

    priority_filter = request.args.get('priority')
    if priority_filter and priority_filter != 'ALL':
        query = query.filter_by(priority=priority_filter)

    task_type = request.args.get('task_type')
    if task_type and task_type != 'ALL':
        query = query.filter_by(task_type=task_type)

    tasks = query.order_by(HousekeepingTask.created_at.desc()).all()
    return success([t.to_dict() for t in tasks])


@housekeeping_bp.route('/<int:task_id>', methods=['GET'])
@jwt_required()
def get_task(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)
    task = HousekeepingTask.query.get_or_404(task_id)
    return success(task.to_dict())


@housekeeping_bp.route('', methods=['POST'])
@jwt_required()
def create_task():
    user = _current_user()
    if not user:
        return error('User not found', 401)
    if user.role not in ELEVATED_ROLES:
        return error('Insufficient permissions to create housekeeping tasks', 403)

    data = request.get_json() or {}
    required = ['area', 'task_type']
    for field in required:
        if not data.get(field):
            return error(f'{field} is required', 400)

    task = HousekeepingTask(
        area=data['area'],
        task_type=data['task_type'],
        description=data.get('description'),
        assigned_to=int(data['assigned_to']) if data.get('assigned_to') else None,
        created_by=user.id,
        status='PENDING',
        priority=data.get('priority', 'MEDIUM'),
        scheduled_date=datetime.fromisoformat(data['scheduled_date']) if data.get('scheduled_date') else None,
        notes=data.get('notes'),
    )
    db.session.add(task)
    db.session.commit()
    return success(task.to_dict(), 'Housekeeping task created', 201)


@housekeeping_bp.route('/<int:task_id>', methods=['PUT'])
@jwt_required()
def update_task(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    task = HousekeepingTask.query.get_or_404(task_id)

    # Only elevated roles or the assigned worker can update the task
    if user.role not in ELEVATED_ROLES and task.assigned_to != user.id:
        return error('Forbidden', 403)

    data = request.get_json() or {}

    if 'area' in data:
        task.area = data['area']
    if 'task_type' in data:
        task.task_type = data['task_type']
    if 'description' in data:
        task.description = data['description']
    if 'assigned_to' in data:
        task.assigned_to = int(data['assigned_to']) if data['assigned_to'] else None
    if 'priority' in data:
        task.priority = data['priority']
    if 'scheduled_date' in data and data['scheduled_date']:
        task.scheduled_date = datetime.fromisoformat(data['scheduled_date'])
    if 'notes' in data:
        task.notes = data['notes']
    if 'status' in data:
        task.status = data['status']
        if data['status'] == 'COMPLETED':
            task.completed_at = datetime.now(timezone.utc)

    db.session.commit()
    return success(task.to_dict(), 'Task updated')


@housekeeping_bp.route('/<int:task_id>', methods=['DELETE'])
@jwt_required()
def delete_task(task_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)
    if user.role not in ELEVATED_ROLES:
        return error('Forbidden', 403)

    task = HousekeepingTask.query.get_or_404(task_id)
    db.session.delete(task)
    db.session.commit()
    return success(None, 'Task deleted')


@housekeeping_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_stats():
    user = _current_user()
    if not user:
        return error('User not found', 401)

    total = HousekeepingTask.query.count()
    pending = HousekeepingTask.query.filter_by(status='PENDING').count()
    in_progress = HousekeepingTask.query.filter_by(status='IN_PROGRESS').count()
    completed = HousekeepingTask.query.filter_by(status='COMPLETED').count()

    return success({
        'total': total,
        'pending': pending,
        'in_progress': in_progress,
        'completed': completed,
    })
