from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Workout, Exercise, Set

stats_bp = Blueprint('stats_bp', __name__)


@stats_bp.get('/api/stats/exercise')
@jwt_required()
def exercise_stats():
    user_id = get_jwt_identity()
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify({'message': 'name param required'}), 400

    rows = (
        db.session.query(Exercise, Workout)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user_id)
        .filter(db.func.lower(Exercise.name) == name.lower())
        .order_by(Workout.date.asc())
        .all()
    )

    if not rows:
        return jsonify({'exercise_name': name, 'personal_bests': {}, 'totals': {}, 'history': []})

    # Determine exercise type from first row
    exercise_type = (rows[0][0].exercise_type or 'strength')

    if exercise_type == 'cardio':
        return _cardio_exercise_stats(name, rows)

    from collections import defaultdict
    workout_map = defaultdict(lambda: {'workout': None, 'sets': []})
    for exercise, workout in rows:
        key = workout.id
        workout_map[key]['workout'] = workout
        for s in exercise.sets:
            workout_map[key]['sets'].append({'reps': s.reps, 'weight': s.weight, 'set_type': s.set_type or 'N'})

    history = []
    all_1rms, all_weights, all_reps = [], [], []
    total_sets = 0
    total_reps = 0

    for wid, data in sorted(workout_map.items(), key=lambda x: x[1]['workout'].date):
        workout = data['workout']
        sets = data['sets']
        if not sets:
            continue

        session_1rms = []
        session_volume = 0
        best_set = None

        for s in sets:
            r, w = s['reps'], s['weight']
            if r and w:
                one_rm = w * (1 + r / 30)
                session_1rms.append(one_rm)
                session_volume += r * w
                all_1rms.append(one_rm)
                all_weights.append(w)
                all_reps.append(r)
                total_sets += 1
                total_reps += r
                if best_set is None or w > best_set['weight']:
                    best_set = {'reps': r, 'weight': w}

        history.append({
            'date': workout.date.strftime('%Y-%m-%d'),
            'workout_name': workout.name or '',
            'best_1rm': round(max(session_1rms), 1) if session_1rms else 0,
            'volume': round(session_volume, 1),
            'best_set': best_set,
            'sets': sets,
        })

    personal_bests = {
        'estimated_1rm': round(max(all_1rms), 1) if all_1rms else 0,
        'max_weight': round(max(all_weights), 1) if all_weights else 0,
        'most_reps': max(all_reps) if all_reps else 0,
    }
    totals = {
        'total_workouts': len(workout_map),
        'total_sets': total_sets,
        'total_reps': total_reps,
    }

    return jsonify({
        'exercise_type': 'strength',
        'exercise_name': name,
        'personal_bests': personal_bests,
        'totals': totals,
        'history': list(reversed(history)),
    })


def _cardio_exercise_stats(name, rows):
    from collections import defaultdict
    workout_map = defaultdict(lambda: {'workout': None, 'bouts': []})
    for exercise, workout in rows:
        key = workout.id
        workout_map[key]['workout'] = workout
        for s in exercise.sets:
            if s.cardio_duration and s.cardio_duration > 0:
                dist_km = None
                if s.distance and s.distance > 0:
                    dist_km = s.distance if (s.distance_unit or 'km') == 'km' else s.distance * 1.60934
                workout_map[key]['bouts'].append({
                    'cardio_duration': s.cardio_duration,
                    'distance': s.distance,
                    'distance_unit': s.distance_unit or 'km',
                    'intensity': s.intensity,
                    'dist_km': dist_km,
                })

    history = []
    total_distance = 0.0
    total_duration = 0.0
    pace_points = []

    for wid, data in sorted(workout_map.items(), key=lambda x: x[1]['workout'].date):
        workout = data['workout']
        bouts = data['bouts']
        if not bouts:
            continue
        session_dist = sum(b['dist_km'] for b in bouts if b['dist_km'])
        session_dur = sum(b['cardio_duration'] for b in bouts)
        total_distance += session_dist
        total_duration += session_dur
        if session_dist > 0:
            pace_points.append(session_dur / session_dist)

        history.append({
            'date': workout.date.strftime('%Y-%m-%d'),
            'workout_name': workout.name or '',
            'bouts': [
                {
                    'cardio_duration': b['cardio_duration'],
                    'distance': b['distance'],
                    'distance_unit': b['distance_unit'],
                    'intensity': b['intensity'],
                }
                for b in bouts
            ],
        })

    avg_pace = round(sum(pace_points) / len(pace_points), 4) if pace_points else None

    return jsonify({
        'exercise_type': 'cardio',
        'exercise_name': name,
        'totals': {
            'total_distance': round(total_distance, 2),
            'total_duration': round(total_duration, 1),
            'session_count': len(workout_map),
        },
        'avg_pace': avg_pace,
        'history': list(reversed(history)),
    })


@stats_bp.get('/api/stats/profile')
@jwt_required()
def profile_stats():
    user_id = get_jwt_identity()

    workouts = (
        db.session.query(Workout)
        .filter(Workout.user_id == user_id)
        .order_by(Workout.date.asc())
        .all()
    )

    total_workouts = len(workouts)

    # Total volume: sum of reps * weight across all sets
    total_volume = 0.0
    for w in workouts:
        for ex in w.exercises:
            for s in ex.sets:
                if s.reps and s.weight:
                    total_volume += s.reps * s.weight

    # Longest streak: consecutive calendar days with at least one workout
    from datetime import timedelta
    dates = sorted({w.date.date() if hasattr(w.date, 'date') else w.date for w in workouts})
    longest = current = 1 if dates else 0
    for i in range(1, len(dates)):
        if dates[i] - dates[i - 1] == timedelta(days=1):
            current += 1
            longest = max(longest, current)
        elif dates[i] != dates[i - 1]:
            current = 1

    return jsonify({
        'total_workouts': total_workouts,
        'longest_streak': longest,
        'total_volume': round(total_volume),
    })


@stats_bp.get('/api/stats/dashboard')
@jwt_required()
def dashboard_stats():
    from datetime import date, timedelta
    user_id = get_jwt_identity()

    today = date.today()
    start_of_week = today - timedelta(days=today.weekday())  # Monday
    eight_weeks_ago = start_of_week - timedelta(weeks=7)

    workouts = (
        db.session.query(Workout)
        .filter(Workout.user_id == user_id)
        .filter(Workout.date >= eight_weeks_ago)
        .order_by(Workout.date.asc())
        .all()
    )

    # Build 8 weekly buckets starting from eight_weeks_ago
    weeks = []
    for i in range(8):
        ws = eight_weeks_ago + timedelta(weeks=i)
        weeks.append({'start': ws, 'end': ws + timedelta(days=6), 'volume': 0.0, 'count': 0})

    for workout in workouts:
        w_date = workout.date.date() if hasattr(workout.date, 'date') else workout.date
        for week in weeks:
            if week['start'] <= w_date <= week['end']:
                week['count'] += 1
                for ex in workout.exercises:
                    for s in ex.sets:
                        if s.reps and s.weight:
                            week['volume'] += s.reps * s.weight
                break

    # Last 7 days summary
    seven_days_ago = today - timedelta(days=6)
    recent = [w for w in workouts
              if (w.date.date() if hasattr(w.date, 'date') else w.date) >= seven_days_ago]
    week_volume = sum(s.reps * s.weight for w in recent for ex in w.exercises for s in ex.sets if s.reps and s.weight)
    week_sets = sum(1 for w in recent for ex in w.exercises for s in ex.sets if s.reps)

    # This week's workout dates (for calendar)
    current_week = weeks[-1]
    this_week_dates = []
    for w in workouts:
        w_date = w.date.date() if hasattr(w.date, 'date') else w.date
        if current_week['start'] <= w_date <= current_week['end']:
            this_week_dates.append(w_date.isoformat())

    return jsonify({
        'weekly': [
            {
                'label': f"{w['start'].month}/{w['start'].day}",
                'volume': round(w['volume']),
                'count': w['count'],
            }
            for w in weeks
        ],
        'last_7_days': {
            'workouts': len(recent),
            'volume': round(week_volume),
            'sets': week_sets,
        },
        'this_week_dates': this_week_dates,
    })


@stats_bp.get('/api/stats/recent-exercises')
@jwt_required()
def recent_exercises():
    user_id = get_jwt_identity()
    # Distinct exercise names ordered by most recent workout date
    rows = (
        db.session.query(Exercise.name, db.func.max(Workout.date).label('last_date'))
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user_id)
        .group_by(Exercise.name)
        .order_by(db.func.max(Workout.date).desc())
        .limit(10)
        .all()
    )
    return jsonify({'recent': [r.name for r in rows]})


@stats_bp.get('/api/stats/exercise/last-session')
@jwt_required()
def exercise_last_session():
    user_id = get_jwt_identity()
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify({'message': 'name param required'}), 400
    template_id = request.args.get('exercise_template_id', type=int)

    query = (
        db.session.query(Exercise, Workout)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user_id)
        .filter(db.func.lower(Exercise.name) == name.lower())
    )
    if template_id:
        query = query.filter(Exercise.exercise_template_id == template_id)
    row = query.order_by(Workout.date.desc()).first()

    if not row:
        return jsonify({'sets': []}), 200

    exercise, _ = row
    sorted_sets = sorted(exercise.sets, key=lambda s: s.order if s.order is not None else 0)
    sets = [
        {'reps': str(s.reps) if s.reps is not None else '', 'weight': str(s.weight) if s.weight is not None else '', 'set_type': getattr(s, 'set_type', 'N') or 'N'}
        for s in sorted_sets
    ]
    return jsonify({'sets': sets}), 200
