from flask import Blueprint, request, jsonify
from models import db, Workout, Set, Exercise
from flask_jwt_extended import  jwt_required, get_jwt_identity

workout_bp = Blueprint('workout_bp', __name__)


# Get all workouts for current user
@workout_bp.get('/api/workouts')
@jwt_required()
def get_workouts():
    try:
        current_user_id = get_jwt_identity()
        workouts = Workout.query.filter_by(user_id=current_user_id).all()
        
        return jsonify({workouts}), 200
    
    except Exception as e:
        print(f"Error {e}")
        return jsonify({'message':'Internal Server Error'}), 500

@workout_bp.get('/api/workouts/recent')
@jwt_required()
def get_recent_workouts():
    current_user_id = get_jwt_identity()
    workouts = Workout.query.filter_by(user_id=current_user_id).order_by(Workout.date.desc()).limit(3).all()
    
    return jsonify([
        {
            'id': w.id,
            'name': w.name,
            'date': w.date.isoformat(),
            'notes': w.notes
        } for w in workouts
    ]), 200

@workout_bp.get('/api/workouts/<int:workout_id>')
@jwt_required()
def get_workout_details(workout_id):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workout_id).first()
    return jsonify({
        'id': workout.id, 
        'name': workout.name,
        'notes': workout.notes,
        'date': workout.date.isoformat(),
        'exercises': [
            {
                'id': ex.id,
                'name': ex.name,
                'sets': [{'reps': s.reps, 'weight':s.weight} for s in ex.sets] 
            }
            for ex in workout.exercises]    
    }), 200

@workout_bp.post('/api/workouts')
@jwt_required()
def add_workout():
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        name = data.get('name')
        notes = data.get('notes')
        exercises = data.get('exercises', [])
        
        if not name:
            return jsonify({'message': 'Name required'}),400
        
        new_workout = Workout(user_id=current_user_id, name=name, notes=notes)
        db.session.add(new_workout)
        db.session.flush()
        
        for ex in exercises:
            new_ex = Exercise(workout_id=new_workout.id, name=ex['name'])
            db.session.add(new_ex)
            db.session.flush()
            
            for s in ex.get('sets', []):
                new_set = Set(exercise_id=new_ex.id, reps=s['reps'], weight=s['weight'])
                db.session.add(new_set)
        db.session.commit()
                
        return jsonify({'message': 'New Workout Added'}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error {e}")
        return jsonify({'message':'Internal Server Error'}), 500
    