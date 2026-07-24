from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload
from models import db, Workout, Exercise, Set, User, ExerciseTemplate, PersonalRecord, StrengthScoreSnapshot, ExerciseMuscleMapping, BodyweightLog
from utils.strength_standards import epley_1rm

stats_bp = Blueprint('stats_bp', __name__)

# Deliberate Python port of workout-tracker-native/utils/cardioCalories.ts —
# used by weekly_summary() to estimate calories burned from stored cardio Set
# fields. Keep both in sync if the MET table or speed-scaling formulas change.
_FLAT_MET = {
    'running': 9.8, 'run': 9.8,
    'cycling': 8.0, 'cycle': 8.0, 'bike': 8.0,
    'rowing': 7.0, 'row': 7.0,
    'swimming': 7.0, 'swim': 7.0,
    'elliptical': 5.0,
    'walking': 3.5, 'walk': 3.5,
    'hiking': 6.0, 'hike': 6.0,
}


def _cardio_speed_kmh(duration_min, distance, distance_unit):
    """Derive speed from stored distance/duration, in km/h — None if not derivable."""
    if not distance or not duration_min:
        return None
    distance_km = distance * 1.60934 if (distance_unit or 'km') == 'mi' else distance
    return distance_km / (duration_min / 60.0)


def _estimate_calories(activity_name, duration_min, weight_kg, speed_kmh=None):
    name = (activity_name or '').lower()
    if speed_kmh and speed_kmh > 0:
        if name in ('run', 'running'):
            met = max(6.0, speed_kmh)
        elif name in ('cycle', 'cycling', 'bike'):
            met = max(4.0, speed_kmh * 0.45 + 2.0)
        elif name in ('walk', 'walking'):
            met = max(2.5, speed_kmh * 0.5 + 1.5)
        else:
            met = _FLAT_MET.get(name, 6.0)
    else:
        met = _FLAT_MET.get(name, 6.0)
    return met * weight_kg * (duration_min / 60.0)


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
        .options(selectinload(Exercise.sets))
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
            # weight 0 = bodyweight set: counts for reps/sets, not weight stats
            if r and w is not None and s['set_type'] != 'W':
                session_volume += r * w
                all_reps.append(r)
                total_sets += 1
                total_reps += r
                if w > 0:
                    all_weights.append(w)
                    if best_set is None or w > best_set['weight']:
                        best_set = {'reps': r, 'weight': w}
                    if r <= 15:
                        one_rm = epley_1rm(w, r)
                        session_1rms.append(one_rm)
                        all_1rms.append(one_rm)
                elif best_set is None or (best_set['weight'] == 0 and r > best_set['reps']):
                    best_set = {'reps': r, 'weight': 0}

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

    total_workouts = Workout.query.filter_by(user_id=user_id).count()

    vol_row = (
        db.session.query(db.func.sum(Set.reps * Set.weight))
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Set.reps.isnot(None),
            Set.weight.isnot(None),
            Set.set_type != 'W',
        )
        .scalar()
    )
    total_volume = (vol_row or 0.0) * kg_to_lbs

    # Fetch only dates for streak calculations — no exercises or sets needed
    workout_dates = [
        row[0].date() if hasattr(row[0], 'date') else row[0]
        for row in (
            db.session.query(Workout.date)
            .filter(Workout.user_id == user_id)
            .order_by(Workout.date.asc())
            .all()
        )
    ]

    # Group workouts by the Monday of their week
    week_counts: dict = defaultdict(int)
    for w_date in workout_dates:
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
    workout_day_set = set(workout_dates)
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
    for w_date in workout_dates:
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
        'this_week_count': week_counts.get(current_monday, 0),
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
                        if s.reps and s.weight and s.set_type != 'W':
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
    # Group template exercises by template_id so Cable vs Barbell variants are distinct
    template_rows = (
        db.session.query(Exercise.exercise_template_id, Exercise.name, db.func.max(Workout.date).label('last_date'))
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user_id)
        .filter(Exercise.exercise_template_id.isnot(None))
        .group_by(Exercise.exercise_template_id, Exercise.name)
        .order_by(db.func.max(Workout.date).desc())
        .limit(10)
        .all()
    )
    # Custom exercises (no template) grouped by name
    custom_rows = (
        db.session.query(Exercise.name, db.func.max(Workout.date).label('last_date'))
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user_id)
        .filter(Exercise.exercise_template_id.is_(None))
        .group_by(Exercise.name)
        .order_by(db.func.max(Workout.date).desc())
        .limit(10)
        .all()
    )
    merged = (
        [{'name': r.name, 'exercise_template_id': r.exercise_template_id, 'last_date': r.last_date} for r in template_rows] +
        [{'name': r.name, 'exercise_template_id': None, 'last_date': r.last_date} for r in custom_rows]
    )
    merged.sort(key=lambda r: r['last_date'], reverse=True)
    return jsonify({'recent': [{'name': r['name'], 'exercise_template_id': r['exercise_template_id']} for r in merged[:10]]})


@stats_bp.get('/api/stats/strength-score')
@jwt_required()
def strength_score():
    from datetime import datetime, timedelta
    from statistics import mean as _mean
    from utils.strength_standards import (
        STANDARDS, BIG_6, COMPOUND_SECONDARY, MUSCLE_GROUP_MAP,
        percentile_to_strength_rank, greek_rank_from_score, compute_percentile,
        compute_weight_at_percentile, compute_muscle_group_scores,
        compute_consistency_score, compute_dedication_score,
        compute_volume_score, compute_greek_score, age_scaling_factor,
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
    # Logged weights are stored in the user's unit — normalise to lbs so
    # bodyweight ratios compare against the lbs-calibrated standards.
    unit_to_lbs = kg_to_lbs if (user.weight_unit or 'lbs') == 'kg' else 1.0
    bw_lbs = user.bodyweight * unit_to_lbs

    # Most recent bodyweight log entry — surfaced so the UI can flag a stale
    # bodyweight (the score uses the live User.bodyweight scalar, which can
    # silently drift out of date if the user hasn't logged in a while).
    last_bw_log_date = (
        db.session.query(db.func.max(BodyweightLog.date))
        .filter(BodyweightLog.user_id == user_id)
        .scalar()
    )

    from datetime import date as _date
    today = _date.today()
    if user.birth_date:
        user_age = today.year - user.birth_date.year - (
            (today.month, today.day) < (user.birth_date.month, user.birth_date.day)
        )
    else:
        user_age = None
    age_factor = age_scaling_factor(user_age) if user_age else 1.0

    # Build per-exercise percentiles using standards_key — one bulk query, no fuzzy matching
    valid_keys = set(STANDARDS.get(user.gender, {}).keys())

    # Fetch all templates that have a standards_key relevant to this gender's standards
    keyed_templates = (
        db.session.query(ExerciseTemplate.id, ExerciseTemplate.standards_key)
        .filter(ExerciseTemplate.standards_key.in_(valid_keys))
        .all()
    )

    # Group template IDs by standards_key
    templates_by_key: dict[str, list[int]] = {}
    for tmpl_id, sk in keyed_templates:
        templates_by_key.setdefault(sk, []).append(tmpl_id)

    exercise_percentiles: dict[str, float] = {}
    exercise_1rms: dict[str, float] = {}

    for exercise_name, template_ids in templates_by_key.items():
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
        true_1rm = float(true_1rm_row) * unit_to_lbs if true_1rm_row else 0.0

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
        est_1rm = float(est_1rm_row) * unit_to_lbs if est_1rm_row else 0.0

        best_1rm = max(true_1rm, est_1rm)

        # Pull-up / Dip bodyweight fallback: standards (and logged weighted sets)
        # are on the ADDED-weight scale, so estimate added 1RM as Epley total
        # minus bodyweight: bw*(1 + r/30) - bw = bw*r/30.
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
                    Set.reps <= 15,
                )
                .scalar()
            )
            if max_reps_row and max_reps_row > 0:
                best_1rm = bw_lbs * max_reps_row / 30

        if best_1rm <= 0:
            continue

        bw_ratio = (best_1rm / bw_lbs) * age_factor
        pct = compute_percentile(exercise_name, user.gender, bw_ratio)
        if pct is not None:
            exercise_percentiles[exercise_name] = pct
            # Display value goes back to the user's unit
            exercise_1rms[exercise_name] = round(best_1rm / unit_to_lbs, 1)

    if not exercise_percentiles:
        return jsonify({'missing': 'data'}), 422

    # Overall score — Big 6 (70%), compound secondary (20%), isolation (10%).
    # Missing categories are dropped and weights renormalized automatically.
    big6_scores     = [exercise_percentiles[e] for e in BIG_6 if e in exercise_percentiles]
    compound_scores = [v for k, v in exercise_percentiles.items()
                       if k not in BIG_6 and k in COMPOUND_SECONDARY]
    isolation_scores = [v for k, v in exercise_percentiles.items()
                        if k not in BIG_6 and k not in COMPOUND_SECONDARY]

    big6_avg     = _mean(big6_scores)     if big6_scores     else None
    compound_avg = _mean(compound_scores) if compound_scores else None
    isolation_avg = _mean(isolation_scores) if isolation_scores else None

    # Coverage — how many of the exercises this user's gender has standards
    # for are actually tracked, per category. The formula above silently skips
    # missing exercises rather than penalizing them, so this is a transparency
    # addition only — it doesn't change `overall`.
    compound_total  = sum(1 for k in valid_keys if k not in BIG_6 and k in COMPOUND_SECONDARY)
    isolation_total = sum(1 for k in valid_keys if k not in BIG_6 and k not in COMPOUND_SECONDARY)
    coverage = {
        'big6':      {'tracked': len(big6_scores),      'total': len(BIG_6)},
        'compound':  {'tracked': len(compound_scores),  'total': compound_total},
        'isolation': {'tracked': len(isolation_scores), 'total': isolation_total},
    }

    parts = []
    if big6_avg     is not None: parts.append((0.70, big6_avg))
    if compound_avg is not None: parts.append((0.20, compound_avg))
    if isolation_avg is not None: parts.append((0.10, isolation_avg))

    total_weight = sum(w for w, _ in parts)
    overall = sum(w * v for w, v in parts) / total_weight

    # Muscle group scores
    muscle_groups = compute_muscle_group_scores(exercise_percentiles)

    # Greek rank composite
    twelve_wks_ago  = datetime.now() - timedelta(weeks=12)
    thirteen_wks_ago = datetime.now() - timedelta(weeks=13)
    eight_wks_ago   = datetime.now() - timedelta(weeks=8)

    workouts_12wk = Workout.query.filter(
        Workout.user_id == user_id,
        Workout.date >= twelve_wks_ago,
    ).all()
    workouts_13wk_count = Workout.query.filter(
        Workout.user_id == user_id,
        Workout.date >= thirteen_wks_ago,
    ).count()
    workouts_8wk_count = Workout.query.filter(
        Workout.user_id == user_id,
        Workout.date >= eight_wks_ago,
    ).count()

    consistency = compute_consistency_score(workouts_12wk)
    dedication  = compute_dedication_score(workouts_13wk_count)
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
    # TODO(post-launch): server-side premium — RevenueCat webhook sets
    # user.is_premium and this reads it. Until then the API over-serves
    # premium fields and gating is client-only (see TODO.md).
    is_pro = True

    _TIER_BOUNDARIES = [
        (10,  'Beginner'),
        (30,  'Intermediate'),
        (60,  'Advanced'),
        (80,  'Elite'),
        (95,  'Legend'),
    ]

    def _ex_entry(name):
        pct = exercise_percentiles.get(name)
        thresholds = []
        for boundary_pct, rank_name in _TIER_BOUNDARIES:
            w = compute_weight_at_percentile(name, user.gender, bw_lbs, boundary_pct)
            if w is not None:
                thresholds.append({'percentile': boundary_pct, 'rank': rank_name,
                                   'weight': round(w / unit_to_lbs, 1)})
        return {
            'exercise': name,
            'percentile': round(pct, 1) if pct is not None else None,
            'rank': percentile_to_strength_rank(pct) if pct is not None else None,
            'estimated_1rm': exercise_1rms.get(name),
            'thresholds': thresholds,
            'has_data': pct is not None,
        }

    big6_list = sorted(
        [_ex_entry(e) for e in BIG_6],
        key=lambda x: (x['percentile'] is None, -(x['percentile'] or 0)),
    )
    def _supp_entry(name):
        entry = _ex_entry(name)
        entry['category'] = 'compound' if name in COMPOUND_SECONDARY else 'isolation'
        return entry

    supp_list = sorted(
        [_supp_entry(e) for e in exercise_percentiles if e not in BIG_6],
        key=lambda x: (x['category'] != 'compound', -(x['percentile'] or 0)),
    )

    resp: dict = {
        'overall': round(overall, 1),
        'overall_rank': percentile_to_strength_rank(overall),
        'greek_rank': greek_rank,
        'exercises_used': len(exercise_percentiles),
        'muscle_groups_used': len(muscle_groups),
        'age_adjusted': age_factor > 1.0,
        'age': user_age,
        'age_factor': round(age_factor, 3),
        'bodyweight_updated_at': last_bw_log_date.isoformat() if last_bw_log_date else None,
        'coverage': coverage,
        'weight_unit': user.weight_unit or 'lbs',
        'last_updated': datetime.now().isoformat(),
    }

    history_snaps = (
        StrengthScoreSnapshot.query
        .filter_by(user_id=user_id)
        .order_by(StrengthScoreSnapshot.created_at.asc())
        .all()
    )
    resp['history'] = [
        {'date': s.created_at.isoformat(), 'score': s.score}
        for s in history_snaps
    ]

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


@stats_bp.get('/api/stats/muscle-volume')
@jwt_required()
def muscle_volume():
    from datetime import date, timedelta
    user_id = get_jwt_identity()

    local_date_str = request.args.get('local_date')
    try:
        today = date.fromisoformat(local_date_str) if local_date_str else date.today()
    except ValueError:
        today = date.today()
    week_start = today - timedelta(days=today.weekday())   # Monday
    last_week_start = week_start - timedelta(weeks=1)

    # Base joins reused across queries
    def _base(extra_filters):
        return (
            db.session.query(
                ExerciseMuscleMapping.muscle_group,
            )
            .join(ExerciseTemplate, ExerciseMuscleMapping.exercise_template_id == ExerciseTemplate.id)
            .join(Exercise, Exercise.exercise_template_id == ExerciseTemplate.id)
            .join(Workout, Exercise.workout_id == Workout.id)
            .join(Set, Set.exercise_id == Exercise.id)
            .filter(
                Workout.user_id == user_id,
                Exercise.exercise_type == 'strength',
                Set.set_type != 'W',
                Set.reps.isnot(None),
                *extra_filters,
            )
        )

    # Sets this week per muscle group
    not_warmup = db.or_(Set.set_type.is_(None), Set.set_type != 'W')
    not_cardio  = db.func.lower(Exercise.exercise_type) != 'cardio'

    # Step 1: set counts per exercise_template_id this week
    week_template_rows = (
        db.session.query(
            Exercise.exercise_template_id,
            db.func.count(Set.id).label('set_count'),
        )
        .join(Set, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Exercise.exercise_template_id.isnot(None),
            not_cardio,
            not_warmup,
            Workout.date >= week_start,
        )
        .group_by(Exercise.exercise_template_id)
        .all()
    )

    # Step 2: look up muscle groups for those templates, accumulate in Python.
    # Secondary movers get half credit — a set still stimulates them, just
    # less directly than the primary target.
    template_set_map = {row.exercise_template_id: row.set_count for row in week_template_rows}
    muscle_sets: dict[str, float] = {}
    if template_set_map:
        mappings = (
            db.session.query(
                ExerciseMuscleMapping.exercise_template_id,
                ExerciseMuscleMapping.muscle_group,
                ExerciseMuscleMapping.is_primary,
            )
            .filter(ExerciseMuscleMapping.exercise_template_id.in_(list(template_set_map.keys())))
            .all()
        )
        for tmpl_id, muscle, is_primary in mappings:
            credit = template_set_map[tmpl_id] * (1.0 if is_primary else 0.5)
            muscle_sets[muscle] = muscle_sets.get(muscle, 0) + credit

    # Last trained date per muscle group (all time) — same two-step approach
    last_template_rows = (
        db.session.query(
            Exercise.exercise_template_id,
            db.func.max(Workout.date).label('last_date'),
        )
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Exercise.exercise_template_id.isnot(None),
            not_cardio,
        )
        .group_by(Exercise.exercise_template_id)
        .all()
    )
    last_date_map = {row.exercise_template_id: row.last_date for row in last_template_rows}
    last_trained: dict[str, str | None] = {}
    if last_date_map:
        last_mappings = (
            db.session.query(ExerciseMuscleMapping.exercise_template_id, ExerciseMuscleMapping.muscle_group)
            .filter(ExerciseMuscleMapping.exercise_template_id.in_(list(last_date_map.keys())))
            .all()
        )
        for tmpl_id, muscle in last_mappings:
            d = last_date_map.get(tmpl_id)
            date_str = d.strftime('%Y-%m-%d') if d else None
            # keep the most recent date if multiple templates map to same muscle
            if muscle not in last_trained or (date_str and (not last_trained[muscle] or date_str > last_trained[muscle])):
                last_trained[muscle] = date_str

    # Last week's total working sets (for fatigue monitor)
    last_week_total = (
        db.session.query(db.func.count(Set.id))
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Exercise.exercise_template_id.isnot(None),
            not_cardio,
            not_warmup,
            Set.reps.isnot(None),
            Workout.date >= last_week_start,
            Workout.date < week_start,
        )
        .scalar() or 0
    )


    return jsonify({
        'week_start': week_start.strftime('%Y-%m-%d'),
        'muscle_sets': muscle_sets,
        'last_trained': last_trained,
        'total_sets': sum(muscle_sets.values()),
        'last_week_total': last_week_total,
    }), 200


@stats_bp.get('/api/stats/weekly-summary')
@jwt_required()
def weekly_summary():
    """Recap of a completed week: workouts, volume, reps, cardio distance,
    PRs earned, bodyweight change, muscle-group breakdown, training days, and
    total training time. Defaults to the most recently COMPLETED week (not
    the current in-progress one) unless ?week=<date within a week> is given.
    Fields are omitted entirely (not zeroed) when the user has no relevant
    data that week, so the frontend can conditionally render sections.
    """
    from datetime import date, timedelta
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    kg_to_lbs = 2.20462 if (user.weight_unit or 'lbs') == 'kg' else 1.0

    local_date_str = request.args.get('local_date')
    try:
        today = date.fromisoformat(local_date_str) if local_date_str else date.today()
    except ValueError:
        today = date.today()
    this_week_start = today - timedelta(days=today.weekday())

    week_param = request.args.get('week')
    if week_param:
        try:
            target = date.fromisoformat(week_param)
            week_start = target - timedelta(days=target.weekday())
        except ValueError:
            week_start = this_week_start - timedelta(weeks=1)
    else:
        week_start = this_week_start - timedelta(weeks=1)
    week_end = week_start + timedelta(weeks=1)

    not_warmup = db.or_(Set.set_type.is_(None), Set.set_type != 'W')
    not_cardio = db.func.lower(Exercise.exercise_type) != 'cardio'

    workout_rows = (
        db.session.query(Workout.id, Workout.date, Workout.duration)
        .filter(Workout.user_id == user_id, Workout.date >= week_start, Workout.date < week_end)
        .all()
    )
    training_days = sorted({w.date.date().isoformat() for w in workout_rows})

    resp: dict = {
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'workouts': len(workout_rows),
        'training_days': training_days,
        'total_duration_min': sum(w.duration or 0 for w in workout_rows),
        'weight_unit': user.weight_unit or 'lbs',
    }

    # Volume + reps — same SQL-aggregate pattern as profile_stats, same
    # canonical-lbs convention for total_volume (Set.weight is stored in the
    # user's current unit, so this multiplies up to lbs like profile_stats
    # and Workout.volume both do).
    vol_reps_row = (
        db.session.query(
            db.func.sum(Set.reps * Set.weight).label('volume'),
            db.func.sum(Set.reps).label('reps'),
        )
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= week_start, Workout.date < week_end,
            Set.reps.isnot(None), Set.weight.isnot(None), Set.set_type != 'W',
        )
        .first()
    )
    resp['total_volume'] = round((vol_reps_row.volume or 0) * kg_to_lbs)
    resp['total_reps'] = int(vol_reps_row.reps or 0)

    # Prior-week workouts/volume, for the ▲/▼ delta shown alongside this
    # week's stats — same "always present, 0 if none" convention as
    # muscle-volume's last_week_total (not the omit-if-absent convention used
    # for the feature-specific fields below, since every week has a count).
    prev_week_start = week_start - timedelta(weeks=1)
    prev_workout_count = (
        db.session.query(db.func.count(Workout.id))
        .filter(Workout.user_id == user_id, Workout.date >= prev_week_start, Workout.date < week_start)
        .scalar() or 0
    )
    prev_vol_row = (
        db.session.query(db.func.sum(Set.reps * Set.weight).label('volume'))
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= prev_week_start, Workout.date < week_start,
            Set.reps.isnot(None), Set.weight.isnot(None), Set.set_type != 'W',
        )
        .first()
    )
    resp['prev_week_workouts'] = prev_workout_count
    resp['prev_week_volume'] = round((prev_vol_row.volume or 0) * kg_to_lbs)

    # Rolling 4-week average (workouts, volume) — the 4 calendar weeks
    # strictly before the displayed week, always divided by 4 (missing weeks
    # count as 0) so a spike/dip reads against a stable baseline rather than
    # just the single prior week. Always present, same convention as
    # prev_week_* above.
    rolling_start = week_start - timedelta(weeks=4)
    rolling_workout_count = (
        db.session.query(db.func.count(Workout.id))
        .filter(Workout.user_id == user_id, Workout.date >= rolling_start, Workout.date < week_start)
        .scalar() or 0
    )
    rolling_vol_row = (
        db.session.query(db.func.sum(Set.reps * Set.weight).label('volume'))
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= rolling_start, Workout.date < week_start,
            Set.reps.isnot(None), Set.weight.isnot(None), Set.set_type != 'W',
        )
        .first()
    )
    resp['rolling_avg_workouts'] = round(rolling_workout_count / 4.0, 1)
    resp['rolling_avg_volume'] = round((rolling_vol_row.volume or 0) * kg_to_lbs / 4.0)

    # Most-improved lift — best Epley-estimated 1RM this week vs. the prior
    # week, per exercise; the exercise with the largest positive gain wins.
    # PersonalRecord has no history (rows are overwritten in place), so this
    # is computed directly from Set data rather than from PR rows.
    epley_expr = db.case((Set.reps <= 1, Set.weight), else_=Set.weight * (1 + Set.reps / 30.0))

    def _best_1rm_by_exercise(start, end):
        rows = (
            db.session.query(Exercise.exercise_template_id, db.func.max(epley_expr).label('best'))
            .join(Set, Set.exercise_id == Exercise.id)
            .join(Workout, Exercise.workout_id == Workout.id)
            .filter(
                Workout.user_id == user_id,
                Workout.date >= start, Workout.date < end,
                not_warmup, not_cardio,
                Set.reps.isnot(None), Set.weight.isnot(None),
                Exercise.exercise_template_id.isnot(None),
            )
            .group_by(Exercise.exercise_template_id)
            .all()
        )
        return {r.exercise_template_id: r.best for r in rows}

    this_1rm = _best_1rm_by_exercise(week_start, week_end)
    prev_1rm = _best_1rm_by_exercise(prev_week_start, week_start)
    gains = {
        tid: this_1rm[tid] - prev_1rm[tid]
        for tid in this_1rm.keys() & prev_1rm.keys()
        if this_1rm[tid] > prev_1rm[tid]
    }
    if gains:
        best_tid = max(gains, key=gains.get)
        tmpl = db.session.get(ExerciseTemplate, best_tid)
        resp['most_improved_lift'] = {
            'exercise_name': tmpl.name,
            'prev_best': round(prev_1rm[best_tid] * kg_to_lbs, 1),
            'this_best': round(this_1rm[best_tid] * kg_to_lbs, 1),
            'gain': round(gains[best_tid] * kg_to_lbs, 1),
        }

    # Avg RPE — omitted if nobody logged an RPE value this week.
    avg_rpe = (
        db.session.query(db.func.avg(Set.rpe))
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= week_start, Workout.date < week_end,
            not_warmup, Set.rpe.isnot(None),
        )
        .scalar()
    )
    if avg_rpe is not None:
        resp['avg_rpe'] = round(avg_rpe, 1)

    # Calories burned (cardio only) — deliberate Python port of
    # utils/cardioCalories.ts's MET-table formula; keep both in sync if the
    # MET table ever changes. Omitted if no cardio logged, or if the user has
    # never set a bodyweight (can't estimate calories without body mass).
    if user.bodyweight:
        weight_kg = user.bodyweight * (0.453592 if (user.weight_unit or 'lbs') == 'lbs' else 1.0)
        cardio_set_rows = (
            db.session.query(Exercise.name, Set.cardio_duration, Set.distance, Set.distance_unit)
            .join(Exercise, Set.exercise_id == Exercise.id)
            .join(Workout, Exercise.workout_id == Workout.id)
            .filter(
                Workout.user_id == user_id,
                Workout.date >= week_start, Workout.date < week_end,
                Exercise.exercise_type == 'cardio',
                Set.cardio_duration.isnot(None),
            )
            .all()
        )
        if cardio_set_rows:
            total_calories = sum(
                _estimate_calories(name, duration, weight_kg,
                                    _cardio_speed_kmh(duration, distance, distance_unit))
                for name, duration, distance, distance_unit in cardio_set_rows
            )
            if total_calories > 0:
                resp['calories_burned'] = round(total_calories)

    # Cardio distance, normalized to km (same canonical-unit-then-convert-on-
    # display idea as Workout.volume) — omitted if no cardio logged.
    distance_rows = (
        db.session.query(Set.distance, Set.distance_unit)
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= week_start, Workout.date < week_end,
            Exercise.exercise_type == 'cardio',
            Set.distance.isnot(None),
        )
        .all()
    )
    if distance_rows:
        total_km = sum((d * 1.60934 if (unit or 'km') == 'mi' else d) for d, unit in distance_rows)
        if total_km > 0:
            resp['distance_km'] = round(total_km, 2)

    # PRs earned this week — excludes estimated_1rm per the app-wide rule
    # (never surface it as a PR label). achieved_at reflects when a PR was
    # last set OR recomputed (editing a past workout can rebuild it), not
    # strictly immutable history.
    pr_rows = (
        db.session.query(ExerciseTemplate.name, PersonalRecord.pr_type, PersonalRecord.value, PersonalRecord.weight_context)
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .filter(
            PersonalRecord.user_id == user_id,
            PersonalRecord.pr_type != 'estimated_1rm',
            PersonalRecord.achieved_at >= week_start,
            PersonalRecord.achieved_at < week_end,
        )
        .all()
    )
    resp['prs'] = [
        {
            'exercise_name': name, 'pr_type': pr_type, 'value': value,
            'weight_context': None if weight_context is None or weight_context < 0 else weight_context,
        }
        for name, pr_type, value, weight_context in pr_rows
    ]

    # Bodyweight change — PR values/bodyweight logs are stored in the user's
    # current unit already (no kg_to_lbs conversion, unlike total_volume
    # above). Omitted entirely if no log entries fall in this week — never
    # fall back to User.bodyweight or a wider range.
    bw_rows = (
        db.session.query(BodyweightLog.weight)
        .filter(
            BodyweightLog.user_id == user_id,
            BodyweightLog.date >= week_start, BodyweightLog.date < week_end,
        )
        .order_by(BodyweightLog.date.asc())
        .all()
    )
    if bw_rows:
        resp['bodyweight_change'] = {'start': bw_rows[0].weight, 'end': bw_rows[-1].weight}

    # Muscle-group breakdown — same single-pass join shape as ai_routes.py's
    # _muscle_sets_range, adapted here since that one is a private closure.
    # Secondary movers get half credit (a set still stimulates them, just less
    # directly than the primary target), matching muscle_volume()'s weighting.
    set_credit = db.case((ExerciseMuscleMapping.is_primary == True, 1.0), else_=0.5)
    muscle_rows = (
        db.session.query(ExerciseMuscleMapping.muscle_group, db.func.sum(set_credit).label('cnt'))
        .join(Exercise, ExerciseMuscleMapping.exercise_template_id == Exercise.exercise_template_id)
        .join(Set, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= week_start, Workout.date < week_end,
            not_warmup, not_cardio,
            Set.reps.isnot(None),
        )
        .group_by(ExerciseMuscleMapping.muscle_group)
        .all()
    )
    resp['muscle_sets'] = {m: c for m, c in muscle_rows}

    return jsonify(resp), 200


@stats_bp.get('/api/stats/weekly-summary/history')
@jwt_required()
def weekly_summary_history():
    """Condensed list of past completed weeks (date range, workout count,
    volume) for a history/browse view — full per-week detail stays behind
    GET /api/stats/weekly-summary?week=<date>. Bucketed in Python rather than
    a SQL date_trunc grouping since the test suite runs on SQLite (production
    is Postgres) and date_trunc isn't portable across both.
    """
    from datetime import date, timedelta
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    kg_to_lbs = 2.20462 if (user.weight_unit or 'lbs') == 'kg' else 1.0

    local_date_str = request.args.get('local_date')
    try:
        today = date.fromisoformat(local_date_str) if local_date_str else date.today()
    except ValueError:
        today = date.today()
    this_week_start = today - timedelta(days=today.weekday())

    weeks_back = min(request.args.get('weeks', default=12, type=int), 52)
    history_start = this_week_start - timedelta(weeks=weeks_back)

    # Step 1: every workout in range, bucketed by its Monday week-start —
    # counted here (not via the joined query below) so a workout with zero
    # sets logged still counts toward that week's workout count.
    workout_rows = (
        db.session.query(Workout.id, Workout.date)
        .filter(Workout.user_id == user_id, Workout.date >= history_start, Workout.date < this_week_start)
        .all()
    )
    workout_week: dict[int, date] = {}
    workouts_per_week: dict[date, set] = {}
    for wid, wdate in workout_rows:
        wk = wdate.date() - timedelta(days=wdate.date().weekday())
        workout_week[wid] = wk
        workouts_per_week.setdefault(wk, set()).add(wid)

    # Step 2: volume per workout, merged into the same week buckets via the
    # workout->week map from step 1 (an inner join here would silently drop
    # workouts with no sets from the count, hence doing it in two passes).
    volume_per_week: dict[date, float] = {}
    if workout_week:
        set_rows = (
            db.session.query(Exercise.workout_id, Set.reps, Set.weight)
            .join(Exercise, Set.exercise_id == Exercise.id)
            .filter(
                Exercise.workout_id.in_(workout_week.keys()),
                Set.reps.isnot(None), Set.weight.isnot(None), Set.set_type != 'W',
            )
            .all()
        )
        for wid, reps, weight in set_rows:
            wk = workout_week.get(wid)
            if wk is None:
                continue
            volume_per_week[wk] = volume_per_week.get(wk, 0.0) + reps * weight

    history = [
        {
            'week_start': wk.isoformat(),
            'week_end': (wk + timedelta(weeks=1)).isoformat(),
            'workouts': len(ids),
            'total_volume': round(volume_per_week.get(wk, 0.0) * kg_to_lbs),
        }
        for wk, ids in sorted(workouts_per_week.items(), reverse=True)
    ]

    return jsonify(history), 200


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
    sorted_sets = sorted(
        [s for s in exercise.sets if (getattr(s, 'set_type', 'N') or 'N') != 'W'],
        key=lambda s: s.order if s.order is not None else 0,
    )
    sets = [
        {
            'reps': str(s.reps) if s.reps is not None else '',
            'weight': str(s.weight) if s.weight is not None else '',
            'set_type': getattr(s, 'set_type', 'N') or 'N',
            'cardio_duration': str(s.cardio_duration) if s.cardio_duration is not None else '',
        }
        for s in sorted_sets
    ]
    return jsonify({'sets': sets}), 200
