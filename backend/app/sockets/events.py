import logging
from flask_socketio import join_room, disconnect
from flask_jwt_extended import decode_token
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from app.extensions import socketio, db
from app.models.user import User

logger = logging.getLogger(__name__)


@socketio.on('connect')
def handle_connect(auth):
    """Authenticate socket connection via JWT token in auth object."""
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get('token')

    if not token:
        logger.info('[socket] rejected connection: no token supplied')
        disconnect()
        return False

    try:
        # Remove 'Bearer ' prefix if present
        if token.startswith('Bearer '):
            token = token[7:]

        decoded = decode_token(token)
        user_id = int(decoded.get('sub'))

        if not user_id:
            disconnect()
            return False

        user = db.session.get(User, user_id)
        if not user or not user.is_active:
            disconnect()
            return False

        # Join personal room
        join_room(f'user_{user_id}')

        # Join department room if applicable
        if user.department_id:
            join_room(f'dept_{user.department_id}')

    except ExpiredSignatureError:
        # Expected every ~15 min; the client reconnects after its REST call
        # refreshes the access token.
        logger.info('[socket] rejected connection: access token expired')
        disconnect()
        return False
    except (InvalidTokenError, Exception) as exc:
        logger.info('[socket] rejected connection: %s', type(exc).__name__)
        disconnect()
        return False


@socketio.on('disconnect')
def handle_disconnect():
    pass