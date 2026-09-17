"""
Tests for /api/signup, /api/login, and /api/auth/social
"""
import os
from unittest.mock import patch


class TestSignup:

    def test_signup_success(self, client):
        res = client.post('/api/signup', json={
            'username': 'newuser',
            'email': 'new@example.com',
            'password': 'password123',
        })
        assert res.status_code == 201
        data = res.get_json()
        assert 'token' in data
        assert data['user']['email'] == 'new@example.com'
        assert data['user']['username'] == 'newuser'

    def test_signup_missing_username(self, client):
        res = client.post('/api/signup', json={
            'email': 'new@example.com',
            'password': 'password123',
        })
        assert res.status_code == 400
        assert 'message' in res.get_json()

    def test_signup_missing_email(self, client):
        res = client.post('/api/signup', json={
            'username': 'newuser',
            'password': 'password123',
        })
        assert res.status_code == 400

    def test_signup_missing_password(self, client):
        res = client.post('/api/signup', json={
            'username': 'newuser',
            'email': 'new@example.com',
        })
        assert res.status_code == 400

    def test_signup_duplicate_email(self, client, registered_user):
        res = client.post('/api/signup', json={
            'username': 'differentuser',
            'email': 'test@example.com',  # already registered
            'password': 'password123',
        })
        assert res.status_code == 400
        assert 'Email' in res.get_json()['message']

    def test_signup_duplicate_username(self, client, registered_user):
        res = client.post('/api/signup', json={
            'username': 'testuser',  # already registered
            'email': 'different@example.com',
            'password': 'password123',
        })
        assert res.status_code == 400
        assert 'Username' in res.get_json()['message']

    def test_signup_password_is_hashed(self, client, app):
        client.post('/api/signup', json={
            'username': 'hashtest',
            'email': 'hash@example.com',
            'password': 'plaintext',
        })
        from models import User
        with app.app_context():
            user = User.query.filter_by(email='hash@example.com').first()
            assert user is not None
            assert user.password != 'plaintext'


class TestLogin:

    def test_login_success(self, client, registered_user):
        res = client.post('/api/login', json={
            'email': 'test@example.com',
            'password': 'password123',
        })
        assert res.status_code == 200
        data = res.get_json()
        assert 'access_token' in data
        assert data['email'] == 'test@example.com'
        assert data['username'] == 'testuser'

    def test_login_wrong_password(self, client, registered_user):
        res = client.post('/api/login', json={
            'email': 'test@example.com',
            'password': 'wrongpassword',
        })
        assert res.status_code == 401
        assert 'Invalid' in res.get_json()['message']

    def test_login_wrong_email(self, client, registered_user):
        res = client.post('/api/login', json={
            'email': 'nobody@example.com',
            'password': 'password123',
        })
        assert res.status_code == 401

    def test_login_returns_user_fields(self, client, registered_user):
        res = client.post('/api/login', json={
            'email': 'test@example.com',
            'password': 'password123',
        })
        data = res.get_json()
        assert 'id' in data
        assert 'username' in data
        assert 'email' in data
        assert 'access_token' in data
        # Password should never be returned
        assert 'password' not in data

    def test_login_token_is_string(self, client, registered_user):
        res = client.post('/api/login', json={
            'email': 'test@example.com',
            'password': 'password123',
        })
        token = res.get_json()['access_token']
        assert isinstance(token, str)
        assert len(token) > 0


class TestAppleSocialAuth:

    def test_apple_fails_closed_without_bundle_id(self, client):
        """With APPLE_BUNDLE_ID unset, Apple auth must reject the token before
        any network call — never silently skip audience verification."""
        def _no_network(*args, **kwargs):
            raise AssertionError('network call attempted before config check')

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('APPLE_BUNDLE_ID', None)
            with patch('routes.auth_routes.http_requests.get', _no_network):
                res = client.post('/api/auth/social', json={
                    'provider': 'apple', 'token': 'any-identity-token',
                })
        assert res.status_code == 401
        assert 'not configured' in res.get_json()['message'].lower()

    def test_unknown_provider_rejected(self, client):
        res = client.post('/api/auth/social', json={
            'provider': 'myspace', 'token': 'x',
        })
        assert res.status_code == 401


class _FakeResp:
    def __init__(self, payload, ok=True):
        self._payload = payload
        self.ok = ok

    def json(self):
        return self._payload


def _google_responses(tokeninfo, tokeninfo_ok=True, name='Social Person'):
    def _get(url, *args, **kwargs):
        if 'tokeninfo' in url:
            return _FakeResp(tokeninfo, ok=tokeninfo_ok)
        return _FakeResp({'name': name})
    return _get


GOOGLE_CLIENT = 'our-ios-client.apps.googleusercontent.com'


class TestGoogleSocialAuth:

    def _post(self, client, get):
        with patch.dict(os.environ, {'GOOGLE_CLIENT_IDS': f'other-id, {GOOGLE_CLIENT}'}):
            with patch('routes.auth_routes.http_requests.get', get):
                return client.post('/api/auth/social', json={
                    'provider': 'google', 'token': 'google-access-token',
                })

    def test_fails_closed_without_client_ids(self, client):
        def _no_network(*args, **kwargs):
            raise AssertionError('network call attempted before config check')

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('GOOGLE_CLIENT_IDS', None)
            with patch('routes.auth_routes.http_requests.get', _no_network):
                res = client.post('/api/auth/social', json={
                    'provider': 'google', 'token': 'x',
                })
        assert res.status_code == 401
        assert 'not configured' in res.get_json()['message'].lower()

    def test_valid_token_creates_social_account(self, client, app):
        res = self._post(client, _google_responses({
            'aud': GOOGLE_CLIENT, 'email': 'new@example.com', 'email_verified': 'true',
        }))
        assert res.status_code == 200
        body = res.get_json()
        assert body['access_token']
        assert body['email'] == 'new@example.com'
        from models import User
        user = User.query.filter_by(email='new@example.com').first()
        assert user.is_social_only
        assert user.name == 'Social Person'

    def test_token_for_another_app_rejected(self, client, registered_user):
        res = self._post(client, _google_responses({
            'aud': 'someone-elses-app.apps.googleusercontent.com',
            'azp': 'someone-elses-app.apps.googleusercontent.com',
            'email': 'test@example.com', 'email_verified': 'true',
        }))
        assert res.status_code == 401
        assert 'access_token' not in res.get_json()

    def test_azp_match_accepted(self, client):
        res = self._post(client, _google_responses({
            'aud': 'web-backend-id', 'azp': GOOGLE_CLIENT,
            'email': 'azp@example.com', 'email_verified': 'true',
        }))
        assert res.status_code == 200

    def test_unverified_email_cannot_sign_into_existing_account(self, client, registered_user):
        res = self._post(client, _google_responses({
            'aud': GOOGLE_CLIENT, 'email': 'test@example.com', 'email_verified': 'false',
        }))
        assert res.status_code == 401
        assert 'access_token' not in res.get_json()

    def test_invalid_token_rejected(self, client):
        res = self._post(client, _google_responses({'error': 'invalid_token'}, tokeninfo_ok=False))
        assert res.status_code == 401

    def test_verified_email_links_existing_account(self, client, registered_user):
        res = self._post(client, _google_responses({
            'aud': GOOGLE_CLIENT, 'email': 'test@example.com', 'email_verified': 'true',
        }))
        assert res.status_code == 200
        assert res.get_json()['id'] == registered_user['user']['id']

    def test_facebook_no_longer_accepted(self, client):
        def _no_network(*args, **kwargs):
            raise AssertionError('facebook token should not be looked up')

        with patch('routes.auth_routes.http_requests.get', _no_network):
            res = client.post('/api/auth/social', json={
                'provider': 'facebook', 'token': 'fb-token',
            })
        assert res.status_code == 401


class TestRefresh:

    def _refresh_token(self, client, registered_user):
        res = client.post('/api/login', json={
            'email': 'test@example.com', 'password': 'password123',
        })
        return res.get_json()['refresh_token']

    def test_refresh_issues_new_tokens(self, client, registered_user):
        token = self._refresh_token(client, registered_user)
        res = client.post('/api/refresh', headers={'Authorization': f'Bearer {token}'})
        assert res.status_code == 200
        assert res.get_json()['access_token']

    def test_refresh_rejected_after_account_deleted(self, client, registered_user):
        token = self._refresh_token(client, registered_user)
        from models import db, User
        db.session.delete(db.session.get(User, registered_user['user']['id']))
        db.session.commit()

        res = client.post('/api/refresh', headers={'Authorization': f'Bearer {token}'})
        assert res.status_code == 401
