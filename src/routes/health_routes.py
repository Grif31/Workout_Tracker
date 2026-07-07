from flask import Blueprint, jsonify
from models import db

health_bp = Blueprint('health', __name__)


# Public liveness probe for uptime monitors and the ops agent — no auth by design.
@health_bp.get('/health')
def health():
    try:
        db.session.execute(db.text('SELECT 1'))
        return jsonify({'status': 'ok', 'db': 'ok'}), 200
    except Exception:
        return jsonify({'status': 'degraded', 'db': 'unreachable'}), 503
