import json
import os
import uuid
from datetime import date, datetime, time, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import exists, func, or_
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.important_document import DocumentAudience, DocumentFolder, ImportantDocument
from app.models.user import User
from app.utils.decorators import roles_required
from app.utils.response import error, success
from app.utils.timezone import school_tz


important_documents_bp = Blueprint('important_documents', __name__)

DOCUMENT_ROLES = ('CHAIRMAN', 'PRINCIPAL')
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'}
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
FILE_SIGNATURES = {
    'pdf': (b'%PDF-',),
    'jpg': (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
    'png': (b'\x89PNG\r\n\x1a\n',),
    'doc': (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
    'xls': (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
    'ppt': (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
    'docx': (b'PK\x03\x04',),
    'xlsx': (b'PK\x03\x04',),
    'pptx': (b'PK\x03\x04',),
}


def _get_active_user():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None

    user = db.session.get(User, user_id)
    return user if user and user.is_active else None


def _document_storage_folder():
    return os.path.join(current_app.config['UPLOAD_FOLDER'], 'documents')


# --------------------------------------------------------------------------
# Access control
# --------------------------------------------------------------------------
# Visibility is decided HERE, on the server, for every list / detail / download
# request. Hiding a row in the UI is never the only protection.
#
#   * DOCUMENT_ROLES (Chairman-level managers) can see every document.
#   * The uploader always sees their own document.
#   * An unrestricted document (restricted = False; every document created
#     before audiences existed) is visible to every signed-in user, as before.
#   * A restricted document is visible only to the users listed in its audience.

def _is_manager(user):
    return user.role in DOCUMENT_ROLES


def _can_access_document(user, document):
    if _is_manager(user) or document.uploaded_by == user.id or not document.restricted:
        return True
    return any(entry.user_id == user.id for entry in document.audience)


def _visibility_criterion(user):
    """SQL equivalent of ``_can_access_document`` (None = no restriction)."""
    if _is_manager(user):
        return None
    return or_(
        ImportantDocument.restricted.is_(False),
        ImportantDocument.uploaded_by == user.id,
        exists().where(
            (DocumentAudience.document_id == ImportantDocument.id)
            & (DocumentAudience.user_id == user.id)
        ),
    )


def _like(value):
    escaped = value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    return f'%{escaped}%'


def _folder_maps():
    """({id: folder}, {parent_id: [child ids]}) - folder trees are small."""
    folders = DocumentFolder.query.all()
    by_id = {folder.id: folder for folder in folders}
    children = {}
    for folder in folders:
        children.setdefault(folder.parent_id, []).append(folder.id)
    return by_id, children


def _folder_path_names(folder_id, by_id):
    names, guard = [], 0
    while folder_id is not None and folder_id in by_id and guard < 100:
        folder = by_id[folder_id]
        names.append(folder.name)
        folder_id = folder.parent_id
        guard += 1
    return list(reversed(names))


def _descendant_ids(folder_ids, children):
    result, stack = set(), list(folder_ids)
    while stack:
        current = stack.pop()
        if current in result:
            continue
        result.add(current)
        stack.extend(children.get(current, []))
    return result


def _document_payload(document, user, by_id):
    data = document.to_dict(include_audience=_is_manager(user))
    data['folder_path'] = _folder_path_names(document.folder_id, by_id)
    return data


def _parse_bool(value, default=None):
    if value is None or value == '':
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ('1', 'true', 'yes', 'on'):
        return True
    if text in ('0', 'false', 'no', 'off'):
        return False
    return default


def _parse_audience(data):
    """Read the visibility fields from a form or JSON payload.

    Returns ``(provided, restricted, user_ids, error)``. ``provided`` is False
    when the client sent no visibility field at all (an update then leaves the
    audience alone; an upload then stays visible to everyone, as before).
    """
    if 'visible_to_all' not in data and 'audience_user_ids' not in data:
        return False, False, [], None

    visible_to_all = _parse_bool(data.get('visible_to_all'), default=None)
    raw_ids = data.get('audience_user_ids')
    if visible_to_all is True:
        return True, False, [], None

    if isinstance(raw_ids, str):
        try:
            raw_ids = json.loads(raw_ids) if raw_ids.strip() else []
        except ValueError:
            return True, True, [], 'Audience must be a list of user ids'
    if raw_ids is None:
        raw_ids = []
    if not isinstance(raw_ids, list):
        return True, True, [], 'Audience must be a list of user ids'
    try:
        user_ids = list(dict.fromkeys(int(value) for value in raw_ids))
    except (TypeError, ValueError):
        return True, True, [], 'Audience must be a list of user ids'
    if not user_ids:
        return True, True, [], 'Select at least one user, or choose Select All'
    found = {
        row[0] for row in db.session.query(User.id)
        .filter(User.id.in_(user_ids), User.is_active.is_(True)).all()
    }
    if len(found) != len(user_ids):
        return True, True, [], 'Audience can only include active users'
    return True, True, user_ids, None


def _apply_audience(document, restricted, user_ids):
    document.restricted = restricted
    wanted = set(user_ids if restricted else [])
    for entry in list(document.audience):
        if entry.user_id not in wanted:
            document.audience.remove(entry)
    existing = {entry.user_id for entry in document.audience}
    for user_id in wanted - existing:
        document.audience.append(DocumentAudience(user_id=user_id))


def _parse_folder_id(data, required_key=False):
    """Returns (provided, folder_id_or_None, error)."""
    if 'folder_id' not in data:
        return False, None, None
    raw = data.get('folder_id')
    if raw in (None, '', 'null', 'root'):
        return True, None, None
    try:
        folder_id = int(raw)
    except (TypeError, ValueError):
        return True, None, 'Folder must be a valid folder'
    if not db.session.get(DocumentFolder, folder_id):
        return True, None, 'Folder not found'
    return True, folder_id, None


def _file_matches_extension(file_storage, extension):
    file_storage.stream.seek(0)
    signature = file_storage.stream.read(8)
    file_storage.stream.seek(0)
    return any(signature.startswith(prefix) for prefix in FILE_SIGNATURES[extension])


@important_documents_bp.errorhandler(RequestEntityTooLarge)
def handle_document_request_too_large(_error):
    return error('Document upload exceeds the maximum request size', 413)


def _school_day_bounds(value, label):
    try:
        day = date.fromisoformat(value)
        if day.isoformat() != value:
            raise ValueError
    except (TypeError, ValueError):
        return None, f'{label} must be a valid YYYY-MM-DD date'
    return day, None


@important_documents_bp.route('', methods=['GET'])
@jwt_required()
def list_documents():
    """List/search the documents the caller is allowed to see.

    Filters (all optional, combinable): q, folder_id (an id or ``root``),
    recursive, category, uploaded_by (user id or part of a name), file_type,
    date_from, date_to, page, page_size. Everything is applied in SQL after the
    visibility rule, so a user can never discover documents outside their
    audience through search either.
    """
    user = _get_active_user()
    if not user:
        return error('User not found or inactive', 401)

    args = request.args
    query = ImportantDocument.query
    criterion = _visibility_criterion(user)
    if criterion is not None:
        query = query.filter(criterion)

    by_id, children = _folder_maps()

    folder_value = (args.get('folder_id') or '').strip()
    if folder_value:
        recursive = _parse_bool(args.get('recursive'), default=False)
        if folder_value.lower() == 'root':
            if not recursive:
                query = query.filter(ImportantDocument.folder_id.is_(None))
        else:
            try:
                folder_id = int(folder_value)
            except ValueError:
                return error('folder_id must be a number or "root"', 400)
            if folder_id not in by_id:
                return error('Folder not found', 404)
            ids = _descendant_ids([folder_id], children) if recursive else {folder_id}
            query = query.filter(ImportantDocument.folder_id.in_(ids))

    text = (args.get('q') or '').strip()
    if text:
        pattern = _like(text)
        matching_folders = [fid for fid, folder in by_id.items() if text.lower() in folder.name.lower()]
        folder_ids = _descendant_ids(matching_folders, children) if matching_folders else set()
        conditions = [
            ImportantDocument.name.ilike(pattern, escape='\\'),
            ImportantDocument.description.ilike(pattern, escape='\\'),
            ImportantDocument.original_filename.ilike(pattern, escape='\\'),
            ImportantDocument.category.ilike(pattern, escape='\\'),
        ]
        if folder_ids:
            conditions.append(ImportantDocument.folder_id.in_(folder_ids))
        query = query.filter(or_(*conditions))

    category = (args.get('category') or '').strip()
    if category:
        query = query.filter(ImportantDocument.category.ilike(_like(category), escape='\\'))

    file_type = (args.get('file_type') or '').strip().upper().lstrip('.')
    if file_type:
        query = query.filter(ImportantDocument.file_type == file_type)

    uploaded_by = (args.get('uploaded_by') or '').strip()
    if uploaded_by:
        if uploaded_by.isdigit():
            query = query.filter(ImportantDocument.uploaded_by == int(uploaded_by))
        else:
            query = query.filter(ImportantDocument.uploaded_by.in_(
                db.session.query(User.id).filter(User.name.ilike(_like(uploaded_by), escape='\\'))
            ))

    # Upload dates are school-calendar days; stored timestamps are UTC.
    for key, label in (('date_from', 'date_from'), ('date_to', 'date_to')):
        value = (args.get(key) or '').strip()
        if not value:
            continue
        day, day_error = _school_day_bounds(value, label)
        if day_error:
            return error(day_error, 400)
        if key == 'date_from':
            start = datetime.combine(day, time.min, tzinfo=school_tz()).astimezone(timezone.utc)
            query = query.filter(ImportantDocument.created_at >= start)
        else:
            end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=school_tz()).astimezone(timezone.utc)
            query = query.filter(ImportantDocument.created_at < end)

    try:
        page = max(int(args.get('page', 1)), 1)
        page_size = min(max(int(args.get('page_size', 50)), 1), 200)
    except ValueError:
        return error('page and page_size must be numbers', 400)

    total = query.order_by(None).count()
    documents = (
        query.order_by(ImportantDocument.created_at.desc(), ImportantDocument.id.desc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    payload = {
        'success': True,
        'message': 'OK',
        'data': [_document_payload(document, user, by_id) for document in documents],
        'meta': {'total': total, 'page': page, 'page_size': page_size},
    }
    return jsonify(payload), 200


@important_documents_bp.route('/<int:document_id>', methods=['GET'])
@jwt_required()
def get_document(document_id):
    user = _get_active_user()
    if not user:
        return error('User not found or inactive', 401)

    document = db.session.get(ImportantDocument, document_id)
    if not document:
        return error('Document not found', 404)
    if not _can_access_document(user, document):
        return error('Forbidden: you do not have access to this document', 403)
    by_id, _ = _folder_maps()
    return success(_document_payload(document, user, by_id))


# ---- Folders --------------------------------------------------------------

MAX_FOLDER_DEPTH = 8
FORBIDDEN_FOLDER_CHARS = ('/', '\\')


def _clean_folder_name(value):
    if not isinstance(value, str) or not value.strip():
        return None, 'Folder name is required'
    name = ' '.join(value.split())
    if len(name) > 150:
        return None, 'Folder name must be 150 characters or fewer'
    if any(char in name for char in FORBIDDEN_FOLDER_CHARS):
        return None, 'Folder name cannot contain / or \\'
    return name, None


def _sibling_name_taken(name, parent_id, ignore_id=None):
    query = DocumentFolder.query.filter(func.lower(DocumentFolder.name) == name.lower())
    query = query.filter(
        DocumentFolder.parent_id.is_(None) if parent_id is None else DocumentFolder.parent_id == parent_id
    )
    if ignore_id is not None:
        query = query.filter(DocumentFolder.id != ignore_id)
    return query.first() is not None


def _depth(folder_id, by_id):
    return len(_folder_path_names(folder_id, by_id))


def _subtree_height(folder_id, children):
    kids = children.get(folder_id, [])
    return 1 + max((_subtree_height(kid, children) for kid in kids), default=0)


def _folder_payload(folder, by_id, direct_counts, subtree_counts, children):
    return {
        'id': folder.id,
        'name': folder.name,
        'parent_id': folder.parent_id,
        'path': _folder_path_names(folder.id, by_id),
        'document_count': direct_counts.get(folder.id, 0),
        'total_document_count': subtree_counts.get(folder.id, 0),
        'subfolder_count': len(children.get(folder.id, [])),
        'created_at': folder.created_at.isoformat() if folder.created_at else None,
    }


@important_documents_bp.route('/folders', methods=['GET'])
@jwt_required()
def list_folders():
    """Folders the caller can navigate. Managers see them all; everyone else
    sees only folders that lead to at least one document they may open, so
    folder names never reveal the existence of restricted material."""
    user = _get_active_user()
    if not user:
        return error('User not found or inactive', 401)

    by_id, children = _folder_maps()
    count_query = db.session.query(ImportantDocument.folder_id, func.count(ImportantDocument.id)).filter(
        ImportantDocument.folder_id.isnot(None)
    )
    criterion = _visibility_criterion(user)
    if criterion is not None:
        count_query = count_query.filter(criterion)
    direct_counts = {folder_id: count for folder_id, count in count_query.group_by(ImportantDocument.folder_id).all()}

    subtree_counts = {}
    for folder_id in by_id:
        subtree_counts[folder_id] = sum(
            direct_counts.get(descendant, 0) for descendant in _descendant_ids([folder_id], children)
        )

    manager = _is_manager(user)
    folders = [
        folder for folder in by_id.values()
        if manager or subtree_counts.get(folder.id, 0) > 0
    ]
    folders.sort(key=lambda folder: (folder.name.lower(), folder.id))
    return success([
        _folder_payload(folder, by_id, direct_counts, subtree_counts, children) for folder in folders
    ])


@important_documents_bp.route('/folders', methods=['POST'])
@roles_required(*DOCUMENT_ROLES)
def create_folder():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error('A JSON object is required', 400)
    name, name_error = _clean_folder_name(data.get('name'))
    if name_error:
        return error(name_error, 400)
    _, parent_id, parent_error = _parse_folder_id({'folder_id': data.get('parent_id')})
    if parent_error:
        return error('Parent folder not found' if parent_error == 'Folder not found' else parent_error, 400)
    by_id, _ = _folder_maps()
    if parent_id is not None and _depth(parent_id, by_id) >= MAX_FOLDER_DEPTH:
        return error(f'Folders can only be nested {MAX_FOLDER_DEPTH} levels deep', 400)
    if _sibling_name_taken(name, parent_id):
        return error('A folder with this name already exists here', 409)

    folder = DocumentFolder(name=name, parent_id=parent_id, created_by=int(get_jwt_identity()))
    try:
        db.session.add(folder)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception('Failed to create document folder')
        return error('Unable to create folder', 500)
    by_id, children = _folder_maps()
    return success(_folder_payload(folder, by_id, {}, {}, children), 'Folder created', 201)


@important_documents_bp.route('/folders/<int:folder_id>', methods=['PUT'])
@roles_required(*DOCUMENT_ROLES)
def update_folder(folder_id):
    """Rename and/or move a folder."""
    folder = db.session.get(DocumentFolder, folder_id)
    if not folder:
        return error('Folder not found', 404)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not ({'name', 'parent_id'} & set(data)):
        return error('A new name or parent folder is required', 400)

    by_id, children = _folder_maps()
    new_name = folder.name
    if 'name' in data:
        new_name, name_error = _clean_folder_name(data.get('name'))
        if name_error:
            return error(name_error, 400)
    new_parent = folder.parent_id
    if 'parent_id' in data:
        _, new_parent, parent_error = _parse_folder_id({'folder_id': data.get('parent_id')})
        if parent_error:
            return error('Parent folder not found' if parent_error == 'Folder not found' else parent_error, 400)
        if new_parent is not None and new_parent in _descendant_ids([folder_id], children):
            return error('A folder cannot be moved into itself or one of its subfolders', 400)
        if new_parent is not None and _depth(new_parent, by_id) + _subtree_height(folder_id, children) > MAX_FOLDER_DEPTH:
            return error(f'Folders can only be nested {MAX_FOLDER_DEPTH} levels deep', 400)
    if _sibling_name_taken(new_name, new_parent, ignore_id=folder_id):
        return error('A folder with this name already exists here', 409)

    folder.name = new_name
    folder.parent_id = new_parent
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception('Failed to update document folder')
        return error('Unable to update folder', 500)
    by_id, children = _folder_maps()
    return success(_folder_payload(folder, by_id, {}, {}, children), 'Folder updated')


@important_documents_bp.route('/folders/<int:folder_id>', methods=['DELETE'])
@roles_required(*DOCUMENT_ROLES)
def delete_folder(folder_id):
    """Delete an EMPTY folder. A folder that still holds subfolders or
    documents is refused so nothing is ever lost by accident."""
    folder = db.session.get(DocumentFolder, folder_id)
    if not folder:
        return error('Folder not found', 404)
    if DocumentFolder.query.filter_by(parent_id=folder_id).first():
        return error('This folder contains subfolders. Move or delete them first.', 409)
    if ImportantDocument.query.filter_by(folder_id=folder_id).first():
        return error('This folder contains documents. Move or delete them first.', 409)
    try:
        db.session.delete(folder)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception('Failed to delete document folder')
        return error('Unable to delete folder', 500)
    return success(None, 'Folder deleted')


@important_documents_bp.route('', methods=['POST'])
@roles_required(*DOCUMENT_ROLES)
def upload_document():
    name = (request.form.get('name') or '').strip()
    description = (request.form.get('description') or '').strip()
    category = (request.form.get('category') or '').strip()
    upload = request.files.get('file')

    if not name or not category:
        return error('Document name and category are required', 400)
    _, folder_id, folder_error = _parse_folder_id(request.form)
    if folder_error:
        return error(folder_error, 400)
    _, restricted, audience_ids, audience_error = _parse_audience(request.form)
    if audience_error:
        return error(audience_error, 400)
    if len(name) > 255 or len(category) > 100 or len(description) > 5000:
        return error('Document name, category, or description exceeds the allowed length', 400)
    if not upload or not upload.filename:
        return error('A document file is required', 400)

    original_filename = secure_filename(upload.filename)
    if not original_filename or len(original_filename) > 255 or '.' not in original_filename:
        return error('A valid filename is required', 400)
    extension = original_filename.rsplit('.', 1)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        return error('Unsupported file type', 400)

    try:
        upload.stream.seek(0, os.SEEK_END)
        file_size = upload.stream.tell()
        upload.stream.seek(0)
    except OSError:
        return error('Unable to read the uploaded file', 400)

    if file_size <= 0:
        return error('The uploaded file is empty', 400)
    if file_size > MAX_DOCUMENT_SIZE:
        return error('Document must be 10 MB or smaller', 413)
    if not _file_matches_extension(upload, extension):
        return error('File content does not match its extension', 400)

    storage_filename = f'{uuid.uuid4().hex}.{extension}'
    storage_folder = _document_storage_folder()
    storage_path = os.path.join(storage_folder, storage_filename)

    try:
        os.makedirs(storage_folder, exist_ok=True)
        upload.save(storage_path)
    except OSError:
        current_app.logger.exception('Failed to store important document')
        return error('Unable to store the uploaded document', 500)

    document = ImportantDocument(
        name=name,
        description=description or None,
        category=category,
        original_filename=original_filename,
        storage_filename=storage_filename,
        file_type=extension.upper(),
        file_size=file_size,
        uploaded_by=int(get_jwt_identity()),
        folder_id=folder_id,
    )
    _apply_audience(document, restricted, audience_ids)
    try:
        db.session.add(document)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        try:
            os.remove(storage_path)
        except OSError:
            current_app.logger.exception('Failed to remove document file after database error')
        current_app.logger.exception('Failed to save important document metadata')
        return error('Unable to save document details', 500)

    by_id, _ = _folder_maps()
    return success(
        _document_payload(document, _get_active_user(), by_id), 'Document uploaded', 201
    )


@important_documents_bp.route('/<int:document_id>', methods=['PUT'])
@roles_required(*DOCUMENT_ROLES)
def update_document(document_id):
    document = db.session.get(ImportantDocument, document_id)
    if not document:
        return error('Document not found', 404)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error('A JSON object is required', 400)

    editable_fields = {'name', 'description', 'category', 'folder_id', 'visible_to_all', 'audience_user_ids'}
    if not editable_fields.intersection(data):
        return error('No editable document details were provided', 400)
    folder_provided, folder_id, folder_error = _parse_folder_id(data)
    if folder_error:
        return error(folder_error, 400)
    audience_provided, restricted, audience_ids, audience_error = _parse_audience(data)
    if audience_error:
        return error(audience_error, 400)
    if 'name' in data:
        name = data['name'].strip() if isinstance(data['name'], str) else ''
        if not name or len(name) > 255:
            return error('Document name is required and must be 255 characters or fewer', 400)
        document.name = name
    if 'description' in data:
        description = data['description']
        if description is not None and not isinstance(description, str):
            return error('Description must be text', 400)
        description = description.strip() if description else ''
        if len(description) > 5000:
            return error('Description must be 5000 characters or fewer', 400)
        document.description = description or None
    if 'category' in data:
        category = data['category'].strip() if isinstance(data['category'], str) else ''
        if not category or len(category) > 100:
            return error('Category is required and must be 100 characters or fewer', 400)
        document.category = category
    if folder_provided:
        document.folder_id = folder_id
    if audience_provided:
        _apply_audience(document, restricted, audience_ids)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception('Failed to update important document')
        return error('Unable to update document details', 500)
    by_id, _ = _folder_maps()
    return success(_document_payload(document, _get_active_user(), by_id), 'Document updated')


@important_documents_bp.route('/<int:document_id>/download', methods=['GET'])
@jwt_required()
def download_document(document_id):
    if not _get_active_user():
        return error('User not found or inactive', 401)

    document = db.session.get(ImportantDocument, document_id)
    if not document:
        return error('Document not found', 404)
    if not _can_access_document(_get_active_user(), document):
        return error('Forbidden: you do not have access to this document', 403)

    storage_folder = _document_storage_folder()
    if not os.path.isfile(os.path.join(storage_folder, document.storage_filename)):
        return error('Document file not found', 404)
    return send_from_directory(
        storage_folder,
        document.storage_filename,
        as_attachment=True,
        download_name=document.original_filename,
    )


@important_documents_bp.route('/<int:document_id>', methods=['DELETE'])
@roles_required(*DOCUMENT_ROLES)
def delete_document(document_id):
    document = db.session.get(ImportantDocument, document_id)
    if not document:
        return error('Document not found', 404)

    storage_path = os.path.join(_document_storage_folder(), document.storage_filename)
    db.session.delete(document)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception('Failed to delete important document metadata')
        return error('Unable to delete document', 500)

    try:
        if os.path.isfile(storage_path):
            os.remove(storage_path)
    except OSError:
        current_app.logger.exception('Document record deleted but file cleanup failed')
        return error('Document record deleted, but its file could not be removed', 500)
    return success(None, 'Document deleted')
