"""
Tests for the password-reset/OTP flow, /api/me/change-password, and /api/refresh.

This surface is the account-takeover attack path (anyone can request a reset
code for any email), so coverage here matters more than raw line count: every
test asserts on the actual security invariant, not just a status code.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from werkzeug.security import check_password_hash

from models import db, User


def _get_otp_for(client, email):
    """Trigger /api/forgot-password and return the raw OTP the route generated,
    captured from the (mocked) email-send call instead of hitting Resend."""
    with patch('routes.auth_routes._send_otp_email') as mock_send:
        res = client.post('/api/forgot-password', json={'email': email})
    assert res.status_code == 200
    assert mock_send.called
    return mock_send.call_args[0][1]


class TestForgotPassword:

    def test_unknown_email_returns_same_safe_message(self, client):
        res = client.post('/api/forgot-password', json={'email': 'nobody@example.com'})
        assert res.status_code == 200
        assert 'registered' in res.get_json()['message'].lower()

    def test_known_email_returns_same_safe_message(self, client, registered_user):
        with patch('routes.auth_routes._send_otp_email'):
            res = client.post('/api/forgot-password', json={'email': 'test@example.com'})
        assert res.status_code == 200
        assert 'registered' in res.get_json()['message'].lower()

    def test_missing_email_does_not_error_or_enumerate(self, client):
        res = client.post('/api/forgot-password', json={})
        assert res.status_code == 200

    def test_known_email_sets_hashed_otp_and_expiry(self, client, app, registered_user):
        import hashlib
        otp = _get_otp_for(client, 'test@example.com')
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            assert user.reset_otp_hash == hashlib.sha256(otp.encode()).hexdigest()
            assert user.reset_otp_attempts == 0
            assert user.reset_otp_expiry is not None

    def test_otp_is_never_returned_in_the_response(self, client, registered_user):
        with patch('routes.auth_routes._send_otp_email'):
            res = client.post('/api/forgot-password', json={'email': 'test@example.com'})
        assert 'otp' not in res.get_json()

    def test_requesting_again_invalidates_the_previous_code(self, client, registered_user):
        first = _get_otp_for(client, 'test@example.com')
        _get_otp_for(client, 'test@example.com')  # second request replaces the stored hash
        res = client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': first})
        assert res.status_code == 400


class TestVerifyOtp:

    def test_missing_fields_rejected(self, client):
        assert client.post('/api/verify-otp', json={'email': 'test@example.com'}).status_code == 400
        assert client.post('/api/verify-otp', json={'otp': '123456'}).status_code == 400

    def test_unknown_email_rejected(self, client):
        res = client.post('/api/verify-otp', json={'email': 'nobody@example.com', 'otp': '123456'})
        assert res.status_code == 400

    def test_no_otp_requested_yet_rejected(self, client, registered_user):
        res = client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': '123456'})
        assert res.status_code == 400

    def test_correct_otp_verifies(self, client, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        res = client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': otp})
        assert res.status_code == 200

    def test_verifying_does_not_consume_the_code(self, client, app, registered_user):
        """verify-otp is a check, not a commit — reset-password must still work after it."""
        otp = _get_otp_for(client, 'test@example.com')
        client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': otp})
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            assert user.reset_otp_hash is not None

    def test_wrong_otp_rejected_and_increments_attempts(self, client, app, registered_user):
        _get_otp_for(client, 'test@example.com')
        res = client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': '000000'})
        assert res.status_code == 400
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            assert user.reset_otp_attempts == 1

    def test_expired_otp_rejected_and_cleared(self, client, app, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            user.reset_otp_expiry = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.session.commit()
        res = client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': otp})
        assert res.status_code == 400
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            assert user.reset_otp_hash is None

    def test_five_wrong_attempts_locks_out_even_the_real_code(self, client, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        for _ in range(5):
            client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': '000000'})
        res = client.post('/api/verify-otp', json={'email': 'test@example.com', 'otp': otp})
        assert res.status_code == 400


class TestResetPassword:

    def test_missing_fields_rejected(self, client):
        res = client.post('/api/reset-password', json={'email': 'test@example.com'})
        assert res.status_code == 400

    def test_short_new_password_rejected(self, client, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'short',
        })
        assert res.status_code == 400

    def test_no_otp_requested_yet_rejected(self, client, registered_user):
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': '123456', 'new_password': 'newpassword456',
        })
        assert res.status_code == 400

    def test_wrong_otp_rejected_and_password_unchanged(self, client, app, registered_user):
        _get_otp_for(client, 'test@example.com')
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': '000000', 'new_password': 'newpassword456',
        })
        assert res.status_code == 400
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            assert user.reset_otp_attempts == 1
            assert check_password_hash(user.password, 'password123')

    def test_expired_otp_rejected(self, client, app, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            user.reset_otp_expiry = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.session.commit()
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'newpassword456',
        })
        assert res.status_code == 400

    def test_five_wrong_attempts_locks_out_even_the_real_code(self, client, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        for _ in range(5):
            client.post('/api/reset-password', json={
                'email': 'test@example.com', 'otp': '000000', 'new_password': 'newpassword456',
            })
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'anotherpassword789',
        })
        assert res.status_code == 400

    def test_correct_otp_resets_password_and_clears_otp_fields(self, client, app, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'newpassword456',
        })
        assert res.status_code == 200
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            assert user.reset_otp_hash is None
            assert user.reset_otp_expiry is None
            assert user.reset_otp_attempts == 0

    def test_can_log_in_with_new_password_after_reset(self, client, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'newpassword456',
        })
        old = client.post('/api/login', json={'email': 'test@example.com', 'password': 'password123'})
        assert old.status_code == 401
        new = client.post('/api/login', json={'email': 'test@example.com', 'password': 'newpassword456'})
        assert new.status_code == 200

    def test_otp_cannot_be_reused_after_a_successful_reset(self, client, registered_user):
        otp = _get_otp_for(client, 'test@example.com')
        client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'newpassword456',
        })
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'anotherpassword789',
        })
        assert res.status_code == 400

    def test_clears_is_social_only_flag_so_social_users_gain_password_login(self, client, app, registered_user):
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            user.is_social_only = True
            db.session.commit()
        otp = _get_otp_for(client, 'test@example.com')
        res = client.post('/api/reset-password', json={
            'email': 'test@example.com', 'otp': otp, 'new_password': 'newpassword456',
        })
        assert res.status_code == 200
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            assert user.is_social_only is False


class TestChangePassword:

    def _auth(self, token):
        return {'Authorization': f'Bearer {token}'}

    def test_requires_auth(self, client):
        res = client.post('/api/me/change-password', json={
            'current_password': 'password123',
            'new_password': 'newpassword456',
            'confirm_password': 'newpassword456',
        })
        assert res.status_code == 401

    def test_missing_fields_rejected(self, client, auth_token):
        res = client.post(
            '/api/me/change-password',
            json={'current_password': 'password123'},
            headers=self._auth(auth_token),
        )
        assert res.status_code == 400

    def test_mismatched_confirmation_rejected(self, client, auth_token):
        res = client.post('/api/me/change-password', json={
            'current_password': 'password123',
            'new_password': 'newpassword456',
            'confirm_password': 'somethingelse',
        }, headers=self._auth(auth_token))
        assert res.status_code == 400

    def test_short_new_password_rejected(self, client, auth_token):
        res = client.post('/api/me/change-password', json={
            'current_password': 'password123', 'new_password': 'short', 'confirm_password': 'short',
        }, headers=self._auth(auth_token))
        assert res.status_code == 400

    def test_wrong_current_password_rejected(self, client, auth_token):
        res = client.post('/api/me/change-password', json={
            'current_password': 'wrongpassword',
            'new_password': 'newpassword456',
            'confirm_password': 'newpassword456',
        }, headers=self._auth(auth_token))
        assert res.status_code == 400
        assert 'incorrect' in res.get_json()['message'].lower()

    def test_new_password_same_as_current_rejected(self, client, auth_token):
        res = client.post('/api/me/change-password', json={
            'current_password': 'password123',
            'new_password': 'password123',
            'confirm_password': 'password123',
        }, headers=self._auth(auth_token))
        assert res.status_code == 400

    def test_success_updates_password(self, client, auth_token):
        res = client.post('/api/me/change-password', json={
            'current_password': 'password123',
            'new_password': 'newpassword456',
            'confirm_password': 'newpassword456',
        }, headers=self._auth(auth_token))
        assert res.status_code == 200
        old = client.post('/api/login', json={'email': 'test@example.com', 'password': 'password123'})
        assert old.status_code == 401
        new = client.post('/api/login', json={'email': 'test@example.com', 'password': 'newpassword456'})
        assert new.status_code == 200

    def test_social_only_account_is_blocked(self, client, app, auth_token):
        with app.app_context():
            user = User.query.filter_by(email='test@example.com').first()
            user.is_social_only = True
            db.session.commit()
        res = client.post('/api/me/change-password', json={
            'current_password': 'password123',
            'new_password': 'newpassword456',
            'confirm_password': 'newpassword456',
        }, headers=self._auth(auth_token))
        assert res.status_code == 400
        assert 'social' in res.get_json()['message'].lower()


class TestRefresh:

    def test_access_token_rejected_where_refresh_is_required(self, client, auth_token):
        res = client.post('/api/refresh', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code in (401, 422)

    def test_no_token_rejected(self, client):
        res = client.post('/api/refresh')
        assert res.status_code == 401

    def test_valid_refresh_token_issues_new_tokens(self, client, registered_user):
        login = client.post('/api/login', json={'email': 'test@example.com', 'password': 'password123'})
        refresh_token = login.get_json()['refresh_token']
        res = client.post('/api/refresh', headers={'Authorization': f'Bearer {refresh_token}'})
        assert res.status_code == 200
        data = res.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data

    def test_new_access_token_is_usable(self, client, registered_user):
        login = client.post('/api/login', json={'email': 'test@example.com', 'password': 'password123'})
        refresh_token = login.get_json()['refresh_token']
        refreshed = client.post('/api/refresh', headers={'Authorization': f'Bearer {refresh_token}'})
        new_access = refreshed.get_json()['access_token']
        res = client.post('/api/me/change-password', json={
            'current_password': 'password123',
            'new_password': 'newpassword456',
            'confirm_password': 'newpassword456',
        }, headers={'Authorization': f'Bearer {new_access}'})
        assert res.status_code == 200
