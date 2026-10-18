"""The admin's System page (/admin/system), its read-only RevenueCat test sync,
and the dashboard alerts that read the same status."""
import base64
import os
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from models import db, AdminAuditLog, AdminState, User
from utils import admin_dashboard, system_status


def _auth():
    return {'Authorization': 'Basic ' + base64.b64encode(b'admin:pw').decode()}


def _write():
    return {**_auth(), 'Origin': 'http://localhost'}


@pytest.fixture
def admin_pw(monkeypatch):
    monkeypatch.setenv('ADMIN_PASSWORD', 'pw')


@pytest.fixture
def all_env(monkeypatch):
    for group in system_status.ENV_VARS.values():
        for name, _ in group:
            monkeypatch.setenv(name, 'secret-value-' + name)
    monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
    monkeypatch.setenv('PREMIUM_ENFORCED', 'false')


class TestSystemPage:

    def test_renders_on_a_fresh_database(self, client, admin_pw):
        res = client.get('/admin/system', headers=_auth())
        assert res.status_code == 200
        html = res.get_data(as_text=True)
        assert 'No alembic_version table' in html  # the suite builds tables with create_all
        assert 'Every account counts as premium' in html

    def test_shows_names_but_never_values(self, client, all_env):
        html = client.get('/admin/system', headers=_auth()).get_data(as_text=True)
        assert 'REVENUECAT_SECRET_KEY' in html
        assert 'secret-value-' not in html

    def test_a_missing_required_var_is_flagged(self, client, admin_pw, monkeypatch):
        monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
        html = client.get('/admin/system', headers=_auth()).get_data(as_text=True)
        row = html[html.index('<code>ANTHROPIC_API_KEY</code>'):][:300]
        assert 'status bad' in row and 'Not set' in row

    def test_migration_behind_and_at_head(self, client, admin_pw):
        db.session.execute(db.text('CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)'))
        db.session.execute(db.text("INSERT INTO alembic_version VALUES ('old0000')"))
        db.session.commit()
        try:
            state = system_status.migration_state()
            assert state['state'] == 'behind' and state['current'] == ['old0000']
            html = client.get('/admin/system', headers=_auth()).get_data(as_text=True)
            assert 'Code expects' in html
            db.session.execute(db.text('UPDATE alembic_version SET version_num = :h'), {'h': state['heads'][0]})
            db.session.commit()
            assert system_status.migration_state()['state'] == 'ok'
        finally:
            db.session.execute(db.text('DROP TABLE alembic_version'))
            db.session.commit()

    def test_there_is_exactly_one_head(self, app):
        assert len(system_status.migration_state()['heads']) == 1

    def test_deploy_commit_from_railway(self, client, admin_pw, monkeypatch):
        monkeypatch.setenv('RAILWAY_GIT_COMMIT_SHA', 'abcdef1234567890')
        monkeypatch.setenv('RAILWAY_GIT_COMMIT_MESSAGE', 'Ship it\n\nbody')
        html = client.get('/admin/system', headers=_auth()).get_data(as_text=True)
        assert 'abcdef1' in html and 'Ship it' in html and 'body' not in html.split('Ship it')[1][:20]


def _rc(answers):
    """fetch_entitlement_active stand-in: answers by user id (missing = None, no answer)."""
    return lambda user_id: answers.get(user_id)


def _users(n, premium_ids=()):
    ids = []
    for i in range(n):
        u = User(email=f'r{i}@x.com', username=f'r{i}', password='x')
        db.session.add(u)
        db.session.flush()
        u.is_premium = i in premium_ids
        ids.append(u.id)
    db.session.commit()
    return ids


class TestChecklist:

    def test_nothing_done(self, app, monkeypatch):
        for name in ('REVENUECAT_WEBHOOK_SECRET', 'REVENUECAT_SECRET_KEY', 'PREMIUM_ENFORCED'):
            monkeypatch.delenv(name, raising=False)
        c = system_status.premium_checklist()
        assert [s['done'] for s in c['steps']] == [False] * 4
        assert c['ready'] is False

    def test_ready_once_keys_are_set_and_everyone_matches_revenuecat(self, app, all_env):
        _users(2)
        with patch('utils.premium.fetch_entitlement_active', side_effect=lambda uid: True):
            system_status.reconcile_batch(0)
        db.session.commit()
        c = system_status.premium_checklist()
        assert c['ready'] is True and c['enforced'] is False
        assert admin_dashboard.premium_ready_alert(c)['level'] == 'warn'

    def test_a_stale_run_or_an_unanswered_account_is_not_ready(self, app, all_env):
        ids = _users(2)
        with patch('utils.premium.fetch_entitlement_active', side_effect=_rc({ids[0]: True})):
            system_status.reconcile_batch(0)
        db.session.commit()
        assert system_status.premium_checklist()['ready'] is False  # ids[1] unanswered
        with patch('utils.premium.fetch_entitlement_active', side_effect=lambda uid: False):
            system_status.reconcile_batch(0)
        db.session.commit()
        assert system_status.premium_checklist()['ready'] is True
        assert system_status.premium_checklist(now=datetime.now() + timedelta(days=8))['ready'] is False

    def test_no_alert_once_enforced(self, app, all_env, monkeypatch):
        monkeypatch.setenv('PREMIUM_ENFORCED', 'true')
        _users(1)
        with patch('utils.premium.fetch_entitlement_active', side_effect=lambda uid: True):
            system_status.reconcile_batch(0)
        db.session.commit()
        c = system_status.premium_checklist()
        assert c['steps'][-1]['done'] is True
        assert admin_dashboard.premium_ready_alert(c) is None


class TestSyncEveryone:

    def test_sets_stored_premium_to_revenuecats_answer(self, client, all_env):
        ids = _users(4, premium_ids={3})
        answers = {ids[0]: True, ids[1]: True, ids[2]: False, ids[3]: False}
        with patch('utils.premium.fetch_entitlement_active', side_effect=_rc(answers)):
            res = client.post('/admin/system/sync-all', json={'after_id': 0}, headers=_write())
        data = res.get_json()
        assert res.status_code == 200 and data['done'] is True
        assert data['totals'] == {'checked': 4, 'granted': 2, 'revoked': 1, 'unchanged': 1, 'unknown': 0}
        assert [db.session.get(User, i).is_premium for i in ids] == [True, True, False, False]
        row = AdminAuditLog.query.one()
        assert row.action == 'premium.revenuecat_sync'
        assert {c['user_id'] for c in row.after} == {ids[0], ids[1], ids[3]}

    def test_no_answer_never_revokes(self, client, all_env):
        ids = _users(1, premium_ids={0})
        with patch('utils.premium.fetch_entitlement_active', return_value=None):
            data = client.post('/admin/system/sync-all', json={'after_id': 0}, headers=_write()).get_json()
        assert data['totals']['unknown'] == 1
        assert db.session.get(User, ids[0]).is_premium is True
        assert system_status.last_reconcile()['ok'] is False
        assert AdminAuditLog.query.count() == 0

    def test_runs_in_batches_and_totals_the_run(self, client, all_env, monkeypatch):
        monkeypatch.setattr(system_status, 'RECONCILE_BATCH', 2)
        _users(5)
        after, batches = 0, 0
        with patch('utils.premium.fetch_entitlement_active', return_value=True):
            while True:
                data = client.post('/admin/system/sync-all', json={'after_id': after}, headers=_write()).get_json()
                batches += 1
                if data['done']:
                    break
                after = data['next_after_id']
        assert batches == 3
        assert data['totals']['checked'] == 5 and data['totals']['granted'] == 5
        assert system_status.last_reconcile()['ok'] is True

    def test_a_new_run_starts_its_totals_over(self, client, all_env):
        _users(2)
        with patch('utils.premium.fetch_entitlement_active', return_value=True):
            client.post('/admin/system/sync-all', json={'after_id': 0}, headers=_write())
            data = client.post('/admin/system/sync-all', json={'after_id': 0}, headers=_write()).get_json()
        assert data['totals'] == {'checked': 2, 'granted': 0, 'revoked': 0, 'unchanged': 2, 'unknown': 0}

    def test_needs_the_secret_key(self, client, admin_pw, monkeypatch):
        monkeypatch.delenv('REVENUECAT_SECRET_KEY', raising=False)
        assert client.post('/admin/system/sync-all', json={}, headers=_write()).status_code == 503

    @pytest.mark.parametrize('body', [{'after_id': -1}, {'after_id': 'x'}, {'after_id': True}])
    def test_bad_after_id(self, client, all_env, body):
        assert client.post('/admin/system/sync-all', json=body, headers=_write()).status_code == 400

    def test_needs_the_write_guard(self, client, all_env):
        assert client.post('/admin/system/sync-all', json={}, headers=_auth()).status_code == 403


class TestSyncCheck:

    def test_asks_revenuecat_without_changing_the_user(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        with patch('utils.premium.fetch_entitlement_active', return_value=True) as fetch:
            res = client.post('/admin/system/test-sync', json={'user_id': uid}, headers=_write())
        fetch.assert_called_once_with(uid)
        data = res.get_json()
        assert res.status_code == 200
        assert (data['active'], data['stored']) == (True, False)
        assert db.session.get(User, uid).is_premium is False
        assert system_status.last_sync_check()['ok'] is True
        assert AdminAuditLog.query.count() == 0  # nothing about the user was written

    def test_no_answer_is_recorded_as_failed(self, client, admin_pw, registered_user):
        with patch('utils.premium.fetch_entitlement_active', return_value=None):
            res = client.post('/admin/system/test-sync', json={'user_id': registered_user['user']['id']},
                              headers=_write())
        assert res.status_code == 502
        assert system_status.last_sync_check()['ok'] is False

    @pytest.mark.parametrize('body', [{}, {'user_id': 'x'}, {'user_id': 0}, {'user_id': True}])
    def test_bad_user_id(self, client, admin_pw, body):
        assert client.post('/admin/system/test-sync', json=body, headers=_write()).status_code == 400

    def test_unknown_user(self, client, admin_pw):
        assert client.post('/admin/system/test-sync', json={'user_id': 99999}, headers=_write()).status_code == 404

    def test_needs_the_write_guard(self, client, admin_pw, registered_user):
        res = client.post('/admin/system/test-sync', json={'user_id': registered_user['user']['id']},
                          headers=_auth())
        assert res.status_code == 403


class TestDashboardAlerts:

    def test_migration(self):
        assert admin_dashboard.migration_alert({'state': 'ok', 'current': ['a'], 'heads': ['a']}) is None
        assert admin_dashboard.migration_alert({'state': 'unknown', 'current': [], 'heads': ['a']}) is None
        alert = admin_dashboard.migration_alert({'state': 'behind', 'current': ['a'], 'heads': ['b']})
        assert alert['level'] == 'bad' and 'expects b' in alert['text']

    def test_env(self):
        assert admin_dashboard.env_alert([]) is None
        assert admin_dashboard.env_alert(['A', 'B'])['text'] == 'Required env vars not set: A, B'

    def test_dashboard_shows_a_missing_required_var(self, client, all_env, monkeypatch):
        monkeypatch.delenv('RESEND_API_KEY')
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert 'Required env var not set: RESEND_API_KEY' in html
