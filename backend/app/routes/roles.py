from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.role import Role
from app.utils.response import success, error
from app.utils.decorators import roles_required

roles_bp = Blueprint('roles', __name__)


@roles_bp.route('', methods=['GET'])
@jwt_required()
def list_roles():
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

    role = Role(name=name)
    db.session.add(role)
    db.session.commit()
    return success(role.to_dict(), 'Role created', 201)
