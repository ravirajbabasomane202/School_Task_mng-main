from datetime import datetime, timezone
from app.extensions import db


class Meeting(db.Model):
    __tablename__ = 'meetings'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    agenda = db.Column(db.Text, nullable=True)
    location = db.Column(db.String(255), nullable=True)
    meeting_date = db.Column(db.DateTime, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=True, default=60)
    status = db.Column(db.String(20), nullable=False, default='SCHEDULED')  # SCHEDULED/ONGOING/COMPLETED/CANCELLED
    meeting_type = db.Column(db.String(20), nullable=False, default='GENERAL')  # GENERAL/DEPARTMENTAL/EMERGENCY
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', foreign_keys=[created_by])
    attendees = db.relationship('MeetingAttendee', back_populates='meeting', cascade='all, delete-orphan')

    def to_dict(self, include_attendees=True):
        data = {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'agenda': self.agenda,
            'location': self.location,
            'meeting_date': self.meeting_date.isoformat() if self.meeting_date else None,
            'duration_minutes': self.duration_minutes,
            'status': self.status,
            'meeting_type': self.meeting_type,
            'created_by': self.created_by,
            'createdByName': self.creator.name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_attendees:
            data['attendees'] = [a.to_dict() for a in self.attendees]
        return data


class MeetingAttendee(db.Model):
    __tablename__ = 'meeting_attendees'

    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(db.Integer, db.ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    rsvp_status = db.Column(db.String(10), nullable=False, default='PENDING')  # PENDING/ACCEPTED/DECLINED

    meeting = db.relationship('Meeting', back_populates='attendees')
    user = db.relationship('User', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'meeting_id': self.meeting_id,
            'user_id': self.user_id,
            'userName': self.user.name if self.user else None,
            'userRole': self.user.role if self.user else None,
            'rsvp_status': self.rsvp_status,
        }
