from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Workout, Exercise, Set, User, PersonalRecord, ExerciseTemplate, BodyweightLog, ExerciseMuscleMapping
from utils.lift_progress import compute_most_improved_lift
from utils.cardio_progress import compute_most_improved_cardio

weekly_summary_bp = Blueprint('weekly_summary_bp', __name__)

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


@weekly_summary_bp.get('/api/stats/weekly-summary')
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

    # Reps — same SQL-aggregate pattern as profile_stats. Volume itself reads
    # the already-computed, bodyweight-aware Workout.volume (canonical lbs)
    # instead of re-deriving reps*weight, so Bodyweight/Weighted equipment
    # sets aren't undercounted here.
    reps_row = (
        db.session.query(db.func.sum(Set.reps).label('reps'))
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= week_start, Workout.date < week_end,
            Set.reps.isnot(None), Set.weight.isnot(None), Set.set_type != 'W',
        )
        .first()
    )
    total_volume = (
        db.session.query(db.func.sum(Workout.volume))
        .filter(Workout.user_id == user_id, Workout.date >= week_start, Workout.date < week_end)
        .scalar()
    ) or 0.0
    resp['total_volume'] = round(total_volume)
    resp['total_reps'] = int(reps_row.reps or 0)

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
    prev_week_volume = (
        db.session.query(db.func.sum(Workout.volume))
        .filter(Workout.user_id == user_id, Workout.date >= prev_week_start, Workout.date < week_start)
        .scalar()
    ) or 0.0
    resp['prev_week_workouts'] = prev_workout_count
    resp['prev_week_volume'] = round(prev_week_volume)

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
    rolling_volume = (
        db.session.query(db.func.sum(Workout.volume))
        .filter(Workout.user_id == user_id, Workout.date >= rolling_start, Workout.date < week_start)
        .scalar()
    ) or 0.0
    resp['rolling_avg_workouts'] = round(rolling_workout_count / 4.0, 1)
    resp['rolling_avg_volume'] = round(rolling_volume / 4.0)

    # Most-improved lift — shared helper so it can also feed the AI coach's
    # insight context without duplicating the query logic.
    most_improved = compute_most_improved_lift(user_id, week_start, week_end, prev_week_start, kg_to_lbs)
    if most_improved:
        resp['most_improved_lift'] = most_improved

    # Most-improved cardio — independent from most_improved_lift (a week can
    # surface both), since cardio PRs are milestone-based rather than a
    # single per-exercise 1RM.
    most_improved_cardio = compute_most_improved_cardio(user_id, week_start, week_end, prev_week_start)
    if most_improved_cardio:
        resp['most_improved_cardio'] = most_improved_cardio

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
    # Full ORM objects (not just specific columns) so `tmpl.muscle_group` — a
    # Python @property assembled from muscle_mappings, not a mapped column —
    # can be read directly; PR lists here are small and capped, so the N+1
    # lazy-load this triggers per exercise is negligible.
    pr_rows = (
        db.session.query(PersonalRecord, ExerciseTemplate)
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
            'exercise_template_id': tmpl.id, 'exercise_name': tmpl.name, 'equipment': tmpl.equipment,
            # ExerciseDetailScreen's isCardio check is a literal `muscleGroup === 'Cardio'`
            # string comparison (matches ExercisesScreen.tsx's own navigation call) —
            # the real muscle_mappings-derived string isn't meaningful for cardio.
            'muscle_group': 'Cardio' if tmpl.exercise_type == 'cardio' else tmpl.muscle_group,
            'image_url': tmpl.image_url, 'is_custom': tmpl.user_id is not None,
            'pr_type': pr.pr_type, 'value': pr.value,
            'weight_context': None if pr.weight_context is None or pr.weight_context < 0 else pr.weight_context,
        }
        for pr, tmpl in pr_rows
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


@weekly_summary_bp.get('/api/stats/weekly-summary/history')
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
    # workout->week map from step 1. Reads the already-computed, bodyweight-
    # aware Workout.volume (canonical lbs) instead of re-deriving reps*weight.
    volume_per_week: dict[date, float] = {}
    if workout_week:
        vol_rows = (
            db.session.query(Workout.id, Workout.volume)
            .filter(Workout.id.in_(workout_week.keys()))
            .all()
        )
        for wid, vol in vol_rows:
            wk = workout_week.get(wid)
            if wk is None:
                continue
            volume_per_week[wk] = volume_per_week.get(wk, 0.0) + (vol or 0.0)

    history = [
        {
            'week_start': wk.isoformat(),
            'week_end': (wk + timedelta(weeks=1)).isoformat(),
            'workouts': len(ids),
            'total_volume': round(volume_per_week.get(wk, 0.0)),
        }
        for wk, ids in sorted(workouts_per_week.items(), reverse=True)
    ]

    return jsonify(history), 200
