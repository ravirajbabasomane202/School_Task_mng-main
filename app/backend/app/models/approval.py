from datetime import datetime, timezone
from app.extensions import db


class Approval(db.Model):
    __tablename__ = 'approvals'

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(20), nullable=False)   # BUDGET/PURCHASE/POLICY/EVENT
    title = db.Column(db.String(255), nullable=False)
    details = db.Column(db.Text, nullable=True)
    amount = db.Column(db.Numeric(15, 2), nullable=True)
    status = db.Column(db.String(15), nullable=False, default='PENDING')  # PENDING/APPROVED/REJECTED
    requested_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    processed_at = db.Column(db.DateTime, nullable=True)

    requester = db.relationship('User', foreign_keys=[requested_by])
    approver = db.relationship('User', foreign_keys=[approved_by])

    def to_dict(self):
        requester_summary = self.requester.to_summary() if self.requester else None
        approver_summary = self.approver.to_summary() if self.approver else None
        return {
            'id': self.id,
            'type': self.type,
            'title': self.title,
            'details': self.details,
            'amount': float(self.amount) if self.amount is not None else None,
            'status': self.status,
            'requested_by': self.requested_by,
            'approved_by': self.approved_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None,
            # 'requester' kept for any internal/legacy usage
            'requester': requester_summary,
            # FIX: ApprovalManagement.tsx and approvalService.ts both read approval.requestedBy
            # (camelCase) but the backend was only sending 'requester' (snake_case relation name).
            # Add the camelCase alias so the frontend renders submitter names correctly.
            'requestedBy': requester_summary,
            # Similarly approver → approvedBy for symmetry and future frontend use
            'approvedBy': approver_summary,
        }
