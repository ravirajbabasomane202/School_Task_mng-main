import os
import uuid

from flask import Blueprint, current_app, request, send_from_directory
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.important_document import ImportantDocument
from app.models.user import User
from app.utils.decorators import roles_required
from app.utils.response import error, success


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


def _file_matches_extension(file_storage, extension):
    file_storage.stream.seek(0)
    signature = file_storage.stream.read(8)
    file_storage.stream.seek(0)
    return any(signature.startswith(prefix) for prefix in FILE_SIGNATURES[extension])


@important_documents_bp.errorhandler(RequestEntityTooLarge)
def handle_document_request_too_large(_error):
    return error('Document upload exceeds the maximum request size', 413)


@important_documents_bp.route('', methods=['GET'])
@jwt_required()
def list_documents():
    if not _get_active_user():
        return error('User not found or inactive', 401)

    documents = ImportantDocument.query.order_by(ImportantDocument.created_at.desc()).all()
    return success([document.to_dict() for document in documents])


@important_documents_bp.route('/<int:document_id>', methods=['GET'])
@jwt_required()
def get_document(document_id):
    if not _get_active_user():
        return error('User not found or inactive', 401)

    document = db.session.get(ImportantDocument, document_id)
    if not document:
        return error('Document not found', 404)
    return success(document.to_dict())


@important_documents_bp.route('', methods=['POST'])
@roles_required(*DOCUMENT_ROLES)
def upload_document():
    name = (request.form.get('name') or '').strip()
    description = (request.form.get('description') or '').strip()
    category = (request.form.get('category') or '').strip()
    upload = request.files.get('file')

    if not name or not category:
        return error('Document name and category are required', 400)
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
    )
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

    return success(document.to_dict(), 'Document uploaded', 201)


@important_documents_bp.route('/<int:document_id>', methods=['PUT'])
@roles_required(*DOCUMENT_ROLES)
def update_document(document_id):
    document = db.session.get(ImportantDocument, document_id)
    if not document:
        return error('Document not found', 404)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error('A JSON object is required', 400)

    editable_fields = {'name', 'description', 'category'}
    if not editable_fields.intersection(data):
        return error('No editable document details were provided', 400)
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

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception('Failed to update important document')
        return error('Unable to update document details', 500)
    return success(document.to_dict(), 'Document updated')


@important_documents_bp.route('/<int:document_id>/download', methods=['GET'])
@jwt_required()
def download_document(document_id):
    if not _get_active_user():
        return error('User not found or inactive', 401)

    document = db.session.get(ImportantDocument, document_id)
    if not document:
        return error('Document not found', 404)

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
