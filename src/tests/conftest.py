import pytest
import sys
import os

# Allow imports from src/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app
from models import db as _db
from werkzeug.security import generate_password_hash


@pytest.fixture(scope='session')
def app():
    """Create a Flask app configured for testing with an in-memory SQLite DB."""
    test_app = create_app(test_config={
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key',
    })

    with test_app.app_context():
        _db.create_all()
        yield test_app
        _db.drop_all()


@pytest.fixture(scope='function')
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture(scope='function', autouse=True)
def clean_db(app):
    """Wipe all table data between tests so each test starts fresh."""
    with app.app_context():
        yield
        _db.session.remove()
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()


@pytest.fixture
def registered_user(client):
    """Create and return a registered user via the signup endpoint."""
    res = client.post('/api/signup', json={
        'username': 'testuser',
        'email': 'test@example.com',
        'password': 'password123',
    })
    assert res.status_code == 201
    return res.get_json()


@pytest.fixture
def auth_token(client, registered_user):
    """Return a valid JWT token for the registered user."""
    res = client.post('/api/login', json={
        'email': 'test@example.com',
        'password': 'password123',
    })
    assert res.status_code == 200
    return res.get_json()['access_token']
