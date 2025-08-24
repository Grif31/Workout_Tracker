from models import db, ExerciseTemplate
from flask import Blueprint, request, jsonify

exercise_bp = Blueprint('exercise_bp', __name__)


#Get all exercises from db
@exercise_bp.get('/api/exercises')
def get_exercises():
    exercises = ExerciseTemplate.query.all()
    return jsonify([{'id': exercise.id, 'name':exercise.name} for exercise in exercises])

# Add new workout to database
@exercise_bp.post('/api/exercises')
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

