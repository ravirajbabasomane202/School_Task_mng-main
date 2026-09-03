import os

from app import create_app
from app.extensions import socketio

app = create_app()


if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 5000))
    debug = app.config.get('DEBUG', False)
    is_windows = os.name == 'nt'

    print(f'Backend running at http://{host}:{port}')

    socketio.run(
        app,
        host=host,
        port=port,
        debug=debug,
        use_reloader=not is_windows,
        allow_unsafe_werkzeug=is_windows
    )
