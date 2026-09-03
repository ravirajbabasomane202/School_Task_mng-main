import hashlib
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, current_app
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity
)
from app.extensions import db
from app.models.task import Task
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.login_attempt import LoginAttempt
from app.utils.response import success, error

auth_bp = Blueprint('auth', __name__)


def _rate_limit_settings():
    return (
        current_app.config.get('LOGIN_MAX_ATTEMPTS', 10),
        current_app.config.get('LOGIN_RATE_LIMIT_WINDOW_SECONDS', 900),
    )


def _is_rate_limited(ip: str) -> bool:
    """Check rate limit using DB-backed LoginAttempt records (works across all workers)."""
    max_attempts, window_seconds = _rate_limit_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
    count = LoginAttempt.query.filter(
        LoginAttempt.ip_address == ip,
        LoginAttempt.attempted_at > cutoff
    ).count()
    return count >= max_attempts


def _record_attempt(ip: str):
    """Record a failed login attempt in the database."""
    _, window_seconds = _rate_limit_settings()
    attempt = LoginAttempt(ip_address=ip, attempted_at=datetime.now(timezone.utc))
    db.session.add(attempt)
    db.session.commit()
    # Prune old attempts for this IP to keep the table lean
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds * 2)
    LoginAttempt.query.filter(
        LoginAttempt.ip_address == ip,
        LoginAttempt.attempted_at < cutoff
    ).delete()
    db.session.commit()


def _hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


@auth_bp.route('/login', methods=['POST'])
def login():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    _, window_seconds = _rate_limit_settings()

    if _is_rate_limited(ip):
        retry_minutes = max(1, (window_seconds + 59) // 60)
        return error(f'Too many failed login attempts. Please wait {retry_minutes} minutes and try again.', 429)

    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return error('Email and password are required', 400)

    user = User.query.filter_by(email=data['email'].lower().strip()).first()
    if not user or not user.check_password(data['password']):
        _record_attempt(ip)
        return error('Invalid email or password', 401)
    if not user.is_active:
        return error('Account is deactivated. Contact administrator.', 403)

    user.last_login = datetime.now(timezone.utc)
    db.session.commit()

    # Automatically mark overdue tasks as delayed during login
    Task.mark_overdue_delayed()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    # Store refresh token in DB
    expires_at = datetime.now(timezone.utc) + current_app.config['JWT_REFRESH_TOKEN_EXPIRES']
    rt = RefreshToken(user_id=user.id, token_hash=_hash_token(refresh_token), expires_at=expires_at)
    db.session.add(rt)
    db.session.commit()

    return success({
        'user': user.to_auth_dict(),
        'accessToken': access_token,
        'refreshToken': refresh_token
    }, 'Login successful')


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    data = request.get_json() or {}
    refresh_token = data.get('refreshToken')
    if refresh_token:
        token_hash = _hash_token(refresh_token)
        rt = RefreshToken.query.filter_by(token_hash=token_hash, revoked=False).first()
        if rt:
            rt.revoked = True
            db.session.commit()
    return success(None, 'Logged out successfully')


@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    data = request.get_json()
    if not data or not data.get('refreshToken'):
        return error('Refresh token is required', 400)

    refresh_token = data['refreshToken']
    token_hash = _hash_token(refresh_token)
    rt = RefreshToken.query.filter_by(token_hash=token_hash, revoked=False).first()

    if not rt or not rt.is_valid():
        return error('Invalid or expired refresh token', 401)

    user = db.session.get(User, rt.user_id)
    if not user or not user.is_active:
        return error('User not found or inactive', 401)

    new_access_token = create_access_token(identity=str(user.id))
    return success({'accessToken': new_access_token}, 'Token refreshed')


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return error('User not found', 404)
    return success(user.to_auth_dict())


@auth_bp.route('/school-info', methods=['GET'])
def school_info():
    return success({
        'schoolName': current_app.config.get('SCHOOL_NAME', 'Adhira International School'),
        'chairmanName': current_app.config.get('CHAIRMAN_NAME', 'Navnath Dhawale'),
        'appName': current_app.config.get('APP_NAME', 'EduTask Pro')
    }, 'School info retrieved')


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    data = request.get_json()

    if not data:
        return error('Request body required', 400)

    current_pw = data.get('currentPassword')
    new_pw = data.get('newPassword')
    confirm_pw = data.get('confirmPassword')

    if not all([current_pw, new_pw, confirm_pw]):
        return error('All password fields are required', 400)
    if not user.check_password(current_pw):
        return error('Current password is incorrect', 400)
    if new_pw != confirm_pw:
        return error('New passwords do not match', 400)
    if len(new_pw) < 8:
        return error('Password must be at least 8 characters', 400)

    user.set_password(new_pw)
    db.session.commit()
    return success(None, 'Password changed successfully')
