from flask import Blueprint, request
from app.tasks.escalation import run_escalation_job
from app.utils.response import success
from app.utils.decorators import roles_required

escalations_bp = Blueprint('escalations', __name__)


@escalations_bp.route('/run', methods=['POST'])
@roles_required('CHAIRMAN', 'DIRECTOR')
def run_escalation():
    """Send "overdue, consider escalating" reminders to assigners.

    Does not change any task status - ESCALATED is set manually by the assigner.
    """
    body = request.get_json(silent=True) or {}
    hours_threshold = body.get('hours_threshold', 48)
    notified_count = run_escalation_job(hours_threshold)

    return success(
        {'notified_count': notified_count, 'escalated_count': 0},
        f'Sent {notified_count} overdue reminder(s)',
    )
