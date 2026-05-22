from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Workout, Exercise, Set, User, ExerciseTemplate, PersonalRecord, StrengthScoreSnapshot

stats_bp = Blueprint('stats_bp', __name__)


@stats_bp.get('/api/stats/exercise')
@jwt_required()
def exercise_stats():
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
    rows = query.order_by(Workout.date.asc()).all()

    if not rows:
        return jsonify({'exercise_name': name, 'personal_bests': {}, 'totals': {}, 'history': []})

    # Determine exercise type from first row
    exercise_type = (rows[0][0].exercise_type or 'strength').lower()

    if exercise_type == 'cardio':
        return _cardio_exercise_stats(name, rows)

    from collections import defaultdict
    workout_map = defaultdict(lambda: {'workout': None, 'sets': [], 'notes': None})
    for exercise, workout in rows:
        key = workout.id
        workout_map[key]['workout'] = workout
        if exercise.notes and workout_map[key]['notes'] is None:
            workout_map[key]['notes'] = exercise.notes
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
            'notes': data.get('notes'),
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
    from datetime import date, timedelta
    from collections import defaultdict
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    kg_to_lbs = 2.20462 if (user.weight_unit or 'lbs') == 'kg' else 1.0
    weekly_goal = max(1, request.args.get('weekly_goal', 1, type=int))

    workouts = (
        db.session.query(Workout)
        .filter(Workout.user_id == user_id)
        .order_by(Workout.date.asc())
        .all()
    )

    total_workouts = len(workouts)

    total_volume = 0.0
    for w in workouts:
        for ex in w.exercises:
            for s in ex.sets:
                if s.reps and s.weight:
                    total_volume += s.reps * s.weight * kg_to_lbs

    # Group workouts by the Monday of their week
    week_counts: dict = defaultdict(int)
    for w in workouts:
        w_date = w.date.date() if hasattr(w.date, 'date') else w.date
        monday = w_date - timedelta(days=w_date.weekday())
        week_counts[monday] += 1

    today = date.today()
    current_monday = today - timedelta(days=today.weekday())

    # Longest streak: longest run of consecutive weeks each meeting the goal
    longest = 0
    run = 0
    for mon in sorted(week_counts):
        if week_counts[mon] >= weekly_goal:
            run += 1
            longest = max(longest, run)
        else:
            run = 0

    # Current streak: consecutive weeks going backwards from now
    current_streak = 0
    check = current_monday
    # Include current (possibly incomplete) week if it already meets the goal
    if week_counts.get(check, 0) >= weekly_goal:
        current_streak += 1
    check -= timedelta(weeks=1)
    while week_counts.get(check, 0) >= weekly_goal:
        current_streak += 1
        check -= timedelta(weeks=1)

    # ── Daily streak ──────────────────────────────────────────────────────
    workout_day_set = set(
        (w.date.date() if hasattr(w.date, 'date') else w.date)
        for w in workouts
    )
    daily_current = 0
    check_day = today
    while check_day in workout_day_set:
        daily_current += 1
        check_day -= timedelta(days=1)

    daily_longest = 0
    run_d = 0
    prev_day = None
    for d in sorted(workout_day_set):
        if prev_day is None or (d - prev_day).days == 1:
            run_d += 1
            daily_longest = max(daily_longest, run_d)
        else:
            run_d = 1
        prev_day = d

    # ── Monthly streak ────────────────────────────────────────────────────
    import calendar as cal
    monthly_goal = weekly_goal * 4
    month_counts: dict = defaultdict(int)
    for w in workouts:
        w_date = w.date.date() if hasattr(w.date, 'date') else w.date
        month_counts[(w_date.year, w_date.month)] += 1

    monthly_longest = 0
    run_m = 0
    for ym in sorted(month_counts):
        if month_counts[ym] >= monthly_goal:
            run_m += 1
            monthly_longest = max(monthly_longest, run_m)
        else:
            run_m = 0

    monthly_current = 0
    y_c, m_c = today.year, today.month
    while month_counts.get((y_c, m_c), 0) >= monthly_goal:
        monthly_current += 1
        m_c -= 1
        if m_c == 0:
            m_c = 12
            y_c -= 1

    return jsonify({
        'total_workouts': total_workouts,
        'longest_streak': longest,
        'current_streak': current_streak,
        'total_volume': round(total_volume),
        'current_daily_streak': daily_current,
        'longest_daily_streak': daily_longest,
        'current_monthly_streak': monthly_current,
        'longest_monthly_streak': monthly_longest,
    })


@stats_bp.get('/api/stats/dashboard')
@jwt_required()
def dashboard_stats():
    from datetime import date, timedelta
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    kg_to_lbs = 2.20462 if (user.weight_unit or 'lbs') == 'kg' else 1.0

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
                            week['volume'] += s.reps * s.weight * kg_to_lbs
                break

    # Last 7 days summary (volume in lbs)
    seven_days_ago = today - timedelta(days=6)
    recent = [w for w in workouts
              if (w.date.date() if hasattr(w.date, 'date') else w.date) >= seven_days_ago]
    week_volume = sum(s.reps * s.weight * kg_to_lbs for w in recent for ex in w.exercises for s in ex.sets if s.reps and s.weight)
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


@stats_bp.get('/api/stats/progress')
@jwt_required()
def progress_stats():
    import calendar as cal
    from datetime import date, timedelta
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    kg_to_lbs = 2.20462 if (user.weight_unit or 'lbs') == 'kg' else 1.0
    range_param = request.args.get('range', '30d')
    today = date.today()

    if range_param == '30d':
        start_of_week = today - timedelta(days=today.weekday())
        thirty_days_ago = today - timedelta(days=29)
        start_monday = thirty_days_ago - timedelta(days=thirty_days_ago.weekday())
        num_weeks = ((start_of_week - start_monday).days // 7) + 1
        buckets = []
        for i in range(num_weeks):
            ws = start_monday + timedelta(weeks=i)
            we = ws + timedelta(days=6)
            buckets.append({'start': ws, 'end': we, 'label': f"{ws.month}/{ws.day}", 'volume': 0.0, 'sets': 0, 'count': 0})
        start = start_monday
        def assign(w, w_date):
            for b in buckets:
                if b['start'] <= w_date <= b['end']:
                    _add_workout(b, w, kg_to_lbs); break

    elif range_param == '6m':
        MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        buckets = []
        for i in range(5, -1, -1):
            y, m = today.year, today.month - i
            while m <= 0: m += 12; y -= 1
            _, last_day = cal.monthrange(y, m)
            buckets.append({'start': date(y, m, 1), 'end': date(y, m, last_day),
                            'label': MONTHS[m - 1], 'volume': 0.0, 'sets': 0, 'count': 0})
        start = buckets[0]['start']
        def assign(w, w_date):
            for b in buckets:
                if b['start'] <= w_date <= b['end']:
                    _add_workout(b, w, kg_to_lbs); break

    else:  # 1y
        MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        buckets = []
        for i in range(11, -1, -1):
            y, m = today.year, today.month - i
            while m <= 0: m += 12; y -= 1
            _, last_day = cal.monthrange(y, m)
            buckets.append({'start': date(y, m, 1), 'end': date(y, m, last_day),
                            'label': MONTHS[m - 1], 'volume': 0.0, 'sets': 0, 'count': 0})
        start = buckets[0]['start']
        def assign(w, w_date):
            for b in buckets:
                if b['start'] <= w_date <= b['end']:
                    _add_workout(b, w, kg_to_lbs); break

    workouts = (Workout.query.filter_by(user_id=user_id)
                .filter(Workout.date >= start).all())
    for w in workouts:
        w_date = w.date.date() if hasattr(w.date, 'date') else w.date
        assign(w, w_date)

    return jsonify({'buckets': [
        {'label': b['label'], 'volume': round(b['volume']), 'sets': b['sets'], 'count': b['count']}
        for b in buckets
    ]})


def _add_workout(bucket, workout, kg_to_lbs):
    bucket['count'] += 1
    for ex in workout.exercises:
        for s in ex.sets:
            if s.reps:
                bucket['sets'] += 1
                if s.weight:
                    bucket['volume'] += s.reps * s.weight * kg_to_lbs


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


@stats_bp.get('/api/stats/strength-score')
@jwt_required()
def strength_score():
    from datetime import datetime, timedelta
    from statistics import mean as _mean
    from utils.strength_standards import (
        STANDARDS, BIG_6, EXERCISE_ALIASES, MUSCLE_GROUP_MAP,
        percentile_to_strength_rank, greek_rank_from_score, compute_percentile,
        compute_muscle_group_scores, compute_consistency_score,
        compute_dedication_score, compute_volume_score, compute_greek_score,
    )

    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))

    missing = []
    if not user.gender:
        missing.append('gender')
    if not user.bodyweight:
        missing.append('bodyweight')
    if missing:
        return jsonify({'missing': missing}), 422

    kg_to_lbs = 2.20462
    bw_lbs = user.bodyweight * kg_to_lbs if (user.weight_unit or 'lbs') == 'kg' else user.bodyweight

    # Build per-exercise percentiles
    exercise_percentiles: dict[str, float] = {}

    for exercise_name, aliases in EXERCISE_ALIASES.items():
        if exercise_name not in STANDARDS.get(user.gender, {}):
            continue

        # Find matching ExerciseTemplate IDs via ILIKE
        template_ids = []
        for alias in aliases:
            rows = (
                db.session.query(ExerciseTemplate.id)
                .filter(db.func.lower(ExerciseTemplate.name).contains(alias.lower()))
                .all()
            )
            template_ids.extend(r[0] for r in rows)
        template_ids = list(set(template_ids))

        if not template_ids:
            continue

        # True 1RM (reps=1 sets)
        true_1rm_row = (
            db.session.query(db.func.max(Set.weight))
            .join(Exercise, Set.exercise_id == Exercise.id)
            .join(Workout, Exercise.workout_id == Workout.id)
            .filter(
                Workout.user_id == user_id,
                Exercise.exercise_template_id.in_(template_ids),
                Set.reps == 1,
                Set.weight.isnot(None),
            )
            .scalar()
        )
        true_1rm = float(true_1rm_row) if true_1rm_row else 0.0

        # Estimated 1RM from PersonalRecord
        est_1rm_row = (
            db.session.query(db.func.max(PersonalRecord.value))
            .filter(
                PersonalRecord.user_id == user_id,
                PersonalRecord.exercise_template_id.in_(template_ids),
                PersonalRecord.pr_type == 'estimated_1rm',
            )
            .scalar()
        )
        est_1rm = float(est_1rm_row) if est_1rm_row else 0.0

        best_1rm = max(true_1rm, est_1rm)

        # Pull-up / Dip bodyweight fallback
        if best_1rm == 0.0 and exercise_name in ('Pull-up', 'Dips'):
            max_reps_row = (
                db.session.query(db.func.max(Set.reps))
                .join(Exercise, Set.exercise_id == Exercise.id)
                .join(Workout, Exercise.workout_id == Workout.id)
                .filter(
                    Workout.user_id == user_id,
                    Exercise.exercise_template_id.in_(template_ids),
                    Set.weight == 0,
                    Set.reps.isnot(None),
                )
                .scalar()
            )
            if max_reps_row and max_reps_row > 0:
                best_1rm = bw_lbs * (max_reps_row / 30)

        if best_1rm <= 0:
            continue

        bw_ratio = best_1rm / bw_lbs
        pct = compute_percentile(exercise_name, user.gender, bw_ratio)
        if pct is not None:
            exercise_percentiles[exercise_name] = pct

    if not exercise_percentiles:
        return jsonify({'missing': 'data'}), 422

    # Overall score
    big6_scores  = [exercise_percentiles[e] for e in BIG_6 if e in exercise_percentiles]
    supp_scores  = [v for k, v in exercise_percentiles.items() if k not in BIG_6]
    big6_avg  = _mean(big6_scores)  if big6_scores  else None
    supp_avg  = _mean(supp_scores)  if supp_scores  else None

    if big6_avg is not None and supp_avg is not None:
        overall = 0.7 * big6_avg + 0.3 * supp_avg
    elif big6_avg is not None:
        overall = big6_avg
    else:
        overall = supp_avg

    # Muscle group scores
    muscle_groups = compute_muscle_group_scores(exercise_percentiles)

    # Greek rank composite
    twelve_wks_ago = datetime.now() - timedelta(weeks=12)
    eight_wks_ago  = datetime.now() - timedelta(weeks=8)

    workouts_12wk = Workout.query.filter(
        Workout.user_id == user_id,
        Workout.date >= twelve_wks_ago,
    ).all()
    workouts_8wk_count = Workout.query.filter(
        Workout.user_id == user_id,
        Workout.date >= eight_wks_ago,
    ).count()
    total_workouts = Workout.query.filter_by(user_id=user_id).count()

    consistency = compute_consistency_score(workouts_12wk)
    dedication  = compute_dedication_score(total_workouts)
    volume_sig  = compute_volume_score(workouts_8wk_count)
    greek_score = compute_greek_score(consistency, overall, dedication, volume_sig)
    greek_rank  = greek_rank_from_score(greek_score)

    # Save snapshot once per 24h
    last_snap = (
        StrengthScoreSnapshot.query
        .filter_by(user_id=user_id)
        .order_by(StrengthScoreSnapshot.created_at.desc())
        .first()
    )
    if not last_snap or (datetime.now() - last_snap.created_at).total_seconds() > 86400:
        db.session.add(StrengthScoreSnapshot(user_id=user_id, score=overall))
        db.session.commit()

    # Build response
    is_pro = True  # default True until subscription system is built

    def _ex_entry(name):
        pct = exercise_percentiles.get(name)
        return {
            'exercise': name,
            'percentile': round(pct, 1) if pct is not None else None,
            'rank': percentile_to_strength_rank(pct) if pct is not None else None,
            'has_data': pct is not None,
        }

    big6_list = sorted(
        [_ex_entry(e) for e in BIG_6],
        key=lambda x: (x['percentile'] is None, -(x['percentile'] or 0)),
    )
    supp_list = sorted(
        [_ex_entry(e) for e in EXERCISE_ALIASES if e not in BIG_6 and e in exercise_percentiles],
        key=lambda x: -(x['percentile'] or 0),
    )

    resp: dict = {
        'overall': round(overall, 1),
        'overall_rank': percentile_to_strength_rank(overall),
        'greek_rank': greek_rank,
        'exercises_used': len(exercise_percentiles),
        'muscle_groups_used': len(muscle_groups),
    }

    if is_pro:
        resp['greek_score'] = round(greek_score, 1)
        resp['greek_score_components'] = {
            'consistency': round(consistency, 1),
            'strength': round(overall, 1),
            'dedication': round(dedication, 1),
            'volume': round(volume_sig, 1),
        }
        resp['big6'] = big6_list
        resp['supplemental'] = supp_list
        resp['muscle_groups'] = muscle_groups

    return jsonify(resp), 200


@stats_bp.get('/api/stats/strength-score/history')
@jwt_required()
def strength_score_history():
    user_id = get_jwt_identity()
    snapshots = (
        StrengthScoreSnapshot.query
        .filter_by(user_id=user_id)
        .order_by(StrengthScoreSnapshot.created_at.asc())
        .all()
    )
    return jsonify({
        'history': [
            {'date': s.created_at.isoformat(), 'score': s.score}
            for s in snapshots
        ]
    }), 200


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
