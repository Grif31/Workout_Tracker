from datetime import datetime
from flask import Blueprint, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, BodyweightLog, User
from schemas import BodyweightSchema
from utils.validation import validate_body

bodyweight_bp = Blueprint('bodyweight_bp', __name__)

_bodyweight_schema = BodyweightSchema()


@bodyweight_bp.get('/api/bodyweight')
@jwt_required()
def get_bodyweight_logs():
    user_id = get_jwt_identity()
    logs = (
        BodyweightLog.query
        .filter_by(user_id=user_id)
        .order_by(BodyweightLog.date.desc())
        .all()
    )
    return jsonify([log.to_dict() for log in logs])


@bodyweight_bp.post('/api/bodyweight')
@jwt_required()
@validate_body(_bodyweight_schema)
def log_bodyweight():
    user_id = get_jwt_identity()
    data = g.validated
    weight = data['weight']
    date_str = data.get('date')

    if weight <= 0:
        return jsonify({'message': 'A valid weight is required'}), 400

    date = datetime.fromisoformat(date_str) if date_str else datetime.now()
    entry = BodyweightLog(user_id=user_id, weight=float(weight), date=date)
    db.session.add(entry)

    # Keep User.bodyweight in sync with the most recent log entry
    latest = (
        BodyweightLog.query
        .filter_by(user_id=user_id)
        .order_by(BodyweightLog.date.desc())
        .first()
    )
    if latest is None or date >= latest.date:
        user = db.session.get(User, user_id)
        user.bodyweight = float(weight)

    db.session.commit()
    return jsonify(entry.to_dict()), 201


@bodyweight_bp.delete('/api/bodyweight/<int:entry_id>')
@jwt_required()
def delete_bodyweight(entry_id):
    user_id = get_jwt_identity()
    entry = BodyweightLog.query.filter_by(id=entry_id, user_id=user_id).first()
    if not entry:
        return jsonify({'message': 'Entry not found'}), 404

    db.session.delete(entry)
    db.session.flush()

    # After deletion, sync User.bodyweight to the new most recent entry
    latest = (
        BodyweightLog.query
        .filter_by(user_id=user_id)
        .order_by(BodyweightLog.date.desc())
        .first()
    )
    user = db.session.get(User, user_id)
    user.bodyweight = latest.weight if latest else None

    db.session.commit()
    return jsonify({'message': 'Entry deleted'}), 200
