from models import db, ExerciseTemplate, ExerciseMuscleMapping
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required
from sqlalchemy.orm import subqueryload
from schemas import ExerciseSchema
from utils.validation import validate_body

exercise_bp = Blueprint('exercise_bp', __name__)

_exercise_schema = ExerciseSchema()


def exercise_to_dict(exercise):
    return {
        'id': exercise.id,
        'name': exercise.name,
        'muscle_group': exercise.muscle_group,  # assembled from muscle_mappings by the property
        'equipment': exercise.equipment,
        'image_url': exercise.image_url,
        'exercise_type': (exercise.exercise_type or 'strength').lower(),
    }


@exercise_bp.get('/api/exercises')
@jwt_required()
def get_exercises():
    equipment = request.args.get('equipment')
    muscle = request.args.get('muscle_group')

    # subqueryload avoids N+1 without conflicting with the optional JOIN filter below
    query = ExerciseTemplate.query.options(subqueryload(ExerciseTemplate.muscle_mappings))

    if equipment:
        query = query.filter_by(equipment=equipment)
    if muscle:
        query = query.join(
            ExerciseMuscleMapping,
            ExerciseMuscleMapping.exercise_template_id == ExerciseTemplate.id,
        ).filter(ExerciseMuscleMapping.muscle_group == muscle)

    return jsonify([exercise_to_dict(e) for e in query.order_by(ExerciseTemplate.name).all()])


@exercise_bp.post('/api/exercises')
@jwt_required()
@validate_body(_exercise_schema)
def add_exercise():
    data = g.validated
    name = data.get('name', '').strip()
    muscle = data.get('muscle_group')
    equipment = data.get('equipment')
    exercise_type = data.get('exercise_type', 'strength')

    if not name:
        return jsonify({'message': 'Name Required'}), 400
    if ExerciseTemplate.query.filter_by(name=name, equipment=equipment).first():
        return jsonify({'message': 'Exercise Already Exists'}), 400

    new_exercise = ExerciseTemplate(name=name, equipment=equipment, exercise_type=exercise_type)
    db.session.add(new_exercise)
    db.session.flush()  # populate new_exercise.id before adding mappings

    if muscle:
        parts = [p.strip() for p in str(muscle).split(',') if p.strip()]
        for i, mg in enumerate(parts):
            db.session.add(ExerciseMuscleMapping(
                exercise_template_id=new_exercise.id,
                muscle_group=mg,
                is_primary=(i == 0),
            ))

    db.session.commit()
    return jsonify({'message': 'New Exercise added', 'id': new_exercise.id}), 201
