from datetime import datetime, timezone
from app.extensions import db


class Asset(db.Model):
    __tablename__ = 'assets'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(50), nullable=False)  # HARDWARE, SOFTWARE, FURNITURE, VEHICLE
    serial_number = db.Column(db.String(100), nullable=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    purchase_date = db.Column(db.DateTime, nullable=True)
    purchase_value = db.Column(db.Numeric(12, 2), nullable=True)
    condition = db.Column(db.String(20), nullable=False, default='GOOD')  # EXCELLENT, GOOD, FAIR, POOR
    status = db.Column(db.String(20), nullable=False, default='ACTIVE')  # ACTIVE, MAINTENANCE, DISPOSED
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    assignee = db.relationship('User', foreign_keys=[assigned_to], lazy='joined')
    department = db.relationship('Department', backref='assets', lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'serial_number': self.serial_number,
            'assigned_to': self.assigned_to,
            'assignee_name': self.assignee.name if self.assignee else None,
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else None,
            'purchase_date': self.purchase_date.isoformat() if self.purchase_date else None,
            'purchase_value': float(self.purchase_value) if self.purchase_value else None,
            'condition': self.condition,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }