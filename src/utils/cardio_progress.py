from models import db, Exercise, Set, Workout, PersonalRecord, ExerciseTemplate

# Mirrors workout_routes.py's CARDIO_DISTANCE_MILESTONES / CARDIO_DURATION_MILESTONES
# exactly — duplicated (not imported) so this read-only comparison never touches
# the live PR-write path; keep both lists in sync if the milestones ever change.
_DISTANCE_MILESTONES = [
    (0.4,     '400m'),
    (0.8,     '800m'),
    (1.0,     '1K'),
    (1.60934, '1 Mile'),
    (5.0,     '5K'),
    (10.0,    '10K'),
    (21.0975, 'Half Marathon'),
    (42.195,  'Marathon'),
]
_DURATION_MILESTONES = [
    (10.0, '10 min'),
    (20.0, '20 min'),
    (30.0, '30 min'),
    (60.0, '60 min'),
]
_MILESTONE_LABELS = {('best_time', km): label for km, label in _DISTANCE_MILESTONES}
_MILESTONE_LABELS.update({('best_distance', mn): label for mn, label in _DURATION_MILESTONES})


def _cardio_bouts(user_id, exercise_template_id, start, end):
    """(dist_km, duration_min) pairs for one exercise's cardio sets in [start, end)."""
    rows = (
        db.session.query(Set.distance, Set.distance_unit, Set.cardio_duration)
        .join(Exercise, Set.exercise_id == Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user_id,
            Workout.date >= start, Workout.date < end,
            Exercise.exercise_template_id == exercise_template_id,
            Exercise.exercise_type == 'cardio',
            Set.distance.isnot(None), Set.cardio_duration.isnot(None),
        )
        .all()
    )
    bouts = []
    for distance, distance_unit, duration in rows:
        if distance and duration and distance > 0 and duration > 0:
            dist_km = distance if (distance_unit or 'km') == 'km' else distance * 1.60934
            bouts.append((dist_km, duration))
    return bouts


def _project_cardio_bests(bouts):
    """Best value reachable at each milestone via constant-pace extrapolation
    from the given bouts — same per-bout projection math as
    workout_routes.py's _compute_and_upsert_cardio_prs. Returns
    {(pr_type, weight_context): projected_value}; lower is better for
    best_time, higher is better for best_distance.
    """
    best = {}
    for dist_km, duration in bouts:
        for target_km, _label in _DISTANCE_MILESTONES:
            if dist_km < target_km:
                continue
            est_time = round(duration * (target_km / dist_km), 4)
            key = ('best_time', target_km)
            if key not in best or est_time < best[key]:
                best[key] = est_time
        for target_min, _label in _DURATION_MILESTONES:
            if duration < target_min:
                continue
            est_dist = round(dist_km * (target_min / duration), 4)
            key = ('best_distance', target_min)
            if key not in best or est_dist > best[key]:
                best[key] = est_dist
    return best


def compute_most_improved_cardio(user_id, period_start, period_end, prev_period_start):
    """The cardio exercise+milestone with the largest genuine new-PR
    improvement in [period_start, period_end). Mirrors
    compute_most_improved_lift's "must be a real new PersonalRecord, not
    just better than an off period" gate — cardio PRs are per-milestone
    (weight_context), so each (exercise, pr_type, weight_context) is
    compared against what was reachable from that same exercise's raw Set
    data in [prev_period_start, period_start).

    Returns None if no exercise qualifies, else
    {exercise_name, pr_type, milestone_label, prev_best, this_best, gain}.
    prev_best/this_best/gain are minutes for best_time, km for best_distance
    — the caller formats based on pr_type.
    """
    new_pr_rows = (
        db.session.query(
            PersonalRecord.exercise_template_id, PersonalRecord.pr_type,
            PersonalRecord.weight_context, PersonalRecord.value,
        )
        .filter(
            PersonalRecord.user_id == user_id,
            PersonalRecord.pr_type.in_(('best_time', 'best_distance')),
            PersonalRecord.achieved_at >= period_start,
            PersonalRecord.achieved_at < period_end,
        )
        .all()
    )
    if not new_pr_rows:
        return None

    by_exercise: dict = {}
    for tid, pr_type, weight_context, value in new_pr_rows:
        by_exercise.setdefault(tid, []).append((pr_type, weight_context, value))

    best_candidate = None
    for tid, candidates in by_exercise.items():
        prev_bests = _project_cardio_bests(_cardio_bouts(user_id, tid, prev_period_start, period_start))
        for pr_type, weight_context, value in candidates:
            prev_value = prev_bests.get((pr_type, weight_context))
            if prev_value is None:
                continue
            gain = (prev_value - value) if pr_type == 'best_time' else (value - prev_value)
            if gain <= 0:
                continue
            if best_candidate is None or gain > best_candidate['gain']:
                best_candidate = {
                    'tid': tid, 'pr_type': pr_type, 'weight_context': weight_context,
                    'value': value, 'prev_value': prev_value, 'gain': gain,
                }

    if best_candidate is None:
        return None

    tmpl = db.session.get(ExerciseTemplate, best_candidate['tid'])
    return {
        'exercise_name': tmpl.name,
        'pr_type': best_candidate['pr_type'],
        'milestone_label': _MILESTONE_LABELS.get(
            (best_candidate['pr_type'], best_candidate['weight_context']), ''
        ),
        'prev_best': round(best_candidate['prev_value'], 2),
        'this_best': round(best_candidate['value'], 2),
        'gain': round(best_candidate['gain'], 2),
    }
