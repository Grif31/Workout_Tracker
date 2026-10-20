"""Server-side Premium: the RevenueCat webhook, the sync route, and the AI routes
that refuse a free account once PREMIUM_ENFORCED is on."""
import os
import sys
import time
from unittest.mock import patch

import pytest

from models import db, User, Routine
from tests.test_ai_routes import _make_anthropic_mock, INSIGHTS_JSON, REVIEW_JSON, ROUTINE_JSON
from utils import premium

SECRET = 'whsec-test'


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def ms(offset_seconds):
    return int((time.time() + offset_seconds) * 1000)


@pytest.fixture
def uid(registered_user):
    return registered_user['user']['id']


def set_premium(app, user_id, value):
    with app.app_context():
        db.session.get(User, user_id).is_premium = value
        db.session.commit()


def is_premium(app, user_id):
    with app.app_context():
        return db.session.get(User, user_id).is_premium


@pytest.fixture
def enforced(monkeypatch):
    monkeypatch.setenv('PREMIUM_ENFORCED', 'true')


class TestHasPremium:

    def test_everyone_is_premium_until_enforcement_is_on(self, app, uid):
        with app.app_context():
            assert premium.has_premium(db.session.get(User, uid)) is True

    def test_enforced_reads_the_flag(self, app, uid, enforced):
        with app.app_context():
            user = db.session.get(User, uid)
            assert premium.has_premium(user) is False
            user.is_premium = True
            assert premium.has_premium(user) is True


class TestApplyEvent:

    def _apply(self, app, uid, **event):
        with app.app_context():
            changed = premium.apply_event({'app_user_id': str(uid), 'entitlement_ids': ['premium'], **event})
            db.session.commit()
        return changed

    def test_a_purchase_or_renewal_grants_until_it_expires(self, app, uid):
        assert self._apply(app, uid, type='INITIAL_PURCHASE', expiration_at_ms=ms(3600)) is True
        assert is_premium(app, uid) is True

    def test_a_lifetime_purchase_has_no_expiry(self, app, uid):
        self._apply(app, uid, type='NON_RENEWING_PURCHASE', expiration_at_ms=None)
        assert is_premium(app, uid) is True

    def test_an_already_expired_grant_does_not_grant(self, app, uid):
        self._apply(app, uid, type='RENEWAL', expiration_at_ms=ms(-3600))
        assert is_premium(app, uid) is False

    def test_expiration_revokes(self, app, uid):
        set_premium(app, uid, True)
        self._apply(app, uid, type='EXPIRATION', expiration_at_ms=ms(-60))
        assert is_premium(app, uid) is False

    def test_cancelling_auto_renew_keeps_access_to_the_period_end(self, app, uid):
        set_premium(app, uid, True)
        self._apply(app, uid, type='CANCELLATION', expiration_at_ms=ms(86400))
        assert is_premium(app, uid) is True

    def test_a_refund_revokes_at_once(self, app, uid):
        set_premium(app, uid, True)
        self._apply(app, uid, type='CANCELLATION', expiration_at_ms=ms(-60))
        assert is_premium(app, uid) is False

    def test_a_transfer_moves_access_between_accounts(self, app, uid, auth_token2):
        with app.app_context():
            other = User.query.filter(User.id != uid).first().id
        set_premium(app, uid, True)
        with app.app_context():
            premium.apply_event({'type': 'TRANSFER', 'entitlement_ids': ['premium'],
                                 'transferred_from': [str(uid)], 'transferred_to': [str(other)]})
            db.session.commit()
        assert is_premium(app, uid) is False
        assert is_premium(app, other) is True

    def _transfer(self, app, **event):
        with app.app_context():
            changed = premium.apply_event({'type': 'TRANSFER', 'entitlement_ids': ['premium'], **event})
            db.session.commit()
        return changed

    def test_a_transfer_of_an_expired_entitlement_grants_nobody(self, app, uid, auth_token2):
        with app.app_context():
            other = User.query.filter(User.id != uid).first().id
        set_premium(app, uid, True)
        assert self._transfer(app, transferred_from=[str(uid)], transferred_to=[str(other)],
                              expiration_at_ms=ms(-60)) is True
        assert is_premium(app, uid) is False
        assert is_premium(app, other) is False

    def test_a_transfer_from_an_anonymous_id_still_grants_our_user(self, app, uid):
        assert self._transfer(app, transferred_from=['$RCAnonymousID:abc'], transferred_to=[str(uid)],
                              expiration_at_ms=ms(3600)) is True
        assert is_premium(app, uid) is True

    def test_a_transfer_to_an_unknown_id_still_revokes_our_user(self, app, uid):
        set_premium(app, uid, True)
        assert self._transfer(app, transferred_from=[str(uid)], transferred_to=['$RCAnonymousID:abc']) is True
        assert is_premium(app, uid) is False

    def test_a_transfer_between_ids_we_do_not_know_is_ignored(self, app, uid):
        assert self._transfer(app, transferred_from=['$RCAnonymousID:a'], transferred_to=['999999']) is False
        assert is_premium(app, uid) is False

    @pytest.mark.parametrize('event', [
        {'type': 'INITIAL_PURCHASE', 'entitlement_ids': ['something_else']},
        {'type': 'BILLING_ISSUE'},
        {'type': 'SUBSCRIPTION_PAUSED'},
        {'type': 'INITIAL_PURCHASE', 'app_user_id': '$RCAnonymousID:abc'},
        {'type': 'INITIAL_PURCHASE', 'app_user_id': '999999'},
        {'type': 'INITIAL_PURCHASE', 'app_user_id': None},
    ])
    def test_ignores_what_it_does_not_recognise(self, app, uid, event):
        with app.app_context():
            base = {'app_user_id': str(uid), 'expiration_at_ms': ms(3600), 'entitlement_ids': ['premium']}
            assert premium.apply_event({**base, **event}) is False
        assert is_premium(app, uid) is False


class TestWebhookRoute:

    def _post(self, client, body, header=None):
        headers = {'Authorization': header} if header is not None else {}
        return client.post('/api/webhooks/revenuecat', json=body, headers=headers)

    @pytest.fixture(autouse=True)
    def secret(self, monkeypatch):
        monkeypatch.setenv('REVENUECAT_WEBHOOK_SECRET', SECRET)

    def test_refuses_a_missing_or_wrong_secret(self, client):
        assert self._post(client, {}).status_code == 401
        assert self._post(client, {}, header='nope').status_code == 401

    def test_refuses_everything_while_no_secret_is_configured(self, client, monkeypatch):
        monkeypatch.delenv('REVENUECAT_WEBHOOK_SECRET')
        assert self._post(client, {}, header=SECRET).status_code == 401
        assert self._post(client, {}, header='').status_code == 401

    def test_accepts_the_secret_raw_or_as_a_bearer_token(self, client, app, uid):
        body = {'event': {'type': 'INITIAL_PURCHASE', 'app_user_id': str(uid), 'entitlement_ids': ['premium'], 'expiration_at_ms': ms(3600)}}
        assert self._post(client, body, header=SECRET).status_code == 200
        assert is_premium(app, uid) is True
        set_premium(app, uid, False)
        assert self._post(client, body, header=f'Bearer {SECRET}').status_code == 200
        assert is_premium(app, uid) is True

    def test_expiry_revokes_through_the_route(self, client, app, uid):
        set_premium(app, uid, True)
        body = {'event': {'type': 'EXPIRATION', 'app_user_id': str(uid), 'entitlement_ids': ['premium'], 'expiration_at_ms': ms(-60)}}
        self._post(client, body, header=SECRET)
        assert is_premium(app, uid) is False

    @pytest.mark.parametrize('body', [None, [], {'event': 'x'}, {}, {'event': {}}, {'event': {'type': 'TEST'}}])
    def test_answers_200_to_a_valid_caller_whatever_the_body(self, client, body):
        assert self._post(client, body, header=SECRET).status_code == 200


    def test_a_failed_event_rolls_back_and_answers_500_so_revenuecat_retries(self, client, app, uid):
        def half_applied(event):
            db.session.get(User, uid).is_premium = True
            raise RuntimeError('boom')
        body = {'event': {'type': 'INITIAL_PURCHASE', 'app_user_id': str(uid), 'entitlement_ids': ['premium'], 'expiration_at_ms': ms(3600)}}
        with patch('utils.premium.apply_event', side_effect=half_applied):
            assert self._post(client, body, header=SECRET).status_code == 500
        assert is_premium(app, uid) is False


class TestSyncRoute:

    def test_requires_auth(self, client):
        assert client.post('/api/premium/sync').status_code == 401

    def test_records_what_revenuecat_says(self, client, app, uid, auth_token):
        with patch('utils.premium.fetch_entitlement_active', return_value=True):
            res = client.post('/api/premium/sync', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['is_premium'] is True
        assert is_premium(app, uid) is True

        with patch('utils.premium.fetch_entitlement_active', return_value=False):
            client.post('/api/premium/sync', headers=auth_headers(auth_token))
        assert is_premium(app, uid) is False

    def test_never_revokes_on_a_guess(self, client, app, uid, auth_token):
        set_premium(app, uid, True)
        with patch('utils.premium.fetch_entitlement_active', return_value=None):
            res = client.post('/api/premium/sync', headers=auth_headers(auth_token))
        assert res.status_code == 503
        assert res.get_json()['is_premium'] is True
        assert is_premium(app, uid) is True

    def test_no_secret_key_means_it_cannot_say(self, monkeypatch):
        monkeypatch.delenv('REVENUECAT_SECRET_KEY', raising=False)
        assert premium.fetch_entitlement_active(1) is None


class TestAiRoutesWhenEnforced:

    def _post(self, client, token, path, body, response_json):
        mock_ant = _make_anthropic_mock(response_json)
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                return client.post(path, json=body, headers=auth_headers(token))

    GENERATE = {'days_per_week': 3, 'goal': 'general', 'experience': 'beginner', 'generate_type': 'routine'}
    SAVE = {'type': 'routine', 'name': 'R', 'days': [{'label': 'Push', 'exercise_ids': []}]}

    def test_insights_are_premium_only(self, client, app, uid, auth_token, enforced):
        res = self._post(client, auth_token, '/api/ai/insights', {}, INSIGHTS_JSON)
        assert res.status_code == 402
        assert res.get_json()['premium_required'] is True
        set_premium(app, uid, True)
        assert self._post(client, auth_token, '/api/ai/insights', {}, INSIGHTS_JSON).status_code == 200

    def test_everything_stays_open_while_enforcement_is_off(self, client, auth_token):
        assert self._post(client, auth_token, '/api/ai/insights', {}, INSIGHTS_JSON).status_code == 200
        assert self._post(client, auth_token, '/api/ai/generate', self.GENERATE, ROUTINE_JSON).status_code == 200

    def test_a_free_account_can_build_its_onboarding_program_once(self, client, app, uid, auth_token, enforced):
        assert self._post(client, auth_token, '/api/ai/generate', self.GENERATE, ROUTINE_JSON).status_code == 200
        res = self._post(client, auth_token, '/api/ai/save', {**self.SAVE, 'starter': True}, {})
        assert res.status_code == 201
        # Having one, it is premium from here
        assert self._post(client, auth_token, '/api/ai/generate', self.GENERATE, ROUTINE_JSON).status_code == 402
        assert self._post(client, auth_token, '/api/ai/save', {**self.SAVE, 'starter': True}, {}).status_code == 402

    def test_deleting_the_starter_routine_does_not_renew_the_free_program(self, client, app, uid, auth_token, enforced):
        routine_id = self._post(client, auth_token, '/api/ai/save', {**self.SAVE, 'starter': True}, {}).get_json()['id']
        assert client.delete(f'/api/routines/{routine_id}', headers=auth_headers(auth_token)).status_code == 200
        with app.app_context():
            assert Routine.query.filter_by(user_id=uid).count() == 0
        assert self._post(client, auth_token, '/api/ai/generate', self.GENERATE, ROUTINE_JSON).status_code == 402
        assert self._post(client, auth_token, '/api/ai/save', {**self.SAVE, 'starter': True}, {}).status_code == 402

    def test_the_free_program_is_a_routine_not_any_plan(self, client, auth_token, enforced):
        res = self._post(client, auth_token, '/api/ai/generate', {**self.GENERATE, 'generate_type': 'template'}, ROUTINE_JSON)
        assert res.status_code == 402

    def test_a_free_account_cannot_save_a_routine_that_is_not_the_starter(self, client, auth_token, enforced):
        assert self._post(client, auth_token, '/api/ai/save', self.SAVE, {}).status_code == 402
        assert self._post(client, auth_token, '/api/ai/save', {'type': 'template', 'name': 'T', 'starter': True}, {}).status_code == 402

    def test_premium_generates_and_saves_freely(self, client, app, uid, auth_token, enforced):
        set_premium(app, uid, True)
        for _ in range(2):
            assert self._post(client, auth_token, '/api/ai/save', self.SAVE, {}).status_code == 201
        assert self._post(client, auth_token, '/api/ai/generate', self.GENERATE, ROUTINE_JSON).status_code == 200

    def test_free_generation_has_a_tighter_daily_limit(self, client, auth_token, enforced):
        from limiter import limiter
        limiter.reset()
        limiter.enabled = True
        try:
            codes = [self._post(client, auth_token, '/api/ai/generate', self.GENERATE, ROUTINE_JSON).status_code for _ in range(4)]
            assert codes == [200, 200, 200, 429]
        finally:
            limiter.enabled = False
            limiter.reset()

    def test_weekly_review_gives_a_free_account_one_part_and_names_the_rest(self, client, app, uid, auth_token, enforced):
        res = self._post(client, auth_token, '/api/ai/weekly-review', {}, REVIEW_JSON)
        data = res.get_json()
        assert res.status_code == 200
        assert list(data['review']) == ['went_well']
        assert data['locked'] == ['lagged', 'next_change']

        set_premium(app, uid, True)
        data = self._post(client, auth_token, '/api/ai/weekly-review', {}, REVIEW_JSON).get_json()
        assert set(data['review']) == {'went_well', 'lagged', 'next_change'}
        assert data['locked'] == []

    def test_weekly_review_free_part_is_the_first_that_survived_the_fact_check(self, client, auth_token, enforced):
        partial = {**REVIEW_JSON}
        partial['went_well'] = {**REVIEW_JSON['went_well'], 'evidence': {**REVIEW_JSON['went_well']['evidence'], 'exercise': 'Zercher Squat'}}
        data = self._post(client, auth_token, '/api/ai/weekly-review', {}, partial).get_json()
        assert list(data['review']) == ['lagged']
        assert data['locked'] == ['next_change']


class FakeResponse:
    def __init__(self, status, body=None):
        self.status_code = status
        self.ok = status < 400
        self._body = body

    def json(self):
        return self._body


def subscriber(expires_date, entitlement='premium'):
    return {'subscriber': {'entitlements': {entitlement: {'expires_date': expires_date}}}}


class TestFetchEntitlementActive:
    """Parses RevenueCat's subscriber reply. True grants, False revokes, None
    means it couldn't tell and nothing changes."""

    @pytest.fixture(autouse=True)
    def secret_key(self, monkeypatch):
        monkeypatch.setenv('REVENUECAT_SECRET_KEY', 'sk_test')

    def fetch(self, response):
        with patch('requests.get', return_value=response) as get:
            result = premium.fetch_entitlement_active(42)
        assert get.call_args.args[0].endswith('/subscribers/42')
        assert get.call_args.kwargs['headers']['Authorization'] == 'Bearer sk_test'
        return result

    def test_a_live_entitlement_is_premium(self):
        assert self.fetch(FakeResponse(200, subscriber('2099-01-01T00:00:00Z'))) is True

    def test_an_expired_entitlement_is_not(self):
        assert self.fetch(FakeResponse(200, subscriber('2020-01-01T00:00:00Z'))) is False

    def test_no_expiry_is_lifetime(self):
        assert self.fetch(FakeResponse(200, subscriber(None))) is True

    def test_dates_with_milliseconds_compare_as_dates(self):
        just_expired = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(time.time() - 1)) + '.999Z'
        assert self.fetch(FakeResponse(200, subscriber(just_expired))) is False
        assert self.fetch(FakeResponse(200, subscriber('2099-01-01T00:00:00.000Z'))) is True

    def test_an_unreadable_date_cannot_say(self):
        assert self.fetch(FakeResponse(200, subscriber('soon'))) is None

    def test_no_premium_entitlement_is_not_premium(self):
        assert self.fetch(FakeResponse(200, subscriber('2099-01-01T00:00:00Z', entitlement='other'))) is False
        assert self.fetch(FakeResponse(200, {'subscriber': {'entitlements': {}}})) is False
        assert self.fetch(FakeResponse(200, {'subscriber': {'entitlements': None}})) is False

    def test_an_unknown_subscriber_is_not_premium(self):
        assert self.fetch(FakeResponse(404)) is False

    @pytest.mark.parametrize('status', [401, 429, 500, 503])
    def test_any_other_failure_cannot_say(self, status):
        assert self.fetch(FakeResponse(status)) is None

    def test_a_network_error_cannot_say(self):
        import requests
        with patch('requests.get', side_effect=requests.ConnectionError()):
            assert premium.fetch_entitlement_active(42) is None


class TestScoresStayOpenWhenEnforced:
    """CLAUDE.md: the score routes are not gated. A free account's app shows its
    own lifts locked, so the server must still send them."""

    def test_a_free_account_still_gets_its_lift_breakdown(self, client, app, uid, auth_token, enforced):
        set_premium(app, uid, False)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        res = client.get('/api/stats/strength-score', headers=auth_headers(auth_token))
        assert res.status_code == 200
        body = res.get_json()
        for key in ('big6', 'supplemental', 'supplemental_coverage', 'muscle_groups', 'endurance', 'greek_score'):
            assert key in body
        assert body['big6']
