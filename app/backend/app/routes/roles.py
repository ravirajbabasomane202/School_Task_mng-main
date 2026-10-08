from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.role import Role, sync_roles
from app.utils.response import success, error
from app.utils.decorators import roles_required

roles_bp = Blueprint('roles', __name__)


@roles_bp.route('', methods=['GET'])
@jwt_required()
def list_roles():
    sync_roles()
    roles = Role.query.order_by(Role.name).all()
    # Same contract as GET /api/departments: return the raw array, not the
    # {success, message, data} envelope, so it can be consumed directly with
    # axios.get('/api/roles').then(res => res.data as Role[]).
    return jsonify([r.to_dict() for r in roles]), 200


@roles_bp.route('', methods=['POST'])
@roles_required('CHAIRMAN')
def create_role():
    data = request.get_json()
    name = (data or {}).get('name', '')
    name = name.strip() if isinstance(name, str) else ''
    if not name:
        return error('Name is required', 400)
    if len(name) > 50:
        return error('Role name must be 50 characters or fewer', 400)

    existing = Role.query.filter(db.func.lower(Role.name) == name.lower()).first()
    if existing:
        return error('Role already exists', 409)

    # The key is the role's permanent identity (what users.role stores); the
    # name is only a label that can be renamed later.
    if Role.query.filter(db.func.lower(Role.key) == name.lower()).first():
        return error('Role already exists', 409)
    role = Role(key=name, name=name, is_builtin=False)
    db.session.add(role)
    db.session.commit()
    return success(role.to_dict(), 'Role created', 201)


@roles_bp.route('/<int:role_id>', methods=['PUT'])
@roles_required('CHAIRMAN')
def rename_role(role_id):
    """Rename a role's display label. The key (identity) never changes, so
    users, filters, tables and charts keep working and show the new name."""
    role = db.session.get(Role, role_id)
    if not role:
        return error('Role not found', 404)
    data = request.get_json() or {}
    name = data.get('name', '')
    name = name.strip() if isinstance(name, str) else ''
    if not name:
        return error('Name is required', 400)
    if len(name) > 50:
        return error('Role name must be 50 characters or fewer', 400)
    clash = Role.query.filter(db.func.lower(Role.name) == name.lower(), Role.id != role.id).first()
    if clash:
        return error('Role already exists', 409)
    role.name = name
    db.session.commit()
    return success(role.to_dict(), 'Role renamed')
