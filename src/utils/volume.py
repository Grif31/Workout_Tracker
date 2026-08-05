from models import db, BodyweightLog

# Equipment variants whose stored Set.weight is only PART of the true load
# moved: 0 for pure bodyweight, or just the added weight/vest for the
# "Weighted" variant. Volume calculations should add the user's bodyweight
# at the time of the workout. NEVER use this for PR / strength-standards /
# percentile logic -- those intentionally read raw Set.weight (see
# workout_routes.py's _compute_and_upsert_prs and strength_score_routes.py's
# Pull-up/Dips bodyweight fallback in the strength-score percentile helper).
BODYWEIGHT_VOLUME_EQUIPMENT = {'Bodyweight', 'Weighted'}


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


def compute_effective_weight(weight, equipment, bodyweight):
    """Stored weight plus the user's bodyweight, for equipment where the
    stored weight is only part of the true load. `bodyweight` must already be
    in the same unit as `weight` (caller's job). Identity function (returns
    `weight or 0.0` unchanged) for every other equipment, or when bodyweight
    is unknown."""
    w = weight or 0.0
    if equipment in BODYWEIGHT_VOLUME_EQUIPMENT and bodyweight:
        return w + bodyweight
    return w
