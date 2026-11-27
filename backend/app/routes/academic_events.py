import json
import os
import uuid
from datetime import date, datetime, time, timezone

from flask import Blueprint, current_app, request, send_from_directory
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.academic_event import (
    APPROVAL_PENDING,
    APPROVAL_STATUSES,
    COMPLETION_COMPLETED,
    AcademicEvent,
    AcademicEventHistory,
)
from app.models.user import User, ROLES
from app.services import academic_event_alerts as alerts
from app.utils.decorators import roles_required
from app.utils.response import error, success
from app.utils.timezone import school_now, school_today


academic_events_bp = Blueprint('academic_events', __name__)
EVENT_MANAGER_ROLES = ('CHAIRMAN', 'PRINCIPAL')
EVENT_CATEGORIES = {
    'ACADEMIC', 'CELEBRATION', 'EXAMINATION', 'HOLIDAY', 'MEETING', 'SPORTS', 'OTHER'
}
ATTACHMENT_EXTENSIONS = {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'}
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024


def _active_user():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None
    user = db.session.get(User, user_id)
    return user if user and user.is_active else None


def _event_visible_to_user(event, user):
    # The responsible person always sees their event, whatever its audience.
    return (
        user.role in EVENT_MANAGER_ROLES
        or event.responsible_user_id == user.id
        or 'ALL' in event.target_audience
        or user.role in event.target_audience
    )


def _can_update_completion(event, user):
    """Only the responsible person (or a Chairman-level manager) may report
    reasons / completion for an event."""
    return user.role in EVENT_MANAGER_ROLES or (
        event.responsible_user_id is not None and event.responsible_user_id == user.id
    )


def _log(event, action, summary, user_id, details=None):
    db.session.add(AcademicEventHistory(
        event=event, action=action, summary=summary, user_id=user_id, details=details
    ))


def _user_label(user):
    if not user:
        return 'Unassigned'
    return f'{user.name} ({user.head_type})' if user.head_type else user.name


def _clean_text(value, label, max_length=5000, required=False):
    if value is None or value == '':
        if required:
            return None, f'{label} is required'
        return None, None
    if not isinstance(value, str):
        return None, f'{label} must be text'
    text = value.strip()
    if required and not text:
        return None, f'{label} is required'
    if len(text) > max_length:
        return None, f'{label} must be {max_length} characters or fewer'
    return (text or None), None


def _parse_responsible(data, existing=None):
    """Returns (provided, user_id_or_None, error). ``provided`` is False when
    the client did not send the field (so an update leaves it alone)."""
    if 'responsible_user_id' not in data:
        return False, None, None
    raw = data.get('responsible_user_id')
    if raw in (None, '', 'null'):
        return True, None, None
    try:
        user_id = int(raw)
    except (TypeError, ValueError):
        return True, None, 'Responsible person must be a valid user'
    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        # Keep an existing (possibly since-deactivated) assignee unchanged.
        if existing is not None and existing.responsible_user_id == user_id:
            return True, user_id, None
        return True, None, 'Responsible person must be an active user'
    return True, user_id, None


def _event_storage_folder():
    return os.path.join(current_app.config['UPLOAD_FOLDER'], 'academic_events')


def _request_data():
    if request.is_json:
        data = request.get_json(silent=True)
    else:
        data = request.form.to_dict()
    return data if isinstance(data, dict) else None


def _parse_audience(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return None
    if not isinstance(value, list) or not value:
        return None
    if any(not isinstance(role, str) or (role != 'ALL' and role not in ROLES) for role in value):
        return None
    normalized = list(dict.fromkeys(value))
    if 'ALL' in normalized and len(normalized) != 1:
        return None
    return normalized


def _validated_fields(data, existing=None):
    values = {}
    required = ('title', 'category', 'start_date', 'end_date', 'start_time', 'end_time', 'target_audience')
    for field in required:
        raw = data.get(field, getattr(existing, field, None) if existing else None)
        if raw is None or raw == '':
            return None, f'{field.replace("_", " ").capitalize()} is required'

    title = data.get('title', existing.title if existing else '')
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 255:
        return None, 'Title is required and must be 255 characters or fewer'
    values['title'] = title.strip()

    category = data.get('category', existing.category if existing else '')
    if not isinstance(category, str) or category.upper() not in EVENT_CATEGORIES:
        return None, 'Invalid event category'
    values['category'] = category.upper()

    for field in ('start_date', 'end_date'):
        raw = data.get(field, getattr(existing, field, None).isoformat() if existing else None)
        try:
            parsed = date.fromisoformat(raw) if isinstance(raw, str) else raw
        except ValueError:
            return None, f'{field.replace("_", " ").capitalize()} must be a valid YYYY-MM-DD date'
        if not isinstance(parsed, date) or parsed.isoformat() != raw:
            return None, f'{field.replace("_", " ").capitalize()} must be a valid YYYY-MM-DD date'
        values[field] = parsed

    for field in ('start_time', 'end_time'):
        raw = data.get(field, getattr(existing, field, None).strftime('%H:%M') if existing else None)
        if isinstance(raw, str):
            try:
                parsed = datetime.strptime(raw, '%H:%M').time()
            except ValueError:
                return None, f'{field.replace("_", " ").capitalize()} must use HH:MM format'
        elif isinstance(raw, time):
            parsed = raw
        else:
            return None, f'{field.replace("_", " ").capitalize()} must use HH:MM format'
        values[field] = parsed

    if datetime.combine(values['end_date'], values['end_time']) <= datetime.combine(values['start_date'], values['start_time']):
        return None, 'Event end must be after its start'

    description = data.get('description', existing.description if existing else '')
    if description is not None and not isinstance(description, str):
        return None, 'Description must be text'
    description = (description or '').strip()
    if len(description) > 5000:
        return None, 'Description must be 5000 characters or fewer'
    values['description'] = description or None

    location = data.get('location', existing.location if existing else '')
    if location is not None and not isinstance(location, str):
        return None, 'Location must be text'
    location = (location or '').strip()
    if len(location) > 255:
        return None, 'Location must be 255 characters or fewer'
    values['location'] = location or None

    audience_value = data.get(
        'target_audience',
        existing.target_audience if existing else None,
    )
    audience = _parse_audience(audience_value)
    if audience is None:
        return None, 'Target audience must be ALL or a list of valid user roles'
    values['target_audience'] = audience
    return values, None


def _store_attachment(upload):
    if not upload or not upload.filename:
        return None, None, None
    filename = secure_filename(upload.filename)
    if not filename or len(filename) > 255 or '.' not in filename:
        return None, None, 'A valid attachment filename is required'
    extension = filename.rsplit('.', 1)[1].lower()
    if extension not in ATTACHMENT_EXTENSIONS:
        return None, None, 'Unsupported attachment file type'
    try:
        upload.stream.seek(0, os.SEEK_END)
        file_size = upload.stream.tell()
        upload.stream.seek(0)
    except OSError:
        return None, None, 'Unable to read the attachment'
    if file_size <= 0:
        return None, None, 'Attachment cannot be empty'
    if file_size > MAX_ATTACHMENT_SIZE:
        return None, None, 'Attachment must be 10 MB or smaller'

    storage_name = f'{uuid.uuid4().hex}.{extension}'
    storage_path = os.path.join(_event_storage_folder(), storage_name)
    try:
        os.makedirs(_event_storage_folder(), exist_ok=True)
        upload.save(storage_path)
    except OSError:
        current_app.logger.exception('Failed to store academic event attachment')
        return None, None, 'Unable to store the attachment'
    return (storage_name, filename, storage_path), None, None


def _remove_attachment(storage_name):
    if not storage_name:
        return True
    if os.path.basename(storage_name) != storage_name:
        current_app.logger.error('Refusing to remove academic event attachment outside its storage folder')
        return False
    storage_path = os.path.join(_event_storage_folder(), storage_name)
    try:
        if os.path.isfile(storage_path):
            os.remove(storage_path)
    except OSError:
        current_app.logger.exception('Failed to remove academic event attachment %s', storage_name)
        return False
    return True


@academic_events_bp.errorhandler(RequestEntityTooLarge)
def handle_upload_too_large(_error):
    del _error
    return error('Academic event request exceeds the maximum size', 413)


@academic_events_bp.route('', methods=['GET'])
@jwt_required()
def list_academic_events():
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)

    query = AcademicEvent.query
    start_value = request.args.get('start')
    end_value = request.args.get('end')
    upcoming = request.args.get('upcoming', '').lower() in ('1', 'true', 'yes')
    if start_value:
        try:
            start = date.fromisoformat(start_value)
            if start.isoformat() != start_value:
                raise ValueError
        except ValueError:
            return error('start must be a valid YYYY-MM-DD date', 400)
        query = query.filter(AcademicEvent.end_date >= start)
    if end_value:
        try:
            end = date.fromisoformat(end_value)
            if end.isoformat() != end_value:
                raise ValueError
        except ValueError:
            return error('end must be a valid YYYY-MM-DD date', 400)
        query = query.filter(AcademicEvent.start_date <= end)
    if start_value and end_value and start > end:
        return error('start must be on or before end', 400)
    if upcoming:
        query = query.filter(AcademicEvent.end_date >= school_today())

    responsible_value = request.args.get('responsible_user_id')
    if responsible_value:
        try:
            query = query.filter(AcademicEvent.responsible_user_id == int(responsible_value))
        except ValueError:
            return error('responsible_user_id must be a number', 400)

    alerts.notify_overdue_events(user.id)  # lazy, idempotent: works even with the scheduler off
    events = query.order_by(AcademicEvent.start_date.asc(), AcademicEvent.start_time.asc()).all()
    visible_events = [event for event in events if _event_visible_to_user(event, user)]
    if upcoming:
        visible_events = visible_events[:10]
    return success([event.to_dict() for event in visible_events])


@academic_events_bp.route('/pending-updates', methods=['GET'])
@jwt_required()
def my_pending_updates():
    """Events the caller is responsible for that are overdue and not completed."""
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    alerts.notify_overdue_events(user.id)
    return success([event.to_dict() for event in alerts.pending_updates_for(user.id)])


@academic_events_bp.route('/<int:event_id>', methods=['GET'])
@jwt_required()
def get_academic_event(event_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    event = db.session.get(AcademicEvent, event_id)
    if not event:
        return error('Event not found', 404)
    if not _event_visible_to_user(event, user):
        return error('Forbidden: event is outside your target audience', 403)
    return success(event.to_dict())


@academic_events_bp.route('', methods=['POST'])
@roles_required(*EVENT_MANAGER_ROLES)
def create_academic_event():
    data = _request_data()
    if data is None:
        return error('A valid event payload is required', 400)
    values, validation_error = _validated_fields(data)
    if validation_error:
        return error(validation_error, 400)

    _, responsible_id, responsible_error = _parse_responsible(data)
    if responsible_error:
        return error(responsible_error, 400)

    attachment, _, attachment_error = _store_attachment(request.files.get('attachment'))
    if attachment_error:
        return error(attachment_error, 400)
    actor_id = int(get_jwt_identity())
    event = AcademicEvent(
        **values,
        created_by=actor_id,
        responsible_user_id=responsible_id,
        original_start_date=values['start_date'],
        original_start_time=values['start_time'],
    )
    if attachment:
        event.attachment_storage_name, event.attachment_filename, storage_path = attachment
    else:
        storage_path = None

    try:
        db.session.add(event)
        db.session.flush()
        responsible = db.session.get(User, responsible_id) if responsible_id else None
        _log(
            event, 'CREATED',
            f'Event created, scheduled for {values["start_date"].isoformat()} '
            f'{values["start_time"].strftime("%H:%M")}–{values["end_time"].strftime("%H:%M")}; '
            f'responsible person: {_user_label(responsible)}.',
            actor_id,
            {
                'start_date': values['start_date'].isoformat(),
                'start_time': values['start_time'].strftime('%H:%M'),
                'end_date': values['end_date'].isoformat(),
                'end_time': values['end_time'].strftime('%H:%M'),
                'responsible_user_id': responsible_id,
            },
        )
        alerts.notify_assigned(event, actor_id)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        if storage_path and os.path.exists(storage_path):
            try:
                os.remove(storage_path)
            except OSError:
                current_app.logger.exception('Failed to clean up attachment after event creation error')
        current_app.logger.exception('Failed to create academic event')
        return error('Unable to create academic event', 500)
    return success(event.to_dict(), 'Academic event created', 201)


@academic_events_bp.route('/<int:event_id>', methods=['PUT'])
@roles_required(*EVENT_MANAGER_ROLES)
def update_academic_event(event_id):
    event = db.session.get(AcademicEvent, event_id)
    if not event:
        return error('Event not found', 404)
    data = _request_data()
    if data is None:
        return error('A valid event payload is required', 400)
    values, validation_error = _validated_fields(data, event)
    if validation_error:
        return error(validation_error, 400)
    if not any(field in data for field in (
        'title', 'description', 'category', 'start_date', 'end_date',
        'start_time', 'end_time', 'location', 'target_audience', 'responsible_user_id'
    )) and not request.files.get('attachment'):
        return error('No event changes were provided', 400)
    responsible_provided, responsible_id, responsible_error = _parse_responsible(data, event)
    if responsible_error:
        return error(responsible_error, 400)

    attachment, _, attachment_error = _store_attachment(request.files.get('attachment'))
    if attachment_error:
        return error(attachment_error, 400)
    old_attachment = event.attachment_storage_name
    actor_id = int(get_jwt_identity())
    old_schedule = (event.start_date, event.start_time, event.end_date, event.end_time)
    old_responsible_id = event.responsible_user_id
    changed_fields = [
        field for field, value in values.items()
        if field not in ('start_date', 'start_time', 'end_date', 'end_time')
        and getattr(event, field) != value
    ]
    for field, value in values.items():
        setattr(event, field, value)
    if event.original_start_date is None:  # legacy rows: first edit pins the original schedule
        event.original_start_date, event.original_start_time = old_schedule[0], old_schedule[1]
    new_schedule = (event.start_date, event.start_time, event.end_date, event.end_time)
    if new_schedule != old_schedule:
        fmt = lambda sched: (  # noqa: E731
            f'{sched[0].isoformat()} {sched[1].strftime("%H:%M")} – '
            f'{sched[2].isoformat()} {sched[3].strftime("%H:%M")}'
        )
        _log(
            event, 'RESCHEDULED',
            f'Schedule changed from {fmt(old_schedule)} to {fmt(new_schedule)}.',
            actor_id,
            {'from': [old_schedule[0].isoformat(), old_schedule[1].strftime('%H:%M'),
                      old_schedule[2].isoformat(), old_schedule[3].strftime('%H:%M')],
             'to': [new_schedule[0].isoformat(), new_schedule[1].strftime('%H:%M'),
                    new_schedule[2].isoformat(), new_schedule[3].strftime('%H:%M')]},
        )
        event.overdue_notified_at = None  # new schedule -> eligible for a fresh overdue alert
    if responsible_provided and responsible_id != old_responsible_id:
        old_user = db.session.get(User, old_responsible_id) if old_responsible_id else None
        new_user = db.session.get(User, responsible_id) if responsible_id else None
        event.responsible_user_id = responsible_id
        event.overdue_notified_at = None
        _log(
            event, 'RESPONSIBLE_CHANGED',
            f'Responsible person changed from {_user_label(old_user)} to {_user_label(new_user)}.',
            actor_id,
            {'from': old_responsible_id, 'to': responsible_id},
        )
        alerts.notify_assigned(event, actor_id)
    if changed_fields or attachment:
        labels = [field.replace('_', ' ') for field in changed_fields] + (['attachment'] if attachment else [])
        _log(event, 'UPDATED', f'Event details updated ({", ".join(labels)}).', actor_id, {'fields': labels})
    if attachment:
        event.attachment_storage_name, event.attachment_filename, new_storage_path = attachment
    else:
        new_storage_path = None

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        if new_storage_path and os.path.exists(new_storage_path):
            try:
                os.remove(new_storage_path)
            except OSError:
                current_app.logger.exception('Failed to clean up attachment after event update error')
        current_app.logger.exception('Failed to update academic event')
        return error('Unable to update academic event', 500)
    if attachment:
        if not _remove_attachment(old_attachment):
            return error('Event updated, but its previous attachment could not be removed', 500)
    return success(event.to_dict(), 'Academic event updated')


def _load_event_for_update(event_id):
    """Shared guard for the reason/completion/approval endpoints.
    Returns (event, user, error_response)."""
    user = _active_user()
    if not user:
        return None, None, error('User not found or inactive', 401)
    event = db.session.get(AcademicEvent, event_id)
    if not event:
        return None, None, error('Event not found', 404)
    if not _event_visible_to_user(event, user):
        return None, None, error('Forbidden: event is outside your target audience', 403)
    if not _can_update_completion(event, user):
        return None, None, error('Only the responsible person or a manager can update this event', 403)
    return event, user, None


def _commit_or_error(message):
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception(message)
        return error(message, 500)
    return None


@academic_events_bp.route('/<int:event_id>/reason', methods=['POST'])
@jwt_required()
def submit_non_completion_reason(event_id):
    """Responsible person explains why an overdue event was not completed on time.
    Never changes completion status."""
    event, user, failure = _load_event_for_update(event_id)
    if failure:
        return failure
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error('A JSON object is required', 400)
    if event.is_completed:
        return error('This event is already completed', 400)
    if not event.is_overdue:
        return error('A reason can only be submitted after the scheduled time has passed', 400)
    reason, reason_error = _clean_text(data.get('reason'), 'Reason', required=True)
    if reason_error:
        return error(reason_error, 400)

    event.non_completion_reason = reason
    event.reason_submitted_by = user.id
    event.reason_submitted_at = datetime.now(timezone.utc)
    _log(
        event, 'REASON_SUBMITTED',
        f'Reason for not completing the event on schedule: {reason}',
        user.id,
        {'reason': reason, 'scheduled_date': event.end_date.isoformat()},
    )
    failure = _commit_or_error('Unable to save the reason')
    return failure or success(event.to_dict(), 'Reason submitted')


@academic_events_bp.route('/<int:event_id>/complete', methods=['POST'])
@jwt_required()
def complete_event(event_id):
    """Mark the event completed (completion only) and optionally record the
    management approval outcome in the same step. Approval is stored in its own
    column and defaults to Pending - it is never assumed."""
    event, user, failure = _load_event_for_update(event_id)
    if failure:
        return failure
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error('A JSON object is required', 400)
    if event.is_completed:
        return error('This event is already completed', 400)

    remarks, remarks_error = _clean_text(data.get('remarks'), 'Completion remarks')
    if remarks_error:
        return error(remarks_error, 400)

    actual_value = data.get('actual_completion_date')
    if actual_value in (None, ''):
        actual_date = school_today()
    else:
        try:
            actual_date = date.fromisoformat(actual_value) if isinstance(actual_value, str) else None
            if actual_date is None or actual_date.isoformat() != actual_value:
                raise ValueError
        except ValueError:
            return error('Actual completion date must be a valid YYYY-MM-DD date', 400)
    if actual_date > school_today():
        return error('Actual completion date cannot be in the future', 400)

    # Completed after the scheduled end -> a reason must be on record.
    completed_late = datetime.combine(actual_date, time.max, tzinfo=event.scheduled_end.tzinfo) > event.scheduled_end \
        and event.is_overdue
    if completed_late and not event.non_completion_reason:
        reason, reason_error = _clean_text(data.get('reason'), 'Reason for not completing on schedule', required=True)
        if reason_error:
            return error(f'{reason_error} (the event was not completed on its scheduled time)', 400)
        event.non_completion_reason = reason
        event.reason_submitted_by = user.id
        event.reason_submitted_at = datetime.now(timezone.utc)
        _log(
            event, 'REASON_SUBMITTED',
            f'Reason for not completing the event on schedule: {reason}',
            user.id,
            {'reason': reason, 'scheduled_date': event.end_date.isoformat()},
        )

    approval_status = data.get('approval_status', APPROVAL_PENDING)
    approval_status = approval_status.upper() if isinstance(approval_status, str) else None
    if approval_status not in APPROVAL_STATUSES:
        return error('Management approval must be Yes, No or Pending', 400)
    approval_remarks, approval_error = _clean_text(data.get('approval_remarks'), 'Approval remarks')
    if approval_error:
        return error(approval_error, 400)

    now = datetime.now(timezone.utc)
    event.completion_status = COMPLETION_COMPLETED
    event.completed_by = user.id
    event.actual_completion_date = actual_date
    event.completed_at = now
    event.completion_remarks = remarks
    _log(
        event, 'COMPLETED',
        f'Marked completed by {user.name} on {actual_date.isoformat()}'
        + (f'. Remarks: {remarks}' if remarks else '.'),
        user.id,
        {'actual_completion_date': actual_date.isoformat(), 'remarks': remarks},
    )
    event.approval_status = approval_status
    event.approval_remarks = approval_remarks
    event.approval_updated_by = user.id
    event.approval_updated_at = now
    _log(
        event, 'APPROVAL_UPDATED',
        f'Management approval recorded as {approval_status.title()}'
        + (f'. Remarks: {approval_remarks}' if approval_remarks else '.'),
        user.id,
        {'approval_status': approval_status, 'remarks': approval_remarks},
    )
    failure = _commit_or_error('Unable to save the completion update')
    return failure or success(event.to_dict(), 'Event marked as completed')


@academic_events_bp.route('/<int:event_id>/approval', methods=['POST'])
@jwt_required()
def update_event_approval(event_id):
    """Record / change the management approval of a COMPLETED event.
    Does not touch the completion fields."""
    event, user, failure = _load_event_for_update(event_id)
    if failure:
        return failure
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error('A JSON object is required', 400)
    if not event.is_completed:
        return error('Management approval can only be recorded after the event is completed', 400)
    status = data.get('approval_status')
    status = status.upper() if isinstance(status, str) else None
    if status not in APPROVAL_STATUSES:
        return error('Management approval must be Yes, No or Pending', 400)
    remarks, remarks_error = _clean_text(data.get('remarks'), 'Approval remarks')
    if remarks_error:
        return error(remarks_error, 400)

    event.approval_status = status
    event.approval_remarks = remarks
    event.approval_updated_by = user.id
    event.approval_updated_at = datetime.now(timezone.utc)
    _log(
        event, 'APPROVAL_UPDATED',
        f'Management approval set to {status.title()}' + (f'. Remarks: {remarks}' if remarks else '.'),
        user.id,
        {'approval_status': status, 'remarks': remarks},
    )
    if user.id != event.responsible_user_id:
        alerts.notify_approval_changed(event, user.id)
    failure = _commit_or_error('Unable to save the approval update')
    return failure or success(event.to_dict(), 'Management approval updated')


@academic_events_bp.route('/<int:event_id>/history', methods=['GET'])
@jwt_required()
def event_history(event_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    event = db.session.get(AcademicEvent, event_id)
    if not event:
        return error('Event not found', 404)
    if not _event_visible_to_user(event, user):
        return error('Forbidden: event is outside your target audience', 403)
    entries = [entry.to_dict() for entry in event.history.all()]
    if not any(entry['action'] == 'CREATED' for entry in entries):
        # Events that pre-date the audit trail: show what we know so the
        # history is never empty or misleading.
        entries.insert(0, {
            'id': None, 'event_id': event.id, 'action': 'CREATED',
            'summary': (
                f'Event created (before the audit trail existed), originally scheduled for '
                f'{(event.original_start_date or event.start_date).isoformat()} '
                f'{(event.original_start_time or event.start_time).strftime("%H:%M")}.'
            ),
            'details': None,
            'user_id': event.created_by,
            'user_name': event.creator.name if event.creator else None,
            'created_at': event.created_at.isoformat() if event.created_at else None,
        })
    return success(entries)


@academic_events_bp.route('/<int:event_id>/attachment', methods=['GET'])
@jwt_required()
def download_event_attachment(event_id):
    user = _active_user()
    if not user:
        return error('User not found or inactive', 401)
    event = db.session.get(AcademicEvent, event_id)
    if not event:
        return error('Event not found', 404)
    if not _event_visible_to_user(event, user):
        return error('Forbidden: event is outside your target audience', 403)
    if not event.attachment_storage_name or not event.attachment_filename:
        return error('Event has no attachment', 404)
    storage_folder = _event_storage_folder()
    if not os.path.isfile(os.path.join(storage_folder, event.attachment_storage_name)):
        return error('Event attachment not found', 404)
    return send_from_directory(
        storage_folder,
        event.attachment_storage_name,
        as_attachment=True,
        download_name=event.attachment_filename,
    )


@academic_events_bp.route('/<int:event_id>', methods=['DELETE'])
@roles_required(*EVENT_MANAGER_ROLES)
def delete_academic_event(event_id):
    event = db.session.get(AcademicEvent, event_id)
    if not event:
        return error('Event not found', 404)
    attachment_name = event.attachment_storage_name
    db.session.delete(event)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception('Failed to delete academic event')
        return error('Unable to delete academic event', 500)
    if not _remove_attachment(attachment_name):
        return error('Event deleted, but its attachment could not be removed', 500)
    return success(None, 'Academic event deleted')
