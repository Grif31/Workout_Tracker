from datetime import datetime
from flask import Blueprint, request, jsonify
from models import db, Workout, Set, Exercise, PersonalRecord, ExerciseTemplate
from flask_jwt_extended import  jwt_required, get_jwt_identity

workout_bp = Blueprint('workout_bp', __name__)


CARDIO_DISTANCE_MILESTONES = [
    (0.4,     '400m'),
    (0.8,     '800m'),
    (1.0,     '1K'),
    (1.60934, '1 Mile'),
    (5.0,     '5K'),
    (10.0,    '10K'),
    (21.0975, 'Half Marathon'),
    (42.195,  'Marathon'),
]

CARDIO_DURATION_MILESTONES = [
    (10.0,  '10 min'),
    (20.0,  '20 min'),
    (30.0,  '30 min'),
    (60.0,  '60 min'),
]


def _compute_and_upsert_cardio_prs(user_id, exercise_set_pairs):
    """Compute best_time and best_distance PRs for cardio exercises.

    best_time: weight_context = target distance km, value = time in minutes (lower is better)
    best_distance: weight_context = target duration min, value = distance km (higher is better)
    """
    new_prs = []
    for exercise, sets in exercise_set_pairs:
        if not exercise.exercise_template_id:
            continue
        bouts = []
        for s in sets:
            if s.distance and s.cardio_duration and s.distance > 0 and s.cardio_duration > 0:
                dist_km = s.distance if (s.distance_unit or 'km') == 'km' else s.distance * 1.60934
                bouts.append((dist_km, s.cardio_duration))
        if not bouts:
            continue

        for dist_km, duration in bouts:
            for target_km, label in CARDIO_DISTANCE_MILESTONES:
                if dist_km < target_km:
                    continue
                est_time = round(duration * (target_km / dist_km), 4)
                existing = PersonalRecord.query.filter_by(
                    user_id=user_id,
                    exercise_template_id=exercise.exercise_template_id,
                    pr_type='best_time',
                    weight_context=target_km,
                ).first()
                if existing and est_time >= existing.value:
                    continue
                if existing:
                    existing.value = est_time
                    existing.achieved_at = datetime.now()
                else:
                    db.session.add(PersonalRecord(
                        user_id=user_id,
                        exercise_template_id=exercise.exercise_template_id,
                        pr_type='best_time',
                        value=est_time,
                        achieved_at=datetime.now(),
                        weight_context=target_km,
                    ))
                new_prs.append({'exercise_name': exercise.name, 'pr_type': 'best_time',
                                'label': label, 'value': est_time})

            for target_min, label in CARDIO_DURATION_MILESTONES:
                if duration < target_min:
                    continue
                est_dist = round(dist_km * (target_min / duration), 4)
                existing = PersonalRecord.query.filter_by(
                    user_id=user_id,
                    exercise_template_id=exercise.exercise_template_id,
                    pr_type='best_distance',
                    weight_context=target_min,
                ).first()
                if existing and est_dist <= existing.value:
                    continue
                if existing:
                    existing.value = est_dist
                    existing.achieved_at = datetime.now()
                else:
                    db.session.add(PersonalRecord(
                        user_id=user_id,
                        exercise_template_id=exercise.exercise_template_id,
                        pr_type='best_distance',
                        value=est_dist,
                        achieved_at=datetime.now(),
                        weight_context=target_min,
                    ))
                new_prs.append({'exercise_name': exercise.name, 'pr_type': 'best_distance',
                                'label': label, 'value': est_dist})
    return new_prs


def _compute_and_upsert_prs(user_id, exercise_set_pairs):
    """Check if any sets in a workout beat existing personal records.

    exercise_set_pairs: list of (Exercise, list[Set])
    Returns a list of new PR dicts for exercises that set a new record.

    max_weight / estimated_1rm: one record per exercise (weight_context = -1).
    max_reps: one record per exercise PER WEIGHT (weight_context = the weight used).
    """
    new_prs = []
    for exercise, sets in exercise_set_pairs:
        if not exercise.exercise_template_id:
            continue
        valid = [(s.reps, s.weight, s.id) for s in sets if s.reps and s.weight]
        if not valid:
            continue

        workout_max_weight = max(w for _, w, _ in valid)
        workout_max_1rm    = max(w * (1 + r / 30) for r, w, _ in valid)

        # ── max_weight and estimated_1rm: single record per exercise ──────────
        for pr_type, workout_value, pr_set_id in [
            ('max_weight',    workout_max_weight,
             next((sid for _, w, sid in valid if w == workout_max_weight), None)),
            ('estimated_1rm', workout_max_1rm, None),
        ]:
            existing = PersonalRecord.query.filter_by(
                user_id=user_id,
                exercise_template_id=exercise.exercise_template_id,
                pr_type=pr_type,
                weight_context=-1.0,
            ).first()

            if existing and workout_value <= existing.value:
                continue

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
                    weight_context=-1.0,
                ))

            new_prs.append({
                'exercise_name': exercise.name,
                'pr_type': pr_type,
                'value': round(workout_value, 1),
            })

        # ── max_reps: one record per weight used in this workout ───────────────
        for weight in set(w for _, w, _ in valid):
            sets_at_weight = [(r, sid) for r, w, sid in valid if w == weight]
            best_reps = int(max(r for r, _ in sets_at_weight))
            pr_set_id = next(sid for r, sid in sets_at_weight if r == best_reps)

            existing = PersonalRecord.query.filter_by(
                user_id=user_id,
                exercise_template_id=exercise.exercise_template_id,
                pr_type='max_reps',
                weight_context=weight,
            ).first()

            if existing and best_reps <= existing.value:
                continue

            if existing:
                existing.value       = float(best_reps)
                existing.achieved_at = datetime.now()
                existing.set_id      = pr_set_id
            else:
                db.session.add(PersonalRecord(
                    user_id=user_id,
                    exercise_template_id=exercise.exercise_template_id,
                    pr_type='max_reps',
                    value=float(best_reps),
                    achieved_at=datetime.now(),
                    set_id=pr_set_id,
                    weight_context=weight,
                ))

            new_prs.append({
                'exercise_name': exercise.name,
                'pr_type': 'max_reps',
                'value': best_reps,
                'weight_context': weight,
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
                exercise_type=ex.get('exercise_type', 'strength'),
                route_polyline=ex.get('route_polyline'),
            )
            db.session.add(new_ex)
            db.session.flush()

            new_sets = []
            for set_index, s in enumerate(ex.get('sets', [])):
                new_set = Set(
                    exercise_id=new_ex.id,
                    reps=s.get('reps'),
                    weight=s.get('weight'),
                    order=s.get('order', set_index),
                    set_type=s.get('set_type', 'N'),
                    cardio_duration=s.get('cardio_duration'),
                    distance=s.get('distance'),
                    distance_unit=s.get('distance_unit'),
                    intensity=s.get('intensity'),
                )
                db.session.add(new_set)
                new_sets.append(new_set)
            db.session.flush()
            exercise_set_pairs.append((new_ex, new_sets))

        new_workout.calculate_volume()
        strength_pairs = [(ex, s) for ex, s in exercise_set_pairs if (ex.exercise_type or 'strength') == 'strength']
        cardio_pairs   = [(ex, s) for ex, s in exercise_set_pairs if (ex.exercise_type or 'strength') == 'cardio']
        new_prs = _compute_and_upsert_prs(current_user_id, strength_pairs)
        new_prs += _compute_and_upsert_cardio_prs(current_user_id, cardio_pairs)
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
                if "exercise_type" in exData:
                    ex.exercise_type = exData["exercise_type"]
                if "route_polyline" in exData:
                    ex.route_polyline = exData["route_polyline"]
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
                        if "cardio_duration" in s_data:
                            s.cardio_duration = s_data["cardio_duration"]
                        if "distance" in s_data:
                            s.distance = s_data["distance"]
                        if "distance_unit" in s_data:
                            s.distance_unit = s_data["distance_unit"]
                        if "intensity" in s_data:
                            s.intensity = s_data["intensity"]
                        s.order = s_data.get('order', set_index)
                    else:
                        ex.sets.append(Set(
                            reps=s_data.get("reps"),
                            weight=s_data.get("weight"),
                            order=s_data.get('order', set_index),
                            set_type=s_data.get('set_type', 'N'),
                            cardio_duration=s_data.get('cardio_duration'),
                            distance=s_data.get('distance'),
                            distance_unit=s_data.get('distance_unit'),
                            intensity=s_data.get('intensity'),
                        ))
            else:
                new_ex = Exercise(
                    name=exData["name"],
                    workout_id=workout_id,
                    exercise_template_id=exData.get('exercise_template_id'),
                    order=exData.get('order', ex_index),
                    exercise_type=exData.get('exercise_type', 'strength'),
                    route_polyline=exData.get('route_polyline'),
                )
                for set_index, s in enumerate(exData.get("sets", [])):
                    new_ex.sets.append(Set(
                        reps=s.get("reps"),
                        weight=s.get("weight"),
                        order=s.get('order', set_index),
                        set_type=s.get('set_type', 'N'),
                        cardio_duration=s.get('cardio_duration'),
                        distance=s.get('distance'),
                        distance_unit=s.get('distance_unit'),
                        intensity=s.get('intensity'),
                    ))
                workout.exercises.append(new_ex)
                        
    db.session.flush()
    db.session.expire(workout)
    workout.calculate_volume()
    db.session.commit()
    return jsonify(workout.to_dict(include_exercises=True)), 200
    
    