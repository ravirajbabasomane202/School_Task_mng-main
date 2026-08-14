from datetime import datetime, timezone, timedelta
from flask import Blueprint, request
from app.extensions import db
from app.models.task import Task, TaskHistory
from app.models.user import User
from app.models.notification import Notification
from app.sockets.emitter import emit_notification
from app.utils.response import success, error
from app.utils.decorators import roles_required

escalations_bp = Blueprint('escalations', __name__)


@escalations_bp.route('/run', methods=['POST'])
@roles_required('CHAIRMAN', 'DIRECTOR')
def run_escalation():
    hours_threshold = request.json.get('hours_threshold', 48)
    escalated_count = _run_escalation_job(hours_threshold)
    
    return success({'escalated_count': escalated_count}, f'Escalated {escalated_count} tasks')


def _run_escalation_job(hours_threshold: int = 48) -> int:
    threshold = datetime.now(timezone.utc) - timedelta(hours=hours_threshold)
    
    overdue_tasks = Task.query.filter(
        Task.status.in_(['PENDING', 'IN_PROGRESS']),
        Task.due_date < threshold
    ).all()
    
    escalated = 0
    chairman = User.query.filter_by(role='CHAIRMAN', is_active=True).first()
    for task in overdue_tasks:
        if task.status != 'ESCALATED':
            task.status = 'ESCALATED'

            if chairman:
                history = TaskHistory(
                    task_id=task.id,
                    new_status='ESCALATED',
                    updated_by=chairman.id,
                    comment=f'Auto-escalated after {hours_threshold} hours overdue'
                )
                db.session.add(history)
            
            notif = Notification(
                user_id=task.assigned_to,
                type='TASK_ESCALATED',
                message=f'Task "{task.title}" has been escalated due to overdue',
                task_id=task.id
            )
            db.session.add(notif)
            db.session.flush()
            
            emit_notification(task.assigned_to, notif.to_dict())
            escalated += 1
    
    db.session.commit()
    return escalated