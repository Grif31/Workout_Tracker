from models import db, BodyweightLog

# Equipment variants whose stored Set.weight is only PART of the true load
# moved: 0 for pure bodyweight, or just the added weight/vest for the
# "Weighted" variant. Volume calculations should add the user's bodyweight
# at the time of the workout, scaled by the exercise's bodyweight_load_factor
# (a push-up moves ~60% of bodyweight, a sit-up ~35%, a pull-up ~100%).
# NEVER use this for PR / strength-standards / percentile logic -- those
# intentionally read raw Set.weight (see workout_routes.py's
# _compute_and_upsert_prs and strength_score_routes.py's Pull-up/Dips
# bodyweight fallback in the strength-score percentile helper).
BODYWEIGHT_VOLUME_EQUIPMENT = {'Bodyweight', 'Weighted'}


def derive_bodyweight_load_factor(name, equipment):
    """Best-guess fraction of bodyweight that counts toward volume for a
    Bodyweight/Weighted exercise, inferred from its name. Returns None for
    every other equipment (caller stores NULL, which volume math treats as
    1.0). Used to seed ExerciseTemplate.bodyweight_load_factor in the
    migration, in seed.py, and when a user creates a custom exercise."""
    if equipment not in BODYWEIGHT_VOLUME_EQUIPMENT:
        return None
    n = (name or '').lower()
    if any(k in n for k in ('clamshell', 'fire hydrant', 'donkey kick', 'bird dog')):
        return 0.0
    if any(k in n for k in ('pull up', 'pull-up', 'pullup', 'chin up', 'chin-up', 'chinup',
                            'dip', 'muscle up', 'pistol', 'dead hang', 'calf raise')):
        return 1.0
    if any(k in n for k in ('squat', 'lunge', 'split squat', 'step up', 'step-up', 'nordic')):
        return 0.85
    if any(k in n for k in ('crunch', 'sit up', 'sit-up', 'situp', 'leg raise', 'knee raise',
                            'hyperextension', 'back extension', 'glute bridge', 'bridge',
                            'flutter', 'russian twist', 'superman')):
        return 0.35
    if any(k in n for k in ('push up', 'push-up', 'pushup', 'row', 'rollout', 'ab wheel',
                            'pike', 'plank')):
        return 0.60
    return 0.60  # unknown bodyweight movement -- conservative middle


def get_bodyweight_at(user_id, target_date):
    """Most recent BodyweightLog on/before target_date, in the user's current
    weight_unit (a user's logs are always internally consistent in one unit
    at any point in time). Falls back to the earliest log if the workout
    predates every log. Returns None if the user has never logged a
    bodyweight -- callers must treat this as a graceful no-op (leave stored
    weight as-is), not an error."""
    prior = (
        db.session.query(BodyweightLog.weight)
        .filter(BodyweightLog.user_id == user_id, BodyweightLog.date <= target_date)
        .order_by(BodyweightLog.date.desc())
        .first()
    )
    if prior:
        return prior[0]
    earliest = (
        db.session.query(BodyweightLog.weight)
        .filter(BodyweightLog.user_id == user_id)
        .order_by(BodyweightLog.date.asc())
        .first()
    )
    return earliest[0] if earliest else None


def compute_effective_weight(weight, equipment, bodyweight, load_factor=1.0):
    """Stored weight plus the user's bodyweight (scaled by load_factor), for
    equipment where the stored weight is only part of the true load.
    `bodyweight` must already be in the same unit as `weight` (caller's job).
    `load_factor` is ExerciseTemplate.bodyweight_load_factor -- the fraction
    of bodyweight the movement actually shifts (None -> 1.0). Identity
    function (returns `weight or 0.0` unchanged) for every other equipment,
    or when bodyweight is unknown."""
    w = weight or 0.0
    if equipment in BODYWEIGHT_VOLUME_EQUIPMENT and bodyweight:
        f = load_factor if load_factor is not None else 1.0
        return w + bodyweight * f
    return w
