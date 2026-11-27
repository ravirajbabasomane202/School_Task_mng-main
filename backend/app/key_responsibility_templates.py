"""Standard Key Responsibilities per role.

Source of truth: "Key Responsibilities and Job Description of the Key Role
Players" (Adhira International School, KRA / JD document). Wording follows the
document; only obvious spelling slips were corrected and the unnumbered
"Admission planning" line in the Principal's list is kept as its own item.

These are *templates*: they are copied onto a user (``user_key_responsibilities``)
by the seed command / migration or by the "Use standard responsibilities"
button in User Management. After that the user's own rows are what the app
shows, so an administrator can freely edit them and nothing here has to change.

Keys are the stable role keys stored in ``users.role``.
"""

KEY_RESPONSIBILITY_TEMPLATES = {
    'DIRECTOR': {
        'title': 'Director',
        'summary': 'Entire school operations and all departments',
        'items': [
            'Maintaining a high level of confidentiality about the total work carried out / planned by Management.',
            'Strategic planning and day-to-day operations, particularly in relation to buildings and premises. '
            'Likely areas of responsibility include: utilities and communications infrastructure, buildings and '
            'premises maintenance, procurement and vendor management.',
            'Health and safety of all students and employees.',
            'Housekeeping & Security.',
            'Modernization of the system/process and facilities with proper approval from the management, and '
            'maintaining the standard of services in all.',
            "Maintaining all kinds of work orders, P.O's, A.M.C's, contracts and all kinds of renovations.",
            'Maintaining proper documentation / records of assets, liabilities, expenditure etc.',
            'Maintaining discipline, rules & regulations as instructed by the management from time to time.',
        ],
    },
    'PRINCIPAL': {
        'title': 'Principal',
        'summary': (
            'The Head of the office of the school; carries out all administrative duties required of the school '
            'in coordination with the departmental heads and the staff.'
        ),
        'items': [
            'Executive of the vision and mission of the organization, to be followed and achieved.',
            'Be the drawing and disbursing officer for the employees of the school; may perform only such '
            'functions as drawing and disbursing officer as may be specified in the instructions issued by the '
            'organisation.',
            'Proceedings and functioning of all governance committees of the school.',
            'Setting up the roles and objectives of the academic and administrative staff.',
            'Ensuring learning outcomes according to the objectives of the organization, the State and the '
            'educational Board.',
            'Health and safety of the students.',
            'Compliance of the records, regulations and directives of the Organisation, the State and the '
            'educational Board.',
            'Financial health of the school: revenue collection and its proper utilization.',
            'Overall school administration.',
            'Admission planning.',
        ],
    },
    'ADMIN': {
        'title': 'Administration Officer',
        'summary': 'School Administration',
        'items': [
            'Office administration',
            'School records',
            'School reports',
            'Transportation',
            'Safety and Security',
            'Housekeeping',
            'Grievance redressal',
            'Repairs and Maintenance',
            'Facilitation and services',
            'School promotion and events',
            'School decorum',
        ],
    },
    'FINANCE': {
        'title': 'Accounts Officer',
        'summary': 'Maintaining the school finance records and process as per policies of the school and the State.',
        'items': [
            'Responsible to maintain a high level of confidentiality about the total work carried out / planned '
            'by Management.',
            'Responsible for preparation of revenue and expense entries by compiling and analyzing account '
            'information, and getting them signed by Management.',
            'Responsible to provide daily accounting and documentation, and to secure financial information by '
            'completing database backups.',
            'To collect the fees from the students and deposit them into the bank accounts of the concerned '
            'institutions.',
        ],
    },
    'ADMISSION': {
        'title': 'Admission Officer',
        'summary': (
            'Enhancing the student strength of the school and maintaining harmony between the parents and the school.'
        ),
        'items': [
            'Admission Target Achievement',
            'Enquiry Management',
            'Parent Relationship Management',
            'Lead Generation & Telecalling',
            'School Promotion & Marketing',
            'Campus Visits & Admission Counselling',
            'Admission Process Management',
            'Database Management & Reporting',
            'Market Research & Competitor Analysis',
            'Strategic Partnerships & Networking',
            'Event Planning & Management',
            'Interdepartmental Coordination',
            'Parent Feedback & Satisfaction',
            'School Branding & Reception Management',
            'Admission Performance Monitoring & Reporting',
        ],
    },
    'HR': {
        'title': 'Human Resource Manager',
        'summary': (
            'Shortlisting, interviewing and hiring the staff. Maintain workflow and performance of the '
            'department. Provides beneficial and timely staff evaluations. Handles discipline and termination of '
            'employees in accordance with school policy.'
        ),
        'items': [
            'Resource planning with the school management.',
            'Hunting, shortlisting, interviews, induction programs and joining of the candidates.',
            'Overview and analyse the exit process of the staff to reduce the attrition ratio.',
            'Statutory compliances according to the law of the State and school policy.',
            'Maintain personal files, certificates and records of the employees.',
            'Coordination with Administration, front desk, finance and the higher authorities.',
            'Ensure employee satisfaction and retention in the organization.',
        ],
    },
}


def apply_template(user, role_key=None, db_session=None):
    """Copy the template for ``role_key`` (default: the user's role) onto ``user``.

    Never overwrites: returns False (and changes nothing) when the user already
    has responsibilities or a summary, or when the role has no template.
    """
    from app.extensions import db
    from app.models.key_responsibility import UserKeyResponsibility

    session = db_session or db.session
    template = KEY_RESPONSIBILITY_TEMPLATES.get(role_key or user.role)
    if not template or user.key_responsibilities or user.responsibility_summary:
        return False
    user.responsibility_summary = template['summary']
    for position, text in enumerate(template['items'], start=1):
        user.key_responsibilities.append(
            UserKeyResponsibility(description=text, sort_order=position)
        )
    session.add(user)
    return True
