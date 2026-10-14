from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from limiter import limiter
from models import db, User
from utils import premium

premium_bp = Blueprint('premium_bp', __name__)


@premium_bp.post('/api/webhooks/revenuecat')
def revenuecat_webhook():
    """RevenueCat's server-to-server events. Public, authenticated by the shared
    secret in the Authorization header. Answers 200 to any valid caller:
    RevenueCat retries anything else, and an event we ignore is not an error."""
    if not premium.webhook_secret_ok(request.headers.get('Authorization')):
        return jsonify({'message': 'Unauthorized'}), 401
    body = request.get_json(silent=True)
    event = body.get('event') if isinstance(body, dict) else None
    if not isinstance(event, dict):
        return jsonify({'message': 'ok'}), 200
    try:
        if premium.apply_event(event):
            db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception('RevenueCat webhook event failed')
        return jsonify({'message': 'error'}), 500
    return jsonify({'message': 'ok'}), 200


@premium_bp.post('/api/premium/sync')
@jwt_required()
@limiter.limit('30 per hour', key_func=lambda: f"premium_sync:{get_jwt_identity()}")
def sync_premium():
    """Asks RevenueCat whether this account is premium and records the answer.
    The app calls it after sign-in, a purchase or a restore, so a promotional
    grant (beta testers) counts without waiting on a webhook."""
    user = db.session.get(User, int(get_jwt_identity()))
    active = premium.fetch_entitlement_active(user.id)
    if active is None:
        return jsonify({'message': 'Could not verify premium', 'is_premium': bool(user.is_premium)}), 503
    if user.is_premium != active:
        user.is_premium = active
        db.session.commit()
    return jsonify({'message': 'ok', 'is_premium': active, 'enforced': premium.enforced()}), 200
