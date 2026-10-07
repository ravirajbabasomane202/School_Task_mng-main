from datetime import datetime, date, timedelta, timezone

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.register import (
    Register,
    RegisterOccurrence,
    CYCLES,
    PRIORITIES,
    STATUSES,
    CHECKED_STATUSES,
    calculate_next_due_date,
    fetch_current_cycle_occurrences,
    fetch_occurrence_maps,
    next_period_start,
    period_bounds,
    period_label,
    _add_months,
)
from app.models.user import User, DEPARTMENT_HEAD_ROLES
from app.utils.response import success, error
from app.utils.decorators import roles_required

registers_bp = Blueprint('registers', __name__)


def _today():
    """The date used to decide which checking period is current. One place,
    so every register endpoint agrees (and tests can pin it)."""
    return date.today()

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
    head_id = request.args.get('head_id')
    department_id = request.args.get('department_id')

    if search:
        like = f'%{search}%'
        query = query.filter(db.or_(Register.name.ilike(like), Register.register_no.ilike(like)))
    if cycle:
        query = query.filter_by(cycle=cycle.upper())
    if priority:
        query = query.filter_by(priority=priority.upper())
    if head_id:
        # "All Head" filter — a register's Head is its own head_id column,
        # so this is a direct filter, no join required.
        query = query.filter(Register.head_id == int(head_id))
    if department_id:
        # Legacy: filter by the assigned Head's department instead of the
        # Head directly. Kept for backward compatibility.
        query = query.join(User, Register.head_id == User.id).filter(User.department_id == int(department_id))

    registers = query.order_by(Register.next_due_date.asc()).all()

    # The Status column must reflect each register's OWN current-cycle
    # occurrence (today for DAILY, the most recent cyclic due date otherwise
    # -- the only date "Update Status" is now restricted to), not the
    # register's own stale `status` field. Batch-fetch those rows (one
    # query, even though the relevant date differs per register).
    today = _today()
    current_occurrences = fetch_current_cycle_occurrences(registers, today)

    # The status filter must match the SAME effective status shown to the
    # user (the current-cycle occurrence when one exists, else the
    # register's own `status`). Filtering on the raw `Register.status`
    # column here missed OK/REJECTED registers because that column is never
    # touched by the per-occurrence "Update Status" action anymore.
    if status:
        status = status.upper()
        registers = [
            r for r in registers
            if r.effective_today_status(today, current_occurrences.get(r.id))[0] == status
        ]

    return success([r.to_dict(today=today, occurrence=current_occurrences.get(r.id)) for r in registers])


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

    today = _today()
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
    occurrence_maps = fetch_occurrence_maps(registers, start, end)

    # Each register's embedded `register` dict (used by the frontend for
    # Status badges / `isRegisterUpdatable`) must reflect ITS OWN
    # current-cycle occurrence date, not "today" -- that date can fall
    # outside [start, end] (e.g. an overdue WEEKLY due date from months ago
    # while paging near today), so it is fetched separately here rather than
    # sourced from `occurrence_maps` above.
    current_occurrences = fetch_current_cycle_occurrences(registers, today)

    events = []
    for r in registers:
        register_dict = r.to_dict(today=today, occurrence=current_occurrences.get(r.id))
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
                'period_start': occ['period_start'].isoformat(),
                'period_end': occ['period_end'].isoformat(),
                'completed_at': occ['completed_at'].isoformat() if occ.get('completed_at') else None,
                'title': f'{r.name} ({r.register_no})',
                'date': occ_date.isoformat(),
                'status': r.status,
                'computed_status': computed_status,
                'color': color,
                'dot_color': dot_color,
                'is_future_or_pending': occ['period_end'] >= today,
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

    today = _today()
    return success(register.to_dict(today=today))


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


class _CheckRejected(Exception):
    """A register check that must be refused (carries the HTTP status)."""

    def __init__(self, message, status_code):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _record_period_check(register, new_status, user_id, today, requested_date=None):
    """Record the ONE check a register gets per checking period.

    This is the single place a check is written, shared by every endpoint
    that can record one, so the rule cannot be bypassed:

      * the register must have started;
      * the check always lands in the CURRENT period (`requested_date`, if
        given, must fall inside it -- past/future periods are refused, so
        history is never rewritten);
      * if ANY check already exists inside that period -- including legacy
        rows stored on an old exact scheduled date -- it is refused (409);
      * the row is stored under the period's start date, so the database's
        unique (register_id, occurrence_date) constraint also stops two
        simultaneous requests from both succeeding.

    Raises _CheckRejected; the caller is responsible for translating it.
    """
    label = period_label(register.cycle)
    period = register.current_period(today)
    if period is None:
        raise _CheckRejected(
            f"This register can't be checked until its start date "
            f"({register.start_date.isoformat() if register.start_date else 'not set'}).",
            400,
        )
    p_start, p_end = period
    span = f'{p_start.isoformat()} to {p_end.isoformat()}'

    if requested_date is not None and period_bounds(register.cycle, requested_date)[0] != p_start:
        raise _CheckRejected(
            f'Only the current {label} ({span}) can be checked. '
            f'Earlier periods are closed and later ones have not started.',
            400,
        )

    already = f'This register has already been checked for the current {label} ({span}).'

    in_period = RegisterOccurrence.query.filter(
        RegisterOccurrence.register_id == register.id,
        RegisterOccurrence.occurrence_date >= p_start,
        RegisterOccurrence.occurrence_date <= p_end,
    ).all()
    if any(row.status in CHECKED_STATUSES for row in in_period):
        raise _CheckRejected(already, 409)

    # An unchecked (IDLE) placeholder already sitting on the period key is
    # reused instead of colliding with the unique constraint.
    occurrence = next((row for row in in_period if row.occurrence_date == p_start), None)
    if occurrence is None:
        occurrence = RegisterOccurrence(register_id=register.id, occurrence_date=p_start)
        db.session.add(occurrence)

    occurrence.status = new_status
    occurrence.completed_by = user_id
    occurrence.completed_at = datetime.now(timezone.utc)

    # Keep the register's own due-date bookkeeping in step: the next check
    # is due in the next period.
    register.next_due_date = next_period_start(register.cycle, today)
    if new_status == 'OK':
        register.last_completed_date = today

    try:
        db.session.commit()
    except IntegrityError:
        # Lost a race with a concurrent request that checked the same period.
        db.session.rollback()
        raise _CheckRejected(already, 409)
    return occurrence


@registers_bp.route('/<int:register_id>/status', methods=['PATCH'])
@roles_required(*REGISTER_MANAGER_ROLES)
def update_status(register_id: int):
    """Series-level status update. Recording OK/REJECTED here is a check like
    any other, so it goes through the same once-per-period rule."""
    register = db.session.get(Register, register_id, with_for_update=True)
    if not register:
        return error('Register not found', 404)

    data = request.get_json() or {}
    new_status = (data.get('status') or '').upper()

    if not new_status:
        return error('status is required', 400)
    if new_status not in STATUSES:
        return error(f"status must be one of {', '.join(STATUSES)}", 400)

    today = _today()
    if new_status in CHECKED_STATUSES:
        try:
            _record_period_check(register, new_status, get_jwt_identity(), today)
        except _CheckRejected as exc:
            return error(exc.message, exc.status_code)

    register.status = new_status
    db.session.commit()
    return success(register.to_dict(today=today), 'Register status updated')


@registers_bp.route('/<int:register_id>/occurrences/<occurrence_date>/status', methods=['PATCH'])
@roles_required(*REGISTER_MANAGER_ROLES)
def update_occurrence_status(register_id: int, occurrence_date: str):
    """Check a register for its current checking period ("Check Register").

    `occurrence_date` may be ANY date inside the current period (the whole
    Monday-Sunday week for a weekly register, the whole month for a monthly
    one, ...); it is resolved to that period, and the check is stored once
    against it. A second check in the same period is refused with 409, and
    a date outside the current period is refused with 400 -- see
    `_record_period_check`. This is enforced here, not just by disabling the
    button, so API calls, second tabs and stale pages can't duplicate a check.
    """
    register = db.session.get(Register, register_id, with_for_update=True)
    if not register:
        return error('Register not found', 404)

    parsed_date = _parse_date(occurrence_date)
    if not parsed_date:
        return error('occurrence_date must be a valid date (YYYY-MM-DD)', 400)

    data = request.get_json() or {}
    new_status = (data.get('status') or '').upper()
    if not new_status:
        return error('status is required', 400)
    if new_status not in CHECKED_STATUSES:
        return error(f"status must be one of {', '.join(CHECKED_STATUSES)}", 400)

    today = _today()
    try:
        occurrence = _record_period_check(
            register, new_status, get_jwt_identity(), today, requested_date=parsed_date
        )
    except _CheckRejected as exc:
        return error(exc.message, exc.status_code)

    return success({
        'occurrence': occurrence.to_dict(),
        'register': register.to_dict(today=today, occurrence=occurrence),
    }, 'Register checked successfully')


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

    today = _today()
    month_str = request.args.get('month')  # 'YYYY-MM', defaults to the current month
    if month_str:
        try:
            year, month = (int(part) for part in month_str.split('-'))
            anchor = date(year, month, 1)
        except (ValueError, TypeError):
            return error('month must be in YYYY-MM format', 400)
    else:
        # Open on today's month (or the start month if the register hasn't
        # started yet).
        default_anchor_date = today
        if register.start_date and register.start_date > today:
            default_anchor_date = register.start_date
        anchor = default_anchor_date.replace(day=1)

    range_start = anchor
    range_end = _add_months(anchor, 1) - timedelta(days=1)

    entries = [
        {
            'date': occ['date'].isoformat(),
            'status': occ['status'],
            'dot_color': occ['dot_color'],
            'occurrence_id': occ['occurrence_id'],
            'period_start': occ['period_start'].isoformat(),
            'period_end': occ['period_end'].isoformat(),
            'is_open': occ['is_open'],
        }
        for occ in register.generate_occurrences(range_start, range_end, today)
    ]

    return success({
        'register': register.to_dict(today=today),
        'month': anchor.strftime('%Y-%m'),
        'entries': entries,
    })