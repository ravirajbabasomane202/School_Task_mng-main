from datetime import datetime, timezone
from app.extensions import db, bcrypt

ROLES = [
    'CHAIRMAN', 'DIRECTOR', 'PROPERTY', 'FINANCE', 'ADMIN',
    'PRINCIPAL', 'ADMISSION', 'HR', 'PURCHASE', 'IT', 'TRANSPORT',
    'HOUSEKEEPING', 'FRONT_DESK'
]

DEPARTMENT_HEAD_ROLES = [
    'PROPERTY', 'FINANCE', 'ADMIN', 'PRINCIPAL',
    'ADMISSION', 'HR', 'PURCHASE', 'IT', 'TRANSPORT',
    'HOUSEKEEPING', 'FRONT_DESK'
]

TASK_ASSIGNABLE_ROLES = ['DIRECTOR', *DEPARTMENT_HEAD_ROLES]


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(30), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    last_login = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    department = db.relationship('Department', back_populates='users')
    tasks_assigned_to = db.relationship('Task', foreign_keys='Task.assigned_to', back_populates='assignee', lazy='dynamic')
    tasks_assigned_by = db.relationship('Task', foreign_keys='Task.assigned_by', back_populates='assigner', lazy='dynamic')
    notifications = db.relationship('Notification', back_populates='user', lazy='dynamic')
    refresh_tokens = db.relationship('RefreshToken', back_populates='user', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)

    def to_dict(self, include_department=True):
        data = {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'department_id': self.department_id,
            'departmentName': self.department.name if self.department else None,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
        }
        if include_department:
            data['department'] = self.department.to_dict() if self.department else None
        return data

    def to_summary(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'department_id': self.department_id
        }

    def to_auth_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'department_id': self.department_id,
            'departmentName': self.department.name if self.department else None
        }
