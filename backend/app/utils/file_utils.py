import os
import uuid
from werkzeug.utils import secure_filename
from flask import current_app


ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xlsx', 'xls', 'txt'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_task_attachment(file, task_id):
    """Save an uploaded file and return the relative path from server root.

    FIX (Issue 14): attachment_path stored in DB must be a relative path rooted at
    the server root (e.g. uploads/tasks/42/abc_file.pdf) so that TaskDetail.tsx can
    construct the correct download URL:
        baseServerUrl + '/' + attachment_path.replace(/^\\/+/, '')
    Storing an absolute OS path (e.g. /home/.../backend/uploads/...) would produce
    a broken URL like http://localhost:5000//home/... .
    """
    if not file or not allowed_file(file.filename):
        return None

    filename = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{filename}"
    task_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'tasks', str(task_id))
    os.makedirs(task_dir, exist_ok=True)

    abs_path = os.path.join(task_dir, unique_name)
    file.save(abs_path)

    # Always return forward-slash relative path from server root (never absolute)
    rel_path = os.path.join('uploads', 'tasks', str(task_id), unique_name)
    return rel_path.replace('\\', '/')


def delete_file(rel_path):
    """Delete a file given its server-root-relative path (e.g. uploads/tasks/42/file.pdf).

    FIX (Issue 14): Original used os.path.dirname(UPLOAD_FOLDER) to go one level up,
    which is fragile and breaks if UPLOAD_FOLDER itself is not directly under the
    project root. Resolve from the project root (parent of UPLOAD_FOLDER) instead,
    and guard against path traversal with os.path.abspath checks.
    """
    if not rel_path:
        return
    # Project root = parent directory of UPLOAD_FOLDER
    upload_folder = current_app.config['UPLOAD_FOLDER']
    project_root = os.path.dirname(os.path.abspath(upload_folder))
    abs_path = os.path.abspath(os.path.join(project_root, rel_path))

    # Safety: ensure the resolved path is still inside the project root
    if not abs_path.startswith(project_root):
        return

    if os.path.exists(abs_path):
        os.remove(abs_path)
