from datetime import datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.extensions import db
from app.models.meeting import Meeting, MeetingAttendee
from app.models.notification import Notification
from app.models.user import User
from app.sockets.emitter import emit_notification
from app.utils.response import error, success

meetings_bp = Blueprint('meetings', __name__)

ELEVATED_ROLES = {'CHAIRMAN', 'DIRECTOR'}


def _current_user():
    return db.session.get(User, int(get_jwt_identity()))

def parse_iso_datetime(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        raise ValueError("Invalid meeting_date format")

@meetings_bp.route('', methods=['GET'])
@jwt_required()
def list_meetings():
    user = _current_user()
    if not user:
        return error('User not found', 401)

    status_filter = request.args.get('status')
    meeting_type = request.args.get('type')

    if user.role in ELEVATED_ROLES:
        query = Meeting.query
    else:
        # Show meetings where this user is an attendee or creator
        attendee_meeting_ids = db.session.query(MeetingAttendee.meeting_id).filter_by(user_id=user.id)
        query = Meeting.query.filter(
            (Meeting.created_by == user.id) | (Meeting.id.in_(attendee_meeting_ids))
        )

    if status_filter:
        query = query.filter_by(status=status_filter)
    if meeting_type:
        query = query.filter_by(meeting_type=meeting_type)

    meetings = query.order_by(Meeting.meeting_date.desc()).all()
    return success([m.to_dict() for m in meetings])


@meetings_bp.route('/<int:meeting_id>', methods=['GET'])
@jwt_required()
def get_meeting(meeting_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)
    meeting = Meeting.query.get_or_404(meeting_id)

    # Non-elevated users can only view meetings they created or attend
    if user.role not in ELEVATED_ROLES:
        is_attendee = MeetingAttendee.query.filter_by(
            meeting_id=meeting.id, user_id=user.id
        ).first()
        if not is_attendee and meeting.created_by != user.id:
            return error('Forbidden', 403)

    return success(meeting.to_dict())


@meetings_bp.route('', methods=['POST'])
@jwt_required()
def create_meeting():
    user = _current_user()
    if not user:
        return error('User not found', 401)
    if user.role not in ELEVATED_ROLES:
        return error('Only Chairman or Director can schedule meetings', 403)

    data = request.get_json() or {}
    required = ['title', 'meeting_date']
    for field in required:
        if not data.get(field):
            return error(f'{field} is required', 400)

    meeting = Meeting(
        title=data['title'],
        description=data.get('description'),
        agenda=data.get('agenda'),
        location=data.get('location'),
        meeting_date=parse_iso_datetime(data['meeting_date']),
        duration_minutes=int(data.get('duration_minutes', 60)),
        status='SCHEDULED',
        meeting_type=data.get('meeting_type', 'GENERAL'),
        created_by=user.id,
    )
    db.session.add(meeting)
    db.session.flush()

    attendee_ids = data.get('attendee_ids', [])
    attendee_notifications: list[tuple[int, Notification]] = []
    for uid in attendee_ids:
        attendee_user = db.session.get(User, uid)
        if attendee_user:
            att = MeetingAttendee(meeting_id=meeting.id, user_id=uid)
            db.session.add(att)
            notif = Notification(
                user_id=uid,
                type='MEETING_SCHEDULED',
                message=f'You have been invited to: {meeting.title} on {meeting.meeting_date.strftime("%d %b %Y %H:%M")}',
                task_id=None
            )
            db.session.add(notif)
            attendee_notifications.append((uid, notif))

    db.session.commit()

    # Emit notifications using the in-memory objects (avoids a fragile re-query)
    for recipient_id, notif_obj in attendee_notifications:
        emit_notification(recipient_id, notif_obj.to_dict())

    return success(meeting.to_dict(), 'Meeting scheduled successfully', 201)


@meetings_bp.route('/<int:meeting_id>', methods=['PUT'])
@jwt_required()
def update_meeting(meeting_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    meeting = Meeting.query.get_or_404(meeting_id)
    if user.role not in ELEVATED_ROLES and meeting.created_by != user.id:
        return error('Forbidden', 403)

    data = request.get_json() or {}

    if 'title' in data:
        meeting.title = data['title']
    if 'description' in data:
        meeting.description = data['description']
    if 'agenda' in data:
        meeting.agenda = data['agenda']
    if 'location' in data:
        meeting.location = data['location']
    if 'meeting_date' in data and data['meeting_date']:
        meeting.meeting_date = parse_iso_datetime(data['meeting_date'])
    if 'duration_minutes' in data:
        meeting.duration_minutes = int(data['duration_minutes'])
    if 'status' in data:
        meeting.status = data['status']
    if 'meeting_type' in data:
        meeting.meeting_type = data['meeting_type']

    # Update attendees if provided
    if 'attendee_ids' in data:
        MeetingAttendee.query.filter_by(meeting_id=meeting.id).delete()
        for uid in data['attendee_ids']:
            att = MeetingAttendee(meeting_id=meeting.id, user_id=uid)
            db.session.add(att)

    db.session.commit()
    return success(meeting.to_dict(), 'Meeting updated')


@meetings_bp.route('/<int:meeting_id>', methods=['DELETE'])
@jwt_required()
def delete_meeting(meeting_id):
    user = _current_user()
    if not user:
        return error('User not found', 401)

    meeting = Meeting.query.get_or_404(meeting_id)
    if user.role not in ELEVATED_ROLES and meeting.created_by != user.id:
        return error('Forbidden', 403)

    db.session.delete(meeting)
    db.session.commit()
    return success(None, 'Meeting cancelled')


@meetings_bp.route('/upcoming', methods=['GET'])
@jwt_required()
def upcoming_meetings():
    user = _current_user()
    if not user:
        return error('User not found', 401)

    now = datetime.now(timezone.utc)
    if user.role in ELEVATED_ROLES:
        meetings = (Meeting.query
                    .filter(Meeting.meeting_date >= now, Meeting.status == 'SCHEDULED')
                    .order_by(Meeting.meeting_date.asc())
                    .limit(10).all())
    else:
        attendee_meeting_ids = db.session.query(MeetingAttendee.meeting_id).filter_by(user_id=user.id)
        meetings = (Meeting.query
                    .filter(
                        Meeting.meeting_date >= now,
                        Meeting.status == 'SCHEDULED',
                        (Meeting.created_by == user.id) | (Meeting.id.in_(attendee_meeting_ids))
                    )
                    .order_by(Meeting.meeting_date.asc())
                    .limit(10).all())

    return success([m.to_dict() for m in meetings])
