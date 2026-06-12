import csv
from datetime import datetime
from io import StringIO
from flask import Blueprint, request, jsonify, current_app, g, make_response
from models import db, Workout, Set, Exercise, PersonalRecord, ExerciseTemplate, User
from sqlalchemy.orm import selectinload
from flask_jwt_extended import  jwt_required, get_jwt_identity
from schemas import WorkoutSchema, UpdateWorkoutSchema
from utils.validation import validate_body
from utils.strength_standards import epley_1rm

workout_bp = Blueprint('workout_bp', __name__)

_workout_schema        = WorkoutSchema()
_update_workout_schema = UpdateWorkoutSchema()


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


def _compute_and_upsert_cardio_prs(user_id, exercise_set_pairs, workout_date):
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
                    existing.achieved_at = workout_date
                else:
                    db.session.add(PersonalRecord(
                        user_id=user_id,
                        exercise_template_id=exercise.exercise_template_id,
                        pr_type='best_time',
                        value=est_time,
                        achieved_at=workout_date,
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
                    existing.achieved_at = workout_date
                else:
                    db.session.add(PersonalRecord(
                        user_id=user_id,
                        exercise_template_id=exercise.exercise_template_id,
                        pr_type='best_distance',
                        value=est_dist,
                        achieved_at=workout_date,
                        weight_context=target_min,
                    ))
                new_prs.append({'exercise_name': exercise.name, 'pr_type': 'best_distance',
                                'label': label, 'value': est_dist})
    return new_prs


def _compute_and_upsert_prs(user_id, exercise_set_pairs, workout_date):
    """Check if any sets in a workout beat existing personal records.

    exercise_set_pairs: list of (Exercise, list[Set])
    Returns a list of new PR dicts for exercises that set a new record.

    max_weight / estimated_1rm: one record per exercise (weight_context = -1).
    max_reps: one record per exercise PER WEIGHT (weight_context = the weight used).
    Weight-0 sets (bodyweight exercises) only produce max_reps records.
    """
    new_prs = []
    for exercise, sets in exercise_set_pairs:
        if not exercise.exercise_template_id:
            continue
        valid = [(s.reps, s.weight, s.id) for s in sets
                 if s.reps and s.weight is not None and s.set_type != 'W']
        if not valid:
            continue

        weighted = [(r, w, sid) for r, w, sid in valid if w > 0]
        epley_valid = [(r, w, sid) for r, w, sid in weighted if r <= 15]

        workout_max_weight = max((w for _, w, _ in weighted), default=None)
        workout_max_1rm    = max(epley_1rm(w, r) for r, w, _ in epley_valid) if epley_valid else None

        # ── max_weight and estimated_1rm: single record per exercise ──────────
        pr_candidates = []
        if workout_max_weight is not None:
            pr_candidates.append(
                ('max_weight', workout_max_weight,
                 next((sid for _, w, sid in weighted if w == workout_max_weight), None)),
            )
        if workout_max_1rm is not None:
            pr_candidates.append(('estimated_1rm', workout_max_1rm, None))

        for pr_type, workout_value, pr_set_id in pr_candidates:
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
                existing.achieved_at = workout_date
                existing.set_id      = pr_set_id
            else:
                db.session.add(PersonalRecord(
                    user_id=user_id,
                    exercise_template_id=exercise.exercise_template_id,
                    pr_type=pr_type,
                    value=round(workout_value, 1),
                    achieved_at=workout_date,
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
            if best_reps < 2:
                continue  # 1-rep sets are max_weight, not max_reps
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
                existing.achieved_at = workout_date
                existing.set_id      = pr_set_id
            else:
                db.session.add(PersonalRecord(
                    user_id=user_id,
                    exercise_template_id=exercise.exercise_template_id,
                    pr_type='max_reps',
                    value=float(best_reps),
                    achieved_at=workout_date,
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


def _recompute_prs_for_templates(user_id, template_ids):
    """Recompute PRs from scratch across all workouts for the given template IDs.
    Called after a workout is edited or deleted to correct stale PR values.
    Excludes warm-up sets. Uses actual workout date for achieved_at.
    """
    for template_id in (t for t in template_ids if t):
        rows = (
            db.session.query(Set, Workout.date)
            .join(Exercise, Set.exercise_id == Exercise.id)
            .join(Workout, Exercise.workout_id == Workout.id)
            .filter(
                Workout.user_id == user_id,
                Exercise.exercise_template_id == template_id,
                Set.reps.isnot(None),
                Set.weight.isnot(None),
                Set.set_type != 'W',
            )
            .all()
        )

        PersonalRecord.query.filter_by(
            user_id=user_id,
            exercise_template_id=template_id,
        ).delete()

        # Cardio PRs (best_time / best_distance) were just deleted too — rebuild
        # them from the remaining cardio exercises so an edit doesn't wipe them.
        cardio_rows = (
            db.session.query(Exercise, Workout.date)
            .join(Workout, Exercise.workout_id == Workout.id)
            .filter(
                Workout.user_id == user_id,
                Exercise.exercise_template_id == template_id,
                db.func.lower(Exercise.exercise_type) == 'cardio',
            )
            .all()
        )
        for exercise, wdate in cardio_rows:
            _compute_and_upsert_cardio_prs(user_id, [(exercise, exercise.sets)], wdate)

        if not rows:
            continue

        valid = [(s.reps, s.weight, s.id, wdate) for s, wdate in rows]

        # max_weight — weighted sets only; bodyweight (weight-0) sets get rep PRs below
        max_w = max((w for _, w, _, _ in valid if w > 0), default=None)
        if max_w is not None:
            mw_sid, mw_date = next((sid, d) for _, w, sid, d in valid if w == max_w)
            db.session.add(PersonalRecord(
                user_id=user_id, exercise_template_id=template_id,
                pr_type='max_weight', value=round(max_w, 1),
                weight_context=-1.0, achieved_at=mw_date, set_id=mw_sid,
            ))

        # estimated_1rm (≤15 reps, weighted sets only)
        epley = [(r, w, sid, d) for r, w, sid, d in valid if r <= 15 and w > 0]
        if epley:
            best_1rm = max(epley_1rm(w, r) for r, w, _, _ in epley)
            e_sid, e_date = next(
                (sid, d) for r, w, sid, d in epley
                if abs(epley_1rm(w, r) - best_1rm) < 0.01
            )
            db.session.add(PersonalRecord(
                user_id=user_id, exercise_template_id=template_id,
                pr_type='estimated_1rm', value=round(best_1rm, 1),
                weight_context=-1.0, achieved_at=e_date, set_id=None,
            ))

        # max_reps per weight (min 2 reps — 1-rep sets are max_weight, not max_reps)
        for weight in {w for _, w, _, _ in valid}:
            at_w = [(r, sid, d) for r, w2, sid, d in valid if w2 == weight]
            best_reps = int(max(r for r, _, _ in at_w))
            if best_reps < 2:
                continue
            r_sid, r_date = next((sid, d) for r, sid, d in at_w if r == best_reps)
            db.session.add(PersonalRecord(
                user_id=user_id, exercise_template_id=template_id,
                pr_type='max_reps', value=float(best_reps),
                weight_context=weight, achieved_at=r_date, set_id=r_sid,
            ))


# Get all workouts for current user
@workout_bp.get('/api/workouts')
@jwt_required()
def get_workouts():
    try:
        current_user_id = get_jwt_identity()
        include_exercises = request.args.get('include_exercises', 'false').lower() == 'true'
        date_filter = request.args.get('date')  # optional YYYY-MM-DD
        page = request.args.get('page', type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)

        query = Workout.query.filter_by(user_id=current_user_id)
        if date_filter:
            from datetime import date as date_type
            try:
                target = date_type.fromisoformat(date_filter)
                query = query.filter(db.func.date(Workout.date) == target)
            except ValueError:
                return jsonify({'message': 'Invalid date format, use YYYY-MM-DD'}), 400

        query = query.order_by(Workout.date.desc())

        # Paginated response when ?page= is supplied; plain array otherwise (backwards-compat).
        if page is not None:
            pagination = query.paginate(page=page, per_page=per_page, error_out=False)
            return jsonify({
                'workouts': [w.to_dict(include_exercises=include_exercises) for w in pagination.items],
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'has_more': pagination.has_next,
            }), 200

        return jsonify([w.to_dict(include_exercises=include_exercises) for w in query.all()]), 200

    except Exception:
        current_app.logger.exception('GET /api/workouts failed')
        return jsonify({'message': 'Internal server error'}), 500

# GET LAST 3 WORKOUTS

@workout_bp.get('/api/workouts/recent')
@jwt_required()
def get_recent_workouts():
    current_user_id = get_jwt_identity()
    user = db.session.get(User, int(current_user_id))
    # Sets are stored in the user's unit; volume is reported in canonical lbs
    # everywhere (Workout.volume convention), so normalise before returning.
    kg_to_lbs = 2.20462 if (user.weight_unit or 'lbs') == 'kg' else 1.0
    workouts = Workout.query.filter_by(user_id=current_user_id).order_by(Workout.date.desc()).limit(5).all()

    template_ids = {
        ex.exercise_template_id
        for w in workouts for ex in w.exercises
        if ex.exercise_template_id
    }
    templates_by_id = {
        t.id: t for t in ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(template_ids)).all()
    } if template_ids else {}

    result = []
    for w in workouts:
        total_reps = 0
        total_volume = 0.0
        muscles = []
        set_ids = []

        for ex in w.exercises:
            if ex.exercise_template_id:
                tmpl = templates_by_id.get(ex.exercise_template_id)
                if tmpl and tmpl.muscle_group:
                    for m in tmpl.muscle_group.split(','):
                        m = m.strip()
                        if m and m not in muscles:
                            muscles.append(m)
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
        data['volume'] = round(total_volume * kg_to_lbs)
        data['num_exercises'] = len(w.exercises)
        data['muscles'] = muscles
        data['pr_count'] = pr_count
        result.append(data)

    return jsonify(result), 200

# GET ALL WORKOUT DATES (for calendar view)

@workout_bp.get('/api/workouts/dates')
@jwt_required()
def get_workout_dates():
    current_user_id = get_jwt_identity()
    rows = db.session.query(Workout.date).filter_by(user_id=current_user_id).all()
    dates = sorted({
        (r.date.date() if hasattr(r.date, 'date') else r.date).isoformat()
        for r in rows
    })
    return jsonify({'dates': dates}), 200


# GET WORKOUT DETAILS

@workout_bp.get('/api/workouts/<int:workout_id>')
@jwt_required()
def get_workout_details(workout_id):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workout_id).first()
    if not workout:
        return jsonify({'message': 'Workout not found'}), 404
    data = workout.to_dict(include_exercises=True)
    # Annotate each set with which PR types it holds
    all_set_ids = [s.id for ex in workout.exercises for s in ex.sets]
    if all_set_ids:
        pr_rows = PersonalRecord.query.filter(PersonalRecord.set_id.in_(all_set_ids)).all()
        pr_by_set: dict[int, list[str]] = {}
        for pr in pr_rows:
            pr_by_set.setdefault(pr.set_id, []).append(pr.pr_type)
        for ex_data, ex in zip(data['exercises'], workout.exercises):
            for set_data, s in zip(ex_data['sets'], ex.sets):
                set_data['pr_types'] = pr_by_set.get(s.id, [])
    return jsonify(data), 200

# CREATE WORKOUT 

@workout_bp.post('/api/workouts')
@jwt_required()
@validate_body(_workout_schema)
def add_workout():
    try:
        current_user_id = get_jwt_identity()
        data = g.validated
        name = data.get('workoutName')
        notes = data.get('notes')
        exercises = data.get('exercises', [])
        duration = data.get('duration')
        date_str = data.get('date')

        if not name:
            return jsonify({'message': 'Name required'}),400

        workout_date = datetime.now()
        if date_str:
            try:
                workout_date = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                return jsonify({'message': 'Invalid date format, use YYYY-MM-DD'}), 400

        new_workout = Workout(user_id=current_user_id, name=name, notes=notes, date=workout_date, duration=duration)
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
                notes=ex.get('notes'),
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
                    rpe=s.get('rpe'),
                    elevation_gain=s.get('elevation_gain'),
                )
                db.session.add(new_set)
                new_sets.append(new_set)
            db.session.flush()
            exercise_set_pairs.append((new_ex, new_sets))

        user = db.session.get(User, int(current_user_id))
        new_workout.calculate_volume(weight_unit=user.weight_unit or 'lbs')
        strength_pairs = [(ex, s) for ex, s in exercise_set_pairs if (ex.exercise_type or 'strength').lower() == 'strength']
        cardio_pairs   = [(ex, s) for ex, s in exercise_set_pairs if (ex.exercise_type or 'strength').lower() == 'cardio']
        new_prs = _compute_and_upsert_prs(current_user_id, strength_pairs, workout_date)
        new_prs += _compute_and_upsert_cardio_prs(current_user_id, cardio_pairs, workout_date)
        db.session.commit()

        total_volume = 0
        total_reps = 0
        total_sets = 0
        muscles_worked = []
        for ex, sets in exercise_set_pairs:
            if ex.exercise_template_id:
                tmpl = db.session.get(ExerciseTemplate, ex.exercise_template_id)
                if tmpl and tmpl.muscle_group:
                    for m in tmpl.muscle_group.split(','):
                        m = m.strip()
                        if m and m not in muscles_worked:
                            muscles_worked.append(m)
            for s in sets:
                if s.reps:
                    total_reps += s.reps
                    total_sets += 1
                    if s.weight:
                        total_volume += s.reps * s.weight

        is_first = Workout.query.filter_by(user_id=current_user_id).count() == 1

        return jsonify({
            'id': new_workout.id,
            'message': 'New Workout Added',
            'new_prs': new_prs,
            'total_volume': round(total_volume),
            'total_reps': total_reps,
            'total_sets': total_sets,
            'muscles': muscles_worked,
            'is_first_workout': is_first,
        }), 201
    except Exception:
        db.session.rollback()
        current_app.logger.exception('POST /api/workouts failed')
        return jsonify({'message': 'Internal server error'}), 500
    
# DELETE WORKOUT    
    
@workout_bp.delete('/api/workouts/<int:workoutId>')
@jwt_required()
def delete_workout(workoutId):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workoutId).first()
    if not workout:
        return jsonify({'message': 'Workout not found'}), 404
    template_ids = [ex.exercise_template_id for ex in workout.exercises]
    db.session.delete(workout)
    db.session.commit()
    _recompute_prs_for_templates(current_user_id, template_ids)
    db.session.commit()
    return jsonify({"message": "Workout deleted"}), 200

    
# UPDATE WORKOUT    

@workout_bp.route('/api/workouts/<int:workout_id>', methods=['PUT', 'PATCH'])
@jwt_required()
@validate_body(_update_workout_schema)
def update_workout(workout_id):
    current_user_id = get_jwt_identity()
    workout = Workout.query.filter_by(user_id=current_user_id, id=workout_id).first()

    if not workout:
        return jsonify({'error': 'workout not found'}), 404

    data = g.validated
    
    if 'workoutName' in data:
        workout.name = data['workoutName']
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
                if "notes" in exData:
                    ex.notes = exData.get("notes")
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
                        if "rpe" in s_data:
                            s.rpe = s_data["rpe"]
                        if "elevation_gain" in s_data:
                            s.elevation_gain = s_data["elevation_gain"]
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
                            rpe=s_data.get('rpe'),
                            elevation_gain=s_data.get('elevation_gain'),
                        ))
            else:
                new_ex = Exercise(
                    name=exData["name"],
                    workout_id=workout_id,
                    exercise_template_id=exData.get('exercise_template_id'),
                    order=exData.get('order', ex_index),
                    exercise_type=exData.get('exercise_type', 'strength'),
                    route_polyline=exData.get('route_polyline'),
                    notes=exData.get('notes'),
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
                        rpe=s.get('rpe'),
                        elevation_gain=s.get('elevation_gain'),
                    ))
                workout.exercises.append(new_ex)
                        
    db.session.flush()
    db.session.expire(workout)
    user = db.session.get(User, int(current_user_id))
    workout.calculate_volume(weight_unit=user.weight_unit or 'lbs')
    db.session.commit()

    template_ids = [ex.exercise_template_id for ex in workout.exercises]
    _recompute_prs_for_templates(current_user_id, template_ids)
    db.session.commit()

    return jsonify(workout.to_dict(include_exercises=True)), 200


@workout_bp.route('/api/workouts/export', methods=['GET'])
@jwt_required()
def export_workouts():
    current_user_id = get_jwt_identity()
    workouts = (
        Workout.query
        .filter_by(user_id=current_user_id)
        .options(selectinload(Workout.exercises).selectinload(Exercise.sets))
        .order_by(Workout.date.asc())
        .all()
    )

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'date', 'workout_name', 'duration_min',
        'exercise_name', 'set_number', 'set_type',
        'reps', 'weight', 'volume',
    ])

    for workout in workouts:
        date_str = workout.date.strftime('%Y-%m-%d') if workout.date else ''
        duration_min = round(workout.duration / 60, 1) if workout.duration else ''
        for exercise in workout.exercises:
            for i, s in enumerate(exercise.sets, start=1):
                reps = s.reps if s.reps is not None else ''
                weight = s.weight if s.weight is not None else ''
                volume = round(s.reps * s.weight, 2) if s.reps and s.weight else ''
                writer.writerow([
                    date_str,
                    workout.name,
                    duration_min,
                    exercise.name,
                    i,
                    s.set_type,
                    reps,
                    weight,
                    volume,
                ])

    csv_data = output.getvalue()
    response = make_response(csv_data)
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename="workouts.csv"'
    return response

    