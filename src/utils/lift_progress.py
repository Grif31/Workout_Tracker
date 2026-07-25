from models import db, Exercise, Set, Workout, PersonalRecord, ExerciseTemplate
from utils.strength_standards import epley_1rm  # noqa: F401 (re-exported for callers that also need the raw formula)

_EPLEY_EXPR = db.case((Set.reps <= 1, Set.weight), else_=Set.weight * (1 + Set.reps / 30.0))


def _best_1rm_by_exercise(user_id, start, end):
    """Best Epley-estimated 1RM per exercise from raw Set data in [start, end)."""
    not_warmup = db.or_(Set.set_type.is_(None), Set.set_type != 'W')
    not_cardio = db.func.lower(Exercise.exercise_type) != 'cardio'
    rows = (
        db.session.query(Exercise.exercise_template_id, db.func.max(_EPLEY_EXPR).label('best'))
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


def compute_most_improved_lift(user_id, period_start, period_end, prev_period_start, kg_to_lbs: float = 1.0):
    """The exercise with the largest genuine new-PR gain in [period_start, period_end)
    vs. its best in [prev_period_start, period_start).

    "Most improved" must be gated on a real new all-time-best estimated_1rm
    PersonalRecord actually achieved in the period — comparing only against
    the immediately-prior period would flag a lift as "improved" even when
    it's still below the user's real standing PR (e.g. an off period before
    it dragging the comparison down). PersonalRecord itself has no history
    (rows are overwritten in place), so the "prev" side is recomputed
    directly from Set data instead.

    Returns None if no exercise qualifies, else
    {exercise_name, prev_best, this_best, gain} with weights already
    converted via kg_to_lbs (pass 1.0 to leave them in the stored unit).
    """
    new_pr_values = {
        tid: value
        for tid, value in db.session.query(PersonalRecord.exercise_template_id, PersonalRecord.value)
        .filter(
            PersonalRecord.user_id == user_id,
            PersonalRecord.pr_type == 'estimated_1rm',
            PersonalRecord.achieved_at >= period_start,
            PersonalRecord.achieved_at < period_end,
        )
        .all()
    }
    if not new_pr_values:
        return None

    prev_1rm = _best_1rm_by_exercise(user_id, prev_period_start, period_start)
    gains = {
        tid: new_pr_values[tid] - prev_1rm[tid]
        for tid in new_pr_values.keys() & prev_1rm.keys()
        if new_pr_values[tid] > prev_1rm[tid]
    }
    if not gains:
        return None

    best_tid = max(gains, key=gains.get)
    tmpl = db.session.get(ExerciseTemplate, best_tid)
    return {
        'exercise_name': tmpl.name,
        'prev_best': round(prev_1rm[best_tid] * kg_to_lbs, 1),
        'this_best': round(new_pr_values[best_tid] * kg_to_lbs, 1),
        'gain': round(gains[best_tid] * kg_to_lbs, 1),
    }
