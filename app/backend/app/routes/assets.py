from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.asset import Asset
from app.models.user import User
from app.utils.response import success, error
from app.utils.decorators import roles_required

assets_bp = Blueprint('assets', __name__)

IT_ROLES = ('IT', 'CHAIRMAN', 'DIRECTOR')


@assets_bp.route('', methods=['GET'])
@jwt_required()
def list_assets():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    query = Asset.query
    category = request.args.get('category')
    status = request.args.get('status')
    department_id = request.args.get('department_id')

    if category:
        query = query.filter_by(category=category)
    if status:
        query = query.filter_by(status=status)

    if user.role in IT_ROLES:
        # IT / elevated roles can filter by any dept or see all
        if department_id:
            query = query.filter_by(department_id=int(department_id))
    else:
        # Non-IT users only see assets assigned to their own department
        if user.department_id:
            query = query.filter_by(department_id=user.department_id)
        else:
            return success([])

    return success([a.to_dict() for a in query.order_by(Asset.created_at.desc()).all()])


@assets_bp.route('/stats', methods=['GET'])
@jwt_required()
def asset_stats():
    from sqlalchemy import func
    total = Asset.query.count()

    # One query per dimension using GROUP BY instead of 9 separate COUNTs
    by_category = {row[0]: row[1] for row in db.session.query(Asset.category, func.count()).group_by(Asset.category).all()}
    by_condition = {row[0]: row[1] for row in db.session.query(Asset.condition, func.count()).group_by(Asset.condition).all()}
    by_status    = {row[0]: row[1] for row in db.session.query(Asset.status,    func.count()).group_by(Asset.status).all()}

    # Fill zeros for any bucket with no rows
    for cat in ('HARDWARE', 'SOFTWARE', 'FURNITURE', 'VEHICLE'):
        by_category.setdefault(cat, 0)
    for cond in ('EXCELLENT', 'GOOD', 'FAIR', 'POOR'):
        by_condition.setdefault(cond, 0)
    for stat in ('ACTIVE', 'MAINTENANCE', 'DISPOSED'):
        by_status.setdefault(stat, 0)

    return success({
        'total': total,
        'by_category': by_category,
        'by_condition': by_condition,
        'by_status': by_status,
        'under_maintenance': by_status.get('MAINTENANCE', 0),
    })


@assets_bp.route('', methods=['POST'])
@roles_required('IT', 'CHAIRMAN')
def create_asset():
    data = request.get_json() or {}
    required = ['name', 'category']
    for field in required:
        if not data.get(field):
            return error(f'{field} is required', 400)
    
    asset = Asset(
        name=data['name'],
        category=data['category'],
        serial_number=data.get('serial_number'),
        assigned_to=data.get('assigned_to'),
        department_id=data.get('department_id'),
        purchase_date=data.get('purchase_date'),
        purchase_value=data.get('purchase_value'),
        condition=data.get('condition', 'GOOD'),
        status=data.get('status', 'ACTIVE'),
    )
    db.session.add(asset)
    db.session.commit()
    return success(asset.to_dict(), 'Asset created', 201)


@assets_bp.route('/<int:asset_id>', methods=['PUT'])
@roles_required('IT', 'CHAIRMAN')
def update_asset(asset_id: int):
    asset = Asset.query.get_or_404(asset_id)
    data = request.get_json() or {}
    
    if 'name' in data:
        asset.name = data['name']
    if 'category' in data:
        asset.category = data['category']
    if 'serial_number' in data:
        asset.serial_number = data['serial_number']
    if 'assigned_to' in data:
        asset.assigned_to = data['assigned_to']
    if 'department_id' in data:
        asset.department_id = data['department_id']
    if 'purchase_date' in data:
        asset.purchase_date = data['purchase_date']
    if 'purchase_value' in data:
        asset.purchase_value = data['purchase_value']
    if 'condition' in data:
        asset.condition = data['condition']
    if 'status' in data:
        asset.status = data['status']
    
    db.session.commit()
    return success(asset.to_dict(), 'Asset updated')


@assets_bp.route('/<int:asset_id>', methods=['DELETE'])
@roles_required('IT', 'CHAIRMAN')
def delete_asset(asset_id: int):
    asset = Asset.query.get_or_404(asset_id)
    db.session.delete(asset)
    db.session.commit()
    return success(None, 'Asset deleted')