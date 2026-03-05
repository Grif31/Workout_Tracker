from flask import Blueprint, request, jsonify
from models import db, Routine, RoutineDay, WorkoutTemplate, ExerciseTemplate
from flask_jwt_extended import jwt_required, get_jwt_identity

routine_bp = Blueprint('routine_bp', __name__)


@routine_bp.post('/api/routines')
@jwt_required()
def create_routine():
    data = request.get_json()
    user_id = get_jwt_identity()

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'message': 'Name is required'}), 400

    days_data = data.get('days', [])
    if not days_data:
        return jsonify({'message': 'At least one day is required'}), 400

    routine = Routine(user_id=user_id, name=name, description=data.get('description'))
    db.session.add(routine)
    db.session.flush()  # get routine.id before adding days

    for order, day in enumerate(days_data):
        label = day.get('label') or f'Day {order + 1}'
        # Each day becomes its own WorkoutTemplate
        template = WorkoutTemplate(user_id=user_id, name=f"{name} - {label}")
        for ex_id in day.get('exercise_template_ids', []):
            ex = ExerciseTemplate.query.get(ex_id)
            if ex:
                template.exercises.append(ex)
        db.session.add(template)
        db.session.flush()

        routine_day = RoutineDay(
            routine_id=routine.id,
            workout_template_id=template.id,
            day_order=order,
            label=label,
        )
        db.session.add(routine_day)

    db.session.commit()
    return jsonify(routine.to_dict(include_days=True)), 201


@routine_bp.get('/api/routines')
@jwt_required()
def list_routines():
    user_id = get_jwt_identity()
    routines = Routine.query.filter_by(user_id=user_id).all()
    return jsonify([r.to_dict() for r in routines])


@routine_bp.get('/api/routines/<int:routine_id>')
@jwt_required()
def get_routine(routine_id):
    user_id = get_jwt_identity()
    routine = Routine.query.filter_by(id=routine_id, user_id=user_id).first()
    if not routine:
        return jsonify({'message': 'Not found'}), 404
    return jsonify(routine.to_dict(include_days=True))


@routine_bp.patch('/api/routines/<int:routine_id>')
@jwt_required()
def update_routine(routine_id):
    user_id = get_jwt_identity()
    routine = Routine.query.filter_by(id=routine_id, user_id=user_id).first()
    if not routine:
        return jsonify({'message': 'Not found'}), 404

    data = request.get_json()
    if 'name' in data:
        routine.name = data['name'].strip() or routine.name
    if 'description' in data:
        routine.description = data['description']

    db.session.commit()
    return jsonify(routine.to_dict(include_days=True))


@routine_bp.delete('/api/routines/<int:routine_id>')
@jwt_required()
def delete_routine(routine_id):
    user_id = get_jwt_identity()
    routine = Routine.query.filter_by(id=routine_id, user_id=user_id).first()
    if not routine:
        return jsonify({'message': 'Not found'}), 404

    db.session.delete(routine)
    db.session.commit()
    return jsonify({'message': 'Routine deleted'}), 200
