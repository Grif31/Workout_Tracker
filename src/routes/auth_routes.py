import json
import os
import secrets
import requests as http_requests
from flask import Blueprint, request, jsonify
from models import db, User
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import create_access_token

auth_bp = Blueprint('auth_bp', __name__)


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    # Accept either 'identifier' (new clients) or 'email' (backwards compat)
    identifier = data.get('identifier') or data.get('email', '')
    password = data.get('password', '')

    user = User.query.filter(
        (User.email == identifier) | (User.username == identifier)
    ).first()

    if user and check_password_hash(user.password, password):
        token = create_access_token(identity=str(user.id))
        return jsonify({'access_token': token, **user.to_dict()}), 200
    return jsonify({'message': 'Invalid credentials'}), 401


@auth_bp.post('/api/signup')
def signup():
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not username or not email or not password:
            return jsonify({'message': 'All fields required'}), 400
        if len(password) < 6:
            return jsonify({'message': 'Password must be at least 6 characters'}), 400
        if User.query.filter_by(email=email).first():
            return jsonify({'message': 'Email already in use'}), 400
        if User.query.filter_by(username=username).first():
            return jsonify({'message': 'Username taken'}), 400

        hashed = generate_password_hash(password, method='pbkdf2:sha256')
        new_user = User(email=email, username=username, password=hashed)
        db.session.add(new_user)
        db.session.commit()

        token = create_access_token(identity=str(new_user.id))
        return jsonify({'user': new_user.to_dict(), 'token': token, 'access_token': token}), 201
    except Exception:
        db.session.rollback()
        return jsonify({'message': 'Internal server error'}), 500


@auth_bp.post('/api/forgot-password')
def forgot_password():
    # Stub — always returns 200 (email delivery deferred)
    return jsonify({'message': 'If that email exists, a reset link has been sent.'}), 200


@auth_bp.post('/api/auth/social')
def social_auth():
    data = request.get_json()
    provider = data.get('provider')  # 'apple' | 'google' | 'facebook'
    token = data.get('token')

    if not provider or not token:
        return jsonify({'message': 'provider and token required'}), 400

    try:
        email, display_name = _extract_social_identity(provider, token)
    except ValueError as e:
        return jsonify({'message': str(e)}), 401
    except Exception:
        return jsonify({'message': 'Could not verify social token'}), 401

    if not email:
        return jsonify({'message': 'Could not retrieve email from provider. Try email/password login.'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # Create a new account for this social identity
        base = email.split('@')[0]
        username = _unique_username(base)
        hashed = generate_password_hash(secrets.token_hex(32), method='pbkdf2:sha256')
        user = User(email=email, username=username, password=hashed, name=display_name)
        db.session.add(user)
        db.session.commit()

    token_jwt = create_access_token(identity=str(user.id))
    return jsonify({'access_token': token_jwt, **user.to_dict()}), 200


# ── helpers ──────────────────────────────────────────────────────────────────

def _extract_social_identity(provider: str, token: str):
    """Return (email, display_name) for the given OAuth token."""
    if provider == 'google':
        resp = http_requests.get(
            'https://www.googleapis.com/userinfo/v2/me',
            headers={'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        if not resp.ok:
            raise ValueError('Google token invalid')
        info = resp.json()
        return info.get('email'), info.get('name')

    if provider == 'facebook':
        resp = http_requests.get(
            'https://graph.facebook.com/me',
            params={'fields': 'id,name,email', 'access_token': token},
            timeout=10,
        )
        if not resp.ok:
            raise ValueError('Facebook token invalid')
        info = resp.json()
        return info.get('email'), info.get('name')

    if provider == 'apple':
        return _verify_apple_token(token)

    raise ValueError(f'Unknown provider: {provider}')


def _verify_apple_token(identity_token: str):
    """Decode Apple identityToken JWT and return (email, name)."""
    try:
        import jwt as pyjwt
        from jwt.algorithms import RSAAlgorithm

        resp = http_requests.get('https://appleid.apple.com/auth/keys', timeout=10)
        keys = resp.json().get('keys', [])

        headers = pyjwt.get_unverified_header(identity_token)
        kid = headers.get('kid')
        key_data = next((k for k in keys if k['kid'] == kid), None)
        if not key_data:
            raise ValueError('Apple public key not found')

        public_key = RSAAlgorithm.from_jwk(json.dumps(key_data))
        bundle_id = os.environ.get('APPLE_BUNDLE_ID', '')
        options = {'verify_aud': bool(bundle_id)}
        payload = pyjwt.decode(
            identity_token,
            public_key,
            algorithms=['RS256'],
            audience=bundle_id or None,
            options=options,
        )
        return payload.get('email'), None
    except Exception as exc:
        raise ValueError(f'Apple token verification failed: {exc}') from exc


def _unique_username(base: str) -> str:
    """Return a unique username derived from base, appending numbers if needed."""
    candidate = base[:20]
    if not User.query.filter_by(username=candidate).first():
        return candidate
    for i in range(1, 1000):
        candidate = f'{base[:17]}{i}'
        if not User.query.filter_by(username=candidate).first():
            return candidate
    return f'{base[:10]}{secrets.token_hex(4)}'
