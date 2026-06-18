from flask import Blueprint, request, jsonify, g
from models import db, WorkoutTemplate, WorkoutTemplateExercise, ExerciseTemplate
from flask_jwt_extended import jwt_required, get_jwt_identity
from schemas import WorkoutTemplateSchema
from utils.validation import validate_body

workout_template_bp = Blueprint('workout_template_bp', __name__)

_workout_template_schema = WorkoutTemplateSchema()


@workout_template_bp.post('/api/workout-templates')
@jwt_required()
@validate_body(_workout_template_schema)
def create_workout_template():
    data = g.validated
    user_id = get_jwt_identity()

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'message': 'Name is required'}), 400

    ex_ids = data.get('exercise_template_ids', [])
    template = WorkoutTemplate(user_id=user_id, name=name)
    db.session.add(template)
    db.session.flush()
    for i, ex_id in enumerate(ex_ids):
        db.session.add(WorkoutTemplateExercise(
            workout_template_id=template.id,
            exercise_template_id=ex_id,
            order=i,
        ))
    db.session.commit()
    return jsonify(template.to_dict(include_exercises=True)), 201


@workout_template_bp.get('/api/workout-templates')
@jwt_required()
def list_workout_templates():
    user_id = get_jwt_identity()
    templates = WorkoutTemplate.query.filter_by(user_id=user_id).all()
    return jsonify([t.to_dict(include_exercises=True) for t in templates])


@workout_template_bp.get('/api/workout-templates/<int:template_id>')
@jwt_required()
def get_workout_template(template_id):
    user_id = get_jwt_identity()
    template = WorkoutTemplate.query.filter_by(id=template_id, user_id=user_id).first()
    if not template:
        return jsonify({'message': 'Not found'}), 404
    return jsonify(template.to_dict(include_exercises=True))


@workout_template_bp.patch('/api/workout-templates/<int:template_id>')
@jwt_required()
def update_workout_template(template_id):
    user_id = get_jwt_identity()
    template = WorkoutTemplate.query.filter_by(id=template_id, user_id=user_id).first()
    if not template:
        return jsonify({'message': 'Not found'}), 404

    data = request.get_json()
    if 'name' in data:
        template.name = data['name'].strip() or template.name
    if 'exercise_template_ids' in data:
        ex_ids = data['exercise_template_ids']
        WorkoutTemplateExercise.query.filter_by(workout_template_id=template.id).delete()
        for i, ex_id in enumerate(ex_ids):
            db.session.add(WorkoutTemplateExercise(
                workout_template_id=template.id,
                exercise_template_id=ex_id,
                order=i,
            ))

    db.session.commit()
    return jsonify(template.to_dict(include_exercises=True))


@workout_template_bp.delete('/api/workout-templates/<int:template_id>')
@jwt_required()
def delete_workout_template(template_id):
    user_id = get_jwt_identity()
    template = WorkoutTemplate.query.filter_by(id=template_id, user_id=user_id).first()
    if not template:
        return jsonify({'message': 'Not found'}), 404

    from models import RoutineDay, Routine
    routine_day = RoutineDay.query.filter_by(workout_template_id=template_id).first()
    if routine_day:
        routine = Routine.query.get(routine_day.routine_id)
        routine_name = routine.name if routine else 'a routine'
        return jsonify({
            'message': f'This template is part of "{routine_name}". To delete it, remove it from the routine or delete the routine entirely.',
            'routine_id': routine_day.routine_id,
            'routine_name': routine_name,
        }), 409

    db.session.delete(template)
    db.session.commit()
    return jsonify({'message': 'Workout template deleted'}), 200
