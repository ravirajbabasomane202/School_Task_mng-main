import json
import os
import uuid
from datetime import date, datetime, time

from flask import Blueprint, current_app, request, send_from_directory
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.academic_event import AcademicEvent
from app.models.user import User, ROLES
from app.utils.decorators import roles_required
from app.utils.response import error, success
from app.utils.timezone import school_today


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
    return user.role in EVENT_MANAGER_ROLES or 'ALL' in event.target_audience or user.role in event.target_audience


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

    events = query.order_by(AcademicEvent.start_date.asc(), AcademicEvent.start_time.asc()).all()
    visible_events = [event for event in events if _event_visible_to_user(event, user)]
    if upcoming:
        visible_events = visible_events[:10]
    return success([event.to_dict() for event in visible_events])


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

    attachment, _, attachment_error = _store_attachment(request.files.get('attachment'))
    if attachment_error:
        return error(attachment_error, 400)
    event = AcademicEvent(**values, created_by=int(get_jwt_identity()))
    if attachment:
        event.attachment_storage_name, event.attachment_filename, storage_path = attachment
    else:
        storage_path = None

    try:
        db.session.add(event)
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
        'start_time', 'end_time', 'location', 'target_audience'
    )) and not request.files.get('attachment'):
        return error('No event changes were provided', 400)

    attachment, _, attachment_error = _store_attachment(request.files.get('attachment'))
    if attachment_error:
        return error(attachment_error, 400)
    old_attachment = event.attachment_storage_name
    for field, value in values.items():
        setattr(event, field, value)
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
