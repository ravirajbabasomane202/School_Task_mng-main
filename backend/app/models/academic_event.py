from datetime import datetime, timezone

from app.extensions import db
from app.utils.timezone import school_now, school_tz

COMPLETION_PENDING = 'PENDING'
COMPLETION_COMPLETED = 'COMPLETED'
APPROVAL_PENDING = 'PENDING'
APPROVAL_YES = 'YES'
APPROVAL_NO = 'NO'
APPROVAL_STATUSES = (APPROVAL_PENDING, APPROVAL_YES, APPROVAL_NO)

# Derived (never stored) so it can't drift from the underlying fields.
WORKFLOW_LABELS = {
    'PLANNED': 'Planned',
    'PENDING_COMPLETION': 'Pending Completion',
    'REASON_REQUIRED': 'Reason Required',
    'COMPLETED': 'Completed',
    'AWAITING_APPROVAL': 'Awaiting Management Approval',
    'APPROVED': 'Approved',
    'NOT_APPROVED': 'Approval Declined',
    'NOT_TRACKED': 'No Responsible Person',
}


class AcademicEvent(db.Model):
    __tablename__ = 'academic_events'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(30), nullable=False)
    start_date = db.Column(db.Date, nullable=False, index=True)
    end_date = db.Column(db.Date, nullable=False, index=True)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    location = db.Column(db.String(255), nullable=True)
    target_audience = db.Column(db.JSON, nullable=False, default=lambda: ['ALL'])
    attachment_filename = db.Column(db.String(255), nullable=True)
    attachment_storage_name = db.Column(db.String(80), nullable=True, unique=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    # --- Responsibility & completion workflow -------------------------------
    # Completion and management approval are deliberately SEPARATE columns so
    # one never overwrites the other.
    responsible_user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    completion_status = db.Column(db.String(15), nullable=False, default=COMPLETION_PENDING, server_default=COMPLETION_PENDING)
    completed_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    actual_completion_date = db.Column(db.Date, nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completion_remarks = db.Column(db.Text, nullable=True)
    non_completion_reason = db.Column(db.Text, nullable=True)
    reason_submitted_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    reason_submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    approval_status = db.Column(db.String(10), nullable=False, default=APPROVAL_PENDING, server_default=APPROVAL_PENDING)
    approval_remarks = db.Column(db.Text, nullable=True)
    approval_updated_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    approval_updated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    original_start_date = db.Column(db.Date, nullable=True)
    original_start_time = db.Column(db.Time, nullable=True)
    overdue_notified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', foreign_keys=[created_by], lazy='joined')
    responsible = db.relationship('User', foreign_keys=[responsible_user_id], lazy='joined')
    completer = db.relationship('User', foreign_keys=[completed_by])
    reason_submitter = db.relationship('User', foreign_keys=[reason_submitted_by])
    approval_updater = db.relationship('User', foreign_keys=[approval_updated_by])
    history = db.relationship(
        'AcademicEventHistory',
        back_populates='event',
        cascade='all, delete-orphan',
        order_by='(AcademicEventHistory.created_at, AcademicEventHistory.id)',
        lazy='dynamic',
    )

    # --- Derived workflow state ---------------------------------------------
    @property
    def is_completed(self):
        return self.completion_status == COMPLETION_COMPLETED

    @property
    def scheduled_end(self):
        """Scheduled end as an aware datetime in the school time zone."""
        return datetime.combine(self.end_date, self.end_time, tzinfo=school_tz())

    @property
    def is_overdue(self):
        """Scheduled end has passed and nobody marked it completed.

        Time passing never completes an event; this is only a flag.
        """
        return (not self.is_completed) and self.scheduled_end < school_now()

    @property
    def is_tracked(self):
        """Only events with a responsible person take part in the overdue /
        reason workflow, so events created before this feature (no responsible
        person) are not suddenly flagged as late."""
        return self.responsible_user_id is not None

    @property
    def workflow_status(self):
        if self.is_completed:
            if self.approval_status == APPROVAL_YES:
                return 'APPROVED'
            if self.approval_status == APPROVAL_NO:
                return 'NOT_APPROVED'
            return 'AWAITING_APPROVAL'
        if not self.is_overdue:
            return 'PLANNED'
        if not self.is_tracked:
            return 'NOT_TRACKED'
        return 'PENDING_COMPLETION' if self.non_completion_reason else 'REASON_REQUIRED'

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'category': self.category,
            'start_date': self.start_date.isoformat(),
            'end_date': self.end_date.isoformat(),
            'start_time': self.start_time.strftime('%H:%M'),
            'end_time': self.end_time.strftime('%H:%M'),
            'location': self.location,
            'target_audience': self.target_audience,
            'attachment_filename': self.attachment_filename,
            'has_attachment': bool(self.attachment_storage_name),
            'created_by': self.created_by,
            'created_by_name': self.creator.name if self.creator else None,
            'responsible_user_id': self.responsible_user_id,
            'responsible_name': self.responsible.name if self.responsible else None,
            'responsible_head_type': self.responsible.head_type if self.responsible else None,
            'completion_status': self.completion_status,
            'workflow_status': self.workflow_status,
            'workflow_label': WORKFLOW_LABELS[self.workflow_status],
            'is_overdue': self.is_overdue and self.is_tracked,
            'non_completion_reason': self.non_completion_reason,
            'reason_submitted_by_name': self.reason_submitter.name if self.reason_submitter else None,
            'reason_submitted_at': self.reason_submitted_at.isoformat() if self.reason_submitted_at else None,
            'completed_by': self.completed_by,
            'completed_by_name': self.completer.name if self.completer else None,
            'actual_completion_date': self.actual_completion_date.isoformat() if self.actual_completion_date else None,
            'completion_remarks': self.completion_remarks,
            'approval_status': self.approval_status,
            'approval_remarks': self.approval_remarks,
            'approval_updated_by_name': self.approval_updater.name if self.approval_updater else None,
            'approval_updated_at': self.approval_updated_at.isoformat() if self.approval_updated_at else None,
            'original_start_date': (self.original_start_date or self.start_date).isoformat(),
            'original_start_time': (self.original_start_time or self.start_time).strftime('%H:%M'),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AcademicEventHistory(db.Model):
    """Append-only audit trail for an academic event."""

    __tablename__ = 'academic_event_history'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(
        db.Integer, db.ForeignKey('academic_events.id', ondelete='CASCADE'), nullable=False, index=True
    )
    action = db.Column(db.String(30), nullable=False)
    summary = db.Column(db.Text, nullable=False)
    details = db.Column(db.JSON, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    event = db.relationship('AcademicEvent', back_populates='history')
    user = db.relationship('User', lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'event_id': self.event_id,
            'action': self.action,
            'summary': self.summary,
            'details': self.details,
            'user_id': self.user_id,
            'user_name': self.user.name if self.user else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
