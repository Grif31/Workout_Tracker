from models import db, ExerciseTemplate, ExerciseMuscleMapping
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
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
        'is_custom': exercise.user_id is not None,
    }


@exercise_bp.get('/api/exercises')
@jwt_required()
def get_exercises():
    user_id = int(get_jwt_identity())
    equipment = request.args.get('equipment')
    muscle = request.args.get('muscle_group')

    # Return global library exercises (user_id IS NULL) + this user's custom exercises
    query = (
        ExerciseTemplate.query
        .options(subqueryload(ExerciseTemplate.muscle_mappings))
        .filter(db.or_(ExerciseTemplate.user_id.is_(None), ExerciseTemplate.user_id == user_id))
    )

    if equipment:
        query = query.filter(ExerciseTemplate.equipment == equipment)
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
    user_id = int(get_jwt_identity())
    data = g.validated
    name = data.get('name', '').strip()
    muscle = data.get('muscle_group')
    equipment = data.get('equipment')
    exercise_type = data.get('exercise_type', 'strength')

    if not name:
        return jsonify({'message': 'Name Required'}), 400
    # Duplicate check: same name+equipment in global library or this user's customs
    duplicate = ExerciseTemplate.query.filter(
        ExerciseTemplate.name == name,
        ExerciseTemplate.equipment == equipment,
        db.or_(ExerciseTemplate.user_id.is_(None), ExerciseTemplate.user_id == user_id),
    ).first()
    if duplicate:
        return jsonify({'message': 'Exercise Already Exists'}), 400

    new_exercise = ExerciseTemplate(name=name, equipment=equipment, exercise_type=exercise_type, user_id=user_id)
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


@exercise_bp.delete('/api/exercises/<int:exercise_id>')
@jwt_required()
def delete_exercise(exercise_id):
    user_id = int(get_jwt_identity())
    exercise = ExerciseTemplate.query.filter_by(id=exercise_id).first()
    if not exercise:
        return jsonify({'message': 'Exercise not found'}), 404
    if exercise.user_id != user_id:
        return jsonify({'message': 'You can only delete your own exercises'}), 403
    db.session.delete(exercise)
    db.session.commit()
    return jsonify({'message': 'Exercise deleted'}), 200
