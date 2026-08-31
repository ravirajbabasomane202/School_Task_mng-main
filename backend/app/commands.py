from datetime import datetime, timedelta, timezone

import click
from flask import Flask
from app.extensions import db


DEPARTMENTS = [
    {'name': 'IT', 'description': 'Information Technology & ERP'},
    {'name': 'HR', 'description': 'Human Resources'},
    {'name': 'Finance', 'description': 'Finance & Accounts'},
    {'name': 'Operations', 'description': 'Administration & School Operations'},
    {'name': 'Property', 'description': 'Property & Maintenance'},
    {'name': 'Principal', 'description': 'Academic Leadership'},
    {'name': 'Admission', 'description': 'Admission & Marketing'},
    {'name': 'Purchase', 'description': 'Procurement & Purchase'},
    {'name': 'Transport', 'description': 'Transport Management'},
    {'name': 'Housekeeping', 'description': 'Housekeeping & Premises Care'},
    {'name': 'Front Desk', 'description': 'Reception & Front Office'},
]

DEFAULT_USERS = [
    {
        'name': 'Chairman',
        'email': 'chairman@school.com',
        'role': 'CHAIRMAN',
        'department': None,
        'password': 'chairman123'
    },
    # NOTE: the default "School Director" seed user was removed per request —
    # the DIRECTOR role and all of its pages/permissions remain fully
    # functional; only this specific placeholder seed account was dropped so
    # it's no longer (re)created by `flask seed`. Add a real Director user via
    # User Management whenever one is needed.
    {
        'name': 'Property & Maintenance Head',
        'email': 'property@school.com',
        'role': 'PROPERTY',
        'department': 'Property',
        'password': 'property123'
    },
    {
        'name': 'Finance Head',
        'email': 'finance@school.com',
        'role': 'FINANCE',
        'department': 'Finance',
        'password': 'finance123'
    },
    {
        'name': 'Admin Head',
        'email': 'admin@school.com',
        'role': 'ADMIN',
        'department': 'Operations',
        'password': 'admin123'
    },
    {
        'name': 'Admin Assistance',
        'email': 'admin.assistance@school.com',
        'role': 'ADMIN',
        'department': 'Operations',
        'password': 'admin123'
    },
    {
        'name': 'Principal',
        'email': 'principal@school.com',
        'role': 'PRINCIPAL',
        'department': 'Principal',
        'password': 'principal123'
    },
    {
        'name': 'Admission Head',
        'email': 'admission@school.com',
        'role': 'ADMISSION',
        'department': 'Admission',
        'password': 'admission123'
    },
    {
        'name': 'HR Head',
        'email': 'hr@school.com',
        'role': 'HR',
        'department': 'HR',
        'password': 'hr123'
    },
    {
        'name': 'Purchase Head / Jr. Accountant / Store',
        'email': 'purchase@school.com',
        'role': 'PURCHASE',
        'department': 'Purchase',
        'password': 'purchase123'
    },
    {
        'name': 'IT Head',
        'email': 'it@school.com',
        'role': 'IT',
        'department': 'IT',
        'password': 'it123'
    },
    {
        'name': 'Transport Head',
        'email': 'transport@school.com',
        'role': 'TRANSPORT',
        'department': 'Transport',
        'password': 'transport123'
    },
    {
        'name': 'Front Desk / Reception / Jr. Clerk',
        'email': 'frontdesk@school.com',
        'role': 'FRONT_DESK',
        'department': 'Front Desk',
        'password': 'frontdesk123'
    },
    {
        'name': 'HouseKeeping Head',
        'email': 'housekeeping@school.com',
        'role': 'HOUSEKEEPING',
        'department': 'Housekeeping',
        'password': 'housekeeping123'
    }
]

MODULE_TASKS = [
    {
        'head': 'School Director',
        'assignee_email': 'director@school.com',
        'department': 'Principal',
        'tasks': [
            'Academic PPT Submission (Every Month 1st Tuesday)',
            'Checking all Academic Registers',
            'Academic Syllabus Status Reporting (Monthly)',
            'Create Yearly Academic Plan',
            'Create Academic Time Table',
            'Teachers Workload Status',
            'Event Calendar',
            'Admission Status',
            'LC Report',
            'Parent Grievance Mgt',
            'Class Observation',
            'Teachers Recruitment Chart',
            'Teachers Appraisal',
            'Exam Mgt',
            'Competition Mgt',
            'Campus Visit Status',
            'MCB (MyClassBoard) Notification Status',
            'Inspection Status',
            'Extra Curriculum',
            'All Committee Status',
        ],
    },
    {
        'head': 'Admin Head',
        'assignee_email': 'admin@school.com',
        'department': 'Operations',
        'tasks': [
            'CBSC Affiliation File Status (Yearly)',
            'School Documents Files Mgt',
            'Govt Permission Renewal',
            'Master Policy File Mgt',
            'Central Register Completion Status (Monthly)',
            'Vendor Management',
            'ID Card Distribution Status',
            'Uniform Distribution Status',
            'Books Distribution Status',
            'Fire Safety Report Status',
            'Lift Safety Report Status',
        ],
    },
    {
        'head': 'Admin Assistance',
        'assignee_email': 'admin.assistance@school.com',
        'department': 'Operations',
        'tasks': [
            'GR Records Maintenance',
            'LC Records Maintenance',
            'UDIS (Student) Records',
            'Teachers Training Status',
            'Outword & Inword Mgt',
            'Bonafide Application File',
            'Original Docs Return Register',
            'Service Book Status',
            'All Staff File Record Keeping',
        ],
    },
    {
        'head': 'Finance Head',
        'assignee_email': 'finance@school.com',
        'department': 'Finance',
        'tasks': [
            'Fees Collection Status',
            'Salary Mgt',
            'Vendor Payment Mgt',
            'Vendor Payment Approval',
            'ITR File (Yearly)',
            'Professional TAX and TDS Filling Status (Monthly)',
            'Yearly Budget',
            'Monthly Income and Expenses Status',
            'Event & Celebration Expenses',
            'Property Tax, Light Bill and Water Bill Payment Status',
            'HOD Register',
        ],
    },
    {
        'head': 'Admission Head / Marketing Executive',
        'assignee_email': 'admission@school.com',
        'department': 'Admission',
        'tasks': [
            'Admission Status',
            'Admission Enquiry (Daily)',
            'School Marketing on Facebook, Instagram and LinkedIn',
            'Marketing Banner Design',
            'HOD Register',
        ],
    },
    {
        'head': 'HR Head',
        'assignee_email': 'hr@school.com',
        'department': 'HR',
        'tasks': [
            'New Appointment Status',
            'Training',
            'PR',
            'Staff Grievance',
            'Leave Application Status',
            'Employee Engagement Program',
            'HOD Register',
        ],
    },
    {
        'head': 'Purchase Head / Jr. Accountant / Store',
        'assignee_email': 'purchase@school.com',
        'department': 'Purchase',
        'tasks': [
            'Student Academic Fee Collection',
            'Student Transport Fee Collection',
            'Store Stock Status',
            'Cheque Deposit Status',
            'Petty Cash Status',
            'Stock Issue',
            'Fees Followup Status',
            'Petrol / Diesel Expenses',
            'Purchase Order Status',
            'Purchase Approval / Requisition Request',
            'Inventory Mgt',
            'HOD Register',
        ],
    },
    {
        'head': 'Transport Head',
        'assignee_email': 'transport@school.com',
        'department': 'Transport',
        'tasks': [
            'Transport Admission Status',
            'Bus Route Finalisation',
            'Daily Transport Summary Submission',
            'Transport Compliance Status',
            'Individual Vehicle Record',
            'Vehicle Maintenance',
            'Vehicle Petrol / Diesel Expenses Demand',
            'Bus Cleaning Status',
            'School Bus Record File (With Driver and Mavshi Details)',
            'Driver and Mavshi Safety Training Status',
        ],
    },
    {
        'head': 'IT Head',
        'assignee_email': 'it@school.com',
        'department': 'IT',
        'tasks': [
            'Website Maintenance',
            'MCB (MyClassBoard) Monitoring',
            'Firewall (Internet) Service Mgt',
            'School Mail_ID Creation',
            'All Gadget Mgt (Computer / Desktop, CCTV, Intercom and Mobile)',
            'Gadget Issue',
            'IT Related Grievance Records',
            'HOD Register',
        ],
    },
    {
        'head': 'Front Desk / Reception / Jr. Clerk',
        'assignee_email': 'frontdesk@school.com',
        'department': 'Front Desk',
        'tasks': [
            'Guest Welcome',
            'Visitor Register Mgt',
            'Student Halfday Register Mgt',
            'Inword',
            'Staff Movement Register',
            'Permission for Child in School Campus',
            'Early Pickup',
            'HOD Register',
        ],
    },
    {
        'head': 'HouseKeeping Head',
        'assignee_email': 'housekeeping@school.com',
        'department': 'Housekeeping',
        'tasks': [
            'Daily Cleaning Report',
            'Daily Duty Assignment Report',
            'HK Material Outword',
            'Toilet Washroom Cleaning Report',
            'School Premises (Inside and Outside) Cleaning Report',
        ],
    },
]


def _task_cadence(title):
    lower_title = title.lower()
    if 'yearly' in lower_title:
        return 'MONTHLY'
    if 'monthly' in lower_title or 'month' in lower_title:
        return 'MONTHLY'
    if 'daily' in lower_title:
        return 'DAILY'
    return 'WEEKLY'


def register_commands(app: Flask):
    @app.cli.command('seed')
    def seed():
        """Seed departments and default leadership users."""
        from app.models.department import Department
        from app.models.task import Task, TaskHistory
        from app.models.user import User

        click.echo('Seeding departments...')
        for dept_data in DEPARTMENTS:
            department = Department.query.filter_by(name=dept_data['name']).first()
            if not department:
                department = Department(**dept_data)
                db.session.add(department)
                click.echo(f"  + {dept_data['name']}")
            else:
                department.description = dept_data['description']
                click.echo(f"  ~ {dept_data['name']} (updated)")
        db.session.commit()

        department_map = {
            department.name: department.id
            for department in Department.query.all()
        }

        click.echo('\nSeeding leadership users...')
        for user_data in DEFAULT_USERS:
            user = User.query.filter_by(email=user_data['email']).first()
            department_id = department_map.get(user_data['department']) if user_data['department'] else None

            if not user:
                user = User(
                    name=user_data['name'],
                    email=user_data['email'],
                    role=user_data['role'],
                    department_id=department_id,
                    is_active=True
                )
                user.set_password(user_data['password'])
                db.session.add(user)
                click.echo(
                    f"  + {user_data['email']} / password: {user_data['password']} ({user_data['role']})"
                )
            else:
                user.name = user_data['name']
                user.role = user_data['role']
                user.department_id = department_id
                user.is_active = True
                click.echo(f"  ~ {user_data['email']} ({user_data['role']})")

        db.session.commit()

        user_map = {
            seeded_user.email: seeded_user
            for seeded_user in User.query.filter(User.email.in_([u['email'] for u in DEFAULT_USERS])).all()
        }
        chairman = user_map.get('chairman@school.com')
        start_date = datetime.now(timezone.utc)
        due_date = start_date + timedelta(days=30)

        click.echo('\nSeeding chairman module tasks...')
        created_count = 0
        updated_count = 0
        skipped_count = 0

        if not chairman:
            click.echo('  ! Chairman user not found; skipped module task seeding.')
        else:
            for module in MODULE_TASKS:
                assignee = user_map.get(module['assignee_email'])
                department_id = department_map.get(module['department'])
                if not assignee:
                    skipped_count += len(module['tasks'])
                    click.echo(f"  ! {module['head']} assignee missing; skipped {len(module['tasks'])} task(s).")
                    continue

                for title in module['tasks']:
                    task = Task.query.filter_by(title=title, assigned_to=assignee.id).first()
                    description = f"{module['head']} module task assigned by Chairman."

                    if not task:
                        task = Task(
                            title=title,
                            description=description,
                            assigned_by=chairman.id,
                            assigned_to=assignee.id,
                            department_id=department_id,
                            priority='MEDIUM',
                            status='PENDING',
                            cadence=_task_cadence(title),
                            start_date=start_date,
                            due_date=due_date,
                        )
                        db.session.add(task)
                        db.session.flush()
                        db.session.add(TaskHistory(
                            task_id=task.id,
                            updated_by=chairman.id,
                            old_status=None,
                            new_status='PENDING',
                            comment='Task seeded from module/head wise list'
                        ))
                        created_count += 1
                    else:
                        task.assigned_by = chairman.id
                        task.department_id = department_id
                        task.description = task.description or description
                        task.cadence = task.cadence or _task_cadence(title)
                        updated_count += 1

            db.session.commit()
            click.echo(f'  + {created_count} created, {updated_count} already present/updated, {skipped_count} skipped')

        click.echo('\nDone.')

    @app.cli.command('clear-login-attempts')
    @click.option('--ip', help='Clear only the failed login attempts for a single IP address.')
    def clear_login_attempts(ip: str | None):
        """Clear failed login attempts so development accounts can log in again."""
        from app.models.login_attempt import LoginAttempt

        query = LoginAttempt.query
        if ip:
            query = query.filter_by(ip_address=ip)

        deleted = query.delete(synchronize_session=False)
        db.session.commit()

        target = f' for {ip}' if ip else ''
        click.echo(f'Cleared {deleted} failed login attempt(s){target}.')

    @app.cli.command('remove-legacy-users')
    @click.option('--confirm', is_flag=True, default=False,
                  help='Actually delete matching users. Without this flag, only a dry-run report is printed.')
    def remove_legacy_users(confirm: bool):
        """Permanently remove the legacy 'Housekeeping' and 'School Director' users.

        Matches users by NAME (case-insensitive, exact match after trimming) against:
          - "Housekeeping"
          - "School Director"

        Any user whose name contains the word "head" (e.g. "HouseKeeping Head",
        "Housekeeping Head") is ALWAYS protected/skipped, even if it were somehow
        also an exact match, per explicit requirement: never touch the
        Housekeeping Head user.

        Safe by default: run with no flags first to see exactly who would be
        deleted and whether any other records (tasks, registers, notifications,
        approvals, etc.) still reference that user. Re-run with --confirm once
        you're satisfied it's safe. If a matching user still has records tied to
        them through a required (NOT NULL) relationship, that user is skipped and
        the blocking table/column is printed so you can reassign that data first.
        """
        from app.models.user import User
        from app.models.register import Register
        from app.models.task import Task, TaskHistory
        from app.models.notification import Notification
        from app.models.approval import Approval
        from app.models.asset import Asset
        from app.models.housekeeping import HousekeepingTask
        from app.models.leave_request import LeaveRequest, ResumptionRequest
        from app.models.meeting import Meeting, MeetingAttendee
        from app.models.purchase_order import PurchaseOrder
        from app.models.recruitment import Recruitment
        from app.models.salary_increment import SalaryIncrement
        from app.models.refresh_token import RefreshToken

        TARGET_NAMES = {'housekeeping', 'school director'}

        candidates = [
            u for u in User.query.all()
            if u.name.strip().lower() in TARGET_NAMES
        ]

        protected = [u for u in candidates if 'head' in u.name.strip().lower()]
        to_process = [u for u in candidates if u not in protected]

        if protected:
            click.echo('Protected (never deleted, name contains "head"):')
            for u in protected:
                click.echo(f'  - SKIP  id={u.id}  name="{u.name}"  role={u.role}  email={u.email}')

        if not to_process:
            click.echo('No matching "Housekeeping" / "School Director" users found to remove.')
            return

        # NOT NULL foreign keys to users.id -> deletion is blocked unless these are reassigned first.
        BLOCKING_CHECKS = [
            (Task, 'assigned_by'), (Task, 'assigned_to'), (TaskHistory, 'updated_by'),
            (Notification, 'user_id'),
            (Approval, 'requested_by'),
            (HousekeepingTask, 'created_by'),
            (LeaveRequest, 'user_id'), (ResumptionRequest, 'user_id'),
            (Meeting, 'created_by'), (MeetingAttendee, 'user_id'),
            (PurchaseOrder, 'created_by'),
            (Recruitment, 'created_by'),
            (SalaryIncrement, 'employee_id'), (SalaryIncrement, 'requested_by'),
        ]
        # Nullable foreign keys to users.id -> safe to clear before deleting.
        NULLABLE_CHECKS = [
            (Register, 'head_id'), (Register, 'created_by'),
            (Approval, 'approved_by'),
            (Asset, 'assigned_to'),
            (HousekeepingTask, 'assigned_to'),
            (LeaveRequest, 'reviewed_by'), (ResumptionRequest, 'reviewed_by'),
            (SalaryIncrement, 'hr_approved_by'), (SalaryIncrement, 'finance_approved_by'),
        ]

        for user in to_process:
            blockers = []
            for model, column in BLOCKING_CHECKS:
                count = model.query.filter(getattr(model, column) == user.id).count()
                if count:
                    blockers.append(f'{model.__tablename__}.{column} ({count} row(s))')

            if blockers:
                click.echo(f'SKIPPED id={user.id} name="{user.name}" — still referenced by: {", ".join(blockers)}')
                click.echo('  Reassign or clear those records first, then re-run this command.')
                continue

            nullable_touched = []
            for model, column in NULLABLE_CHECKS:
                count = model.query.filter(getattr(model, column) == user.id).count()
                if count:
                    nullable_touched.append(f'{model.__tablename__}.{column} ({count} row(s))')

            if not confirm:
                extra = f' [would also clear: {", ".join(nullable_touched)}]' if nullable_touched else ''
                click.echo(f'WOULD DELETE id={user.id} name="{user.name}" role={user.role} email={user.email}{extra}')
                continue

            for model, column in NULLABLE_CHECKS:
                model.query.filter(getattr(model, column) == user.id).update(
                    {column: None}, synchronize_session=False
                )
            RefreshToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)

            click.echo(f'DELETING id={user.id} name="{user.name}" role={user.role} email={user.email}')
            db.session.delete(user)

        if confirm:
            db.session.commit()
            click.echo('Done. Legacy users removed (protected Housekeeping Head user left untouched).')
        else:
            click.echo('\nDry run only — no changes made. Re-run with --confirm to actually delete.')
