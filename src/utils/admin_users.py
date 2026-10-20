"""User lookup for the admin: search, a support summary of one account, and
the two actions support needs. Deliberately leaves out progress photos,
body measurements and anything else a user wrote about their body: the
summary counts activity, it doesn't read it."""
from datetime import datetime

from sqlalchemy import func, or_

from models import (db, AiCallLog, DeviceToken, InsightFeedback, PersonalRecord, Routine, User, Workout,
                    WorkoutTemplate)
from utils import premium
from utils.admin_audit import audit

SEARCH_LIMIT = 50


def search(q):
    """Users whose email or username contains `q`, or whose id is `q`."""
    q = (q or '').strip()
    if not q:
        return []
    # autoescape: a '%' or '_' typed in the box is a character, not a wildcard
    conds = [func.lower(User.email).contains(q.lower(), autoescape=True),
             func.lower(User.username).contains(q.lower(), autoescape=True)]
    if q.lstrip('#').isdigit():
        conds.append(User.id == int(q.lstrip('#')))
    return User.query.filter(or_(*conds)).order_by(User.id).limit(SEARCH_LIMIT).all()


def summary(user, now=None):
    now = now or datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = lambda model: db.session.query(func.count(model.id)).filter(model.user_id == user.id).scalar()
    last_workout = db.session.query(func.max(Workout.date)).filter(Workout.user_id == user.id).scalar()
    return {
        'sign_in': 'Apple or Google only' if user.is_social_only else 'Password',
        'workouts': count(Workout),
        'last_workout': last_workout,
        'routines': count(Routine),
        'templates': count(WorkoutTemplate),
        'prs': count(PersonalRecord),
        'devices': count(DeviceToken),
        'insight_votes': count(InsightFeedback),
        'ai_calls_month': db.session.query(func.count(AiCallLog.id)).filter(
            AiCallLog.user_id == user.id, AiCallLog.created_at >= month_start).scalar(),
    }


def resync_premium(user):
    """Sets is_premium to RevenueCat's answer, the same as POST
    /api/premium/sync. Returns (active, changed); active is None when
    RevenueCat didn't answer, and then nothing changes."""
    active = premium.fetch_entitlement_active(user.id)
    if active is None or active == bool(user.is_premium):
        return active, False
    audit('user.premium.resync', 'user', user.id, {'is_premium': bool(user.is_premium)}, {'is_premium': active})
    user.is_premium = active
    return active, True


def force_sign_out(user):
    """Bumps token_version: every token issued before stops working on its
    next request (token_in_blocklist_loader in app.py)."""
    before = user.token_version or 0
    user.token_version = before + 1
    audit('user.sign_out', 'user', user.id, {'token_version': before}, {'token_version': user.token_version})
