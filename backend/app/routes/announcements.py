from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.notification import Announcement, Notification
from app.models.user import User
from app.utils.response import success, error
from app.utils.decorators import roles_required
from app.sockets.emitter import emit_announcement, emit_notification

announcements_bp = Blueprint('announcements', __name__)


@announcements_bp.route('', methods=['GET'])
@jwt_required()
def list_announcements():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    query = Announcement.query

    # Filter: ALL announcements + announcements for user's dept
    if user.department_id:
        from sqlalchemy import or_
        query = query.filter(
            or_(Announcement.target == 'ALL',
                Announcement.department_id == user.department_id)
        )
    # CHAIRMAN / DIRECTOR see all
    announcements = query.order_by(Announcement.created_at.desc()).all()
    return success([a.to_dict() for a in announcements])


@announcements_bp.route('/<int:ann_id>', methods=['GET'])
@jwt_required()
def get_announcement(ann_id):
    ann = Announcement.query.get_or_404(ann_id)
    return success(ann.to_dict())


@announcements_bp.route('', methods=['POST'])
@roles_required('CHAIRMAN', 'DIRECTOR')
def create_announcement():
    user_id = get_jwt_identity()
    data = request.get_json()
    if not data or not data.get('message'):
        return error('Message is required', 400)

    target = data.get('target', 'ALL')
    dept_id = data.get('department_id') if target == 'DEPARTMENT' else None

    if target == 'DEPARTMENT' and not dept_id:
        return error('department_id required when target is DEPARTMENT', 400)

    ann = Announcement(
        created_by=user_id,
        target=target,
        message=data['message'],
        department_id=dept_id
    )
    db.session.add(ann)
    db.session.flush()

    # Create notifications for target users
    if target == 'ALL':
        recipients = User.query.filter_by(is_active=True).all()
    else:
        recipients = User.query.filter_by(department_id=dept_id, is_active=True).all()

    notifications = []
    for recipient in recipients:
        if recipient.id == user_id:
            continue
        notif = Notification(
            user_id=recipient.id,
            type='ANNOUNCEMENT',
            message=data['message'][:200],
            task_id=None
        )
        db.session.add(notif)
        notifications.append((recipient.id, notif))

    db.session.commit()

    # Emit real-time events
    emit_announcement(ann.to_dict(), target=target, dept_id=dept_id)
    for recipient_id, notif in notifications:
        emit_notification(recipient_id, notif.to_dict())

    return success(ann.to_dict(), 'Announcement broadcast', 201)
