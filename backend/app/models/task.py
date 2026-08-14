from datetime import datetime, timezone
from app.extensions import db


class Task(db.Model):
    __tablename__ = 'tasks'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    assigned_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    priority = db.Column(db.String(10), nullable=False, default='MEDIUM')  # HIGH/MEDIUM/LOW
    status = db.Column(db.String(15), nullable=False, default='PENDING')   # PENDING/IN_PROGRESS/COMPLETED/DELAYED/ESCALATED
    cadence = db.Column(db.String(10), nullable=True)                       # DAILY/WEEKLY/MONTHLY (optional)
    start_date = db.Column(db.DateTime(timezone=True), nullable=True)
    due_date = db.Column(db.DateTime(timezone=True), nullable=True)
    attachment_path = db.Column(db.String(500), nullable=True)  # brief / initial attachment
    proof_path = db.Column(db.String(500), nullable=True)        # completion proof upload
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    assigner = db.relationship('User', foreign_keys=[assigned_by], back_populates='tasks_assigned_by')
    assignee = db.relationship('User', foreign_keys=[assigned_to], back_populates='tasks_assigned_to')
    department = db.relationship('Department', back_populates='tasks')
    history = db.relationship('TaskHistory', back_populates='task', cascade='all, delete-orphan', order_by='TaskHistory.updated_at.desc()')
    notifications = db.relationship('Notification', back_populates='task', lazy='dynamic')

    def to_dict(self, include_history=False):
        data = {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'assigned_by': self.assigned_by,
            'assigned_to': self.assigned_to,
            'department_id': self.department_id,
            'priority': self.priority,
            'status': self.status,
            'cadence': self.cadence,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'attachment_path': self.attachment_path,
            'proof_path': self.proof_path,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'assignedBy': self.assigner.to_summary() if self.assigner else None,
            'assignedTo': self.assignee.to_summary() if self.assignee else None,
            'department': self.department.to_dict() if self.department else None,
            'assignedByName': self.assigner.name if self.assigner else None,
            'assignedToName': self.assignee.name if self.assignee else None,
            'departmentName': self.department.name if self.department else None,
        }
        if include_history:
            data['history'] = [h.to_dict() for h in self.history]
        return data

    @classmethod
    def mark_overdue_delayed(cls):
        now = datetime.now(timezone.utc)
        overdue_tasks = cls.query.filter(
            cls.due_date != None,
            cls.due_date < now,
            cls.status.in_(['PENDING', 'IN_PROGRESS'])
        ).all()

        if not overdue_tasks:
            return 0

        for task in overdue_tasks:
            task.status = 'DELAYED'

        db.session.commit()
        return len(overdue_tasks)


class TaskHistory(db.Model):
    __tablename__ = 'task_history'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    old_status = db.Column(db.String(15), nullable=True)
    new_status = db.Column(db.String(15), nullable=False)
    comment = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task = db.relationship('Task', back_populates='history')
    updater = db.relationship('User', foreign_keys=[updated_by])

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'updated_by': self.updated_by,
            'old_status': self.old_status,
            'new_status': self.new_status,
            'comment': self.comment,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updatedBy': self.updater.to_summary() if self.updater else None,
            'updatedByName': self.updater.name if self.updater else None,
        }
