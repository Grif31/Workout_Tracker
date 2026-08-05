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

    best_1rm = max(true_1rm, est_1rm)

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


@strength_score_bp.get('/api/stats/strength-score')
@jwt_required()
def strength_score():
    from datetime import datetime, timedelta
    from statistics import mean as _mean
    from utils.strength_standards import (
        STANDARDS, BIG_6, COMPOUND_SECONDARY,
        percentile_to_strength_rank, greek_rank_from_score,
        compute_muscle_group_scores,
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
    exercise_true_1rms: dict[str, float] = {}

    for exercise_name, template_ids in templates_by_key.items():
        result = _exercise_percentile_data(user_id, exercise_name, template_ids, user.gender, unit_to_lbs, bw_lbs, age_factor)
        if result is not None:
            exercise_percentiles[exercise_name] = result['percentile']
            exercise_1rms[exercise_name] = result['best_1rm']
            if result['true_1rm'] is not None:
                exercise_true_1rms[exercise_name] = result['true_1rm']

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

    def _ex_entry(name):
        pct = exercise_percentiles.get(name)
        thresholds = _compute_thresholds(name, user.gender, bw_lbs, unit_to_lbs)
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
        resp['supplemental_coverage'] = supp_coverage
        resp['muscle_groups'] = muscle_groups

    return jsonify(resp), 200


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
        'thresholds': _compute_thresholds(standards_key, user.gender, bw_lbs, unit_to_lbs),
    }), 200


@strength_score_bp.get('/api/stats/strength-score/history')
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
