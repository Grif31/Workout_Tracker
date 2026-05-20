from flask import Blueprint, request, jsonify, g
from models import db, WorkoutTemplate, ExerciseTemplate
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
    exercises = ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(ex_ids)).all() if ex_ids else []
    template = WorkoutTemplate(user_id=user_id, name=name, exercises=exercises)
    db.session.add(template)
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
        template.exercises = ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(ex_ids)).all() if ex_ids else []

    db.session.commit()
    return jsonify(template.to_dict(include_exercises=True))


@workout_template_bp.delete('/api/workout-templates/<int:template_id>')
@jwt_required()
def delete_workout_template(template_id):
    user_id = get_jwt_identity()
    template = WorkoutTemplate.query.filter_by(id=template_id, user_id=user_id).first()
    if not template:
        return jsonify({'message': 'Not found'}), 404

    db.session.delete(template)
    db.session.commit()
    return jsonify({'message': 'Workout template deleted'}), 200
