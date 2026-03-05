"""
Tests for /api/signup and /api/login
"""


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
