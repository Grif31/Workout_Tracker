import hashlib
import json
import os
import secrets
import threading
import requests as http_requests
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify, current_app, g
from models import db, User
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required, get_jwt_identity,
)
from limiter import limiter
from schemas import SignupSchema, ResetPasswordSchema, ChangePasswordSchema
from utils.validation import validate_body

auth_bp = Blueprint('auth_bp', __name__)

_signup_schema          = SignupSchema()
_reset_password_schema  = ResetPasswordSchema()
_change_password_schema = ChangePasswordSchema()


@auth_bp.route('/api/login', methods=['POST'])
@limiter.limit('10 per minute')
def login():
    data = request.get_json()
    # Accept either 'identifier' (new clients) or 'email' (backwards compat)
    identifier = data.get('identifier') or data.get('email', '')
    password = data.get('password', '')

    user = User.query.filter(
        (User.email == identifier) | (User.username == identifier)
    ).first()

    if user and check_password_hash(user.password, password):
        access  = create_access_token(identity=str(user.id))
        refresh = create_refresh_token(identity=str(user.id))
        return jsonify({'access_token': access, 'refresh_token': refresh, **user.to_dict()}), 200
    return jsonify({'message': 'Invalid credentials'}), 401


@auth_bp.post('/api/signup')
@limiter.limit('5 per minute')
@validate_body(_signup_schema)
def signup():
    try:
        data = g.validated
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

        access  = create_access_token(identity=str(new_user.id))
        refresh = create_refresh_token(identity=str(new_user.id))
        return jsonify({'user': new_user.to_dict(), 'token': access, 'access_token': access, 'refresh_token': refresh}), 201
    except Exception:
        db.session.rollback()
        current_app.logger.exception('Signup failed')
        return jsonify({'message': 'Internal server error'}), 500


@auth_bp.post('/api/refresh')
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()
    new_access  = create_access_token(identity=user_id)
    new_refresh = create_refresh_token(identity=user_id)
    return jsonify({'access_token': new_access, 'refresh_token': new_refresh}), 200


@auth_bp.post('/api/forgot-password')
@limiter.limit('5 per hour')
def forgot_password():
    data  = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    # Always return the same message to prevent email enumeration
    SAFE  = jsonify({'message': 'If that email is registered, a code has been sent.'}), 200
    if not email:
        return SAFE
    user = User.query.filter_by(email=email).first()
    if not user:
        return SAFE
    raw_otp = str(secrets.randbelow(900000) + 100000)  # always 6 digits: 100000–999999
    user.reset_otp_hash     = hashlib.sha256(raw_otp.encode()).hexdigest()
    user.reset_otp_expiry   = datetime.now(timezone.utc) + timedelta(minutes=15)
    user.reset_otp_attempts = 0
    db.session.commit()
    _send_otp_email(user.email, raw_otp)
    return SAFE


@auth_bp.post('/api/verify-otp')
@limiter.limit('10 per hour')
def verify_otp():
    """Check an OTP is valid without consuming it or changing the password."""
    data  = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    otp   = str(data.get('otp', '')).strip()
    if not email or not otp:
        return jsonify({'message': 'Email and code are required.'}), 400
    user    = User.query.filter_by(email=email).first()
    INVALID = jsonify({'message': 'Invalid or expired code.'}), 400
    if not user or not user.reset_otp_hash or not user.reset_otp_expiry:
        return INVALID
    if datetime.now(timezone.utc) > user.reset_otp_expiry.replace(tzinfo=timezone.utc):
        user.reset_otp_hash = user.reset_otp_expiry = None
        user.reset_otp_attempts = 0
        db.session.commit()
        return INVALID
    if (user.reset_otp_attempts or 0) >= 5:
        user.reset_otp_hash = user.reset_otp_expiry = None
        user.reset_otp_attempts = 0
        db.session.commit()
        return INVALID
    if not secrets.compare_digest(hashlib.sha256(otp.encode()).hexdigest(), user.reset_otp_hash):
        user.reset_otp_attempts = (user.reset_otp_attempts or 0) + 1
        db.session.commit()
        return INVALID
    return jsonify({'message': 'Code verified.'}), 200


@auth_bp.post('/api/reset-password')
@limiter.limit('10 per hour')
@validate_body(_reset_password_schema)
def reset_password():
    data         = g.validated
    email        = data.get('email', '').strip().lower()
    otp          = str(data.get('otp', '')).strip()
    new_password = data.get('new_password', '')
    if not email or not otp or not new_password:
        return jsonify({'message': 'Email, code, and new password are required.'}), 400
    if len(new_password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters.'}), 400
    user = User.query.filter_by(email=email).first()
    INVALID = jsonify({'message': 'Invalid or expired code.'}), 400

    def _clear_otp():
        user.reset_otp_hash     = None
        user.reset_otp_expiry   = None
        user.reset_otp_attempts = 0
        db.session.commit()

    if not user or not user.reset_otp_hash or not user.reset_otp_expiry:
        return INVALID
    if datetime.now(timezone.utc) > user.reset_otp_expiry.replace(tzinfo=timezone.utc):
        _clear_otp()
        return INVALID
    # Lock out after 5 wrong attempts — attacker must request a fresh OTP
    if (user.reset_otp_attempts or 0) >= 5:
        _clear_otp()
        return INVALID
    if not secrets.compare_digest(hashlib.sha256(otp.encode()).hexdigest(), user.reset_otp_hash):
        user.reset_otp_attempts = (user.reset_otp_attempts or 0) + 1
        db.session.commit()
        return INVALID
    user.password       = generate_password_hash(new_password, method='pbkdf2:sha256')
    user.is_social_only = False
    _clear_otp()
    return jsonify({'message': 'Password reset successfully.'}), 200


@auth_bp.post('/api/me/change-password')
@jwt_required()
@limiter.limit('10 per hour')
@validate_body(_change_password_schema)
def change_password():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'message': 'User not found.'}), 404
    if user.is_social_only:
        return jsonify({'message': 'Your account uses social sign-in. Use Forgot Password to set a password.'}), 400
    data       = g.validated
    current_pw = data.get('current_password', '')
    new_pw     = data.get('new_password', '')
    confirm_pw = data.get('confirm_password', '')
    if not current_pw or not new_pw or not confirm_pw:
        return jsonify({'message': 'All fields are required.'}), 400
    if new_pw != confirm_pw:
        return jsonify({'message': 'New passwords do not match.'}), 400
    if len(new_pw) < 6:
        return jsonify({'message': 'Password must be at least 6 characters.'}), 400
    if not check_password_hash(user.password, current_pw):
        return jsonify({'message': 'Current password is incorrect.'}), 400
    if current_pw == new_pw:
        return jsonify({'message': 'New password must differ from your current password.'}), 400
    user.password = generate_password_hash(new_pw, method='pbkdf2:sha256')
    db.session.commit()
    return jsonify({'message': 'Password changed successfully.'}), 200


@auth_bp.post('/api/auth/social')
@limiter.limit('20 per hour')
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
        current_app.logger.exception('Social token verification failed')
        return jsonify({'message': 'Could not verify social token'}), 401

    if not email:
        return jsonify({'message': 'Could not retrieve email from provider. Try email/password login.'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # Create a new account for this social identity
        base = email.split('@')[0]
        username = _unique_username(base)
        hashed = generate_password_hash(secrets.token_hex(32), method='pbkdf2:sha256')
        user = User(email=email, username=username, password=hashed, name=display_name, is_social_only=True)
        db.session.add(user)
        db.session.commit()

    access  = create_access_token(identity=str(user.id))
    refresh = create_refresh_token(identity=str(user.id))
    return jsonify({'access_token': access, 'refresh_token': refresh, **user.to_dict()}), 200


# ── helpers ───────────────────────────────────────────────────────────────────

def _send_otp_email(recipient: str, otp: str) -> None:
    # Sent via Resend's HTTPS API — Railway blocks outbound SMTP ports, so
    # Flask-Mail/smtplib times out in production.
    # Fire-and-forget in a daemon thread so the route returns immediately.
    app = current_app._get_current_object()
    api_key = os.environ.get('RESEND_API_KEY', '')
    sender  = os.environ.get('RESEND_FROM', 'Arete Fitness <support@aretefitnessapp.com>')
    if not api_key:
        app.logger.error('RESEND_API_KEY not set — OTP email not sent to %s', recipient)
        return

    def _send() -> None:
        html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0D0D0D;font-family:-apple-system,sans-serif;">
  <table width="100%" style="background:#0D0D0D;padding:40px 0;"><tr><td align="center">
  <table width="480" style="background:#1C1C1E;border-radius:16px;border:1px solid #2C2C2E;">
    <tr><td style="padding:32px 40px 0;text-align:center;">
      <p style="font-size:12px;color:#8E8E93;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Arete Fitness</p>
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 8px;">Password Reset Code</h1>
      <p style="color:#8E8E93;font-size:15px;margin:0;">Enter this code in the app to reset your password.</p>
    </td></tr>
    <tr><td style="padding:32px 40px;text-align:center;">
      <div style="background:#0D0D0D;border-radius:12px;border:1px solid #2C2C2E;display:inline-block;padding:20px 48px;">
        <span style="font-size:40px;font-weight:700;color:#30D158;letter-spacing:10px;">{otp}</span>
      </div>
      <p style="color:#8E8E93;font-size:13px;margin:16px 0 0;">Expires in <strong style="color:#fff;">15 minutes</strong></p>
    </td></tr>
    <tr><td style="border-top:1px solid #2C2C2E;padding:20px 40px;text-align:center;">
      <p style="color:#636366;font-size:12px;margin:0;">If you didn&#39;t request this, ignore this email.</p>
      <p style="color:#636366;font-size:12px;margin:6px 0 0;">
        <a href="mailto:support@aretefitnessapp.com" style="color:#30D158;">support@aretefitnessapp.com</a>
      </p>
    </td></tr>
  </table></td></tr></table>
</body></html>"""
        plain = (
            f"Your Arete Fitness reset code: {otp}\n\n"
            f"Expires in 15 minutes.\n"
            f"If you didn't request this, ignore this email."
        )
        try:
            resp = http_requests.post(
                'https://api.resend.com/emails',
                headers={'Authorization': f'Bearer {api_key}'},
                json={
                    'from': sender,
                    'to': [recipient],
                    'subject': 'Your Arete Fitness reset code',
                    'html': html,
                    'text': plain,
                },
                timeout=15,
            )
            if resp.status_code >= 400:
                app.logger.error(
                    'OTP email send failed for %s: HTTP %s %s',
                    recipient, resp.status_code, resp.text,
                )
        except Exception:
            app.logger.exception('OTP email send failed for %s', recipient)

    threading.Thread(target=_send, daemon=True).start()



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
    # Fail closed: without the expected audience we cannot tell our app's
    # tokens from any other app's — never skip the check.
    bundle_id = os.environ.get('APPLE_BUNDLE_ID', '')
    if not bundle_id:
        raise ValueError('Apple Sign-In is not configured (APPLE_BUNDLE_ID missing)')

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
        payload = pyjwt.decode(
            identity_token,
            public_key,
            algorithms=['RS256'],
            audience=bundle_id,
            issuer='https://appleid.apple.com',
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
