"""
Salary increment workflow:
  PENDING_HR  →  PENDING_FINANCE  →  APPROVED | REJECTED
"""
from datetime import datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.salary_increment import SalaryIncrement
from app.models.notification import Notification
from app.models.user import User
from app.sockets.emitter import emit_notification
from app.utils.response import success, error
from app.utils.decorators import roles_required

salary_bp = Blueprint('salary', __name__)

REVIEWER_ROLES = ('HR', 'FINANCE', 'CHAIRMAN', 'DIRECTOR')


def _notify_salary_change(row: SalaryIncrement, message: str):
    """Notify the requester (and optionally the employee) about a salary change."""
    for uid in {row.requested_by, row.employee_id}:
        if uid:
            notif = Notification(user_id=uid, type='SALARY_UPDATE', message=message)
            db.session.add(notif)
            db.session.flush()
            emit_notification(uid, notif.to_dict())


def _notify_role(role: str, message: str):
    """Send a notification to all active users with the given role."""
    users = User.query.filter_by(role=role, is_active=True).all()
    for u in users:
        notif = Notification(user_id=u.id, type='SALARY_UPDATE', message=message)
        db.session.add(notif)
        db.session.flush()
        emit_notification(u.id, notif.to_dict())


# ── List ──────────────────────────────────────────────────────────────────────

@salary_bp.route('', methods=['GET'])
@jwt_required()
def list_salary_increments():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    query = SalaryIncrement.query.order_by(SalaryIncrement.created_at.desc())

    # Filter by status if requested
    status = request.args.get('status')
    if status:
        valid = ('PENDING_HR', 'PENDING_FINANCE', 'APPROVED', 'REJECTED')
        if status not in valid:
            return error(f'status must be one of {valid}', 400)
        query = query.filter_by(status=status)

    # Non-privileged users only see their own records
    if user.role not in REVIEWER_ROLES:
        query = query.filter_by(employee_id=user.id)

    return success([row.to_dict() for row in query.all()])


# ── Detail ────────────────────────────────────────────────────────────────────

@salary_bp.route('/<int:salary_id>', methods=['GET'])
@jwt_required()
def get_salary_increment(salary_id: int):
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    row = SalaryIncrement.query.get_or_404(salary_id)

    # Object-level access: only the employee, reviewers, or admins
    if user.role not in REVIEWER_ROLES and row.employee_id != user.id:
        return error('Forbidden', 403)

    return success(row.to_dict())


# ── Create ────────────────────────────────────────────────────────────────────

@salary_bp.route('', methods=['POST'])
@roles_required('HR', 'CHAIRMAN')
def create_salary_increment():
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    required = ('employee_id', 'current_salary', 'proposed_salary')
    for field in required:
        if field not in data:
            return error(f'{field} is required', 400)

    try:
        employee_id = int(data['employee_id'])
        current_salary = float(data['current_salary'])
        proposed_salary = float(data['proposed_salary'])
    except (ValueError, TypeError):
        return error('employee_id, current_salary and proposed_salary must be numeric', 400)

    if proposed_salary <= current_salary:
        return error('proposed_salary must be greater than current_salary', 400)

    employee = db.session.get(User, employee_id)
    if not employee or not employee.is_active:
        return error('Employee not found or inactive', 404)

    row = SalaryIncrement(
        employee_id=employee_id,
        current_salary=current_salary,
        proposed_salary=proposed_salary,
        reason=data.get('reason'),
        status='PENDING_HR',
        requested_by=user_id,
    )
    db.session.add(row)
    db.session.flush()

    # Notify HR heads that a new request needs their review
    _notify_role('HR', f'New salary increment request for {employee.name} requires HR review.')

    db.session.commit()
    return success(row.to_dict(), 'Salary increment request created', 201)


# ── HR Approve ────────────────────────────────────────────────────────────────

@salary_bp.route('/<int:salary_id>/hr-approve', methods=['PUT'])
@roles_required('HR', 'CHAIRMAN')
def hr_approve_salary_increment(salary_id: int):
    user_id = get_jwt_identity()
    row = SalaryIncrement.query.get_or_404(salary_id)
    data = request.get_json() or {}

    if row.status != 'PENDING_HR':
        return error('Request is not in PENDING_HR stage', 400)

    row.status = 'PENDING_FINANCE'
    row.hr_approved_by = user_id
    row.hr_comment = data.get('comment')
    db.session.flush()

    # Notify the requester that HR has approved and it's forwarded to Finance
    _notify_salary_change(row, f'Salary increment for {row.employee.name} has been approved by HR and is now pending Finance review.')
    # Notify Finance head(s)
    _notify_role('FINANCE', f'A salary increment request for {row.employee.name} requires your review.')

    db.session.commit()
    return success(row.to_dict(), 'Forwarded to Finance for approval')


# ── Finance Process ───────────────────────────────────────────────────────────

@salary_bp.route('/<int:salary_id>/finance-process', methods=['PUT'])
@roles_required('FINANCE', 'CHAIRMAN')
def finance_process_salary_increment(salary_id: int):
    user_id = get_jwt_identity()
    row = SalaryIncrement.query.get_or_404(salary_id)
    data = request.get_json() or {}

    if row.status != 'PENDING_FINANCE':
        return error('Request is not in PENDING_FINANCE stage', 400)

    status = data.get('status')
    if status not in ('APPROVED', 'REJECTED'):
        return error('status must be APPROVED or REJECTED', 400)

    row.status = status
    row.finance_approved_by = user_id
    row.finance_comment = data.get('comment')
    row.processed_at = datetime.now(timezone.utc)

    outcome_msg = (
        f'Your salary increment request has been APPROVED by Finance.' if status == 'APPROVED'
        else f'Your salary increment request has been REJECTED by Finance. Reason: {data.get("comment", "N/A")}'
    )
    _notify_salary_change(row, outcome_msg)

    db.session.commit()
    return success(row.to_dict(), f'Salary increment {status.lower()}')
