import os
import re
from flask import Flask, request, send_from_directory, jsonify
from config import config
from app.extensions import db, migrate, jwt, socketio, bcrypt, scheduler


DEVTUNNEL_FRONTEND_ORIGIN = re.compile(
    r'^https://[a-z0-9-]+-5173\.[a-z0-9-]+\.devtunnels\.ms$',
    re.IGNORECASE,
)


def _parse_frontend_origins(value):
    if not value:
        return []
    return [origin.strip().rstrip('/') for origin in str(value).split(',') if origin.strip()]


def _get_allowed_frontend_origins(app):
    configured_origins = _parse_frontend_origins(app.config.get('FRONTEND_URLS'))
    allowed_origins = list(dict.fromkeys(configured_origins))
    allowed_patterns = []

    if app.debug:
        for origin in ('http://localhost:5173', 'http://127.0.0.1:5173'):
            if origin not in allowed_origins:
                allowed_origins.append(origin)
        allowed_patterns.append(DEVTUNNEL_FRONTEND_ORIGIN)

    return allowed_origins, allowed_patterns


def _resolve_allowed_origin(origin, allowed_origins, allowed_patterns):
    if not origin:
        return None

    normalized_origin = origin.rstrip('/')
    if normalized_origin in allowed_origins:
        return normalized_origin

    if any(pattern.fullmatch(normalized_origin) for pattern in allowed_patterns):
        return normalized_origin

    return None


def _append_vary_header(response, value):
    existing = response.headers.get('Vary')
    if not existing:
        response.headers['Vary'] = value
        return

    vary_values = [item.strip() for item in existing.split(',') if item.strip()]
    if value not in vary_values:
        vary_values.append(value)
        response.headers['Vary'] = ', '.join(vary_values)


def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    app = Flask(__name__)
    app.config.from_object(config.get(config_name, config['default']))

    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'tasks'), exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'reports'), exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'resumes'), exist_ok=True)

    # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    def _jwt_error_response(message, status=401):
        return jsonify({'success': False, 'message': message, 'data': None}), status

    @jwt.unauthorized_loader
    def unauthorized_loader(reason):
        return _jwt_error_response(reason or 'Authorization token is required')

    @jwt.invalid_token_loader
    def invalid_token_loader(reason):
        return _jwt_error_response(reason or 'Invalid or malformed token')

    @jwt.expired_token_loader
    def expired_token_loader(jwt_header, jwt_payload):
        return _jwt_error_response('Token has expired')

    @jwt.revoked_token_loader
    def revoked_token_loader(jwt_header, jwt_payload):
        return _jwt_error_response('Token has been revoked')

    bcrypt.init_app(app)
    async_mode = os.environ.get('SOCKETIO_ASYNC_MODE', 'threading')
    allowed_frontend_origins, allowed_origin_patterns = _get_allowed_frontend_origins(app)

    @app.after_request
    def add_cors_headers(response):
        if not request.path.startswith('/api/'):
            return response

        allowed_origin = _resolve_allowed_origin(
            request.headers.get('Origin'),
            allowed_frontend_origins,
            allowed_origin_patterns,
        )
        if not allowed_origin:
            return response

        response.headers['Access-Control-Allow-Origin'] = allowed_origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        _append_vary_header(response, 'Origin')

        if request.method == 'OPTIONS':
            requested_headers = request.headers.get('Access-Control-Request-Headers')
            response.headers['Access-Control-Allow-Headers'] = (
                requested_headers if requested_headers else 'Authorization, Content-Type'
            )
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
            response.headers['Access-Control-Max-Age'] = '600'

        return response

    socketio_options = {
        'cors_allowed_origins': '*' if app.debug else allowed_frontend_origins,
        'async_mode': async_mode
    }

    if async_mode == 'eventlet':
        socketio_options['transports'] = ['websocket']

    socketio.init_app(app, **socketio_options)

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.users import users_bp
    from app.routes.departments import departments_bp
    from app.routes.roles import roles_bp
    from app.routes.tasks import tasks_bp
    from app.routes.notifications import notifications_bp
    from app.routes.approvals import approvals_bp
    from app.routes.announcements import announcements_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.reports import reports_bp
    from app.routes.meetings import meetings_bp
    from app.routes.housekeeping import housekeeping_bp
    from app.routes.leave import leave_bp
    from app.routes.salary import salary_bp
    from app.routes.recruitment import recruitment_bp
    from app.routes.assets import assets_bp
    from app.routes.purchase_orders import po_bp
    from app.routes.escalations import escalations_bp
    from app.routes.registers import registers_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(departments_bp, url_prefix='/api/departments')
    app.register_blueprint(roles_bp, url_prefix='/api/roles')
    app.register_blueprint(tasks_bp, url_prefix='/api/tasks')
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
    app.register_blueprint(approvals_bp, url_prefix='/api/approvals')
    app.register_blueprint(announcements_bp, url_prefix='/api/announcements')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(reports_bp, url_prefix='/api/reports')
    app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
    app.register_blueprint(housekeeping_bp, url_prefix='/api/housekeeping')
    app.register_blueprint(leave_bp, url_prefix='/api/leave')
    app.register_blueprint(salary_bp, url_prefix='/api/salary-increments')
    app.register_blueprint(recruitment_bp, url_prefix='/api/recruitment')
    app.register_blueprint(assets_bp, url_prefix='/api/assets')
    app.register_blueprint(po_bp, url_prefix='/api/purchase-orders')
    app.register_blueprint(escalations_bp, url_prefix='/api/escalations')
    app.register_blueprint(registers_bp, url_prefix='/api/registers')

    # ── APScheduler: auto-escalation every hour ──────────────────────────────
    # Guard against multiple gunicorn workers each starting their own scheduler.
    # We check WORKER_ID (set in gunicorn config) or fall back to checking
    # whether we are the first/only process via a simple env sentinel.
    # Set SCHEDULER_WORKER_ID=1 in your gunicorn preload config so only one
    # worker starts the scheduler; leave unset in dev (single process).
    worker_id = os.environ.get('SCHEDULER_WORKER_ID')
    current_worker = os.environ.get('WORKER_ID', '1')
    is_scheduler_worker = (worker_id is None) or (current_worker == worker_id)

    # Disable scheduler in testing mode or when env var says no
    enable_scheduler = (
        not app.config.get('TESTING', False)
        and os.environ.get('ENABLE_SCHEDULER', 'true').lower() == 'true'
    )
    if enable_scheduler and is_scheduler_worker and not scheduler.running:
        from app.tasks.escalation import run_escalation_job
        hours_threshold = int(os.environ.get('ESCALATION_HOURS', 48))

        def _scheduled_escalation():
            with app.app_context():
                count = run_escalation_job(hours_threshold)
                if count:
                    app.logger.info(f'[Scheduler] Auto-escalated {count} task(s).')

        scheduler.add_job(
            _scheduled_escalation,
            trigger='interval',
            hours=1,
            id='auto_escalation',
            replace_existing=True,
        )
        scheduler.start()
        app.logger.info('[Scheduler] APScheduler started – escalation job runs every hour.')

    # Static file serving for uploads
    @app.route('/uploads/<path:filename>')
    def serve_upload(filename):
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    # Register SocketIO events
    from app.sockets import events  # noqa: F401

    # Register CLI commands
    from app.commands import register_commands
    register_commands(app)

    return app
