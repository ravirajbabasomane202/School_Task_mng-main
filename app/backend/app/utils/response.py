from flask import jsonify


def success(data=None, message='OK', status=200):
    return jsonify({'success': True, 'message': message, 'data': data}), status


def error(message='An error occurred', status=400):
    return jsonify({'success': False, 'message': message, 'data': None}), status
