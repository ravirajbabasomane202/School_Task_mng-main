from datetime import datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.user import User
from app.utils.response import success, error
from app.utils.decorators import roles_required

po_bp = Blueprint('purchase_orders', __name__)


@po_bp.route('', methods=['GET'])
@jwt_required()
def list_purchase_orders():
    query = PurchaseOrder.query
    status = request.args.get('status')
    department_id = request.args.get('department_id')
    
    if status:
        query = query.filter_by(status=status)
    if department_id:
        query = query.filter_by(department_id=department_id)
    
    return success([po.to_dict() for po in query.order_by(PurchaseOrder.created_at.desc()).all()])


@po_bp.route('/<int:po_id>', methods=['GET'])
@jwt_required()
def get_purchase_order(po_id: int):
    po = PurchaseOrder.query.get_or_404(po_id)
    return success({**po.to_dict(), 'items': [i.to_dict() for i in po.items]})


@po_bp.route('/stats', methods=['GET'])
@jwt_required()
def po_stats():
    total = PurchaseOrder.query.count()
    pending = PurchaseOrder.query.filter_by(status='PENDING').count()
    approved = PurchaseOrder.query.filter_by(status='APPROVED').count()
    rejected = PurchaseOrder.query.filter_by(status='REJECTED').count()
    ordered = PurchaseOrder.query.filter_by(status='ORDERED').count()
    draft = PurchaseOrder.query.filter_by(status='DRAFT').count()
    
    return success({
        'total': total,
        'pending': pending,
        'approved': approved,
        'rejected': rejected,
        'ordered': ordered,
        'draft': draft,
    })


@po_bp.route('', methods=['POST'])
@roles_required('PURCHASE', 'CHAIRMAN')
def create_purchase_order():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    required = ['title', 'vendor_name', 'total_amount']
    for field in required:
        if data.get(field) is None:
            return error(f'{field} is required', 400)

    # Resolve department_id: use submitted value, fall back to creator's own department
    dept_id = data.get('department_id')
    if not dept_id:
        creator = db.session.get(User, user_id)
        dept_id = creator.department_id if creator else None
    if not dept_id:
        return error('department_id is required (user has no department assigned)', 400)
    
    items_data = data.get('items', [])

    # Compute authoritative total from line items; ignore client-supplied total_amount
    computed_total = sum(
        float(item.get('quantity', 0)) * float(item.get('unit_price', 0))
        for item in items_data
    )
    if not items_data:
        # Allow header-only POs but use the submitted amount (e.g. blanket POs)
        try:
            computed_total = float(data['total_amount'])
        except (ValueError, TypeError):
            return error('total_amount must be a number', 400)

    po = PurchaseOrder(
        title=data['title'],
        vendor_name=data['vendor_name'],
        total_amount=computed_total,
        department_id=dept_id,
        notes=data.get('notes'),
        status='DRAFT',
        created_by=user_id,
    )
    db.session.add(po)
    db.session.flush()

    for item in items_data:
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            item_name=item['item_name'],
            quantity=item['quantity'],
            unit_price=item['unit_price'],
            total_price=float(item['quantity']) * float(item['unit_price']),
        )
        db.session.add(po_item)

    db.session.commit()
    return success(po.to_dict(), 'Purchase order created', 201)


@po_bp.route('/<int:po_id>/submit', methods=['PUT'])
@roles_required('PURCHASE', 'CHAIRMAN')
def submit_purchase_order(po_id: int):
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status != 'DRAFT':
        return error('Only DRAFT orders can be submitted', 400)
    
    po.status = 'PENDING'
    db.session.commit()
    return success(po.to_dict(), 'Submitted for approval')


@po_bp.route('/<int:po_id>/finance-process', methods=['PUT'])
@roles_required('FINANCE', 'CHAIRMAN')
def finance_process(po_id: int):
    po = PurchaseOrder.query.get_or_404(po_id)
    data = request.get_json() or {}
    status = data.get('status')
    
    if status not in ('APPROVED', 'REJECTED'):
        return error('status must be APPROVED or REJECTED', 400)
    
    if po.status != 'PENDING':
        return error('Order must be PENDING for finance review', 400)
    
    po.status = status
    po.processed_at = datetime.now(timezone.utc)
    db.session.commit()
    return success(po.to_dict(), f'Purchase order {status.lower()}')


@po_bp.route('/<int:po_id>/mark-ordered', methods=['PUT'])
@roles_required('PURCHASE', 'CHAIRMAN')
def mark_ordered(po_id: int):
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status != 'APPROVED':
        return error('Only APPROVED orders can be marked as ordered', 400)
    
    po.status = 'ORDERED'
    po.processed_at = datetime.now(timezone.utc)
    db.session.commit()
    return success(po.to_dict(), 'Marked as ordered')