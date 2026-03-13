from flask import Blueprint, jsonify, request
from models import Workout, db, User
from flask_jwt_extended import  jwt_required, get_jwt_identity

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
