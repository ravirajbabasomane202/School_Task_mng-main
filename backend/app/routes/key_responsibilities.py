from flask import Blueprint
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.key_responsibility_templates import KEY_RESPONSIBILITY_TEMPLATES
from app.models.key_responsibility import UserKeyResponsibility
from app.models.user import User
from app.utils.decorators import roles_required
from app.utils.permissions import CHAIRMAN_LEVEL_ROLES
from app.utils.response import error, success

key_responsibilities_bp = Blueprint('key_responsibilities', __name__)

MAX_ITEMS = 100
MAX_ITEM_LENGTH = 2000
MAX_SUMMARY_LENGTH = 2000


def parse_responsibilities(value):
    """Validate a list of responsibility strings.

    Returns ``(items, None)`` or ``(None, message)``. Blank rows are dropped
    (the UI keeps an empty input open for typing) and order is preserved.
    """
    if value is None:
        return [], None
    if not isinstance(value, list):
        return None, 'key_responsibilities must be a list of text values'
    items = []
    for entry in value:
        if isinstance(entry, dict):  # tolerate {description: ...} objects from older clients
            entry = entry.get('description')
        if entry is None:
            continue
        if not isinstance(entry, str):
            return None, 'Each key responsibility must be text'
        text = entry.strip()
        if not text:
            continue
        if len(text) > MAX_ITEM_LENGTH:
            return None, f'Each key responsibility must be {MAX_ITEM_LENGTH} characters or fewer'
        items.append(text)
    if len(items) > MAX_ITEMS:
        return None, f'A user can have at most {MAX_ITEMS} key responsibilities'
    return items, None


def parse_summary(value):
    if value is None:
        return None, None
    if not isinstance(value, str):
        return None, 'Responsibility summary must be text'
    text = value.strip()
    if len(text) > MAX_SUMMARY_LENGTH:
        return None, f'Responsibility summary must be {MAX_SUMMARY_LENGTH} characters or fewer'
    return (text or None), None


def replace_responsibilities(user, items):
    """Replace ALL of a user's responsibilities with ``items`` (ordered)."""
    user.key_responsibilities.clear()
    db.session.flush()
    for position, text in enumerate(items, start=1):
        user.key_responsibilities.append(UserKeyResponsibility(description=text, sort_order=position))


def _payload(user):
    return {
        'user_id': user.id,
        'name': user.name,
        'head_type': user.head_type,
        'role': user.role,
        'summary': user.responsibility_summary,
        'items': [item.to_dict() for item in user.key_responsibilities],
    }


@key_responsibilities_bp.route('/me', methods=['GET'])
@jwt_required()
def my_responsibilities():
    """The caller's OWN responsibilities. The user id always comes from the JWT,
    never from the request, so one user can never read another's here."""
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return error('User not found or inactive', 401)
    return success(_payload(user))


@key_responsibilities_bp.route('/templates', methods=['GET'])
@roles_required(*CHAIRMAN_LEVEL_ROLES)
def list_templates():
    return success({
        role: {'title': t['title'], 'summary': t['summary'], 'items': list(t['items'])}
        for role, t in KEY_RESPONSIBILITY_TEMPLATES.items()
    })


@key_responsibilities_bp.route('/users/<int:user_id>', methods=['GET'])
@jwt_required()
def user_responsibilities(user_id):
    caller = db.session.get(User, int(get_jwt_identity()))
    if not caller or not caller.is_active:
        return error('User not found or inactive', 401)
    if caller.id != user_id and caller.role not in CHAIRMAN_LEVEL_ROLES:
        return error('Forbidden: insufficient role', 403)
    target = db.session.get(User, user_id)
    if not target:
        return error('User not found', 404)
    return success(_payload(target))
