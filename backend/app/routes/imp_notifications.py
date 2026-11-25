from datetime import date

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.imp_notification import (
    PRIORITIES, RECURRENCES, STATUSES, ImpNotification,
)
from app.models.user import ROLES, User
from app.services import imp_notifications as service
from app.utils.permissions import CHAIRMAN_LEVEL_ROLES
from app.utils.response import error, success
from app.utils.timezone import school_today

imp_notifications_bp = Blueprint('imp_notifications', __name__)

# Create / edit / assign / delete / (de)activate. Same group that manages
# registers, announcements and academic events.
MANAGER_ROLES = CHAIRMAN_LEVEL_ROLES


def _active_user():
    try:
        user = db.session.get(User, int(get_jwt_identity()))
    except (TypeError, ValueError):
        return None
    return user if user and user.is_active else None


def _is_manager(user):
    return user.role in MANAGER_ROLES


def _can_view(user, notification):
    return _is_manager(user) or notification.is_assigned_to(user)


def _parse_date(value, label):
    if isinstance(value, date):
        return value, None
    if not isinstance(value, str):
        return None, f'{label} must be a valid YYYY-MM-DD date'
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None, f'{label} must be a valid YYYY-MM-DD date'
    if parsed.isoformat() != value:
        return None, f'{label} must be a valid YYYY-MM-DD date'
    return parsed, None


def _validated_fields(data, existing=None):
    """Validate a create / update payload into model-ready values."""
    values = {}

    title = data.get('title', existing.title if existing else None)
    if not isinstance(title, str) or not title.strip():
        return None, 'Notification title is required'
    if len(title.strip()) > 255:
        return None, 'Title must be 255 characters or fewer'
    values['title'] = title.strip()

    description = data.get('description', existing.description if existing else None)
    if description is not None and not isinstance(description, str):
        return None, 'Description must be text'
    description = (description or '').strip()
    if len(description) > 5000:
        return None, 'Description must be 5000 characters or fewer'
    values['description'] = description or None

    raw_due = data.get('due_date', existing.due_date.isoformat() if existing else None)
    if raw_due in (None, ''):
        return None, 'Due date is required'
    due, err = _parse_date(raw_due, 'Due date')
    if err:
        return None, err
    values['due_date'] = due

    raw_start = data.get('start_date', existing.start_date.isoformat() if existing else None)
    if raw_start in (None, ''):
        start = due
    else:
        start, err = _parse_date(raw_start, 'Notification start date')
        if err:
            return None, err
    if start > due:
        return None, 'Notification start date cannot be after the due date'
    values['start_date'] = start

    recurrence = str(data.get('recurrence', existing.recurrence if existing else 'ONE_TIME') or '').upper()
    if recurrence not in RECURRENCES:
        return None, f"Recurrence must be one of {', '.join(RECURRENCES)}"
    values['recurrence'] = recurrence

    priority = str(data.get('priority', existing.priority if existing else 'MEDIUM') or '').upper()
    if priority not in PRIORITIES:
        return None, f"Priority must be one of {', '.join(PRIORITIES)}"
    values['priority'] = priority

    roles = data.get('assigned_roles', list(existing.assigned_roles or []) if existing else [])
    users = data.get('assigned_user_ids', list(existing.assigned_user_ids or []) if existing else [])
    if roles is None:
        roles = []
    if users is None:
        users = []
    if not isinstance(roles, list) or any(not isinstance(r, str) or r not in ROLES for r in roles):
        return None, 'Assigned roles must be a list of valid roles'
    try:
        users = [int(u) for u in users] if isinstance(users, list) else None
    except (TypeError, ValueError):
        users = None
    if users is None:
        return None, 'Assigned users must be a list of user IDs'
    users = list(dict.fromkeys(users))
    if users:
        found = {uid for (uid,) in db.session.query(User.id).filter(User.id.in_(users), User.is_active.is_(True))}
        if found != set(users):
            return None, 'One or more assigned users are invalid or inactive'
    if not roles and not users:
        return None, 'Assign the notification to at least one user or role'
    values['assigned_roles'] = list(dict.fromkeys(roles))
    values['assigned_user_ids'] = users

    is_active = data.get('is_active', existing.is_active if existing else True)
    if not isinstance(is_active, bool):
        return None, 'is_active must be true or false'
    values['is_active'] = is_active
    return values, None


def _snapshot(notification, user, include_history=False):
    return notification.to_dict(school_today(), user=user, include_history=include_history)


@imp_notifications_bp.route('/options', methods=['GET'])
@jwt_required()
def assignment_options():
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    if not _is_manager(user):
        return error('Forbidden: insufficient role', 403)
    users = User.query.filter(User.is_active.is_(True)).order_by(User.name.asc()).all()
    return success({
        'users': [{'id': u.id, 'name': u.name, 'role': u.role, 'head_type': u.head_type} for u in users],
        'roles': list(ROLES),
        'recurrences': list(RECURRENCES),
        'priorities': list(PRIORITIES),
        'statuses': list(STATUSES),
    })


@imp_notifications_bp.route('', methods=['GET'])
@jwt_required()
def list_imp_notifications():
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)

    query = ImpNotification.query
    search = (request.args.get('search') or '').strip()
    if search:
        query = query.filter(ImpNotification.title.ilike(f'%{search}%'))
    recurrence = (request.args.get('recurrence') or '').upper()
    if recurrence:
        query = query.filter(ImpNotification.recurrence == recurrence)
    priority = (request.args.get('priority') or '').upper()
    if priority:
        query = query.filter(ImpNotification.priority == priority)
    active = request.args.get('active')
    if active in ('true', 'false'):
        query = query.filter(ImpNotification.is_active.is_(active == 'true'))

    items = [n for n in query.order_by(ImpNotification.title.asc()).all() if _can_view(user, n)]
    rows = [_snapshot(n, user) for n in items]
    status = (request.args.get('status') or '').upper()
    if status:
        rows = [r for r in rows if r['status'] == status]
    rows.sort(key=lambda r: (r['current_due_date'], r['title'].lower()))
    return success(rows)


@imp_notifications_bp.route('/<int:notification_id>', methods=['GET'])
@jwt_required()
def get_imp_notification(notification_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    notification = db.session.get(ImpNotification, notification_id)
    if not notification:
        return error('Notification not found', 404)
    if not _can_view(user, notification):
        return error('Forbidden: this notification is not assigned to you', 403)
    return success(_snapshot(notification, user, include_history=True))


@imp_notifications_bp.route('', methods=['POST'])
@jwt_required()
def create_imp_notification():
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    if not _is_manager(user):
        return error('Forbidden: insufficient role', 403)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error('A valid notification payload is required', 400)
    values, validation_error = _validated_fields(data)
    if validation_error:
        return error(validation_error, 400)
    status = str(data.get('status') or 'PENDING').upper()
    if status not in STATUSES:
        return error(f"Status must be one of {', '.join(STATUSES)}", 400)

    notification = ImpNotification(**values, created_by=user.id)
    try:
        db.session.add(notification)
        db.session.flush()
        service.start_first_cycle(notification)
        db.session.flush()
        if status != 'PENDING':
            service.set_cycle_status(notification, status, user)
        db.session.commit()
    except service.ImpNotificationError as exc:
        db.session.rollback()
        return error(exc.message, exc.status_code)
    except SQLAlchemyError:
        db.session.rollback()
        return error('Unable to create notification', 500)
    return success(_snapshot(notification, user, include_history=True), 'Notification created', 201)


@imp_notifications_bp.route('/<int:notification_id>', methods=['PUT'])
@jwt_required()
def update_imp_notification(notification_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    if not _is_manager(user):
        return error('Forbidden: insufficient role', 403)
    notification = db.session.get(ImpNotification, notification_id)
    if not notification:
        return error('Notification not found', 404)

    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return error('No notification changes were provided', 400)
    values, validation_error = _validated_fields(data, notification)
    if validation_error:
        return error(validation_error, 400)

    schedule_changed = any(
        values[f] != getattr(notification, f) for f in ('due_date', 'start_date', 'recurrence')
    )
    try:
        for field, value in values.items():
            setattr(notification, field, value)
        if schedule_changed:
            service.apply_schedule_change(notification)
        if 'status' in data:
            new_status = str(data['status'] or '').upper()
            if new_status not in STATUSES:
                db.session.rollback()
                return error(f"Status must be one of {', '.join(STATUSES)}", 400)
            current = notification.current_cycle()
            if current is not None and new_status != current.status:
                service.set_cycle_status(notification, new_status, user)
        db.session.commit()
    except service.ImpNotificationError as exc:
        db.session.rollback()
        return error(exc.message, exc.status_code)
    except SQLAlchemyError:
        db.session.rollback()
        return error('Unable to update notification', 500)
    return success(_snapshot(notification, user, include_history=True), 'Notification updated')


@imp_notifications_bp.route('/<int:notification_id>/status', methods=['PATCH'])
@jwt_required()
def update_imp_notification_status(notification_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    notification = db.session.get(ImpNotification, notification_id, with_for_update=True)
    if not notification:
        return error('Notification not found', 404)
    # Managers, and users this notification is assigned to, may progress it.
    if not _can_view(user, notification):
        return error('Forbidden: this notification is not assigned to you', 403)

    data = request.get_json(silent=True) or {}
    new_status = str(data.get('status') or '').upper()
    if new_status not in STATUSES:
        return error(f"Status must be one of {', '.join(STATUSES)}", 400)
    try:
        service.set_cycle_status(notification, new_status, user)
        db.session.commit()
    except service.ImpNotificationError as exc:
        db.session.rollback()
        return error(exc.message, exc.status_code)
    message = 'Notification marked as Done' if new_status == 'DONE' else 'Notification status updated'
    return success(_snapshot(notification, user, include_history=True), message)


@imp_notifications_bp.route('/<int:notification_id>/active', methods=['PATCH'])
@jwt_required()
def set_imp_notification_active(notification_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    if not _is_manager(user):
        return error('Forbidden: insufficient role', 403)
    notification = db.session.get(ImpNotification, notification_id)
    if not notification:
        return error('Notification not found', 404)
    data = request.get_json(silent=True) or {}
    if not isinstance(data.get('is_active'), bool):
        return error('is_active must be true or false', 400)
    notification.is_active = data['is_active']
    db.session.commit()
    return success(
        _snapshot(notification, user, include_history=True),
        'Notification activated' if notification.is_active else 'Notification deactivated',
    )


@imp_notifications_bp.route('/<int:notification_id>', methods=['DELETE'])
@jwt_required()
def delete_imp_notification(notification_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    if not _is_manager(user):
        return error('Forbidden: insufficient role', 403)
    notification = db.session.get(ImpNotification, notification_id)
    if not notification:
        return error('Notification not found', 404)
    # Inbox reminders point at this row; remove them with it.
    from app.models.notification import Notification
    Notification.query.filter_by(imp_notification_id=notification.id).delete(synchronize_session=False)
    db.session.delete(notification)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return error('Unable to delete notification', 500)
    return success(None, 'Notification deleted')


@imp_notifications_bp.route('/run-reminders', methods=['POST'])
@jwt_required()
def run_reminders_now():
    """Manual trigger of the same idempotent job the scheduler runs."""
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    if not _is_manager(user):
        return error('Forbidden: insufficient role', 403)
    sent = service.run_imp_reminders()
    return success({'sent': sent}, f'{sent} reminder(s) sent')
