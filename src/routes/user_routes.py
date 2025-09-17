from flask import Blueprint, jsonify
from models import db, User
from flask_jwt_extended import  jwt_required, get_jwt_identity

user_bp = Blueprint('user_bp', __name__)

@user_bp.get('/api/me')
@jwt_required()
def get_current_user():
    userId = get_jwt_identity()
    user = User.query.filter_by(id=userId).first()
    if not user: 
        return jsonify({'message': 'User not found'}), 404
    return jsonify({'id': user.id, 'username': user.username, 'email': user.email}), 200
    
