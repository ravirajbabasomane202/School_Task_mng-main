from datetime import datetime, timezone
from app.extensions import db


class HousekeepingTask(db.Model):
    __tablename__ = 'housekeeping_tasks'

    id = db.Column(db.Integer, primary_key=True)
    area = db.Column(db.String(255), nullable=False)           # e.g. Library, Corridor B, Toilets
    task_type = db.Column(db.String(50), nullable=False)       # CLEANING/MAINTENANCE/INSPECTION/REPAIR
    description = db.Column(db.Text, nullable=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='PENDING')  # PENDING/IN_PROGRESS/COMPLETED
    priority = db.Column(db.String(10), nullable=False, default='MEDIUM')  # HIGH/MEDIUM/LOW
    scheduled_date = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    assignee = db.relationship('User', foreign_keys=[assigned_to])
    creator = db.relationship('User', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'area': self.area,
            'task_type': self.task_type,
            'description': self.description,
            'assigned_to': self.assigned_to,
            'assigneeName': self.assignee.name if self.assignee else None,
            'created_by': self.created_by,
            'createdByName': self.creator.name if self.creator else None,
            'status': self.status,
            'priority': self.priority,
            'scheduled_date': self.scheduled_date.isoformat() if self.scheduled_date else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
