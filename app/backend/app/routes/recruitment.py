from datetime import datetime, timezone
from flask import Blueprint, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app.extensions import db
from app.models.recruitment import Recruitment, RecruitmentApplication
from app.models.user import User
from app.models.department import Department
from app.utils.response import success, error
from app.utils.decorators import roles_required
import os
import uuid

recruitment_bp = Blueprint('recruitment', __name__)

HR_ROLES = ('HR', 'CHAIRMAN')

# CHAIRMAN/DIRECTOR are the org-wide elevated roles; HR is the designated
# recruitment-management role (creates/updates postings and applications for
# every department's vacancies, same as FINANCE for purchase orders) and so
# also needs cross-department visibility. Everyone else is scoped to their
# own department, regardless of any department_id they pass in.
RECRUITMENT_ELEVATED_ROLES = ('CHAIRMAN', 'DIRECTOR', 'HR')

ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def _allowed_file(filename: str) -> bool:
    safe = secure_filename(filename)
    ext = os.path.splitext(safe.lower())[1]
    return ext in ALLOWED_EXTENSIONS


def _get_upload_path(filename: str) -> tuple[str, str]:
    """Return (absolute_path, relative_filename) for the uploaded file."""
    upload_dir = current_app.config.get('UPLOAD_FOLDER', 'uploads')
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    safe_name = secure_filename(filename)
    unique_name = f"{timestamp}_{uuid.uuid4().hex[:8]}_{safe_name}"
    resume_dir = os.path.join(upload_dir, 'resumes')
    os.makedirs(resume_dir, exist_ok=True)
    full_path = os.path.join(resume_dir, unique_name)
    return full_path, unique_name


@recruitment_bp.route('', methods=['GET'])
@jwt_required()
def list_recruitments():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    query = Recruitment.query
    status = request.args.get('status')
    department_id = request.args.get('department_id')

    if status:
        query = query.filter_by(status=status)

    if user.role in RECRUITMENT_ELEVATED_ROLES:
        # Elevated roles can filter by any department, or see all if omitted.
        if department_id:
            query = query.filter_by(department_id=int(department_id))
    else:
        # Everyone else only ever sees their own department's postings, no
        # matter what department_id (if any) was passed in the query string.
        if user.department_id:
            query = query.filter_by(department_id=user.department_id)
        else:
            return success([])

    return success([r.to_dict() for r in query.order_by(Recruitment.created_at.desc()).all()])


@recruitment_bp.route('/<int:recruitment_id>', methods=['GET'])
@jwt_required()
def get_recruitment(recruitment_id: int):
    recruitment = Recruitment.query.get_or_404(recruitment_id)
    return success(recruitment.to_dict())


@recruitment_bp.route('', methods=['POST'])
@roles_required('HR', 'CHAIRMAN')
def create_recruitment():
    data = request.get_json() or {}
    required = ['position_title']
    for field in required:
        if not data.get(field):
            return error(f'{field} is required', 400)
    
    recruitment = Recruitment(
        position_title=data['position_title'],
        department_id=data.get('department_id'),
        vacancies=data.get('vacancies', 1),
        description=data.get('description'),
        status=data.get('status', 'OPEN'),
        created_by=int(get_jwt_identity()),
    )
    db.session.add(recruitment)
    db.session.commit()
    return success(recruitment.to_dict(), 'Recruitment created', 201)


@recruitment_bp.route('/<int:recruitment_id>', methods=['PUT'])
@roles_required('HR', 'CHAIRMAN')
def update_recruitment(recruitment_id: int):
    recruitment = Recruitment.query.get_or_404(recruitment_id)
    data = request.get_json() or {}
    
    if 'position_title' in data:
        recruitment.position_title = data['position_title']
    if 'department_id' in data:
        recruitment.department_id = data['department_id']
    if 'vacancies' in data:
        recruitment.vacancies = data['vacancies']
    if 'description' in data:
        recruitment.description = data['description']
    if 'status' in data:
        recruitment.status = data['status']
    
    db.session.commit()
    return success(recruitment.to_dict(), 'Recruitment updated')


@recruitment_bp.route('/<int:recruitment_id>/applications', methods=['GET'])
@jwt_required()
def list_applications(recruitment_id: int):
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    # Applications carry no department_id of their own — scope is derived
    # from the PARENT recruitment posting's department_id. Never trust a
    # client-supplied department value for this sub-resource.
    recruitment = Recruitment.query.get_or_404(recruitment_id)

    if user.role not in RECRUITMENT_ELEVATED_ROLES:
        if not user.department_id or recruitment.department_id != user.department_id:
            return error('Forbidden: recruitment posting belongs to another department', 403)

    applications = RecruitmentApplication.query.filter_by(recruitment_id=recruitment_id).all()
    return success([a.to_dict() for a in applications])


@recruitment_bp.route('/<int:recruitment_id>/applications', methods=['POST'])
@roles_required('HR', 'CHAIRMAN')
def create_application(recruitment_id: int):
    recruitment = Recruitment.query.get_or_404(recruitment_id)
    
    applicant_name = request.form.get('applicant_name', '')
    email = request.form.get('email', '')
    notes = request.form.get('notes', '')
    
    if not applicant_name or not email:
        return error('applicant_name and email are required', 400)

    # Reject duplicate email for the same recruitment posting
    existing = RecruitmentApplication.query.filter_by(
        recruitment_id=recruitment_id,
        email=email.lower().strip()
    ).first()
    if existing:
        return error('An application with this email already exists for this position', 409)
    
    resume_path = None
    if 'resume' in request.files:
        file = request.files['resume']
        if file.filename:
            if not _allowed_file(file.filename):
                return error('Invalid file type. Allowed: pdf, doc, docx, png, jpg, jpeg', 400)
            if len(file.read()) > MAX_FILE_SIZE:
                return error('File too large. Maximum 5MB', 400)
            file.seek(0)
            full_path, filename = _get_upload_path(file.filename)
            file.save(full_path)
            resume_path = filename
    
    application = RecruitmentApplication(
        recruitment_id=recruitment_id,
        applicant_name=applicant_name,
        email=email,
        notes=notes,
        resume_path=resume_path,
    )
    db.session.add(application)
    db.session.commit()
    return success(application.to_dict(), 'Application submitted', 201)


@recruitment_bp.route('/applications/<int:application_id>', methods=['PUT'])
@roles_required('HR', 'CHAIRMAN')
def update_application(application_id: int):
    application = RecruitmentApplication.query.get_or_404(application_id)
    data = request.get_json() or {}
    
    valid_stages = ('APPLIED', 'SHORTLISTED', 'INTERVIEWED', 'HIRED', 'REJECTED')
    if 'stage' in data:
        if data['stage'] not in valid_stages:
            return error(f'Invalid stage. Must be one of: {valid_stages}', 400)
        application.stage = data['stage']
    if 'notes' in data:
        application.notes = data['notes']
    
    db.session.commit()
    return success(application.to_dict(), 'Application updated')