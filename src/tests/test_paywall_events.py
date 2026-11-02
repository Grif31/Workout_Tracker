"""POST /api/paywall/events, the paywall_events it writes, and the admin's
Paywall page that reads them."""
import base64
from datetime import date, datetime, timedelta

import pytest

from models import db, PaywallEvent
from utils import admin_stats


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def _basic_auth(password='pw'):
    return {'Authorization': 'Basic ' + base64.b64encode(f'admin:{password}'.encode()).decode()}


@pytest.fixture
def admin_pw(monkeypatch):
    monkeypatch.setenv('ADMIN_PASSWORD', 'pw')


def _event(user_id, event, source='ai_coach', plan=None, trial=None, outcome=None, when=None, id=None):
    row = PaywallEvent(user_id=user_id, event=event, source=source, plan=plan, trial=trial, outcome=outcome,
                       created_at=when or datetime.now())
    if id is not None:
        row.id = id
    return row


# ── POST /api/paywall/events ──────────────────────────────────

class TestPostEvent:

    def test_requires_auth(self, client):
        assert client.post('/api/paywall/events', json={'event': 'paywall_viewed'}).status_code == 401

    def test_records_a_purchase_with_its_plan_and_trial(self, client, auth_token, registered_user):
        res = client.post('/api/paywall/events', json={
            'event': 'purchase', 'source': 'templates', 'plan': 'annual', 'trial': True, 'outcome': 'purchased',
        }, headers=auth_headers(auth_token))
        assert res.status_code == 201
        row = PaywallEvent.query.one()
        assert (row.user_id, row.event, row.source, row.plan, row.trial, row.outcome) == (
            registered_user['user']['id'], 'purchase', 'templates', 'annual', True, 'purchased')

    def test_source_is_optional(self, client, auth_token):
        res = client.post('/api/paywall/events', json={'event': 'paywall_viewed'}, headers=auth_headers(auth_token))
        assert res.status_code == 201
        assert PaywallEvent.query.one().source is None

    @pytest.mark.parametrize('body', [
        {},
        {'event': 'clicked_everything'},
        {'event': 'paywall_viewed', 'source': 'Not A Source!'},
        {'event': 'paywall_viewed', 'source': 'x' * 33},
        {'event': 'plan_selected', 'plan': 'weekly'},
        {'event': 'purchase', 'plan': 'annual'},
        {'event': 'purchase', 'outcome': 'none'},
        {'event': 'restore', 'outcome': 'purchased'},
    ])
    def test_rejects_a_bad_body(self, client, auth_token, body):
        res = client.post('/api/paywall/events', json=body, headers=auth_headers(auth_token))
        assert res.status_code == 400
        assert PaywallEvent.query.count() == 0

    def test_an_outcome_only_rides_on_a_purchase_or_restore(self, client, auth_token):
        client.post('/api/paywall/events', json={'event': 'paywall_viewed', 'outcome': 'failed'},
                    headers=auth_headers(auth_token))
        assert PaywallEvent.query.one().outcome is None

    def test_a_deleted_users_events_are_kept(self):
        # The suite's SQLite runs without foreign keys, so check the declaration Postgres enforces
        fk = next(iter(PaywallEvent.__table__.c.user_id.foreign_keys))
        assert (fk.column.table.name, fk.ondelete) == ('user', 'SET NULL')


# ── admin_stats ───────────────────────────────────────────────

class TestFunnel:

    def test_counts_people_not_events(self):
        rows = [_event(1, 'paywall_viewed'), _event(1, 'paywall_viewed'), _event(2, 'paywall_viewed'),
                _event(1, 'purchase_started', plan='annual'),
                _event(1, 'purchase', plan='annual', outcome='purchased')]
        funnel = admin_stats.paywall_funnel(rows)
        assert (funnel['viewed'], funnel['started'], funnel['purchased'], funnel['conversion']) == (2, 1, 1, 50)

    def test_a_cancelled_purchase_is_not_a_sale(self):
        rows = [_event(1, 'paywall_viewed'), _event(1, 'purchase', plan='monthly', outcome='cancelled')]
        assert admin_stats.paywall_funnel(rows)['purchased'] == 0

    def test_no_openers_has_no_conversion(self):
        assert admin_stats.paywall_funnel([_event(1, 'upsell_shown')])['conversion'] is None

    def test_deleted_accounts_count_one_each(self):
        rows = [_event(None, 'paywall_viewed', id=1), _event(None, 'paywall_viewed', id=2)]
        assert admin_stats.paywall_funnel(rows)['viewed'] == 2

    def test_by_source_credits_the_purchase_to_what_opened_the_paywall(self):
        rows = [_event(1, 'upsell_shown', source='muscle_volume'),
                _event(1, 'paywall_viewed', source='muscle_volume'),
                _event(1, 'purchase', source='muscle_volume', plan='annual', outcome='purchased'),
                _event(2, 'paywall_viewed', source='templates'),
                _event(3, 'paywall_viewed', source='templates')]
        by_source = {s['source']: s for s in admin_stats.paywall_by_source(rows)}
        assert (by_source['muscle_volume']['label'], by_source['muscle_volume']['conversion']) == ('Muscle volume', 100)
        assert (by_source['templates']['viewed'], by_source['templates']['conversion']) == (2, 0)
        # Most opened first
        assert admin_stats.paywall_by_source(rows)[0]['source'] == 'templates'

    def test_an_unknown_source_shows_as_itself(self):
        assert admin_stats.paywall_by_source([_event(1, 'paywall_viewed', source='new_spot')])[0]['label'] == 'new_spot'

    def test_by_plan_counts_trials_on_purchases(self):
        rows = [_event(1, 'plan_selected', plan='monthly'),
                _event(1, 'purchase_started', plan='annual', trial=True),
                _event(1, 'purchase', plan='annual', trial=True, outcome='purchased'),
                _event(2, 'purchase', plan='lifetime', outcome='purchased')]
        plans = {p['plan']: p for p in admin_stats.paywall_by_plan(rows)}
        assert plans['monthly']['selected'] == 1
        assert (plans['annual']['started'], plans['annual']['purchased'], plans['annual']['trials']) == (1, 1, 1)
        assert (plans['lifetime']['purchased'], plans['lifetime']['trials']) == (1, 0)

    def test_outcomes_list_every_kind_even_at_zero(self):
        rows = [_event(1, 'restore', outcome='none'), _event(2, 'restore', outcome='none')]
        out = {o['outcome']: o['count'] for o in
               admin_stats.paywall_outcomes(rows, 'restore', admin_stats.RESTORE_OUTCOME_LABELS)}
        assert out == {'restored': 0, 'none': 2, 'failed': 0}

    def test_by_day_fills_every_day_oldest_first(self):
        today = date(2026, 10, 31)
        rows = [_event(1, 'paywall_viewed', when=datetime(2026, 10, 31, 9)),
                _event(1, 'purchase', outcome='purchased', plan='annual', when=datetime(2026, 10, 31, 9, 5)),
                _event(2, 'paywall_viewed', when=datetime(2026, 10, 30, 9)),
                _event(3, 'paywall_viewed', when=datetime(2026, 9, 1, 9))]
        days = admin_stats.paywall_by_day(rows, today)
        assert len(days) == 30
        assert (days[0]['day'], days[-1]['day']) == (today - timedelta(days=29), today)
        assert (days[-1]['viewed'], days[-1]['purchased'], days[-2]['viewed']) == (1, 1, 1)
        assert sum(d['viewed'] for d in days) == 2


# ── /admin/paywall ────────────────────────────────────────────

class TestPaywallPage:

    def test_requires_admin(self, client, admin_pw):
        assert client.get('/admin/paywall').status_code == 401

    def test_empty(self, client, admin_pw):
        res = client.get('/admin/paywall', headers=_basic_auth())
        assert res.status_code == 200
        html = res.get_data(as_text=True)
        assert 'Nothing logged yet' in html
        assert 'Nobody opened the paywall' in html

    def test_shows_the_funnel_by_source(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        db.session.add_all([
            _event(uid, 'upsell_shown', source='strength_score'),
            _event(uid, 'paywall_viewed', source='strength_score'),
            _event(uid, 'purchase_started', source='strength_score', plan='annual', trial=True),
            _event(uid, 'purchase', source='strength_score', plan='annual', trial=True, outcome='purchased'),
            _event(None, 'purchase', source='templates', plan='monthly', outcome='network'),
        ])
        db.session.commit()
        html = client.get('/admin/paywall', headers=_basic_auth()).get_data(as_text=True)
        assert 'Strength Score' in html
        assert '1 started on a free trial' in html
        assert 'Pending, offline or failed' in html
        assert 'aria-label="People opening the paywall per day"' in html

    def test_range_filters_old_events(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        db.session.add(_event(uid, 'paywall_viewed', source='routines', when=datetime.now() - timedelta(days=60)))
        db.session.commit()
        assert 'Routine limit' not in client.get('/admin/paywall', headers=_basic_auth()).get_data(as_text=True)
        assert 'Routine limit' in client.get('/admin/paywall?range=90', headers=_basic_auth()).get_data(as_text=True)

    def test_a_bad_range_falls_back(self, client, admin_pw):
        assert client.get('/admin/paywall?range=forever', headers=_basic_auth()).status_code == 200
