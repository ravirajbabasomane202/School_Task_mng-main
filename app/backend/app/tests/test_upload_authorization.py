"""
Backend route tests — /uploads/<filename> static file serving

The route must:
  * require a valid JWT (401 for unauthenticated requests)
  * resolve the filename to the DB record that owns it (task attachment/
    proof, recruitment resume) rather than trusting the URL path
  * reject requests from users who are not authorized to view that record
    (403), and requests for filenames that don't map to any known record
    (404)
  * allow requests from users who ARE authorized (200, correct bytes)
"""

import os
import uuid

import pytest


def _make_department(app_context, name_prefix='Upload Dept'):
    from app.extensions import db
    from app.models.department import Department

    dept = Department(name=f'{name_prefix} {uuid.uuid4().hex[:10]}', description='For upload tests')
    db.session.add(dept)
    db.session.commit()
    return dept


def _make_user(app, client, role='HR', department_id=None):
    from app.extensions import db
    from app.models.user import User

    email = f'upload-test-{uuid.uuid4().hex[:8]}@school.test'
    plain = str(uuid.uuid4())[:12]
    with app.app_context():
        user = User(
            name=f'{role} Upload Tester',
            email=email,
            role=role,
            department_id=department_id,
            is_active=True,
        )
        user.set_password(plain)
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    resp = client.post('/api/auth/login', json={'email': email, 'password': plain})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    token = resp.get_json()['data']['accessToken']
    return user_id, {'Authorization': f'Bearer {token}'}


def _make_task_with_attachment(app, department_id, assigned_to, assigned_by, contents=b'brief-bytes'):
    """Create a Task row with an attachment_path pointing at a real file on
    disk under UPLOAD_FOLDER/tasks/<id>/, mirroring save_task_attachment()."""
    from app.extensions import db
    from app.models.task import Task

    with app.app_context():
        task = Task(
            title='Upload Test Task',
            assigned_by=assigned_by,
            assigned_to=assigned_to,
            department_id=department_id,
        )
        db.session.add(task)
        db.session.commit()
        task_id = task.id

        upload_folder = app.config['UPLOAD_FOLDER']
        task_dir = os.path.join(upload_folder, 'tasks', str(task_id))
        os.makedirs(task_dir, exist_ok=True)
        filename = f'{uuid.uuid4().hex}_brief.pdf'
        abs_path = os.path.join(task_dir, filename)
        with open(abs_path, 'wb') as fh:
            fh.write(contents)

        rel_path = f'uploads/tasks/{task_id}/{filename}'
        task.attachment_path = rel_path
        db.session.commit()

    url_filename = f'tasks/{task_id}/{filename}'
    return task_id, url_filename


def _make_application_with_resume(app, department_id, contents=b'resume-bytes'):
    """Create a Recruitment + RecruitmentApplication with a resume_path
    pointing at a real file on disk under UPLOAD_FOLDER/resumes/."""
    from app.extensions import db
    from app.models.recruitment import Recruitment, RecruitmentApplication
    from app.models.user import User

    with app.app_context():
        creator = User.query.filter_by(role='HR').first()
        if creator is None:
            creator = User(name='HR Seed', email=f'hr-seed-{uuid.uuid4().hex[:8]}@school.test', role='HR')
            creator.set_password('irrelevant')
            db.session.add(creator)
            db.session.commit()

        recruitment = Recruitment(
            position_title='Upload Test Role',
            department_id=department_id,
            created_by=creator.id,
        )
        db.session.add(recruitment)
        db.session.commit()

        upload_folder = app.config['UPLOAD_FOLDER']
        resume_dir = os.path.join(upload_folder, 'resumes')
        os.makedirs(resume_dir, exist_ok=True)
        filename = f'{uuid.uuid4().hex}_resume.pdf'
        abs_path = os.path.join(resume_dir, filename)
        with open(abs_path, 'wb') as fh:
            fh.write(contents)

        application = RecruitmentApplication(
            recruitment_id=recruitment.id,
            applicant_name='Jane Doe',
            email=f'jane-{uuid.uuid4().hex[:8]}@test.com',
            resume_path=filename,
        )
        db.session.add(application)
        db.session.commit()

    url_filename = f'resumes/{filename}'
    return url_filename


class TestUploadRequiresAuth:
    def test_unauthenticated_request_returns_401(self, client, app, app_context):
        dept = _make_department(app_context)
        _, chairman_headers = _make_user(app, client, role='CHAIRMAN')
        assignee_id, _ = _make_user(app, client, role='HR', department_id=dept.id)
        _, url_filename = _make_task_with_attachment(
            app, dept.id, assigned_to=assignee_id, assigned_by=assignee_id
        )

        resp = client.get(f'/uploads/{url_filename}')
        assert resp.status_code in (401, 422)


class TestUploadOwnershipAuthorization:
    def test_assignee_can_view_own_task_attachment(self, client, app, app_context):
        dept = _make_department(app_context)
        assignee_id, assignee_headers = _make_user(app, client, role='HR', department_id=dept.id)
        _, url_filename = _make_task_with_attachment(
            app, dept.id, assigned_to=assignee_id, assigned_by=assignee_id, contents=b'hello-world'
        )

        resp = client.get(f'/uploads/{url_filename}', headers=assignee_headers)
        assert resp.status_code == 200
        assert resp.data == b'hello-world'

    def test_elevated_role_can_view_any_task_attachment(self, client, app, app_context):
        dept = _make_department(app_context)
        assignee_id, _ = _make_user(app, client, role='HR', department_id=dept.id)
        _, chairman_headers = _make_user(app, client, role='CHAIRMAN')
        _, url_filename = _make_task_with_attachment(
            app, dept.id, assigned_to=assignee_id, assigned_by=assignee_id
        )

        resp = client.get(f'/uploads/{url_filename}', headers=chairman_headers)
        assert resp.status_code == 200

    def test_same_department_user_can_view_task_attachment(self, client, app, app_context):
        dept = _make_department(app_context)
        assignee_id, _ = _make_user(app, client, role='HR', department_id=dept.id)
        _, colleague_headers = _make_user(app, client, role='HR', department_id=dept.id)
        _, url_filename = _make_task_with_attachment(
            app, dept.id, assigned_to=assignee_id, assigned_by=assignee_id
        )

        resp = client.get(f'/uploads/{url_filename}', headers=colleague_headers)
        assert resp.status_code == 200

    def test_unrelated_user_gets_403(self, client, app, app_context):
        dept = _make_department(app_context, 'Upload Dept Owner')
        other_dept = _make_department(app_context, 'Upload Dept Other')
        assignee_id, _ = _make_user(app, client, role='HR', department_id=dept.id)
        _, outsider_headers = _make_user(app, client, role='IT', department_id=other_dept.id)
        _, url_filename = _make_task_with_attachment(
            app, dept.id, assigned_to=assignee_id, assigned_by=assignee_id
        )

        resp = client.get(f'/uploads/{url_filename}', headers=outsider_headers)
        assert resp.status_code == 403

    def test_unmapped_filename_returns_404(self, client, app, app_context):
        _, some_headers = _make_user(app, client, role='HR')
        resp = client.get('/uploads/tasks/999999/does-not-exist.pdf', headers=some_headers)
        assert resp.status_code == 404

    def test_resume_visible_to_hr_and_same_department_only(self, client, app, app_context):
        dept = _make_department(app_context, 'Upload Recruit Dept')
        other_dept = _make_department(app_context, 'Upload Recruit Other Dept')
        url_filename = _make_application_with_resume(app, dept.id, contents=b'resume-bytes')

        _, hr_headers = _make_user(app, client, role='HR')
        resp = client.get(f'/uploads/{url_filename}', headers=hr_headers)
        assert resp.status_code == 200
        assert resp.data == b'resume-bytes'

        _, same_dept_headers = _make_user(app, client, role='IT', department_id=dept.id)
        resp = client.get(f'/uploads/{url_filename}', headers=same_dept_headers)
        assert resp.status_code == 200

        _, other_dept_headers = _make_user(app, client, role='IT', department_id=other_dept.id)
        resp = client.get(f'/uploads/{url_filename}', headers=other_dept_headers)
        assert resp.status_code == 403
