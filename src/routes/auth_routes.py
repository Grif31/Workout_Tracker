from flask import Blueprint, request, jsonify
from models import db, User
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import create_access_token

auth_bp = Blueprint('auth_bp', __name__)


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    user = User.query.filter_by(email=email).first()

    if user and check_password_hash(user.password, password):
        token = create_access_token(identity=str(user.id))
        return jsonify(access_token=token), 200
    else:
        return jsonify({'message': 'Invalid Credentials'}), 401

@auth_bp.post('/api/signup')
def signup():
    try:
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
    
        if not username or not email or not password:
            return jsonify({'message': 'all fields required'}), 400
        # Determines if email or username is taken
        if User.query.filter_by(email=email).first():
            return jsonify({'message': 'Email connected to another account'}), 400
        if User.query.filter_by(username=username).first():
            return jsonify({'message': 'Username Taken'}), 400
    
        hashed_password = generate_password_hash(password, method="pbkdf2:sha256")
    
        # create new user 
        new_user = User(email=email, username=username, password=hashed_password)
        db.session.add(new_user)
        db.session.commit()
    
        return jsonify({'message': 'User registered successfully'}), 201
    except Exception as e:
        # Log the error for debugging
        print(f"Signup error: {e}")
        return jsonify({'message': 'Internal server error'}), 500
