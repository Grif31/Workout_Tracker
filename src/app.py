from flask import Flask, redirect, render_template, url_for, request, jsonify
from models import db, User, Workout, ExerciseTemplate
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
        
#Get all Users from db
@app.route('/users')
def get_users():
    users = User.query.all()
    return jsonify([{'id': user.id, 'username': user.username} for user in users])

#Get all exercises from db
@app.get('/api/exercises')
def get_exercises():
    exercises = ExerciseTemplate.query.all()
    return jsonify([{'id': exercise.id, 'name':exercise.name} for exercise in exercises])

# Add new workout to database
@app.post('/api/exercises')
def add_exercise():
    data = request.get_json()
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'message': 'Name Required'}), 400
    if ExerciseTemplate.query.filter_by(name=name).first():
        return jsonify({'message': 'Exercise Already Exists'}), 400
    
    new_exercise = ExerciseTemplate(name=name)
    db.session.add(new_exercise)
    db.session.commit()
    
    return jsonify({'message': 'New Exercise added'}), 201

    
@app.post('/api/workouts')
def add_workout():
    data = request.get_json()
    new_workout = Workout(user_id=data['user.id'], name=data['name'], notes=data.get('notes', ''))
    db.session.add(new_workout)
    db.session.commit()
    
    return jsonify({'message': 'New Workout Added'}), 201

@app.post('/api/login')
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    user = User.query.filter_by(email=email).first()

    if user and check_password_hash(user.password, password):
        return jsonify({'message': 'Login successfull'}), 200
    else:
        return jsonify({'message': 'Invalid Credentials'}), 401

@app.post('/api/signup')
def signup():
    try:
        data = request.get_json()
        print(data)
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

print("Registered routes:")
for rule in app.url_map.iter_rules():
    print(rule, rule.methods)


if __name__ == '__main__':
    app.run(debug=False, host="0.0.0.0")
