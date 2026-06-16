from flask import Blueprint, request, jsonify, g
from models import db, Routine, RoutineDay, WorkoutTemplate, ExerciseTemplate, User
from flask_jwt_extended import jwt_required, get_jwt_identity
from schemas import RoutineSchema
from utils.validation import validate_body

routine_bp = Blueprint('routine_bp', __name__)

_routine_schema = RoutineSchema()


@routine_bp.post('/api/routines')
@jwt_required()
@validate_body(_routine_schema)
def create_routine():
    data = g.validated
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

        existing_id = day.get('workout_template_id')
        if existing_id:
            template = WorkoutTemplate.query.filter_by(id=existing_id, user_id=user_id).first()
            if not template:
                return jsonify({'message': f'Template {existing_id} not found'}), 404
        else:
            ex_ids = day.get('exercise_template_ids', [])
            exercises = ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(ex_ids)).all() if ex_ids else []
            template = WorkoutTemplate(user_id=user_id, name=f"{name} - {label}", exercises=exercises)
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

    if 'days' in data:
        days_data = data['days']
        if not days_data:
            return jsonify({'message': 'At least one day is required'}), 400

        # Remove all existing days (cascade orphan delete handles RoutineDay rows)
        for day in list(routine.days):
            db.session.delete(day)
        db.session.flush()

        for order, day in enumerate(days_data):
            label = day.get('label') or f'Day {order + 1}'
            existing_id = day.get('workout_template_id')
            if existing_id:
                template = WorkoutTemplate.query.filter_by(id=existing_id, user_id=user_id).first()
                if not template:
                    return jsonify({'message': f'Template {existing_id} not found'}), 404
            else:
                ex_ids = day.get('exercise_template_ids', [])
                exercises = ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(ex_ids)).all() if ex_ids else []
                template = WorkoutTemplate(user_id=user_id, name=f"{routine.name} - {label}", exercises=exercises)
                db.session.add(template)
                db.session.flush()

            db.session.add(RoutineDay(
                routine_id=routine.id,
                workout_template_id=template.id,
                day_order=order,
                label=label,
            ))

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


@routine_bp.post('/api/routines/deactivate')
@jwt_required()
def deactivate_routine():
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id).first()
    user.active_routine_id = None
    db.session.commit()
    return jsonify(user.to_dict()), 200


@routine_bp.post('/api/routines/<int:routine_id>/activate')
@jwt_required()
def activate_routine(routine_id):
    user_id = get_jwt_identity()
    routine = Routine.query.filter_by(id=routine_id, user_id=user_id).first()
    if not routine:
        return jsonify({'message': 'Not found'}), 404
    user = User.query.filter_by(id=user_id).first()
    user.active_routine_id = routine_id
    db.session.commit()
    return jsonify(user.to_dict()), 200
