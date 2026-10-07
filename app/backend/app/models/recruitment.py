from datetime import datetime, timezone
from app.extensions import db


class Recruitment(db.Model):
    __tablename__ = 'recruitments'

    id = db.Column(db.Integer, primary_key=True)
    position_title = db.Column(db.String(120), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    vacancies = db.Column(db.Integer, nullable=False, default=1)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='OPEN')  # OPEN, SCREENING, INTERVIEW, CLOSED
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    department = db.relationship('Department', backref='recruitments', lazy='joined')
    creator = db.relationship('User', foreign_keys=[created_by], lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'position_title': self.position_title,
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else None,
            'vacancies': self.vacancies,
            'description': self.description,
            'status': self.status,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class RecruitmentApplication(db.Model):
    __tablename__ = 'recruitment_applications'

    id = db.Column(db.Integer, primary_key=True)
    recruitment_id = db.Column(db.Integer, db.ForeignKey('recruitments.id'), nullable=False)
    applicant_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    resume_path = db.Column(db.String(255), nullable=True)
    stage = db.Column(db.String(20), nullable=False, default='APPLIED')  # APPLIED, SHORTLISTED, INTERVIEWED, HIRED, REJECTED
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    recruitment = db.relationship('Recruitment', backref='applications', lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'recruitment_id': self.recruitment_id,
            'position_title': self.recruitment.position_title if self.recruitment else None,
            'applicant_name': self.applicant_name,
            'email': self.email,
            'notes': self.notes,
            'resume_path': self.resume_path,
            'stage': self.stage,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }