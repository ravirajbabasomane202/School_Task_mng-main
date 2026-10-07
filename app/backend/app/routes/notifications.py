from flask import Blueprint
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.notification import Notification
from app.utils.response import success, error

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('', methods=['GET'])
@jwt_required()
def list_notifications():
    user_id = get_jwt_identity()
    notifications = (Notification.query
                     .filter_by(user_id=user_id)
                     .order_by(Notification.created_at.desc())
                     .all())
    return success([n.to_dict() for n in notifications])


@notifications_bp.route('/read-all', methods=['PUT'])
@jwt_required()
def mark_all_read():
    user_id = get_jwt_identity()
    Notification.query.filter_by(user_id=user_id, is_read=False).update({'is_read': True})
    db.session.commit()
    return success(None, 'All notifications marked as read')


@notifications_bp.route('/<int:notif_id>/read', methods=['PUT'])
@jwt_required()
def mark_read(notif_id):
    user_id = get_jwt_identity()
    notif = Notification.query.get_or_404(notif_id)
    if notif.user_id != user_id:
        return error('Forbidden', 403)
    notif.is_read = True
    db.session.commit()
    return success(notif.to_dict(), 'Notification marked as read')
