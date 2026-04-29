from datetime import datetime
from flask import Blueprint, request, jsonify
from models import db, Workout, Set, Exercise, PersonalRecord, ExerciseTemplate
from flask_jwt_extended import  jwt_required, get_jwt_identity

workout_bp = Blueprint('workout_bp', __name__)


def _compute_and_upsert_prs(user_id, exercise_set_pairs):
    """Check if any sets in a workout beat existing personal records.

    exercise_set_pairs: list of (Exercise, list[Set])
    Returns a list of new PR dicts for exercises that set a new record.
    """
    new_prs = []
    for exercise, sets in exercise_set_pairs:
        if not exercise.exercise_template_id:
            continue
        valid = [(s.reps, s.weight, s.id) for s in sets if s.reps and s.weight]
        if not valid:
            continue

        workout_max_weight = max(w for _, w, _ in valid)
        workout_max_reps   = max(r for r, _, _ in valid)
        workout_max_1rm    = max(w * (1 + r / 30) for r, w, _ in valid)

        for pr_type, workout_value in [
            ('max_weight',    workout_max_weight),
            ('max_reps',      float(workout_max_reps)),
            ('estimated_1rm', workout_max_1rm),
        ]:
            existing = PersonalRecord.query.filter_by(
                user_id=user_id,
                exercise_template_id=exercise.exercise_template_id,
                pr_type=pr_type,
            ).first()

            if existing and workout_value <= existing.value:
                continue

            # Identify the set that produced this PR
            if pr_type == 'max_weight':
                pr_set_id = next((sid for _, w, sid in valid if w == workout_max_weight), None)
            elif pr_type == 'max_reps':
                pr_set_id = next((sid for r, _, sid in valid if r == workout_max_reps), None)
            else:
                pr_set_id = None

            if existing:
                existing.value       = round(workout_value, 1)
                existing.achieved_at = datetime.now()
                existing.set_id      = pr_set_id
            else:
                db.session.add(PersonalRecord(
                    user_id=user_id,
                    exercise_template_id=exercise.exercise_template_id,
                    pr_type=pr_type,
                    value=round(workout_value, 1),
                    achieved_at=datetime.now(),
                    set_id=pr_set_id,
                ))

            new_prs.append({
                'exercise_name': exercise.name,
                'pr_type': pr_type,
                'value': round(workout_value, 1),
            })

    return new_prs


# Get all workouts for current user
@workout_bp.get('/api/workouts')
@jwt_required()
def get_workouts():
    try:
        current_user_id = get_jwt_identity()
        include_exercises = request.args.get('include_exercises', 'false').lower() == 'true'
        date_filter = request.args.get('date')  # optional YYYY-MM-DD

        query = Workout.query.filter_by(user_id=current_user_id)
        if date_filter:
            from datetime import date as date_type
            try:
                target = date_type.fromisoformat(date_filter)
                query = query.filter(db.func.date(Workout.date) == target)
            except ValueError:
                return jsonify({'message': 'Invalid date format, use YYYY-MM-DD'}), 400

        workouts = query.order_by(Workout.date.desc()).all()
        return jsonify([w.to_dict(include_exercises=include_exercises) for w in workouts]), 200

    except Exception as e:
        print(f"Error {e}")
        return jsonify({'message': 'Internal Server Error'}), 500

# GET LAST 3 WORKOUTS

@workout_bp.get('/api/workouts/recent')
@jwt_required()
def get_recent_workouts():
    current_user_id = get_jwt_identity()
    workouts = Workout.query.filter_by(user_id=current_user_id).order_by(Workout.date.desc()).limit(5).all()

    result = []
    for w in workouts:
        total_reps = 0
        total_volume = 0.0
        muscles = []
        set_ids = []

        for ex in w.exercises:
            # muscle group via ExerciseTemplate if linked
            if ex.exercise_template_id:
                tmpl = ExerciseTemplate.query.get(ex.exercise_template_id)
                if tmpl and tmpl.muscle_group and tmpl.muscle_group not in muscles:
                    muscles.append(tmpl.muscle_group)
            for s in ex.sets:
                set_ids.append(s.id)
                if s.reps:
                    total_reps += s.reps
                if s.reps and s.weight:
                    total_volume += s.reps * s.weight

        pr_count = PersonalRecord.query.filter(
            PersonalRecord.set_id.in_(set_ids)
        ).count() if set_ids else 0

        data = w.to_dict()
        data['total_reps'] = total_reps
        data['volume'] = round(total_volume)
        data['num_exercises'] = len(w.exercises)
        data['muscles'] = muscles
        data['pr_count'] = pr_count
        result.append(data)

    return jsonify(result), 200

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
        duration = data.get('duration')
        
        if not name:
            return jsonify({'message': 'Name required'}),400
        
        new_workout = Workout(user_id=current_user_id, name=name, notes=notes)
        db.session.add(new_workout)
        db.session.flush()
        
        exercise_set_pairs = []
        for ex_index, ex in enumerate(exercises):
            new_ex = Exercise(
                workout_id=new_workout.id,
                name=ex['name'],
                exercise_template_id=ex.get('exercise_template_id'),
                order=ex.get('order', ex_index),
            )
            db.session.add(new_ex)
            db.session.flush()

            new_sets = []
            for set_index, s in enumerate(ex.get('sets', [])):
                new_set = Set(
                    exercise_id=new_ex.id,
                    reps=s['reps'],
                    weight=s['weight'],
                    order=s.get('order', set_index),
                    set_type=s.get('set_type', 'N'),
                )
                db.session.add(new_set)
                new_sets.append(new_set)
            db.session.flush()
            exercise_set_pairs.append((new_ex, new_sets))

        new_workout.calculate_volume()
        new_prs = _compute_and_upsert_prs(current_user_id, exercise_set_pairs)
        db.session.commit()

        return jsonify({'message': 'New Workout Added', 'new_prs': new_prs}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error {e}")
        return jsonify({'message':'Internal Server Error'}), 500
    
# DELETE WORKOUT    
    
@workout_bp.delete('/api/workouts/<int:workoutId>')
@jwt_required()
def delete_workout(workoutId):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workoutId).first()
    if not workout:
        return jsonify({'message': 'Workout not found'}), 404
    db.session.delete(workout)
    db.session.commit()
    return jsonify({"message": "Workout deleted"}), 200

    
# UPDATE WORKOUT    

@workout_bp.route('/api/workouts/<int:workout_id>', methods=['PUT', 'PATCH'])
@jwt_required()
def update_workout(workout_id):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workout_id).first()
    
    if not workout:
        return jsonify({'error': 'workout not found'}), 404
    
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
    if "duration" in data:
        workout.duration = data["duration"]


    
    if 'exercises' in data:
        exIds = {ex.id for ex in workout.exercises}
        newExIds = {ex.get('id') for ex in data['exercises'] if ex.get('id')}
        
        for ex in workout.exercises[:]:
            if ex.id not in newExIds:
                db.session.delete(ex)
            
        for ex_index, exData in enumerate(data['exercises']):
            exId = exData.get('id')
            if exId and exId in exIds: # update exercise if it exists
                ex = next(e for e in workout.exercises if e.id == exId)
                if "name" in exData:
                    ex.name = exData["name"]
                if "exercise_template_id" in exData:
                    ex.exercise_template_id = exData["exercise_template_id"]
                ex.order = exData.get('order', ex_index)

                setIds = {s.id for s in ex.sets}
                newSetIds = {s.get('id') for s in exData.get('sets', []) if s.get('id')}

                for s in ex.sets[:]:
                    if s.id not in newSetIds:
                        db.session.delete(s)

                for set_index, s_data in enumerate(exData.get("sets", [])):
                    s_id = s_data.get("id")
                    if s_id and s_id in setIds:
                        s = next(st for st in ex.sets if st.id == s_id)
                        if "reps" in s_data:
                            s.reps = s_data["reps"]
                        if "weight" in s_data:
                            s.weight = s_data["weight"]
                        if "set_type" in s_data:
                            s.set_type = s_data["set_type"]
                        s.order = s_data.get('order', set_index)
                    else:
                        ex.sets.append(Set(
                            reps=s_data["reps"],
                            weight=s_data["weight"],
                            order=s_data.get('order', set_index),
                            set_type=s_data.get('set_type', 'N'),
                        ))
            else:
                new_ex = Exercise(
                    name=exData["name"],
                    workout_id=workout_id,
                    exercise_template_id=exData.get('exercise_template_id'),
                    order=exData.get('order', ex_index),
                )
                for set_index, s in enumerate(exData.get("sets", [])):
                    new_ex.sets.append(Set(
                        reps=s["reps"],
                        weight=s["weight"],
                        order=s.get('order', set_index),
                        set_type=s.get('set_type', 'N'),
                    ))
                workout.exercises.append(new_ex) 
                        
    db.session.flush()
    db.session.expire(workout)
    workout.calculate_volume()
    db.session.commit()
    return jsonify(workout.to_dict(include_exercises=True)), 200
    
    