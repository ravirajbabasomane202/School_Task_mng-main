from datetime import datetime, date, timedelta, timezone

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.register import Register, RegisterOccurrence, CYCLES, PRIORITIES, STATUSES, calculate_next_due_date, _add_months
from app.models.user import User, DEPARTMENT_HEAD_ROLES
from app.utils.response import success, error
from app.utils.decorators import roles_required

registers_bp = Blueprint('registers', __name__)

REGISTER_MANAGER_ROLES = ('CHAIRMAN',)
# Roles that can VIEW every register (school-wide), even though they cannot
# create/edit/delete one. The Director's dashboard/sidebar exposes a
# "Registers" page (`/director/registers`) that is meant to be school-wide,
# just like the Chairman's — previously DIRECTOR was missing from this list,
# so a newly added register (correctly visible to the Chairman who created
# it) never showed up for the Director because the query was silently
# scoped down to `head_id == user.id`, which the Director almost never
# matches. Add any other "view everything" roles here as needed.
REGISTER_VIEW_ALL_ROLES = (*REGISTER_MANAGER_ROLES, 'DIRECTOR')


def _scope_to_user(query, user):
    """Restrict a Register query to records assigned/available to `user`.

    Roles in REGISTER_VIEW_ALL_ROLES (Chairman, Director) see and can browse
    every register. Every other role only sees registers where they are the
    assigned Head (`head_id`), i.e. the registers actually available to them.
    """
    if user.role in REGISTER_VIEW_ALL_ROLES:
        return query
    return query.filter(Register.head_id == user.id)

# `head_name` is accepted as a legacy fallback, but `head_id` is the preferred field
# going forward — the register stores the selected user's ID, not free text.
REQUIRED_FIELDS = ['name', 'register_no', 'cycle', 'priority', 'start_date']


def _parse_date(value):
    """Parse an ISO date/datetime string into a date object."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        # Accept both 'YYYY-MM-DD' and full ISO datetime strings
        if 'T' in text:
            return datetime.fromisoformat(text.replace('Z', '+00:00')).date()
        return datetime.strptime(text, '%Y-%m-%d').date()
    except ValueError:
        return None


def _resolve_head(data, partial=False):
    """Resolve the selected Head (User) from `head_id`, falling back to legacy
    free-text `head_name` for backward compatibility.

    Returns (head_user_or_None, head_name_text, error_message_or_None).
    """
    if 'head_id' in data and data['head_id'] not in (None, ''):
        try:
            head_id = int(data['head_id'])
        except (TypeError, ValueError):
            return None, None, 'head_id must be a valid Head ID'
        head_user = db.session.get(User, head_id)
        if not head_user or not head_user.is_active:
            return None, None, 'Selected Head Name is not a valid active user'
        return head_user, head_user.name, None

    if 'head_name' in data and data['head_name']:
        # Legacy fallback: plain text, no linked user.
        return None, str(data['head_name']).strip(), None

    if not partial:
        return None, None, 'head_id is required'

    return None, None, None


def _validate_payload(data, partial=False):
    """Validate register fields. Returns an error message string, or None if valid."""
    fields = REQUIRED_FIELDS if not partial else [f for f in REQUIRED_FIELDS if f in data]
    for field in fields:
        if data.get(field) in (None, ''):
            return f'{field} is required'

    if not partial and 'head_id' not in data and 'head_name' not in data:
        return 'head_id is required'

    if 'cycle' in data and data['cycle'] and data['cycle'].upper() not in CYCLES:
        return f"checking_cycle must be one of {', '.join(CYCLES)}"

    if 'priority' in data and data['priority'] and data['priority'].upper() not in PRIORITIES:
        return f"priority must be one of {', '.join(PRIORITIES)}"

    if 'start_date' in data and data['start_date'] and _parse_date(data['start_date']) is None:
        return 'start_date must be a valid date (YYYY-MM-DD)'

    return None


@registers_bp.route('', methods=['GET'])
@jwt_required()
def list_registers():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    query = _scope_to_user(Register.query, user)

    search = request.args.get('search')
    cycle = request.args.get('cycle')
    priority = request.args.get('priority')
    status = request.args.get('status')
    department_id = request.args.get('department_id')

    if search:
        like = f'%{search}%'
        query = query.filter(db.or_(Register.name.ilike(like), Register.register_no.ilike(like)))
    if cycle:
        query = query.filter_by(cycle=cycle.upper())
    if priority:
        query = query.filter_by(priority=priority.upper())
    if department_id:
        # A register's "department" is derived from its assigned Head's department.
        query = query.join(User, Register.head_id == User.id).filter(User.department_id == int(department_id))

    registers = query.order_by(Register.next_due_date.asc()).all()

    # The Status column must reflect TODAY's occurrence (the only thing
    # "Update Status" ever writes now), not the register's own stale
    # `status` field -- batch-fetch today's occurrence rows in one query.
    today = date.today()
    register_ids = [r.id for r in registers]
    todays_occurrences = {}
    if register_ids:
        todays_occurrences = {
            occ.register_id: occ
            for occ in RegisterOccurrence.query.filter(
                RegisterOccurrence.register_id.in_(register_ids),
                RegisterOccurrence.occurrence_date == today,
            ).all()
        }

    # The status filter must match the SAME effective status shown to the
    # user (today's occurrence when one exists, else the register's own
    # `status`). Filtering on the raw `Register.status` column here missed
    # OK/REJECTED registers because that column is never touched by the
    # per-occurrence "Update Status" action anymore.
    if status:
        status = status.upper()
        registers = [
            r for r in registers
            if r.effective_today_status(today, todays_occurrences.get(r.id))[0] == status
        ]

    return success([r.to_dict(today=today, occurrence=todays_occurrences.get(r.id)) for r in registers])


@registers_bp.route('/calendar', methods=['GET'])
@jwt_required()
def calendar_events():
    """Return register schedules as calendar events within a date range.

    Registers are cyclic (DAILY/WEEKLY/MONTHLY/...), so every occurrence of
    the cycle that falls inside [start, end] is returned — not just the
    single stored `next_due_date` — so the calendar shows a dot on every
    scheduled day, including future ones, as the user pages through it.
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    today = date.today()
    start = _parse_date(request.args.get('start')) or (today - timedelta(days=90))
    end = _parse_date(request.args.get('end')) or (today + timedelta(days=365))

    query = _scope_to_user(Register.query, user)

    cycle = request.args.get('cycle')
    priority = request.args.get('priority')
    status = request.args.get('status')
    if cycle:
        query = query.filter_by(cycle=cycle.upper())
    if priority:
        query = query.filter_by(priority=priority.upper())
    if status:
        query = query.filter_by(status=status.upper())

    registers = query.order_by(Register.next_due_date.asc()).all()

    # Batch-fetch every persisted occurrence record for every register in this
    # range in one query (instead of one query per register per occurrence),
    # then hand each register its own slice via `occurrence_map`.
    register_ids = [r.id for r in registers]
    occurrence_maps = {r.id: {} for r in registers}
    if register_ids:
        all_occurrences = RegisterOccurrence.query.filter(
            RegisterOccurrence.register_id.in_(register_ids),
            RegisterOccurrence.occurrence_date >= start,
            RegisterOccurrence.occurrence_date <= end,
        ).all()
        for occ in all_occurrences:
            occurrence_maps[occ.register_id][occ.occurrence_date] = occ

    events = []
    for r in registers:
        todays_occurrence = occurrence_maps[r.id].get(today)
        register_dict = r.to_dict(today=today, occurrence=todays_occurrence)
        for occ in r.generate_occurrences(start, end, today, occurrence_map=occurrence_maps[r.id]):
            occ_date = occ['date']
            computed_status = occ['status']
            dot_color = occ['dot_color']
            # `color` kept as a 3-value field for backward compatibility with older
            # clients; `dot_color` carries the full 4-state Completed/Pending/Failed/Upcoming.
            color = 'green' if computed_status == 'COMPLETED' else ('red' if computed_status == 'FAILED' else 'gray')

            events.append({
                # `id` stays a stable, unique-per-cell React key (register + date).
                # It is NOT what identifies the occurrence to the backend for
                # updates -- `register_id` + `occurrence_date` (or `occurrence_id`
                # once a record exists) is what the update endpoint requires, and
                # is what MUST be sent back so only this one occurrence changes.
                'id': f'{r.id}:{occ_date.isoformat()}',
                'register_id': r.id,
                'occurrence_id': occ['occurrence_id'],
                'occurrence_date': occ_date.isoformat(),
                'title': f'{r.name} ({r.register_no})',
                'date': occ_date.isoformat(),
                'status': r.status,
                'computed_status': computed_status,
                'color': color,
                'dot_color': dot_color,
                'is_future_or_pending': occ_date >= today,
                'register': register_dict,
            })

    return success(events)


@registers_bp.route('/<int:register_id>', methods=['GET'])
@jwt_required()
def get_register(register_id: int):
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    register = db.session.get(Register, register_id)
    if not register:
        return error('Register not found', 404)
    if user.role not in REGISTER_VIEW_ALL_ROLES and register.head_id != user.id:
        return error('You do not have access to this register', 403)

    today = date.today()
    todays_occurrence = RegisterOccurrence.query.filter_by(register_id=register_id, occurrence_date=today).first()
    return success(register.to_dict(today=today, occurrence=todays_occurrence))


@registers_bp.route('', methods=['POST'])
@roles_required(*REGISTER_MANAGER_ROLES)
def create_register():
    data = request.get_json() or {}
    # Accept `checking_cycle` as the primary field name, `cycle` as legacy alias.
    if 'checking_cycle' in data and 'cycle' not in data:
        data['cycle'] = data['checking_cycle']

    validation_error = _validate_payload(data)
    if validation_error:
        return error(validation_error, 400)

    head_user, head_name, head_error = _resolve_head(data)
    if head_error:
        return error(head_error, 400)

    register_no = str(data['register_no']).strip()
    if Register.query.filter_by(register_no=register_no).first():
        return error('Register No. already exists. Register numbers must be unique.', 409)

    start_date = _parse_date(data['start_date'])
    cycle = data['cycle'].upper()

    user_id = get_jwt_identity()

    register = Register(
        name=data['name'].strip(),
        register_no=register_no,
        head_id=head_user.id if head_user else None,
        head_name=head_name,
        cycle=cycle,
        priority=data['priority'].upper(),
        status=data.get('status', 'IDLE').upper() if data.get('status') else 'IDLE',
        start_date=start_date,
        next_due_date=calculate_next_due_date(start_date, cycle),
        created_by=user_id,
    )
    db.session.add(register)
    db.session.commit()
    return success(register.to_dict(), 'Register added successfully', 201)


@registers_bp.route('/<int:register_id>', methods=['PUT'])
@roles_required(*REGISTER_MANAGER_ROLES)
def update_register(register_id: int):
    register = db.session.get(Register, register_id)
    if not register:
        return error('Register not found', 404)

    data = request.get_json() or {}
    if 'checking_cycle' in data and 'cycle' not in data:
        data['cycle'] = data['checking_cycle']

    validation_error = _validate_payload(data, partial=True)
    if validation_error:
        return error(validation_error, 400)

    if 'head_id' in data or 'head_name' in data:
        head_user, head_name, head_error = _resolve_head(data, partial=True)
        if head_error:
            return error(head_error, 400)
        if head_user:
            register.head_id = head_user.id
            register.head_name = head_name
        elif head_name:
            register.head_id = None
            register.head_name = head_name

    if 'register_no' in data:
        new_register_no = str(data['register_no']).strip()
        if new_register_no != register.register_no:
            existing = Register.query.filter_by(register_no=new_register_no).first()
            if existing and existing.id != register.id:
                return error('Register No. already exists. Register numbers must be unique.', 409)
            register.register_no = new_register_no

    if 'name' in data:
        register.name = data['name'].strip()
    if 'cycle' in data and data['cycle']:
        register.cycle = data['cycle'].upper()
    if 'priority' in data and data['priority']:
        register.priority = data['priority'].upper()
    if 'start_date' in data and data['start_date']:
        register.start_date = _parse_date(data['start_date'])
    if 'status' in data and data['status']:
        if data['status'].upper() not in STATUSES:
            return error(f"status must be one of {', '.join(STATUSES)}", 400)
        register.status = data['status'].upper()

    # Recalculate next due date if the start date or cycle changed
    if 'start_date' in data or 'cycle' in data:
        register.next_due_date = calculate_next_due_date(register.start_date, register.cycle)

    db.session.commit()
    return success(register.to_dict(), 'Register updated successfully')


@registers_bp.route('/<int:register_id>', methods=['DELETE'])
@roles_required(*REGISTER_MANAGER_ROLES)
def delete_register(register_id: int):
    register = db.session.get(Register, register_id)
    if not register:
        return error('Register not found', 404)

    db.session.delete(register)
    db.session.commit()
    return success(None, 'Register deleted successfully')


@registers_bp.route('/<int:register_id>/status', methods=['PATCH'])
@roles_required(*REGISTER_MANAGER_ROLES)
def update_status(register_id: int):
    register = db.session.get(Register, register_id)
    if not register:
        return error('Register not found', 404)

    data = request.get_json() or {}
    new_status = (data.get('status') or '').upper()

    if not new_status:
        return error('status is required', 400)
    if new_status not in STATUSES:
        return error(f"status must be one of {', '.join(STATUSES)}", 400)

    register.status = new_status

    # Automatically calculate the next due date based on the cycle after
    # each completed update (i.e. whenever the status moves out of IDLE).
    if new_status in ('OK', 'REJECTED'):
        base_date = register.next_due_date or register.start_date or date.today()
        if new_status == 'OK':
            register.last_completed_date = base_date
        register.next_due_date = calculate_next_due_date(base_date, register.cycle)

    db.session.commit()
    return success(register.to_dict(), 'Register status updated')


@registers_bp.route('/<int:register_id>/occurrences/<occurrence_date>/status', methods=['PATCH'])
@roles_required(*REGISTER_MANAGER_ROLES)
def update_occurrence_status(register_id: int, occurrence_date: str):
    """Edit THIS occurrence only.

    This is the fix for the "editing one occurrence updates several" bug:
    the update targets a single `RegisterOccurrence` row, upserted on the
    unique (register_id, occurrence_date) pair, and the SQL/ORM write below
    only ever touches that one row --

        RegisterOccurrence.query.filter_by(register_id=..., occurrence_date=...)

    NOT `WHERE register_id = ?` alone and NOT the parent `Register` row, so
    no other date's occurrence is ever affected. Contrast with
    `update_status` below, which intentionally updates the shared `Register`
    row and represents "Edit Entire Series".
    """
    register = db.session.get(Register, register_id)
    if not register:
        return error('Register not found', 404)

    parsed_date = _parse_date(occurrence_date)
    if not parsed_date:
        return error('occurrence_date must be a valid date (YYYY-MM-DD)', 400)

    data = request.get_json() or {}
    new_status = (data.get('status') or '').upper()
    if not new_status:
        return error('status is required', 400)
    if new_status not in STATUSES:
        return error(f"status must be one of {', '.join(STATUSES)}", 400)

    user_id = get_jwt_identity()

    # Upsert scoped to (register_id, occurrence_date) -- this is the ONE
    # occurrence being edited, and no other row is read or written.
    occurrence = RegisterOccurrence.query.filter_by(
        register_id=register_id,
        occurrence_date=parsed_date,
    ).first()
    if occurrence is None:
        occurrence = RegisterOccurrence(register_id=register_id, occurrence_date=parsed_date)
        db.session.add(occurrence)

    occurrence.status = new_status
    occurrence.completed_by = user_id
    occurrence.completed_at = datetime.now(timezone.utc)

    db.session.commit()

    return success({
        'occurrence': occurrence.to_dict(),
        'register': register.to_dict(today=date.today(), occurrence=occurrence),
    }, 'Occurrence updated successfully')


@registers_bp.route('/heads', methods=['GET'])
@jwt_required()
def list_register_heads():
    """Active users eligible to be selected as a Register's Head Name."""
    query = User.query.filter(
        User.is_active.is_(True),
        User.role.in_(DEPARTMENT_HEAD_ROLES),
    )
    users = query.order_by(User.name).all()
    return success([
        {
            'id': u.id,
            'name': u.name,
            'role': u.role,
            'department_id': u.department_id,
            'department_name': u.department.name if u.department else None,
        }
        for u in users
    ])


@registers_bp.route('/<int:register_id>/calendar', methods=['GET'])
@jwt_required()
def register_calendar(register_id: int):
    """Calendar dots for a single Register, for the small popup view.

    The register is cyclic (per its Checking Cycle), so every occurrence of
    the cycle that falls within the viewed month is surfaced with its own
    computed status — not just the single current due date — so daily/weekly/
    monthly registers show a dot on every scheduled day of the month,
    including future ones.
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return error('User not found', 401)

    register = db.session.get(Register, register_id)
    if not register:
        return error('Register not found', 404)
    if user.role not in REGISTER_VIEW_ALL_ROLES and register.head_id != user.id:
        return error('You do not have access to this register', 403)

    today = date.today()
    month_str = request.args.get('month')  # 'YYYY-MM', defaults to the due date's month
    if month_str:
        try:
            year, month = (int(part) for part in month_str.split('-'))
            anchor = date(year, month, 1)
        except (ValueError, TypeError):
            return error('month must be in YYYY-MM format', 400)
    else:
        anchor = register.next_due_date.replace(day=1) if register.next_due_date else today.replace(day=1)

    range_start = anchor
    range_end = _add_months(anchor, 1) - timedelta(days=1)

    entries = [
        {
            'date': occ['date'].isoformat(),
            'status': occ['status'],
            'dot_color': occ['dot_color'],
            'occurrence_id': occ['occurrence_id'],
        }
        for occ in register.generate_occurrences(range_start, range_end, today)
    ]

    todays_occurrence = RegisterOccurrence.query.filter_by(register_id=register_id, occurrence_date=today).first()

    return success({
        'register': register.to_dict(today=today, occurrence=todays_occurrence),
        'month': anchor.strftime('%Y-%m'),
        'entries': entries,
    })
