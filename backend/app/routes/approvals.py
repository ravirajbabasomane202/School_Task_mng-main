from datetime import datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.approval import Approval
from app.utils.response import success, error
from app.utils.decorators import roles_required

approvals_bp = Blueprint('approvals', __name__)

ALLOWED_TYPES = ('BUDGET', 'PURCHASE', 'POLICY', 'EVENT', 'SALARY', 'LEAVE', 'PROPERTY', 'IT', 'TRANSPORT')


@approvals_bp.route('', methods=['GET'])
@jwt_required()
def list_approvals():
    from app.models.user import User
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    query = Approval.query
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    # Non-elevated users can only see their own approval requests
    if not user or user.role not in ('CHAIRMAN', 'DIRECTOR'):
        query = query.filter_by(requested_by=user_id)
    approvals = query.order_by(Approval.created_at.desc()).all()
    return success([a.to_dict() for a in approvals])


@approvals_bp.route('/<int:approval_id>', methods=['GET'])
@jwt_required()
def get_approval(approval_id):
    from app.models.user import User
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    approval = Approval.query.get_or_404(approval_id)
    # Non-elevated users can only view their own approval requests
    if not user or user.role not in ('CHAIRMAN', 'DIRECTOR'):
        if approval.requested_by != user_id:
            return error('Forbidden', 403)
    return success(approval.to_dict())


@approvals_bp.route('', methods=['POST'])
@jwt_required()
def create_approval():
    user_id = get_jwt_identity()
    data = request.get_json()
    if not data:
        return error('Request body required', 400)
    if not data.get('title'):
        return error('Title is required', 400)
    if data.get('type') not in ALLOWED_TYPES:
        return error(f"Type must be one of: {', '.join(ALLOWED_TYPES)}", 400)

    approval = Approval(
        type=data['type'],
        title=data['title'],
        details=data.get('details'),
        amount=data.get('amount'),
        status='PENDING',
        requested_by=user_id
    )
    db.session.add(approval)
    db.session.commit()
    return success(approval.to_dict(), 'Approval request submitted', 201)


@approvals_bp.route('/<int:approval_id>/process', methods=['PUT'])
@roles_required('CHAIRMAN')
def process_approval(approval_id):
    approval = Approval.query.get_or_404(approval_id)
    data = request.get_json()
    if not data or not data.get('status'):
        return error('Status is required', 400)
    if data['status'] not in ('APPROVED', 'REJECTED'):
        return error('Status must be APPROVED or REJECTED', 400)
    if approval.status != 'PENDING':
        return error('Approval already processed', 400)

    user_id = get_jwt_identity()
    approval.status = data['status']
    approval.approved_by = user_id
    approval.processed_at = datetime.now(timezone.utc)
    db.session.commit()
    return success(approval.to_dict(), f'Approval {data["status"].lower()}')


@approvals_bp.route('/<int:approval_id>/approve', methods=['PUT'])
@roles_required('CHAIRMAN')
def approve(approval_id):
    approval = Approval.query.get_or_404(approval_id)
    if approval.status != 'PENDING':
        return error('Already processed', 400)
    user_id = get_jwt_identity()
    approval.status = 'APPROVED'
    approval.approved_by = user_id
    approval.processed_at = datetime.now(timezone.utc)
    db.session.commit()
    return success(approval.to_dict(), 'Approved')


@approvals_bp.route('/<int:approval_id>/reject', methods=['PUT'])
@roles_required('CHAIRMAN')
def reject(approval_id):
    approval = Approval.query.get_or_404(approval_id)
    if approval.status != 'PENDING':
        return error('Already processed', 400)
    user_id = get_jwt_identity()
    approval.status = 'REJECTED'
    approval.approved_by = user_id
    approval.processed_at = datetime.now(timezone.utc)
    db.session.commit()
    return success(approval.to_dict(), 'Rejected')
