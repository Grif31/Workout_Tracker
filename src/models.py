from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "user"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(250), unique=True, nullable=False)
    username = db.Column(db.String(250), unique =True, nullable=False)
    password = db.Column(db.String(250), nullable=False)
    name = db.Column(db.String(100))
    bio = db.Column(db.Text)
    profile_pic_url = db.Column(db.Text)
    workouts = db.relationship('Workout', backref='user', lazy=True)
    
    

class Workout(db.Model):
    __tablename__ = "workouts"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.now())
    name = db.Column(db.String(250))
    notes = db.Column(db.String(250))
    exercises = db.relationship('Exercise', backref='workouts', cascade="all, delete-orphan", lazy=True)
    
    def to_dict(self, include_exercises=False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "date": self.date.isoformat() if self.date else None,
            "notes": self.notes,
        }
        if include_exercises:
            data["exercises"] = [ex.to_dict(include_sets=True) for ex in self.exercises]
        return data


class Exercise(db.Model):
    __tablename__ = "exercises"
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column(db.Integer, db.ForeignKey('workouts.id'), nullable=False)
    name = db.Column (db.String(250), nullable=False)
    sets = db.relationship('Set', backref='exercises', cascade="all, delete-orphan", lazy=True)
    
    def to_dict(self, include_sets=False):
        data = {
            "id": self.id,
            "workout_id": self.workout_id,
            "name": self.name,
        }
        if include_sets:
            data["sets"] = [s.to_dict() for s in self.sets]
        return data

    
class ExerciseTemplate(db.Model):
    __tablename__ = "exerciseTemplates"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column (db.String(250), unique=True, nullable=False)
    muscle_group = db.Column(db.String(250), nullable=False)
        
class Set(db.Model):
    __tablename__ = "sets"
    id = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id'), nullable=False)
    reps = db.Column(db.Integer, nullable=False)
    weight = db.Column(db.Float, nullable=False)
    
    def to_dict(self):
        return {
            "id": self.id,
            "exercise_id": self.exercise_id,
            "reps": self.reps,
            "weight": self.weight,
        }

    
    
    
    