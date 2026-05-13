import os
import time
from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from models import db, BodyMeasurement, ProgressPhoto

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB

def _allowed(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

measurement_bp = Blueprint('measurement_bp', __name__)


@measurement_bp.get('/api/measurements')
@jwt_required()
def get_measurements():
    user_id = get_jwt_identity()
    entries = (
        BodyMeasurement.query
        .filter_by(user_id=user_id)
        .order_by(BodyMeasurement.date.desc())
        .all()
    )
    return jsonify([e.to_dict() for e in entries]), 200


@measurement_bp.post('/api/measurements')
@jwt_required()
def create_measurement():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    waist = data.get('waist')
    chest = data.get('chest')
    arms  = data.get('arms')
    legs  = data.get('legs')

    if all(v is None for v in [waist, chest, arms, legs]):
        return jsonify({'message': 'At least one measurement field required'}), 400

    entry = BodyMeasurement(
        user_id=user_id,
        waist=float(waist) if waist is not None else None,
        chest=float(chest) if chest is not None else None,
        arms=float(arms) if arms is not None else None,
        legs=float(legs) if legs is not None else None,
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@measurement_bp.delete('/api/measurements/<int:entry_id>')
@jwt_required()
def delete_measurement(entry_id):
    user_id = get_jwt_identity()
    entry = db.session.get(BodyMeasurement, entry_id)
    if not entry or str(entry.user_id) != str(user_id):
        return jsonify({'message': 'Not found'}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200


@measurement_bp.get('/api/progress-photos')
@jwt_required()
def get_progress_photos():
    user_id = get_jwt_identity()
    photos = (
        ProgressPhoto.query
        .filter_by(user_id=user_id)
        .order_by(ProgressPhoto.date.desc())
        .all()
    )
    return jsonify([p.to_dict() for p in photos]), 200


@measurement_bp.post('/api/progress-photos')
@jwt_required()
def upload_progress_photo():
    user_id = get_jwt_identity()

    if 'photo' not in request.files:
        return jsonify({'message': 'No file provided'}), 400
    file = request.files['photo']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400
    if not _allowed(file.filename):
        return jsonify({'message': 'File type not allowed. Use jpg, png, or webp.'}), 400

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_PHOTO_BYTES:
        return jsonify({'message': 'File too large (max 5 MB)'}), 400

    photos_dir = os.path.join(current_app.static_folder, 'progress_photos')
    os.makedirs(photos_dir, exist_ok=True)

    ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
    filename = f'{user_id}_{int(time.time() * 1000)}.{ext}'
    file.save(os.path.join(photos_dir, filename))

    host = request.host_url.rstrip('/')
    photo_url = f'{host}/static/progress_photos/{filename}'
    notes = request.form.get('notes', '').strip() or None

    photo = ProgressPhoto(user_id=user_id, photo_url=photo_url, notes=notes)
    db.session.add(photo)
    db.session.commit()
    return jsonify(photo.to_dict()), 201


@measurement_bp.delete('/api/progress-photos/<int:photo_id>')
@jwt_required()
def delete_progress_photo(photo_id):
    user_id = get_jwt_identity()
    photo = db.session.get(ProgressPhoto, photo_id)
    if not photo or str(photo.user_id) != str(user_id):
        return jsonify({'message': 'Not found'}), 404

    # Remove file from disk
    try:
        filename = photo.photo_url.split('/static/progress_photos/')[-1]
        file_path = os.path.join(current_app.static_folder, 'progress_photos', filename)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass

    db.session.delete(photo)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200
