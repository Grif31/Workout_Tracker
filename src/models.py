from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(250), unique=True, nullable=False)
    username = db.Column(db.String(250), unique =True, nullable=False)
    password = db.Column(db.String(250), nullable=False)
    workouts = db.relationship('Workout', backref='user', lazy=True)

class Workout(db.Model):
    __tablename__ = "workouts"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.now())
    name = db.Column(db.String(250))
    notes = db.Column(db.String(250))
    exercises = db.relationship('Exercise', backref='workout', lazy=True)
    
class Exercise(db.Model):
    __tablename__ = "exercises"
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column(db.Integer, db.ForeignKey('workouts.id'), nullable=False)
    name = db.Column(db.String(250), nullable=False)
    reps = db.Column(db.Integer)
    sets = db.Column(db.Integer)
    weight = db.Column(db.Float) 
    duration = db.Column(db.Integer)
    notes = db.Column(db.String(250))
    
    
    
    