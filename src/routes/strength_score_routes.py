from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Exercise, Set, Workout, User, ExerciseTemplate, PersonalRecord, StrengthScoreSnapshot, BodyweightLog

strength_score_bp = Blueprint('strength_score_bp', __name__)


def _exercise_percentile_data(user_id, standards_key, template_ids, gender, unit_to_lbs, bw_lbs, age_factor):
    """Best-1RM + percentile for one standards_key, shared by strength_score()
    and the single-exercise lookup so both stay in sync. Returns None if the
    user has no qualifying data for this lift (untracked, not an error)."""
    from utils.strength_standards import compute_percentile

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

    # A logged true 1RM (an actual single-rep set) is more trustworthy than
    # an Epley estimate from a different, submaximal set — the formula can
    # overshoot at higher rep ranges and claim a user is stronger than their
    # real, achieved single. Prefer the true 1RM whenever one exists; only
    # fall back to the estimate when no true 1RM has been logged at all.
    best_1rm = true_1rm if true_1rm > 0 else est_1rm

    # Pull-up / Dip bodyweight fallback: standards (and logged weighted sets)
    # are on the ADDED-weight scale, so estimate added 1RM as Epley total
    # minus bodyweight: bw*(1 + r/30) - bw = bw*r/30.
    if best_1rm == 0.0 and standards_key in ('Pull-up', 'Dips'):
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
        return None

    bw_ratio = (best_1rm / bw_lbs) * age_factor
    pct = compute_percentile(standards_key, gender, bw_ratio)
    if pct is None:
        return None

    return {
        'percentile': pct,
        'best_1rm': round(best_1rm / unit_to_lbs, 1),
        'true_1rm': round(true_1rm / unit_to_lbs, 1) if true_1rm > 0 else None,
    }


# Both screens render the credit as a whole percent ("Age-adjusted +3%"), so a
# factor under this floor would show as "+0%". Don't claim an adjustment then.
_MIN_AGE_CREDIT = 1.005

_TIER_BOUNDARIES = [
    (10,  'Beginner'),
    (30,  'Intermediate'),
    (60,  'Advanced'),
    (80,  'Elite'),
    (95,  'Legend'),
]


def _compute_thresholds(standards_key, gender, bw_lbs, unit_to_lbs):
    """Weight needed at each rank-tier boundary for one lift, in the user's
    display unit — shared by strength_score()'s big6/supplemental lists and
    the single-exercise lookup so both stay in sync."""
    from utils.strength_standards import compute_weight_at_percentile
    thresholds = []
    for boundary_pct, rank_name in _TIER_BOUNDARIES:
        w = compute_weight_at_percentile(standards_key, gender, bw_lbs, boundary_pct)
        if w is not None:
            thresholds.append({'percentile': boundary_pct, 'rank': rank_name, 'weight': round(w / unit_to_lbs, 1)})
    return thresholds


def _endurance_data(user_id, gender, user_age):
    """Running pace percentiles for one user: the best pace at each milestone
    distance, that distance's percentile, and the tier-weighted overall.

    Shared by strength_score(), which blends it into the Greek rank, and the
    endurance-score endpoint. Needs gender (the pace tables are gendered) but
    not bodyweight, which pace does not depend on.
    """
    from utils.endurance_standards import (
        compute_pace_percentile, compute_endurance_overall, endurance_age_factor,
    )

    running_prs = (
        db.session.query(PersonalRecord.weight_context, PersonalRecord.value)
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .filter(
            PersonalRecord.user_id == user_id,
            PersonalRecord.pr_type == 'best_time',
            ExerciseTemplate.standards_key == 'Running',
        )
        .all()
    )
    best_pace_by_distance: dict[float, float] = {}
    for dist_km, time_min in running_prs:
        if not dist_km or dist_km <= 0 or not time_min or time_min <= 0:
            continue
        pace = time_min / dist_km
        if dist_km not in best_pace_by_distance or pace < best_pace_by_distance[dist_km]:
            best_pace_by_distance[dist_km] = pace

    # Age credit divides pace (a faster effective pace) before lookup. The
    # endurance anchors are WMA running age-grading, not the lifting curve.
    age_factor = endurance_age_factor(user_age) if user_age else 1.0
    percentiles: dict[float, float] = {}
    for dist_km, pace in best_pace_by_distance.items():
        pct = compute_pace_percentile(dist_km, gender, pace / age_factor)
        if pct is not None:
            percentiles[dist_km] = pct

    return {
        'paces': best_pace_by_distance,
        'percentiles': percentiles,
        'overall': compute_endurance_overall(percentiles),
        'age_factor': age_factor,
    }


def _user_age(user):
    if not user.birth_date:
        return None
    from datetime import date as _date
    today = _date.today()
    return today.year - user.birth_date.year - (
        (today.month, today.day) < (user.birth_date.month, user.birth_date.day)
    )


def _strength_data(user, user_age):
    """Per-lift percentiles and the weighted overall for one user.

    Shared by strength_score() and _greek_rank_data(), which only needs the
    overall to check the top-rank gates. Needs gender. Without bodyweight the
    percentiles are skipped (they're bodyweight ratios), so overall is None.
    """
    from utils.strength_standards import STANDARDS, age_scaling_factor, compute_overall_score

    has_bodyweight = bool(user.bodyweight)
    kg_to_lbs = 2.20462
    # Logged weights are stored in the user's unit, so normalise to lbs before
    # comparing bodyweight ratios against the lbs-calibrated standards.
    unit_to_lbs = kg_to_lbs if (user.weight_unit or 'lbs') == 'kg' else 1.0
    bw_lbs = user.bodyweight * unit_to_lbs if has_bodyweight else None
    age_factor = age_scaling_factor(user_age) if user_age else 1.0

    # Per-exercise percentiles via standards_key: one bulk query, no fuzzy matching
    valid_keys = set(STANDARDS.get(user.gender, {}).keys())
    keyed_templates = (
        db.session.query(ExerciseTemplate.id, ExerciseTemplate.standards_key)
        .filter(ExerciseTemplate.standards_key.in_(valid_keys))
        .all()
    )
    templates_by_key: dict[str, list[int]] = {}
    for tmpl_id, sk in keyed_templates:
        templates_by_key.setdefault(sk, []).append(tmpl_id)

    percentiles: dict[str, float] = {}
    best_1rms: dict[str, float] = {}
    true_1rms: dict[str, float] = {}
    if has_bodyweight:
        for exercise_name, template_ids in templates_by_key.items():
            result = _exercise_percentile_data(user.id, exercise_name, template_ids, user.gender, unit_to_lbs, bw_lbs, age_factor)
            if result is not None:
                percentiles[exercise_name] = result['percentile']
                best_1rms[exercise_name] = result['best_1rm']
                if result['true_1rm'] is not None:
                    true_1rms[exercise_name] = result['true_1rm']

    return {
        'has_bodyweight': has_bodyweight,
        'unit_to_lbs': unit_to_lbs,
        'bw_lbs': bw_lbs,
        'age_factor': age_factor,
        'valid_keys': valid_keys,
        'percentiles': percentiles,
        'best_1rms': best_1rms,
        'true_1rms': true_1rms,
        'overall': compute_overall_score(percentiles) if percentiles else None,
    }


def _effort_components(user_id):
    """Consistency, dedication and training-load volume, each 0-100."""
    from datetime import datetime, timedelta
    from sqlalchemy import func, case, and_, or_
    from utils.strength_standards import (
        compute_consistency_score, compute_dedication_score,
        compute_training_load_score, workout_training_load, TRAINING_LOAD_WINDOW_WEEKS,
    )

    now = datetime.now()
    workouts_12wk = Workout.query.filter(
        Workout.user_id == user_id,
        Workout.date >= now - timedelta(weeks=12),
    ).all()
    workouts_13wk_count = Workout.query.filter(
        Workout.user_id == user_id,
        Workout.date >= now - timedelta(weeks=13),
    ).count()

    # Per-workout load in one query: working sets (warm-ups and empty rows
    # excluded; a timed hold counts as a set) and cardio minutes. Grouped by
    # workout because the anti-padding cap applies per workout.
    ex_type = func.lower(func.coalesce(Exercise.exercise_type, 'strength'))
    not_warmup = or_(Set.set_type.is_(None), Set.set_type != 'W')
    load_rows = (
        db.session.query(
            Workout.id,
            func.sum(case(
                (ex_type == 'cardio', 0),
                (and_(ex_type == 'duration', not_warmup, Set.cardio_duration > 0), 1),
                (and_(ex_type != 'duration', not_warmup, Set.reps > 0), 1),
                else_=0,
            )),
            func.sum(case(
                (ex_type == 'cardio', func.coalesce(Set.cardio_duration, 0)),
                else_=0,
            )),
        )
        .join(Exercise, Exercise.workout_id == Workout.id)
        .join(Set, Set.exercise_id == Exercise.id)
        .filter(Workout.user_id == user_id, Workout.date >= now - timedelta(weeks=TRAINING_LOAD_WINDOW_WEEKS))
        .group_by(Workout.id)
        .all()
    )
    total_load = sum(
        workout_training_load(int(sets or 0), float(cardio_min or 0))
        for _, sets, cardio_min in load_rows
    )

    return (
        compute_consistency_score(workouts_12wk),
        compute_dedication_score(workouts_13wk_count),
        compute_training_load_score(total_load / TRAINING_LOAD_WINDOW_WEEKS),
    )


_NOT_COMPUTED = object()


def _greek_rank_data(user, strength_overall=_NOT_COMPUTED, endurance_overall=_NOT_COMPUTED):
    """The Greek rank for one user.

    Effort sets the score, so every user gets a rank with no profile fields
    required. Performance (the higher of the Strength and Endurance Scores)
    only gates Titan and Aretē. A caller that already computed a leg passes
    it in, None meaning no score, to avoid computing it twice.
    """
    from utils.strength_standards import (
        compute_greek_score, greek_rank_from_score, apply_greek_rank_gates,
    )

    if user.gender:
        user_age = _user_age(user)
        if strength_overall is _NOT_COMPUTED:
            strength_overall = _strength_data(user, user_age)['overall']
        if endurance_overall is _NOT_COMPUTED:
            endurance_overall = _endurance_data(user.id, user.gender, user_age)['overall']
    else:
        # Both the lift and pace standards are gendered, so neither leg scores
        strength_overall = endurance_overall = None

    consistency, dedication, volume = _effort_components(user.id)
    score = compute_greek_score(consistency, dedication, volume)
    legs = [v for v in (strength_overall, endurance_overall) if v is not None]
    performance = max(legs) if legs else None
    rank, next_gate = apply_greek_rank_gates(score, performance)

    return {
        'rank': rank,
        'score': score,
        'score_rank': greek_rank_from_score(score),
        'next_gate': next_gate,
        'consistency': consistency,
        'dedication': dedication,
        'volume': volume,
        'strength': strength_overall,
        'endurance': endurance_overall,
        'performance': performance,
    }


@strength_score_bp.get('/api/stats/strength-score')
@jwt_required()
def strength_score():
    from datetime import datetime, timedelta
    from utils.strength_standards import (
        BIG_6, COMPOUND_SECONDARY,
        percentile_to_strength_rank, compute_muscle_group_scores,
    )

    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))

    if not user.gender:
        return jsonify({'missing': ['gender']}), 422
    # Bodyweight only gates the STRENGTH leg (its percentiles are
    # bodyweight-ratio based). The endurance leg and the Greek rank don't need
    # it, and the response carries missing_for_strength so StrengthScoreScreen
    # can keep showing its "Log Bodyweight" gate.
    user_age = _user_age(user)
    _strength = _strength_data(user, user_age)
    has_bodyweight = _strength['has_bodyweight']
    unit_to_lbs = _strength['unit_to_lbs']
    bw_lbs = _strength['bw_lbs']
    age_factor = _strength['age_factor']
    valid_keys = _strength['valid_keys']
    exercise_percentiles = _strength['percentiles']
    exercise_1rms = _strength['best_1rms']
    exercise_true_1rms = _strength['true_1rms']
    has_strength_data = bool(exercise_percentiles)

    # Most recent bodyweight log entry, surfaced so the UI can flag a stale
    # bodyweight (the score uses the live User.bodyweight scalar, which can
    # silently drift out of date if the user hasn't logged in a while).
    last_bw_log_date = (
        db.session.query(db.func.max(BodyweightLog.date))
        .filter(BodyweightLog.user_id == user_id)
        .scalar()
    )

    # No hard gate on missing exercise_percentiles here: a user with zero
    # tracked strength lifts (e.g. cardio-only) still gets a Greek rank, which
    # is effort-based. StrengthScoreScreen detects this case itself via
    # `exercises_used === 0` in the response rather than an error status.

    # Overall score — Big 6 (70%), compound secondary (20%), isolation (10%).
    # Missing categories are dropped and weights renormalized automatically.
    # compute_overall_score is shared with compute_muscle_group_scores and the
    # snapshot-history backfill so all three weight identically.
    big6_scores     = [exercise_percentiles[e] for e in BIG_6 if e in exercise_percentiles]
    compound_scores = [v for k, v in exercise_percentiles.items()
                       if k not in BIG_6 and k in COMPOUND_SECONDARY]
    isolation_scores = [v for k, v in exercise_percentiles.items()
                        if k not in BIG_6 and k not in COMPOUND_SECONDARY]

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

    overall = _strength['overall'] or 0.0

    # Muscle group scores
    muscle_groups = compute_muscle_group_scores(exercise_percentiles)

    # ── Endurance leg (running only in v1) ─────────────────────────────────
    # best_time PRs on standards_key='Running' templates (outdoor + treadmill
    # pool) → pace per milestone distance → percentile vs. PACE_STANDARDS.
    # Needs gender but NOT bodyweight, so it computes even when the strength
    # leg was skipped above.
    from utils.endurance_standards import CORE_DISTANCES, DISTANCE_LABELS
    _endurance = _endurance_data(user_id, user.gender, user_age)
    best_pace_by_distance = _endurance['paces']
    endurance_percentiles = _endurance['percentiles']
    endurance_overall = _endurance['overall']

    # Both legs are already computed above, so hand them over instead of
    # letting _greek_rank_data compute them again.
    greek = _greek_rank_data(
        user,
        strength_overall=overall if has_strength_data else None,
        endurance_overall=endurance_overall,
    )
    greek_score = greek['score']
    greek_rank = greek['rank']

    # Save snapshot once per 24h — only when there's actual strength data, so
    # cardio-only (or bodyweight-less) users don't pollute their strength
    # history chart with score-0 rows.
    if has_strength_data:
        last_snap = (
            StrengthScoreSnapshot.query
            .filter_by(user_id=user_id, score_type='strength')
            .order_by(StrengthScoreSnapshot.created_at.desc())
            .first()
        )
        if not last_snap or (datetime.now() - last_snap.created_at).total_seconds() > 86400:
            db.session.add(StrengthScoreSnapshot(user_id=user_id, score=overall, score_type='strength'))
            db.session.commit()

    # Build response
    # TODO(post-launch): server-side premium — RevenueCat webhook sets
    # user.is_premium and this reads it. Until then the API over-serves
    # premium fields and gating is client-only (see TODO.md).
    is_pro = True

    def _ex_entry(name):
        pct = exercise_percentiles.get(name)
        # bw_lbs is None when bodyweight is missing — 0 makes
        # compute_weight_at_percentile return None, yielding empty thresholds
        thresholds = _compute_thresholds(name, user.gender, bw_lbs or 0, unit_to_lbs)
        return {
            'exercise': name,
            'percentile': round(pct, 1) if pct is not None else None,
            'rank': percentile_to_strength_rank(pct) if pct is not None else None,
            'estimated_1rm': exercise_1rms.get(name),
            # estimated_1rm already holds a logged single when one exists (it's
            # preferred over the Epley estimate); this says which it is so the
            # app doesn't call a real 1RM estimated. The field keeps its name
            # for app builds that read it.
            'is_true_1rm': name in exercise_true_1rms,
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

    # Full compound/isolation reference list (tracked AND not-yet-tracked) for
    # the "More Lifts" info modal — deliberately separate from supp_list above,
    # which only lists tracked lifts (what actually renders in the scrollable
    # card) so that list doesn't balloon with dozens of untracked rows.
    supp_coverage = sorted(
        [
            {
                'exercise': name,
                'category': 'compound' if name in COMPOUND_SECONDARY else 'isolation',
                'has_data': name in exercise_percentiles,
                'true_1rm': exercise_true_1rms.get(name),
            }
            for name in valid_keys if name not in BIG_6
        ],
        key=lambda x: (x['category'] != 'compound', not x['has_data'], x['exercise']),
    )

    resp: dict = {
        # None (not 0) when no strength data — "no score yet" is different
        # from "0th percentile", and consumers guard with `?? null` /
        # `overall_rank?.label` already
        'overall': round(overall, 1) if has_strength_data else None,
        'overall_rank': percentile_to_strength_rank(overall) if has_strength_data else None,
        'endurance_overall': round(endurance_overall, 1) if endurance_overall is not None else None,
        'greek_rank': greek_rank,
        'exercises_used': len(exercise_percentiles),
        'muscle_groups_used': len(muscle_groups),
        'age_adjusted': age_factor >= _MIN_AGE_CREDIT,
        'age': user_age,
        'age_factor': round(age_factor, 3),
        'bodyweight_updated_at': last_bw_log_date.isoformat() if last_bw_log_date else None,
        'coverage': coverage,
        'weight_unit': user.weight_unit or 'lbs',
        'last_updated': datetime.now().isoformat(),
    }
    if not has_bodyweight:
        resp['missing_for_strength'] = ['bodyweight']

    history_snaps = (
        StrengthScoreSnapshot.query
        .filter_by(user_id=user_id, score_type='strength')
        .order_by(StrengthScoreSnapshot.created_at.asc())
        .all()
    )
    resp['history'] = [
        {'date': s.created_at.isoformat(), 'score': s.score}
        for s in history_snaps
    ]

    if is_pro:
        resp['greek_score'] = round(greek_score, 1)
        # Kept in this shape for app builds that read the Greek rank from here
        # (1.1.6 and earlier). Newer builds use GET /api/stats/greek-rank.
        resp['greek_score_components'] = {
            'consistency': round(greek['consistency'], 1),
            'strength': round(overall, 1),
            'endurance': round(endurance_overall, 1) if endurance_overall is not None else 0.0,
            'performance': round(greek['performance'] or 0.0, 1),
            'dedication': round(greek['dedication'], 1),
            'volume': round(greek['volume'], 1),
        }
        resp['big6'] = big6_list
        resp['supplemental'] = supp_list
        resp['supplemental_coverage'] = supp_coverage
        resp['muscle_groups'] = muscle_groups
        resp['endurance'] = {
            'overall': round(endurance_overall, 1) if endurance_overall is not None else None,
            'distances': sorted(
                [
                    {
                        'distance_km': d,
                        'label': DISTANCE_LABELS.get(d, f'{d} km'),
                        'pace_min_per_km': round(best_pace_by_distance[d], 2),
                        'percentile': round(p, 1),
                        'rank': percentile_to_strength_rank(p),
                        'tier': 'core' if d in CORE_DISTANCES else 'speed',
                    }
                    for d, p in endurance_percentiles.items()
                ],
                key=lambda x: x['distance_km'],
            ),
        }

    return jsonify(resp), 200


@strength_score_bp.get('/api/stats/greek-rank')
@jwt_required()
def greek_rank():
    """Greek rank for any user. Unlike strength-score it needs no gender or
    bodyweight: those only feed the performance gate on the top two ranks."""
    from utils.strength_standards import GREEK_WEIGHTS, GREEK_RANK_PERFORMANCE_GATES

    user = db.session.get(User, int(get_jwt_identity()))
    data = _greek_rank_data(user)

    def _r(v):
        return round(v, 1) if v is not None else None

    # What would let performance count: without gender neither leg can score;
    # with gender but no bodyweight only the strength leg is blocked.
    profile_missing = []
    if not user.gender:
        profile_missing.append('gender')
    elif not user.bodyweight:
        profile_missing.append('bodyweight')

    return jsonify({
        'greek_rank': data['rank'],
        'greek_score': round(data['score'], 1),
        'score_rank': data['score_rank'],
        'held_by_gate': data['rank'] != data['score_rank'],
        'next_gate': data['next_gate'],
        # Every gated rank's required percentile, for listing all of them
        'gates': GREEK_RANK_PERFORMANCE_GATES,
        'components': {
            'consistency': _r(data['consistency']),
            'dedication': _r(data['dedication']),
            'volume': _r(data['volume']),
        },
        'weights': GREEK_WEIGHTS,
        'performance': {
            'strength': _r(data['strength']),
            'endurance': _r(data['endurance']),
            'best': _r(data['performance']),
        },
        'profile_missing': profile_missing,
    }), 200


@strength_score_bp.get('/api/stats/strength-score/exercise')
@jwt_required()
def strength_score_for_exercise():
    """Lightweight single-lift percentile/rank lookup — for surfacing a Strength
    Score badge on ExerciseDetailScreen without paying for the full strength_score()
    computation (overall score, Greek rank, muscle groups, snapshot writes) on
    every exercise-detail visit."""
    from datetime import date as _date
    from utils.strength_standards import STANDARDS, percentile_to_strength_rank, age_scaling_factor

    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))

    template_id = request.args.get('exercise_template_id', type=int)
    if not template_id:
        return jsonify({'message': 'exercise_template_id required'}), 400

    missing = []
    if not user.gender:
        missing.append('gender')
    if not user.bodyweight:
        missing.append('bodyweight')
    if missing:
        return jsonify({'missing': missing}), 422

    tmpl = db.session.get(ExerciseTemplate, template_id)
    standards_key = tmpl.standards_key if tmpl else None
    if not standards_key or standards_key not in STANDARDS.get(user.gender, {}):
        return jsonify({'has_data': False}), 200

    kg_to_lbs = 2.20462
    unit_to_lbs = kg_to_lbs if (user.weight_unit or 'lbs') == 'kg' else 1.0
    bw_lbs = user.bodyweight * unit_to_lbs

    today = _date.today()
    user_age = None
    if user.birth_date:
        user_age = today.year - user.birth_date.year - (
            (today.month, today.day) < (user.birth_date.month, user.birth_date.day)
        )
    age_factor = age_scaling_factor(user_age) if user_age else 1.0

    # Other templates sharing this standards_key (name variants map to the same lift)
    template_ids = [
        tid for (tid,) in
        db.session.query(ExerciseTemplate.id).filter(ExerciseTemplate.standards_key == standards_key).all()
    ]

    result = _exercise_percentile_data(user_id, standards_key, template_ids, user.gender, unit_to_lbs, bw_lbs, age_factor)
    if result is None:
        return jsonify({'has_data': False}), 200

    return jsonify({
        'has_data': True,
        'exercise': tmpl.name,
        'percentile': round(result['percentile'], 1),
        'rank': percentile_to_strength_rank(result['percentile']),
        'estimated_1rm': result['best_1rm'],
        'is_true_1rm': result['true_1rm'] is not None,
        'thresholds': _compute_thresholds(standards_key, user.gender, bw_lbs, unit_to_lbs),
    }), 200


@strength_score_bp.get('/api/stats/endurance-score')
@jwt_required()
def endurance_score():
    """Running counterpart to strength_score(): per-distance pace percentiles,
    the tier-weighted overall, and its own snapshot history. Gender gates it
    because the pace tables are gendered; bodyweight is irrelevant to pace."""
    from datetime import datetime, date as _date
    from utils.strength_standards import percentile_to_strength_rank
    from utils.endurance_standards import (
        CORE_DISTANCES, CORE_WEIGHT, SPEED_WEIGHT, DISTANCE_LABELS,
        compute_pace_at_percentile,
    )

    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user.gender:
        return jsonify({'missing': ['gender']}), 422

    today = _date.today()
    user_age = None
    if user.birth_date:
        user_age = today.year - user.birth_date.year - (
            (today.month, today.day) < (user.birth_date.month, user.birth_date.day)
        )

    data = _endurance_data(user_id, user.gender, user_age)
    percentiles, paces, overall = data['percentiles'], data['paces'], data['overall']

    def _thresholds(dist_km):
        out = []
        for boundary_pct, rank_name in _TIER_BOUNDARIES:
            pace = compute_pace_at_percentile(dist_km, user.gender, boundary_pct)
            if pace is not None:
                out.append({'percentile': boundary_pct, 'rank': rank_name,
                            'pace_min_per_km': round(pace, 2)})
        return out

    distances = sorted(
        [
            {
                'distance_km': d,
                'label': DISTANCE_LABELS.get(d, f'{d} km'),
                'pace_min_per_km': round(paces[d], 2),
                'percentile': round(p, 1),
                'rank': percentile_to_strength_rank(p),
                'tier': 'core' if d in CORE_DISTANCES else 'speed',
                'thresholds': _thresholds(d),
            }
            for d, p in percentiles.items()
        ],
        key=lambda x: x['distance_km'],
    )

    # Each tier reports its best distance, which is what the overall weights.
    # See compute_endurance_overall for why it is best-within-tier, not a mean.
    core_best = max((p for d, p in percentiles.items() if d in CORE_DISTANCES), default=None)
    speed_best = max((p for d, p in percentiles.items() if d not in CORE_DISTANCES), default=None)

    if overall is not None:
        last_snap = (
            StrengthScoreSnapshot.query
            .filter_by(user_id=user_id, score_type='endurance')
            .order_by(StrengthScoreSnapshot.created_at.desc())
            .first()
        )
        if not last_snap or (datetime.now() - last_snap.created_at).total_seconds() > 86400:
            db.session.add(StrengthScoreSnapshot(user_id=user_id, score=overall, score_type='endurance'))
            db.session.commit()

    history = [
        {'date': s.created_at.isoformat(), 'score': s.score}
        for s in (
            StrengthScoreSnapshot.query
            .filter_by(user_id=user_id, score_type='endurance')
            .order_by(StrengthScoreSnapshot.created_at.asc())
            .all()
        )
    ]

    return jsonify({
        'overall': round(overall, 1) if overall is not None else None,
        'overall_rank': percentile_to_strength_rank(overall) if overall is not None else None,
        'distances': distances,
        'distances_tracked': len(distances),
        'tiers': {
            'core':  {'best': round(core_best, 1) if core_best is not None else None, 'weight': CORE_WEIGHT},
            'speed': {'best': round(speed_best, 1) if speed_best is not None else None, 'weight': SPEED_WEIGHT},
        },
        'age': user_age,
        'age_factor': round(data['age_factor'], 3),
        'age_adjusted': data['age_factor'] >= _MIN_AGE_CREDIT,
        'history': history,
        'last_updated': datetime.now().isoformat(),
    }), 200


@strength_score_bp.get('/api/stats/strength-score/history')
@jwt_required()
def strength_score_history():
    user_id = get_jwt_identity()
    snapshots = (
        StrengthScoreSnapshot.query
        .filter_by(user_id=user_id, score_type='strength')
        .order_by(StrengthScoreSnapshot.created_at.asc())
        .all()
    )
    return jsonify({
        'history': [
            {'date': s.created_at.isoformat(), 'score': s.score}
            for s in snapshots
        ]
    }), 200
