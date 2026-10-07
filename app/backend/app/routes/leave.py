from datetime import datetime, timezone, date as date_type
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.leave_request import LeaveRequest, ResumptionRequest
from app.models.user import User
from app.utils.response import success, error

leave_bp = Blueprint('leave', __name__)

ALLOWED_LEAVE_TYPES = ('SICK', 'CASUAL', 'ANNUAL', 'OTHER')


def _parse_date(val):
    if not val:
        return None
    try:
        return datetime.strptime(val, '%Y-%m-%d').date()
    except ValueError:
        return None


# ─── Leave Requests ──────────────────────────────────────────────────────────

@leave_bp.route('', methods=['GET'])
@jwt_required()
def list_leave():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('Not found', 404)

    if user.role in ('CHAIRMAN', 'DIRECTOR', 'HR'):
        query = LeaveRequest.query
    else:
        query = LeaveRequest.query.filter_by(user_id=user_id)

    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)

    records = query.order_by(LeaveRequest.created_at.desc()).all()
    return success([r.to_dict() for r in records])


@leave_bp.route('', methods=['POST'])
@jwt_required()
def create_leave():
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    if not data.get('leave_type') or data['leave_type'] not in ALLOWED_LEAVE_TYPES:
        return error(f"leave_type must be one of {ALLOWED_LEAVE_TYPES}", 400)
    if not data.get('start_date') or not data.get('end_date'):
        return error('start_date and end_date are required', 400)

    start = _parse_date(data['start_date'])
    end = _parse_date(data['end_date'])
    if not start or not end:
        return error('Invalid date format (YYYY-MM-DD expected)', 400)
    if end < start:
        return error('end_date must be >= start_date', 400)

    # Reject if an approved or pending leave already covers any part of this range
    overlap = LeaveRequest.query.filter(
        LeaveRequest.user_id == user_id,
        LeaveRequest.status.in_(('PENDING', 'APPROVED')),
        LeaveRequest.start_date <= end,
        LeaveRequest.end_date >= start,
    ).first()
    if overlap:
        return error(
            f'You already have a {overlap.status.lower()} leave request overlapping those dates '
            f'({overlap.start_date} – {overlap.end_date})',
            409
        )

    lr = LeaveRequest(
        user_id=user_id,
        leave_type=data['leave_type'],
        start_date=start,
        end_date=end,
        reason=data.get('reason'),
        status='PENDING'
    )
    db.session.add(lr)
    db.session.commit()
    return success(lr.to_dict(), 'Leave request submitted', 201)


@leave_bp.route('/<int:leave_id>/process', methods=['PUT'])
@jwt_required()
def process_leave(leave_id):
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user or user.role not in ('CHAIRMAN', 'DIRECTOR', 'HR'):
        return error('Forbidden', 403)

    lr = LeaveRequest.query.get_or_404(leave_id)
    data = request.get_json() or {}
    status = data.get('status')
    if status not in ('APPROVED', 'REJECTED'):
        return error('status must be APPROVED or REJECTED', 400)
    if lr.status != 'PENDING':
        return error('Already processed', 400)

    lr.status = status
    lr.reviewed_by = user_id
    lr.reviewed_at = datetime.now(timezone.utc)
    lr.review_comment = data.get('comment')
    db.session.commit()
    return success(lr.to_dict(), f'Leave {status.lower()}')


# ─── Resumption Requests ─────────────────────────────────────────────────────

@leave_bp.route('/resumption', methods=['GET'])
@jwt_required()
def list_resumption():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('Not found', 404)

    if user.role in ('CHAIRMAN', 'DIRECTOR', 'HR'):
        records = ResumptionRequest.query.order_by(ResumptionRequest.created_at.desc()).all()
    else:
        records = ResumptionRequest.query.filter_by(user_id=user_id).order_by(ResumptionRequest.created_at.desc()).all()

    return success([r.to_dict() for r in records])


@leave_bp.route('/resumption', methods=['POST'])
@jwt_required()
def create_resumption():
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    if not data.get('resumption_date'):
        return error('resumption_date is required', 400)

    rdate = _parse_date(data['resumption_date'])
    if not rdate:
        return error('Invalid date format', 400)

    rr = ResumptionRequest(
        user_id=user_id,
        resumption_date=rdate,
        notes=data.get('notes'),
        status='PENDING'
    )
    db.session.add(rr)
    db.session.commit()
    return success(rr.to_dict(), 'Resumption request submitted', 201)


@leave_bp.route('/resumption/<int:req_id>/process', methods=['PUT'])
@jwt_required()
def process_resumption(req_id):
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user or user.role not in ('CHAIRMAN', 'DIRECTOR', 'HR'):
        return error('Forbidden', 403)

    rr = ResumptionRequest.query.get_or_404(req_id)
    data = request.get_json() or {}
    status = data.get('status')
    if status not in ('APPROVED', 'REJECTED'):
        return error('status must be APPROVED or REJECTED', 400)
    if rr.status != 'PENDING':
        return error('Already processed', 400)

    rr.status = status
    rr.reviewed_by = user_id
    rr.reviewed_at = datetime.now(timezone.utc)
    db.session.commit()
    return success(rr.to_dict(), f'Resumption {status.lower()}')
