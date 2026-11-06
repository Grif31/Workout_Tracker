from flask import Blueprint, g, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import db, User
from schemas import AchievementsSeenSchema
from utils.achievements import achievements_payload, mark_seen
from utils.validation import validate_body

achievement_bp = Blueprint('achievement_bp', __name__)

_seen_schema = AchievementsSeenSchema()


# Free for every account on purpose: badges are a habit loop and cost nothing
# to compute, so there is no has_premium() check here (TODO §27).
@achievement_bp.get('/api/achievements')
@jwt_required()
def get_achievements():
    user = db.session.get(User, int(get_jwt_identity()))
    return jsonify({'message': 'ok', **achievements_payload(user)}), 200


@achievement_bp.post('/api/achievements/seen')
@jwt_required()
@validate_body(_seen_schema)
def post_achievements_seen():
    updated = mark_seen(int(get_jwt_identity()), g.validated.get('keys'))
    db.session.commit()
    return jsonify({'message': 'ok', 'updated': updated}), 200
