from models import db, ExerciseTemplate
from flask import Blueprint, request, jsonify

exercise_bp = Blueprint('exercise_bp', __name__)


def exercise_to_dict(exercise):
    return {
        'id': exercise.id,
        'name': exercise.name,
        'muscle_group': exercise.muscle_group,
        'equipment': exercise.equipment,
        'image_url': exercise.image_url,
        'exercise_type': (exercise.exercise_type or 'strength').lower(),
    }


@exercise_bp.get('/api/exercises')
def get_exercises():
    equipment = request.args.get('equipment')
    muscle = request.args.get('muscle_group')
    query = ExerciseTemplate.query
    if equipment:
        query = query.filter_by(equipment=equipment)
    if muscle:
        query = query.filter_by(muscle_group=muscle)
    return jsonify([exercise_to_dict(e) for e in query.order_by(ExerciseTemplate.name).all()])


@exercise_bp.post('/api/exercises')
def add_exercise():
    data = request.get_json()
    name = data.get('name', '').strip()
    muscle = data.get('muscle_group')
    equipment = data.get('equipment')

    exercise_type = data.get('exercise_type', 'strength')

    if not name:
        return jsonify({'message': 'Name Required'}), 400
    if ExerciseTemplate.query.filter_by(name=name, equipment=equipment).first():
        return jsonify({'message': 'Exercise Already Exists'}), 400

    new_exercise = ExerciseTemplate(name=name, muscle_group=muscle, equipment=equipment,
                                    exercise_type=exercise_type)
    db.session.add(new_exercise)
    db.session.commit()

    return jsonify({'message': 'New Exercise added', 'id': new_exercise.id}), 201
