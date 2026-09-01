from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import selectinload
from models import db, Workout, Exercise, Set, User, ExerciseTemplate, ExerciseMuscleMapping
from utils.strength_standards import epley_1rm
from utils.volume import compute_effective_weight, get_bodyweight_at, BODYWEIGHT_VOLUME_EQUIPMENT

stats_bp = Blueprint('stats_bp', __name__)


@stats_bp.get('/api/stats/exercise')
@jwt_required()
def exercise_stats():
    user_id = get_jwt_identity()
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify({'message': 'name param required'}), 400
    template_id = request.args.get('exercise_template_id', type=int)

    # Hand-curated (or custom-exercise: none) "how to perform" text — fetched
    # independently of whether the user has ever logged this exercise, so a
    # brand-new exercise still gets a description on first view.
    if template_id:
        tmpl = db.session.get(ExerciseTemplate, template_id)
    else:
        tmpl = ExerciseTemplate.query.filter(db.func.lower(ExerciseTemplate.name) == name.lower()).first()
    description = tmpl.description if tmpl else None

    query = (
        db.session.query(Exercise, Workout)
        .join(Workout, Exercise.workout_id == Workout.id)
        .options(selectinload(Exercise.sets))
        .filter(Workout.user_id == user_id)
    )
    # exercise_template_id is the real identity link — trust it alone when given.
    # Logged Exercise.name can drift from the template's name (e.g. GPS-tracked
    # runs historically saved as "Run" instead of the "Running" template name),
    # so requiring both would wrongly exclude rows that clearly belong together.
    if template_id:
        query = query.filter(Exercise.exercise_template_id == template_id)
    else:
        query = query.filter(db.func.lower(Exercise.name) == name.lower())
    rows = query.order_by(Workout.date.asc()).all()

    if not rows:
        return jsonify({'exercise_name': name, 'description': description, 'personal_bests': {}, 'totals': {}, 'history': []})

    # Determine exercise type from first row
    exercise_type = (rows[0][0].exercise_type or 'strength').lower()

    if exercise_type == 'cardio':
        return _cardio_exercise_stats(name, rows, description)

    templates_cache = {}

    def _template_for(tid):
        if tid is None:
            return None
        if tid not in templates_cache:
            templates_cache[tid] = db.session.get(ExerciseTemplate, tid)
        return templates_cache[tid]

    from collections import defaultdict
    # 'equipment' / 'load_factor' are parallel lists (same order/length as
    # 'sets') used only internally to compute bodyweight-aware volume -- kept
    # out of the 'sets' dicts themselves since those are returned as-is in the
    # API response.
    workout_map = defaultdict(lambda: {'workout': None, 'sets': [], 'equipment': [], 'load_factor': [], 'notes': None})
    for exercise, workout in rows:
        key = workout.id
        workout_map[key]['workout'] = workout
        if exercise.notes and workout_map[key]['notes'] is None:
            workout_map[key]['notes'] = exercise.notes
        tmpl = _template_for(exercise.exercise_template_id)
        equip = tmpl.equipment if tmpl else None
        lf = tmpl.bodyweight_load_factor if tmpl else None
        for s in exercise.sets:
            workout_map[key]['sets'].append({'reps': s.reps, 'weight': s.weight, 'set_type': s.set_type or 'N'})
            workout_map[key]['equipment'].append(equip)
            workout_map[key]['load_factor'].append(lf)

    history = []
    all_1rms, all_weights, all_reps, all_set_volumes = [], [], [], []
    total_sets = 0
    total_reps = 0

    for wid, data in sorted(workout_map.items(), key=lambda x: x[1]['workout'].date):
        workout = data['workout']
        sets = data['sets']
        equipment_list = data['equipment']
        load_factor_list = data['load_factor']
        if not sets:
            continue

        # Bodyweight-at-the-time is only looked up if this session actually
        # has a Bodyweight/Weighted set — avoids a query for ordinary sessions.
        bw_at_session = None
        if any(e in BODYWEIGHT_VOLUME_EQUIPMENT for e in equipment_list):
            bw_at_session = get_bodyweight_at(user_id, workout.date)

        session_1rms = []
        session_volume = 0
        best_set = None

        for s, equip, lf in zip(sets, equipment_list, load_factor_list):
            r, w = s['reps'], s['weight']
            # weight 0 = bodyweight set: counts for reps/sets, not weight stats
            if r and w is not None and s['set_type'] != 'W':
                effective_w = compute_effective_weight(w, equip, bw_at_session, lf)
                session_volume += r * effective_w
                all_set_volumes.append(r * effective_w)
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
        'max_set_volume': round(max(all_set_volumes), 1) if all_set_volumes else 0,
    }
    totals = {
        'total_workouts': len(workout_map),
        'total_sets': total_sets,
        'total_reps': total_reps,
    }

    return jsonify({
        'exercise_type': 'strength',
        'exercise_name': name,
        'description': description,
        'personal_bests': personal_bests,
        'totals': totals,
        'history': list(reversed(history)),
    })


def _cardio_exercise_stats(name, rows, description=None):
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
        'description': description,
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
    weekly_goal = max(1, request.args.get('weekly_goal', 1, type=int))

    total_workouts = Workout.query.filter_by(user_id=user_id).count()

    total_volume = (
        db.session.query(db.func.sum(Workout.volume))
        .filter(Workout.user_id == user_id)
        .scalar()
    ) or 0.0

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

    # Current streak: same "don't let an incomplete current period break the
    # streak" shape as the weekly streak above -- the in-progress month only
    # counts if it already hit the goal, but a below-goal in-progress month
    # must still fall through to check prior, fully-completed months rather
    # than zeroing the streak out.
    def _prev_ym(y, m):
        return (y, m - 1) if m > 1 else (y - 1, 12)

    monthly_current = 0
    y_c, m_c = today.year, today.month
    if month_counts.get((y_c, m_c), 0) >= monthly_goal:
        monthly_current += 1
    y_c, m_c = _prev_ym(y_c, m_c)
    while month_counts.get((y_c, m_c), 0) >= monthly_goal:
        monthly_current += 1
        y_c, m_c = _prev_ym(y_c, m_c)

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

    today = date.today()
    start_of_week = today - timedelta(days=today.weekday())  # Monday
    eight_weeks_ago = start_of_week - timedelta(weeks=7)

    workouts = (
        db.session.query(Workout)
        .filter(Workout.user_id == user_id)
        .filter(Workout.date >= eight_weeks_ago)
        .options(selectinload(Workout.exercises).selectinload(Exercise.sets))
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
                week['volume'] += workout.volume or 0.0
                break

    # Last 7 days summary (volume in lbs)
    seven_days_ago = today - timedelta(days=6)
    recent = [w for w in workouts
              if (w.date.date() if hasattr(w.date, 'date') else w.date) >= seven_days_ago]
    week_volume = sum(w.volume or 0.0 for w in recent)
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
                    _add_workout(b, w); break

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
                    _add_workout(b, w); break

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
                    _add_workout(b, w); break

    workouts = (Workout.query.filter_by(user_id=user_id)
                .filter(Workout.date >= start)
                .options(selectinload(Workout.exercises).selectinload(Exercise.sets))
                .all())
    for w in workouts:
        w_date = w.date.date() if hasattr(w.date, 'date') else w.date
        assign(w, w_date)

    return jsonify({'buckets': [
        {'label': b['label'], 'volume': round(b['volume']), 'sets': b['sets'], 'count': b['count']}
        for b in buckets
    ]})


def _add_workout(bucket, workout):
    bucket['count'] += 1
    bucket['volume'] += workout.volume or 0.0
    for ex in workout.exercises:
        for s in ex.sets:
            if s.reps:
                bucket['sets'] += 1


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
