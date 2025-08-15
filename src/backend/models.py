from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column
    username = db.Column
    password = db.Column
    workouts = db.Column

class Workouts(db.Model):
    __tablename__ = "workouts"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column
    date = db.Column
    notes = db.Column
    exercises = db.Column
    
class Exercise(db.Model):
    __tablename__ = "exercises"
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column 
    name = db.Column 
    reps = db.Column 
    sets = db.Column 
    weight = db.Column 
    duration = db.Column 
    
    
    
    