from datetime import datetime, timezone
from app.extensions import db


class SalaryIncrement(db.Model):
    __tablename__ = 'salary_increments'

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    current_salary = db.Column(db.Numeric(14, 2), nullable=False)
    proposed_salary = db.Column(db.Numeric(14, 2), nullable=False)
    reason = db.Column(db.Text, nullable=True)

    # Status flow: PENDING_HR → PENDING_FINANCE → APPROVED | REJECTED
    status = db.Column(db.String(20), nullable=False, default='PENDING_HR')

    requested_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    hr_approved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    finance_approved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    hr_comment = db.Column(db.Text, nullable=True)
    finance_comment = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    processed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    employee = db.relationship('User', foreign_keys=[employee_id], lazy='joined')
    requester = db.relationship('User', foreign_keys=[requested_by], lazy='joined')
    hr_approver = db.relationship('User', foreign_keys=[hr_approved_by], lazy='joined')
    finance_approver = db.relationship('User', foreign_keys=[finance_approved_by], lazy='joined')

    def to_dict(self):
        curr = float(self.current_salary)
        prop = float(self.proposed_salary)
        increment_pct = round(((prop - curr) / curr) * 100, 2) if curr > 0 else 0.0
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'current_salary': curr,
            'proposed_salary': prop,
            'increment_pct': increment_pct,
            'reason': self.reason,
            'status': self.status,
            'requested_by': self.requested_by,
            'hr_approved_by': self.hr_approved_by,
            'finance_approved_by': self.finance_approved_by,
            'hr_comment': self.hr_comment,
            'finance_comment': self.finance_comment,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None,
            'employee': self.employee.to_summary() if self.employee else None,
            'requester': self.requester.to_summary() if self.requester else None,
            'hr_approver': self.hr_approver.to_summary() if self.hr_approver else None,
            'finance_approver': self.finance_approver.to_summary() if self.finance_approver else None,
        }
