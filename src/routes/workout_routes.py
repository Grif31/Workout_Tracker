from datetime import datetime
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
        
        return jsonify([ w.to_dict() for w in workouts]), 200
    
    except Exception as e:
        print(f"Error {e}")
        return jsonify({'message':'Internal Server Error'}), 500

# GET LAST 3 WORKOUTS

@workout_bp.get('/api/workouts/recent')
@jwt_required()
def get_recent_workouts():
    current_user_id = get_jwt_identity()
    workouts = Workout.query.filter_by(user_id=current_user_id).order_by(Workout.date.desc()).limit(3).all()
    
    return jsonify([w.to_dict() for w in workouts]), 200

# GET WORKOUT DETAILS

@workout_bp.get('/api/workouts/<int:workout_id>')
@jwt_required()
def get_workout_details(workout_id):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workout_id).first()
    return jsonify(workout.to_dict(include_exercises=True)), 200

# CREATE WORKOUT 

@workout_bp.post('/api/workouts')
@jwt_required()
def add_workout():
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        name = data.get('workoutName')
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
    
# DELETE WORKOUT    
    
@workout_bp.delete('/api/workouts/<int:workout_id>')
@jwt_required()
def delete_workout(workoutId):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workoutId).first()
    db.session.delete(workout)
    db.session.commit()
    
# UPDATE WORKOUT    

@workout_bp.route('/api/workouts/<int:workout_id>', methods=['PUT', 'PATCH'])
@jwt_required()
def update_workout(workout_id):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workout_id).first()
    
    if  not workout :
        return jsonify({'error', 'workout not found'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        workout.name = data['name']
    if 'date' in data: 
        try: 
            workout.date = datetime.strptime(data['date'], "%Y-%m-%d").date()

        except ValueError:
            return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400
    if 'notes' in data: 
        workout.notes = data['notes']
    
    if 'exercises' in data:
        exIds = {ex.id for ex in workout.exercises}
        newExIds = {ex.get('id') for ex in data['exercises'] if ex.get('id')}
        
        for ex in workout.exercises[:]:
            if ex.id not in newExIds:
                db.session.delete(ex)
            
        for exData in data['exercises']:
            exId = exData.get('id')
            if exId and exId in exIds: # update exercise if it exists 
                ex = next(e for e in workout.exercises if e.id == exId)
                if "name" in exData:
                    ex.name = exData["name"]
                
                setIds = {s.id for s in ex.sets}
                newSetIds = {s.get('id') for s in exData.get('sets', []) if s.get('id')}
                
                for s in ex.sets[:]:
                    if s.id not in newSetIds:
                        db.session.delete(s)
                        
                for s_data in exData.get("sets", []):
                    s_id = s_data.get("id")
                    if s_id and s_id in newExIds:
                        s = next(st for st in ex.sets if st.id == s_id)
                        if "reps" in s_data:
                            s.reps = s_data["reps"]
                        if "weight" in s_data:
                            s.weight = s_data["weight"]
                    else:
                        ex.sets.append(Set(reps=s_data["reps"], weight=s_data["weight"]))
            else:
                new_ex = Exercise(name=exData["name"], workout_id=workout_id)
                for s in exData.get("sets", []):
                    new_ex.sets.append(Set(reps=s["reps"], weight=s["weight"]))
                workout.exercises.append(new_ex)         
    
    db.session.commit()
    return jsonify(workout.to_dict(include_exercises=True)), 200
    
    