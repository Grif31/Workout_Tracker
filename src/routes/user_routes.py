import os
from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename
from datetime import datetime
from models import Workout, db, User, DeviceToken
from flask_jwt_extended import  jwt_required, get_jwt_identity

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB

def _allowed(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

user_bp = Blueprint('user_bp', __name__)

@user_bp.get('/api/me')
@jwt_required()
def get_current_user():
    userId = get_jwt_identity()
    user = User.query.filter_by(id=userId).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
    workouts = Workout.query.filter_by(user_id=userId).all()
    return jsonify({
        **user.to_dict(),
        'workouts': [{'id': w.id, 'name': w.name, 'date': w.date.isoformat(), 'notes': w.notes} for w in workouts],
    }), 200

@user_bp.patch('/api/me')
@jwt_required()
def update_user_info():
    userId = get_jwt_identity()
    user = User.query.filter_by(id=userId).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
    data = request.get_json()
    if "name" in data:
        user.name = data["name"].strip() or None
    if "bio" in data:
        user.bio = data["bio"].strip() or None
    if "profile_pic_url" in data:
        user.profile_pic_url = data["profile_pic_url"]
    if "bodyweight" in data:
        user.bodyweight = float(data["bodyweight"]) if data["bodyweight"] not in (None, '') else None
    if "height" in data:
        user.height = float(data["height"]) if data["height"] not in (None, '') else None
    if "weight_unit" in data:
        user.weight_unit = data["weight_unit"] if data["weight_unit"] in ('lbs', 'kg') else 'lbs'

    db.session.commit()
    return jsonify(user.to_dict()), 200

@user_bp.post('/api/me/avatar')
@jwt_required()
def upload_avatar():
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404

    if 'avatar' not in request.files:
        return jsonify({'message': 'No file provided'}), 400
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400
    if not _allowed(file.filename):
        return jsonify({'message': 'File type not allowed. Use jpg, png, or webp.'}), 400

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_AVATAR_BYTES:
        return jsonify({'message': 'File too large (max 5 MB)'}), 400

    avatars_dir = os.path.join(current_app.static_folder, 'avatars')
    os.makedirs(avatars_dir, exist_ok=True)

    ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
    filename = f'{user_id}.{ext}'

    # Remove any old avatar with a different extension
    for old_ext in ALLOWED_EXTENSIONS - {ext}:
        old_path = os.path.join(avatars_dir, f'{user_id}.{old_ext}')
        if os.path.exists(old_path):
            os.remove(old_path)

    file.save(os.path.join(avatars_dir, filename))

    relative_path = f'/static/avatars/{filename}'
    user.profile_pic_url = relative_path
    db.session.commit()

    avatar_url = f'{request.host_url.rstrip("/")}{relative_path}'
    return jsonify({'avatar_url': avatar_url}), 200


@user_bp.post('/api/me/device-token')
@jwt_required()
def register_device_token():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    token = data.get('token')
    platform = data.get('platform', 'unknown')
    if not token:
        return jsonify({'message': 'token required'}), 400
    existing = DeviceToken.query.filter_by(user_id=user_id).first()
    if existing:
        existing.token = token
        existing.platform = platform
        existing.updated_at = datetime.now()
    else:
        db.session.add(DeviceToken(user_id=user_id, token=token, platform=platform))
    db.session.commit()
    return jsonify({'message': 'ok'}), 200


@user_bp.delete('/api/me/device-token')
@jwt_required()
def deregister_device_token():
    user_id = get_jwt_identity()
    DeviceToken.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({'message': 'ok'}), 200
