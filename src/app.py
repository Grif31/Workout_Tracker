from flask import Flask, redirect, render_template, url_for, request, jsonify
from models import db, User, Workout, Exercise
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
CORS(app)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///workout_tracker.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
#create database
with app.app_context():
    db.create_all()
    

@app.route('/users')
def get_users():
    users = User.query.all()
    return jsonify([{'id': user.id, 'username': user.username} for user in users])

@app.post('/workouts')
def add_workout():
    data = request.get_json()
    new_workout = Workout(user_id=data['user.id'], name=data['name'], notes=data.get('notes', ''))
    db.session.add(new_workout)
    db.session.commit()
    
    return jsonify({'message': 'New Workout Added'}), 201

@app.post('/login')
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    user = User.query.filter_by(email=email).first()

    if user and check_password_hash(user.password, password):
        return jsonify({'message': 'Login successfull'}), 200
    else:
        return jsonify({'message': 'Invalid Credentials'}), 401

@app.route('/register')
def register():
    data = request.get_json()
    email = data.get('email')
    username = data.get('username')
    password = data.get('password')
    
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
    
if __name__ == '__main__':
    app.run(debug=False)
