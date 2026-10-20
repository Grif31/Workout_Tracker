"""User lookup in the admin (/admin/users): search, the account summary, the
RevenueCat re-sync and force sign-out, and what the page must never show."""
import base64
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from models import (db, AdminAuditLog, AiCallLog, BodyMeasurement, User, Workout)
from utils import admin_users


def _auth():
    return {'Authorization': 'Basic ' + base64.b64encode(b'admin:pw').decode()}


def _write():
    return {**_auth(), 'Origin': 'http://localhost'}


@pytest.fixture
def admin_pw(monkeypatch):
    monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
    monkeypatch.setenv('REVENUECAT_SECRET_KEY', 'sk')


def _user(username, email, **kw):
    u = User(username=username, email=email, password='x', **kw)
    db.session.add(u)
    db.session.commit()
    return u


class TestSearch:

    def test_by_email_username_or_id(self, app):
        a = _user('griffin', 'grif@example.com')
        b = _user('sam_lifts', 'sam@other.com')
        assert [u.id for u in admin_users.search('GRIF')] == [a.id]
        assert [u.id for u in admin_users.search('other.com')] == [b.id]
        assert [u.id for u in admin_users.search(f'#{b.id}')] == [b.id]
        assert admin_users.search('   ') == []

    def test_like_wildcards_in_the_query_are_just_characters(self, app):
        _user('a', 'a@x.com')
        _user('b', 'b@x.com')
        pct = _user('100pct', '100%club@x.com')
        assert [u.id for u in admin_users.search('%')] == [pct.id]
        assert admin_users.search('_') == []

    def test_page(self, client, admin_pw):
        u = _user('griffin', 'grif@example.com', is_premium=True)
        html = client.get('/admin/users?q=grif', headers=_auth()).get_data(as_text=True)
        assert f'/admin/users/{u.id}' in html and 'Premium' in html
        html = client.get('/admin/users?q=nobody', headers=_auth()).get_data(as_text=True)
        assert 'No user matches' in html


class TestDetail:

    def test_summary_counts_activity(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        for d in (1, 3):
            db.session.add(Workout(user_id=uid, name='W', date=datetime.now() - timedelta(days=d)))
        db.session.add(AiCallLog(endpoint='insights', user_id=uid, model='m', latency_ms=1, ok=True))
        db.session.commit()
        s = admin_users.summary(db.session.get(User, uid))
        assert (s['workouts'], s['ai_calls_month'], s['sign_in']) == (2, 1, 'Password')
        html = client.get(f'/admin/users/{uid}', headers=_auth()).get_data(as_text=True)
        assert 'testuser' in html and 'test@example.com' in html

    def test_never_shows_body_measurements(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        db.session.get(User, uid).bodyweight = 187.5
        db.session.add(BodyMeasurement(user_id=uid, date=datetime.now().date(), waist=33.25))
        db.session.commit()
        html = client.get(f'/admin/users/{uid}', headers=_auth()).get_data(as_text=True)
        assert '187.5' not in html and '33.25' not in html

    def test_missing_user(self, client, admin_pw):
        assert client.get('/admin/users/99999', headers=_auth()).status_code == 404


class TestResync:

    def test_sets_revenuecats_answer_and_audits(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        with patch('utils.premium.fetch_entitlement_active', return_value=True):
            data = client.post(f'/admin/users/{uid}/resync', json={}, headers=_write()).get_json()
        assert (data['is_premium'], data['changed']) == (True, True)
        assert db.session.get(User, uid).is_premium is True
        row = AdminAuditLog.query.one()
        assert (row.action, row.target_id, row.after) == ('user.premium.resync', uid, {'is_premium': True})

    def test_already_matching_writes_nothing(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        with patch('utils.premium.fetch_entitlement_active', return_value=False):
            data = client.post(f'/admin/users/{uid}/resync', json={}, headers=_write()).get_json()
        assert data['changed'] is False
        assert AdminAuditLog.query.count() == 0

    def test_no_answer_changes_nothing(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        db.session.get(User, uid).is_premium = True
        db.session.commit()
        with patch('utils.premium.fetch_entitlement_active', return_value=None):
            res = client.post(f'/admin/users/{uid}/resync', json={}, headers=_write())
        assert res.status_code == 502
        assert db.session.get(User, uid).is_premium is True

    def test_needs_the_secret_key(self, client, admin_pw, monkeypatch, registered_user):
        monkeypatch.delenv('REVENUECAT_SECRET_KEY')
        res = client.post(f'/admin/users/{registered_user["user"]["id"]}/resync', json={}, headers=_write())
        assert res.status_code == 503


class TestForceSignOut:

    def test_old_tokens_stop_working(self, client, admin_pw, registered_user, auth_token):
        uid = registered_user['user']['id']
        bearer = {'Authorization': f'Bearer {auth_token}'}
        assert client.get('/api/me', headers=bearer).status_code == 200
        res = client.post(f'/admin/users/{uid}/sign-out', json={}, headers=_write())
        assert res.status_code == 200
        assert client.get('/api/me', headers=bearer).status_code == 401
        row = AdminAuditLog.query.one()
        assert row.action == 'user.sign_out' and row.after['token_version'] == row.before['token_version'] + 1

    def test_they_can_sign_in_again(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        client.post(f'/admin/users/{uid}/sign-out', json={}, headers=_write())
        res = client.post('/api/login', json={'email': 'test@example.com', 'password': 'password123'})
        assert res.status_code == 200
        token = res.get_json()['access_token']
        assert client.get('/api/me', headers={'Authorization': f'Bearer {token}'}).status_code == 200

    def test_needs_the_write_guard(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        assert client.post(f'/admin/users/{uid}/sign-out', json={}, headers=_auth()).status_code == 403
        assert db.session.get(User, uid).token_version == 0

    def test_missing_user(self, client, admin_pw):
        assert client.post('/admin/users/99999/sign-out', json={}, headers=_write()).status_code == 404
