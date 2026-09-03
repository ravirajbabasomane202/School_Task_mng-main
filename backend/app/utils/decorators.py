from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from app.extensions import db
from app.models.user import User


def get_current_user_id():
    """Get the current user ID from JWT token as an integer."""
    return int(get_jwt_identity())


def roles_required(*roles):
    """Restrict endpoint to one or more roles."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_id = get_jwt_identity()
            user = db.session.get(User, int(user_id))
            if not user or not user.is_active:
                return jsonify({'success': False, 'message': 'User not found or inactive', 'data': None}), 401
            if user.role not in roles:
                return jsonify({'success': False, 'message': 'Forbidden: insufficient role', 'data': None}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def elevated_only(fn):
    """Allow CHAIRMAN and DIRECTOR."""
    return roles_required('CHAIRMAN', 'DIRECTOR')(fn)
