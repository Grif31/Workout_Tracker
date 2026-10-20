"""Premium entitlement on the server.

The app has always gated Premium on the client. This is the server half: a
RevenueCat webhook and a verify-on-demand sync keep `User.is_premium`, and the
AI routes (the ones that cost money per call) refuse free accounts.

PREMIUM_ENFORCED switches the refusals on. It stays off until the webhook secret
and REVENUECAT_SECRET_KEY are set on the host and a sync has been seen to work:
with it off every account counts as premium, which is how the API behaved
before this existed.
"""
import hmac
import os
import time
from datetime import datetime, timezone

from flask import jsonify

from models import db, User, Routine

ENTITLEMENT = 'premium'
RC_SUBSCRIBERS_URL = 'https://api.revenuecat.com/v1/subscribers'

# Events that (re)start an entitlement; whether it is still live is decided by expiration_at_ms
_GRANTING = {
    'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE', 'TEST',
}


def enforced() -> bool:
    return os.environ.get('PREMIUM_ENFORCED', '').lower() == 'true'


def has_premium(user) -> bool:
    """True for a premium account, and for everyone while enforcement is off."""
    if not enforced():
        return True
    return bool(user is not None and user.is_premium)


def premium_required_response():
    return jsonify({'message': 'Premium required', 'premium_required': True}), 402


def free_onboarding_allowed(user_id) -> bool:
    """A free account gets the program onboarding builds for it, once: it may
    generate and save a starter routine until it has saved one. starter_granted
    stays set after that routine is deleted, so deleting it doesn't renew this."""
    user = db.session.get(User, user_id)
    if user is None or user.starter_granted:
        return False
    has_starter = db.session.query(Routine.query.filter_by(user_id=user_id, starter=True).exists()).scalar()
    return not has_starter


def webhook_secret_ok(header_value) -> bool:
    """RevenueCat sends the Authorization value configured in its dashboard
    verbatim; accept it raw or with a Bearer prefix."""
    secret = os.environ.get('REVENUECAT_WEBHOOK_SECRET')
    if not secret or not header_value:
        return False
    return hmac.compare_digest(header_value, secret) or hmac.compare_digest(header_value, f'Bearer {secret}')


def _user_for(app_user_id):
    """Our user for a RevenueCat app user id; anonymous ids ($RCAnonymousID:...) have none."""
    if not isinstance(app_user_id, str) or not app_user_id.isdigit():
        return None
    return db.session.get(User, int(app_user_id))


def apply_event(event: dict, now_ms=None) -> bool:
    """Updates is_premium from one webhook event. Returns whether the event was
    recognised; ones about other entitlements, anonymous users or event types
    that don't change access are ignored."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    entitlements = event.get('entitlement_ids') or []
    if entitlements and ENTITLEMENT not in entitlements:
        return False
    kind = event.get('type')
    expires = event.get('expiration_at_ms')
    live = expires is None or expires > now_ms

    if kind == 'TRANSFER':
        recognised = False
        for ids, value in ((event.get('transferred_from') or [], False), (event.get('transferred_to') or [], True)):
            for app_user_id in ids:
                user = _user_for(app_user_id)
                if user is not None:
                    user.is_premium = value and live
                    recognised = True
        return recognised

    user = _user_for(event.get('app_user_id'))
    if user is None:
        return False
    if kind == 'EXPIRATION':
        user.is_premium = False
    elif kind == 'CANCELLATION':
        # Turning off auto-renew keeps the entitlement to the period's end; a
        # refund arrives with an expiration already in the past
        user.is_premium = live
    elif kind in _GRANTING:
        user.is_premium = live
    else:
        return False
    return True


def fetch_entitlement_active(user_id):
    """Asks RevenueCat directly whether the user holds a live `premium`
    entitlement. None when it can't say (no key, or the call failed), so a
    caller never revokes on a guess."""
    import requests
    secret = os.environ.get('REVENUECAT_SECRET_KEY')
    if not secret:
        return None
    try:
        res = requests.get(
            f'{RC_SUBSCRIBERS_URL}/{user_id}',
            headers={'Authorization': f'Bearer {secret}', 'Content-Type': 'application/json'},
            timeout=10,
        )
    except requests.RequestException:
        return None
    if res.status_code == 404:
        return False
    if not res.ok:
        return None
    ent = (res.json().get('subscriber', {}).get('entitlements', {}) or {}).get(ENTITLEMENT)
    if not ent:
        return False
    expires = ent.get('expires_date')
    if expires is None:
        return True
    # Parsed, not compared as strings: a date with milliseconds sorts wrong
    # against one without, and an unreadable date must not revoke anyone
    try:
        return datetime.fromisoformat(expires) > datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return None
