from datetime import datetime, timezone
from app.extensions import db


class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(30), nullable=False)  # TASK_ASSIGNED/TASK_UPDATED/TASK_DELAYED/TASK_ESCALATED/ANNOUNCEMENT
    message = db.Column(db.Text, nullable=False)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', back_populates='notifications')
    task = db.relationship('Task', back_populates='notifications')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'message': self.message,
            'task_id': self.task_id,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Announcement(db.Model):
    __tablename__ = 'announcements'

    id = db.Column(db.Integer, primary_key=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    target = db.Column(db.String(15), nullable=False, default='ALL')  # ALL / DEPARTMENT
    message = db.Column(db.Text, nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', foreign_keys=[created_by])
    department = db.relationship('Department', foreign_keys=[department_id])

    def to_dict(self):
        return {
            'id': self.id,
            'created_by': self.created_by,
            'target': self.target,
            'message': self.message,
            'department_id': self.department_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'creator': {'id': self.creator.id, 'name': self.creator.name} if self.creator else None,
            'department': self.department.to_dict() if self.department else None,
        }
