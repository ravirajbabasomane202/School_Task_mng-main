from datetime import datetime, timezone
from app.extensions import db


class ReportHistory(db.Model):
    __tablename__ = 'report_history'

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(20), nullable=False)  # DAILY/WEEKLY/MONTHLY/HOUSEKEEPING
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    date_from = db.Column(db.Date, nullable=True)
    date_to = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    pdf_path = db.Column(db.String(500), nullable=True)
    excel_path = db.Column(db.String(500), nullable=True)

    department = db.relationship('Department', foreign_keys=[department_id])

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'department_id': self.department_id,
            'department': self.department.to_dict() if self.department else None,
            'dateFrom': self.date_from.isoformat() if self.date_from else None,
            'dateTo': self.date_to.isoformat() if self.date_to else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'pdfPath': self.pdf_path,
            'excelPath': self.excel_path,
        }
