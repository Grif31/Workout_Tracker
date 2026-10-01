"""
flask grant-beta-premium: beta accounts keep premium through a RevenueCat
promotional entitlement once production builds stop setting
EXPO_PUBLIC_BETA_PREMIUM. RevenueCat is never reached; requests.Session.request
is replaced with a recorder.
"""
import pytest
import requests

from models import db, User


class FakeResponse:
    def __init__(self, status_code, body=None, headers=None):
        self.status_code = status_code
        self._body = body or {}
        self.headers = headers or {}
        self.text = str(self._body)

    @property
    def ok(self):
        return 200 <= self.status_code < 300

    def json(self):
        return self._body


def make_users(n):
    users = [User(username=f'u{i}', email=f'u{i}@example.com', password='x') for i in range(n)]
    db.session.add_all(users)
    db.session.commit()
    return [u.id for u in users]


@pytest.fixture
def revenuecat(monkeypatch):
    """Records every call; `entitlements` maps user id -> its premium entitlement."""
    state = {'calls': [], 'entitlements': {}, 'fail_post_for': set()}

    def fake_request(self, method, url, **kwargs):
        state['calls'].append((method, url, kwargs.get('json')))
        user_id = int(url.split('/subscribers/')[1].split('/')[0])
        if method == 'GET':
            ent = state['entitlements'].get(user_id)
            return FakeResponse(200, {'subscriber': {'entitlements': {'premium': ent} if ent else {}}})
        if user_id in state['fail_post_for']:
            return FakeResponse(500, {'message': 'boom'})
        return FakeResponse(201, {})

    monkeypatch.setattr(requests.Session, 'request', fake_request)
    monkeypatch.setenv('REVENUECAT_SECRET_KEY', 'sk_test')
    return state


def posts(state):
    return [(url, body) for method, url, body in state['calls'] if method == 'POST']


def test_dry_run_lists_users_and_calls_nothing(app, revenuecat):
    ids = make_users(3)
    result = app.test_cli_runner().invoke(args=['grant-beta-premium', '--max-user-id', str(ids[1])])
    assert result.exit_code == 0
    assert 'DRY RUN' in result.output
    assert '2 user(s)' in result.output
    assert revenuecat['calls'] == []


def test_grants_lifetime_premium_up_to_the_cutoff_only(app, revenuecat):
    ids = make_users(3)
    result = app.test_cli_runner().invoke(args=['grant-beta-premium', '--max-user-id', str(ids[1]), '--apply'])
    assert result.exit_code == 0, result.output
    assert posts(revenuecat) == [
        (f'https://api.revenuecat.com/v1/subscribers/{i}/entitlements/premium/promotional', {'duration': 'lifetime'})
        for i in ids[:2]
    ]


def test_exclude_leaves_a_user_out(app, revenuecat):
    ids = make_users(3)
    result = app.test_cli_runner().invoke(
        args=['grant-beta-premium', '--max-user-id', str(ids[2]), '--exclude', str(ids[1]), '--apply'])
    assert result.exit_code == 0, result.output
    granted = [url.split('/subscribers/')[1].split('/')[0] for url, _ in posts(revenuecat)]
    assert granted == [str(ids[0]), str(ids[2])]


def test_rerun_skips_users_who_already_hold_the_promo(app, revenuecat):
    ids = make_users(2)
    revenuecat['entitlements'][ids[0]] = {'product_identifier': 'rc_promo_premium_lifetime', 'expires_date': '2226-01-01T00:00:00Z'}
    # A real (store) subscription doesn't count: it can lapse, the beta promise can't
    revenuecat['entitlements'][ids[1]] = {'product_identifier': 'arete_premium_monthly', 'expires_date': '2226-01-01T00:00:00Z'}
    result = app.test_cli_runner().invoke(args=['grant-beta-premium', '--max-user-id', str(ids[1]), '--apply'])
    assert result.exit_code == 0, result.output
    assert [url for url, _ in posts(revenuecat)] == [
        f'https://api.revenuecat.com/v1/subscribers/{ids[1]}/entitlements/premium/promotional']
    assert '1 granted, 1 already had it' in result.output


def test_expired_promo_is_granted_again(app, revenuecat):
    ids = make_users(1)
    revenuecat['entitlements'][ids[0]] = {'product_identifier': 'rc_promo_premium_weekly', 'expires_date': '2020-01-01T00:00:00Z'}
    result = app.test_cli_runner().invoke(args=['grant-beta-premium', '--max-user-id', str(ids[0]), '--apply'])
    assert result.exit_code == 0, result.output
    assert len(posts(revenuecat)) == 1


def test_failed_grant_exits_nonzero_and_names_the_user(app, revenuecat):
    ids = make_users(2)
    revenuecat['fail_post_for'].add(ids[0])
    result = app.test_cli_runner().invoke(args=['grant-beta-premium', '--max-user-id', str(ids[1]), '--apply'])
    assert result.exit_code != 0
    assert f'FAILED user {ids[0]}' in result.output
    assert len(posts(revenuecat)) == 2  # one failure doesn't stop the rest


def test_apply_without_secret_key_fails_before_calling(app, revenuecat, monkeypatch):
    monkeypatch.delenv('REVENUECAT_SECRET_KEY')
    ids = make_users(1)
    result = app.test_cli_runner().invoke(args=['grant-beta-premium', '--max-user-id', str(ids[0]), '--apply'])
    assert result.exit_code != 0
    assert 'REVENUECAT_SECRET_KEY' in result.output
    assert revenuecat['calls'] == []
