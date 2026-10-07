from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.department import Department
from app.utils.response import success, error
from app.utils.decorators import roles_required

departments_bp = Blueprint('departments', __name__)


@departments_bp.route('', methods=['GET'])
@jwt_required()
def list_departments():
    departments = Department.query.order_by(Department.name).all()
    # FIX (Issue 11 / Section 10): UserManagement.tsx calls axios.get('/api/departments')
    # via raw axios and reads `response.data as Department[]`. It expects the raw array,
    # not a wrapped envelope. Using success() returns {success, message, data: [...]} so
    # response.data would be the wrapper object, not the array. Return unwrapped.
    return jsonify([d.to_dict() for d in departments]), 200


@departments_bp.route('', methods=['POST'])
@roles_required('CHAIRMAN')
def create_department():
    data = request.get_json()
    name = (data or {}).get('name', '')
    name = name.strip() if isinstance(name, str) else ''
    if not name:
        return error('Name is required', 400)
    if len(name) > 100:
        return error('Department name must be 100 characters or fewer', 400)
    if Department.query.filter(db.func.lower(Department.name) == name.lower()).first():
        return error('Department already exists', 409)
    dept = Department(name=name, description=data.get('description'))
    db.session.add(dept)
    db.session.commit()
    return success(dept.to_dict(), 'Department created', 201)
