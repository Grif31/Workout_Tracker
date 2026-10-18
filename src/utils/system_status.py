"""What the admin's System page and dashboard report about the running
server: the database, migrations, the deploy, env vars (names only, never
values) and the premium turn-on checklist."""
import os
import time
from datetime import datetime, timedelta

from alembic.config import Config
from alembic.script import ScriptDirectory
from flask import current_app

from models import db, AdminState, User
from utils import premium

# What each env var is for, grouped by what breaks without it. Names only:
# the page never reads a value except PREMIUM_ENFORCED's on/off.
ENV_VARS = {
    'required': [
        ('DATABASE_URL', 'Postgres connection; Railway injects it'),
        ('JWT_SECRET_KEY', 'Signs every sign-in token'),
        ('APPLE_BUNDLE_ID', 'Apple Sign-In audience (prod and dev bundle ids)'),
        ('GOOGLE_CLIENT_IDS', 'Google Sign-In audiences'),
        ('RESEND_API_KEY', 'Password-reset emails'),
        ('ANTHROPIC_API_KEY', 'Coach insights, weekly review and program generation'),
        ('ADMIN_PASSWORD', 'This console'),
    ],
    'premium': [
        ('REVENUECAT_WEBHOOK_SECRET', 'Authenticates RevenueCat webhook calls'),
        ('REVENUECAT_SECRET_KEY', 'Lets the server ask RevenueCat who is premium'),
        ('PREMIUM_ENFORCED', 'Turns the premium refusals on'),
    ],
    'optional': [
        ('RAPIDAPI_KEY', 'ExerciseDB GIFs on the exercise page'),
        ('RESEND_FROM', 'Sender address for emails (has a default)'),
        ('CORS_ORIGINS', 'Allowed browser origins (defaults to any)'),
        ('RATELIMIT_STORAGE_URI', 'Shared rate-limit store (defaults to in-process memory)'),
        ('MAIL_SERVER', 'SMTP host (has a default)'),
        ('MAIL_USERNAME', 'SMTP user'),
        ('MAIL_PASSWORD', 'SMTP password'),
    ],
}

SYNC_CHECK_KEY = 'revenuecat_sync_check'
SYNC_CHECK_FRESH = timedelta(days=7)


def env_status():
    return {group: [{'name': name, 'purpose': purpose, 'set': bool(os.environ.get(name))}
                    for name, purpose in names]
            for group, names in ENV_VARS.items()}


def missing_required():
    return [name for name, _ in ENV_VARS['required'] if not os.environ.get(name)]


def db_ping():
    start = time.monotonic()
    try:
        db.session.execute(db.text('SELECT 1'))
        return {'ok': True, 'ms': round((time.monotonic() - start) * 1000)}
    except Exception as exc:
        db.session.rollback()
        return {'ok': False, 'error': type(exc).__name__}


def migration_state():
    """The revision the database is on against the head of
    migrations/versions. 'unknown' when there's no alembic_version table to
    read (the test suite builds its tables with create_all), so nothing
    alerts on a database that was never migrated by alembic."""
    cfg = Config()
    cfg.set_main_option('script_location', os.path.join(current_app.root_path, 'migrations'))
    heads = sorted(ScriptDirectory.from_config(cfg).get_heads())
    try:
        current = sorted(r for (r,) in db.session.execute(db.text('SELECT version_num FROM alembic_version')))
    except Exception:
        db.session.rollback()
        return {'state': 'unknown', 'current': [], 'heads': heads}
    return {'state': 'ok' if current == heads else 'behind', 'current': current, 'heads': heads}


def deploy_info():
    sha = os.environ.get('RAILWAY_GIT_COMMIT_SHA', '')
    return {
        'sha': sha[:7] or None,
        'message': (os.environ.get('RAILWAY_GIT_COMMIT_MESSAGE') or '').split('\n')[0] or None,
        'branch': os.environ.get('RAILWAY_GIT_BRANCH') or None,
    }


def last_sync_check():
    """The last "Test sync" result the admin ran, as (ok, when, detail)."""
    row = db.session.get(AdminState, SYNC_CHECK_KEY)
    if not row or not row.value:
        return None
    ok, _, detail = row.value.partition('|')
    return {'ok': ok == 'ok', 'at': row.updated_at, 'detail': detail}


def record_sync_check(ok, detail):
    row = db.session.get(AdminState, SYNC_CHECK_KEY) or AdminState(key=SYNC_CHECK_KEY)
    row.value = f"{'ok' if ok else 'failed'}|{detail}"[:255]
    row.updated_at = datetime.now()
    db.session.add(row)
    db.session.commit()


def premium_checklist(now=None):
    """The turn-on steps from CLAUDE.md (Server-side premium), each with
    whether it's done. `ready` is every step but the last: the point at which
    PREMIUM_ENFORCED can be flipped."""
    now = now or datetime.now()
    sync = last_sync_check()
    sync_fresh = bool(sync and sync['ok'] and now - sync['at'] <= SYNC_CHECK_FRESH)
    premium_users = User.query.filter_by(is_premium=True).count()
    steps = [
        {'key': 'webhook', 'done': bool(os.environ.get('REVENUECAT_WEBHOOK_SECRET')),
         'text': 'REVENUECAT_WEBHOOK_SECRET set on Railway'},
        {'key': 'secret', 'done': bool(os.environ.get('REVENUECAT_SECRET_KEY')),
         'text': 'REVENUECAT_SECRET_KEY set on Railway'},
        {'key': 'beta', 'done': premium_users > 0,
         'text': f'Beta testers granted premium (flask grant-beta-premium --apply): {premium_users} premium now'},
        {'key': 'sync', 'done': sync_fresh,
         'text': 'RevenueCat answers a sync for a real account (Test sync below, within the last 7 days)'},
    ]
    ready = all(s['done'] for s in steps)
    steps.append({'key': 'enforce', 'done': premium.enforced(), 'text': 'PREMIUM_ENFORCED=true on Railway'})
    return {'steps': steps, 'ready': ready, 'enforced': premium.enforced(), 'sync': sync}
