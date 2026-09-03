from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User, ROLES
from app.models.role import Role
from app.utils.response import success, error
from app.utils.decorators import roles_required

users_bp = Blueprint('users', __name__)


def is_valid_role(name):
    """A role is valid if it's one of the built-in ROLES (which drive
    permissions/routing) or a custom role added via the roles catalog
    (the "Other" option on the Add/Edit User forms)."""
    if not name:
        return False
    if name in ROLES:
        return True
    return Role.query.filter(db.func.lower(Role.name) == name.lower()).first() is not None


@users_bp.route('', methods=['GET'])
@roles_required('CHAIRMAN')
def list_users():
    query = User.query
    dept_id = request.args.get('department_id')
    role = request.args.get('role')
    if dept_id:
        query = query.filter_by(department_id=int(dept_id))
    if role:
        query = query.filter_by(role=role)
    users = query.order_by(User.name).all()
    # Include nested department object (needed by AnnouncementsPage via userService.getAllUsers())
    # userService reads response.data.data — serve wrapped format.
    # UserManagement list query uses axios.get('/api/users') and reads response.data as User[]:
    # that page's queryFn does `return response.data as User[]` — this will be the wrapper
    # object, not the array. That is a frontend read bug; the correct pattern is .data.data.
    # We serve wrapped here to satisfy the majority pattern (userService / api.ts callers).
    return success([u.to_dict(include_department=True) for u in users])


@users_bp.route('/<int:user_id>', methods=['GET'])
@roles_required('CHAIRMAN')
def get_user(user_id):
    user = User.query.get_or_404(user_id)
    return success(user.to_dict())


@users_bp.route('', methods=['POST'])
@roles_required('CHAIRMAN')
def create_user():
    data = request.get_json()
    if not data:
        return error('Request body required', 400)

    required = ['name', 'email', 'password', 'role']
    for field in required:
        if not data.get(field):
            return error(f'{field} is required', 400)

    if not is_valid_role(data['role']):
        return error('Invalid role', 400)

    if User.query.filter_by(email=data['email'].lower().strip()).first():
        return error('Email already registered', 409)

    if len(data['password']) < 8:
        return error('Password must be at least 8 characters', 400)

    user = User(
        name=data['name'].strip(),
        email=data['email'].lower().strip(),
        role=data['role'],
        department_id=data.get('department_id')
    )
    user.set_password(data['password'])
    db.session.add(user)
    db.session.commit()

    # FIX (Issues 1 & 6): UserManagement.addUserMutation uses raw axios.post('/api/users')
    # and does `return response.data` expecting a User object directly — not a wrapped envelope.
    # Return the raw user dict so response.data IS the User.
    return jsonify(user.to_dict()), 201


@users_bp.route('/<int:user_id>', methods=['PUT'])
@roles_required('CHAIRMAN')
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json()
    if not data:
        return error('Request body required', 400)

    if 'name' in data:
        user.name = data['name'].strip()
    if 'email' in data:
        existing = User.query.filter_by(email=data['email'].lower()).first()
        if existing and existing.id != user_id:
            return error('Email already in use', 409)
        user.email = data['email'].lower().strip()
    if 'role' in data:
        if not is_valid_role(data['role']):
            return error('Invalid role', 400)
        if data['role'] == 'CHAIRMAN':
            return error('Cannot assign CHAIRMAN role via this endpoint', 403)
        user.role = data['role']
    if 'department_id' in data:
        user.department_id = data['department_id']
    if 'password' in data and data['password']:
        user.set_password(data['password'])

    db.session.commit()

    # FIX (Issue 6): UserManagement.editUserMutation uses raw axios.put('/api/users/:id')
    # and does `return response.data` expecting a User object directly — not a wrapped envelope.
    # Return the raw user dict so response.data IS the User.
    return jsonify(user.to_dict()), 200


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@roles_required('CHAIRMAN')
def deactivate_user(user_id):
    current_user_id = get_jwt_identity()
    if user_id == current_user_id:
        return error('Cannot deactivate your own account', 400)
    user = User.query.get_or_404(user_id)
    user.is_active = False
    db.session.commit()
    return success(None, 'User deactivated')
