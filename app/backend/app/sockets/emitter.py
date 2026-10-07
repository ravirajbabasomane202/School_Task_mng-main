from app.extensions import socketio


def emit_notification(user_id, notification_data):
    """Emit a notification to a specific user's room."""
    socketio.emit('notification:new', notification_data, room=f'user_{user_id}')


def emit_task_updated(task_data):
    """Broadcast task update to all connected clients."""
    socketio.emit('task:updated', task_data)


def emit_announcement(announcement_data, target='ALL', dept_id=None):
    """Emit announcement to relevant rooms."""
    if target == 'ALL':
        socketio.emit('announcement:new', announcement_data)
    elif target == 'DEPARTMENT' and dept_id:
        socketio.emit('announcement:new', announcement_data, room=f'dept_{dept_id}')
