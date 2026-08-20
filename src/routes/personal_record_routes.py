from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from models import db, PersonalRecord, PREvent, ExerciseTemplate, Exercise, Set, Workout

pr_bp = Blueprint('pr_bp', __name__)

DISTANCE_LABELS = {
    0.4:     '400m',
    0.8:     '800m',
    1.0:     '1K',
    1.60934: '1 Mile',
    5.0:     '5K',
    10.0:    '10K',
    21.0975: 'Half Marathon',
    42.195:  'Marathon',
}

DURATION_LABELS = {
    10.0: '10 min',
    20.0: '20 min',
    30.0: '30 min',
    60.0: '60 min',
}

PR_LABELS = {
    'max_weight':    'Max Weight',
    'max_reps':      'Max Reps',
    'estimated_1rm': 'Estimated 1RM',
    'max_duration':  'Longest Hold',
}


def _cardio_pr_label(pr):
    if pr.pr_type == 'best_time':
        dist_label = DISTANCE_LABELS.get(pr.weight_context, f'{pr.weight_context} km')
        return f'{dist_label} Best Time'
    if pr.pr_type == 'best_distance':
        dur_label = DURATION_LABELS.get(pr.weight_context, f'{pr.weight_context:.0f} min')
        return f'{dur_label} Best Distance'
    return pr.pr_type


def _pr_label(pr):
    if pr.pr_type in ('best_time', 'best_distance'):
        return _cardio_pr_label(pr)
    return PR_LABELS.get(pr.pr_type, pr.pr_type)


# Filter-chip categories → PREvent pr_types. estimated_1rm is deliberately
# absent: it is never surfaced as a PR to users (progression tables get it via
# /api/personal-records/history instead).
FEED_TYPE_FILTERS = {
    'weight':   ['max_weight'],
    'reps':     ['max_reps'],
    'time':     ['best_time', 'max_duration'],
    'distance': ['best_distance'],
}
FEED_PR_TYPES = [t for types in FEED_TYPE_FILTERS.values() for t in types]

# The dashboard's "recent PRs" feed defaults to the last week, falling back to
# the user's most recent PRs (any age) when that window is empty — see
# recent_events_scope in get_pr_dashboard. Momentum stats (streak, this-month
# count, days-since-last-PR) are unaffected — they're computed from the full
# PREvent history, not this window.
RECENT_FEED_WINDOW_DAYS = 7


@pr_bp.get('/api/personal-records')
@jwt_required()
def get_personal_records():
    """Return all PRs for the current user.

    max_reps records with weight_context < 0 are legacy (pre-per-weight) and are skipped.
    """
    user_id = get_jwt_identity()
    rows = (
        db.session.query(PersonalRecord, ExerciseTemplate, Set)
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .outerjoin(Set, PersonalRecord.set_id == Set.id)
        .filter(PersonalRecord.user_id == user_id)
        .filter(
            ~((PersonalRecord.pr_type == 'max_reps') & (PersonalRecord.weight_context < 0))
        )
        .order_by(ExerciseTemplate.name, PersonalRecord.pr_type, PersonalRecord.weight_context.desc())
        .all()
    )

    result = []
    for pr, tmpl, set_row in rows:
        if pr.pr_type in ('best_time', 'best_distance'):
            label = _cardio_pr_label(pr)
        else:
            label = PR_LABELS.get(pr.pr_type, pr.pr_type)
        primary_muscle = (tmpl.muscle_group or '').split(',')[0].strip()
        d = {
            **pr.to_dict(),
            'exercise_name': tmpl.name,
            'equipment': tmpl.equipment,
            'pr_label': label,
            'muscle_group': primary_muscle,
        }
        if pr.pr_type == 'max_weight' and set_row:
            d['reps'] = set_row.reps
        result.append(d)
    return jsonify(result)


@pr_bp.get('/api/personal-records/dashboard')
@jwt_required()
def get_pr_dashboard():
    """Aggregate payload for the PR Dashboard screen: recent PR events feed,
    workout-level bests, and momentum stats — one round trip."""
    user_id = get_jwt_identity()
    now = datetime.now()

    # ── Recent PRs feed ────────────────────────────────────────────────────
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    type_filter = request.args.get('type')
    if type_filter is not None and type_filter not in FEED_TYPE_FILTERS:
        return jsonify({'message': f'Invalid type, use one of: {", ".join(FEED_TYPE_FILTERS)}'}), 400
    feed_types = FEED_TYPE_FILTERS[type_filter] if type_filter else FEED_PR_TYPES

    feed_window_start = now - timedelta(days=RECENT_FEED_WINDOW_DAYS)
    feed_base_query = (
        db.session.query(PREvent, ExerciseTemplate.name, Workout.name, Workout.date)
        .join(ExerciseTemplate, PREvent.exercise_template_id == ExerciseTemplate.id)
        .join(Workout, PREvent.workout_id == Workout.id)
        .filter(PREvent.user_id == user_id, PREvent.pr_type.in_(feed_types))
    )
    feed_windowed_query = feed_base_query.filter(PREvent.achieved_at >= feed_window_start)

    # A quiet week shouldn't leave the dashboard looking dead — fall back to
    # the user's most recent PRs (any age) when the week's window is empty,
    # scoped to whichever type filter is active. recent_events_scope tells the
    # frontend which framing applies, so older PRs never get mislabeled as
    # "this week".
    using_fallback = feed_windowed_query.count() == 0
    feed_query = (feed_base_query if using_fallback else feed_windowed_query) \
        .order_by(PREvent.achieved_at.desc(), PREvent.id.desc())
    pagination = feed_query.paginate(page=page, per_page=per_page, error_out=False)
    recent_events = []
    for event, exercise_name, workout_name, workout_date in pagination.items:
        recent_events.append({
            **event.to_dict(),
            'exercise_name': exercise_name,
            'pr_label': _pr_label(event),
            'workout_name': workout_name,
            'workout_date': workout_date.isoformat() if workout_date else None,
        })

    # ── Workout-level bests (computed on read — no stored rows) ────────────
    best_volume_workout = (
        Workout.query
        .filter(Workout.user_id == user_id, Workout.volume.isnot(None), Workout.volume > 0)
        .order_by(Workout.volume.desc())
        .first()
    )
    best_reps_row = (
        db.session.query(Workout.id, Workout.name, Workout.date, func.sum(Set.reps).label('total_reps'))
        .join(Exercise, Exercise.workout_id == Workout.id)
        .join(Set, Set.exercise_id == Exercise.id)
        .filter(Workout.user_id == user_id, Set.reps.isnot(None))
        .group_by(Workout.id, Workout.name, Workout.date)
        .order_by(func.sum(Set.reps).desc())
        .first()
    )
    workout_bests = {
        'best_volume': {
            'workout_id': best_volume_workout.id,
            'workout_name': best_volume_workout.name,
            'date': best_volume_workout.date.isoformat(),
            'value': round(best_volume_workout.volume),
        } if best_volume_workout else None,
        'best_total_reps': {
            'workout_id': best_reps_row.id,
            'workout_name': best_reps_row.name,
            'date': best_reps_row.date.isoformat(),
            'value': int(best_reps_row.total_reps),
        } if best_reps_row else None,
    }

    # ── Momentum stats ─────────────────────────────────────────────────────
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prs_this_month = (
        db.session.query(func.count(PREvent.id))
        .filter(
            PREvent.user_id == user_id,
            PREvent.pr_type.in_(FEED_PR_TYPES),
            PREvent.achieved_at >= month_start,
        )
        .scalar()
    )

    # PR streak: consecutive weeks (Mon-start) with >=1 PR event, counted back
    # from this week. A PR-less current week doesn't break the streak mid-week.
    event_dates = [
        d for (d,) in db.session.query(PREvent.achieved_at)
        .filter(PREvent.user_id == user_id, PREvent.pr_type.in_(FEED_PR_TYPES))
        .all()
    ]
    pr_weeks = {d.date() - timedelta(days=d.weekday()) for d in event_dates}
    this_week = now.date() - timedelta(days=now.weekday())
    streak = 0
    cursor = this_week if this_week in pr_weeks else this_week - timedelta(weeks=1)
    while cursor in pr_weeks:
        streak += 1
        cursor -= timedelta(weeks=1)

    # Days since last PR per exercise, for the user's 10 most-trained exercises
    most_trained = (
        db.session.query(
            Exercise.exercise_template_id,
            ExerciseTemplate.name,
            func.count(func.distinct(Exercise.workout_id)).label('workout_count'),
        )
        .join(Workout, Exercise.workout_id == Workout.id)
        .join(ExerciseTemplate, Exercise.exercise_template_id == ExerciseTemplate.id)
        .filter(Workout.user_id == user_id, Exercise.exercise_template_id.isnot(None))
        .group_by(Exercise.exercise_template_id, ExerciseTemplate.name)
        .order_by(func.count(func.distinct(Exercise.workout_id)).desc())
        .limit(10)
        .all()
    )
    # Grouped by (exercise, pr_type, weight_context) rather than just exercise,
    # so the frontend can let users switch "Time Since Last PR" between
    # Weight/Reps/Time/Distance without a second round trip — see by_type
    # below. weight_context is included in the grouping (not just pr_type) so
    # the summary can report which specific weight a max_reps PR was set at —
    # collapsing it out here would lose that.
    last_event_rows = (
        db.session.query(
            PREvent.exercise_template_id, PREvent.pr_type, PREvent.weight_context,
            func.max(PREvent.achieved_at),
        )
        .filter(
            PREvent.user_id == user_id,
            PREvent.pr_type.in_(FEED_PR_TYPES),
            PREvent.exercise_template_id.in_([t for t, _, _ in most_trained] or [-1]),
        )
        .group_by(PREvent.exercise_template_id, PREvent.pr_type, PREvent.weight_context)
        .all()
    )
    last_by_template_and_type = {}
    for template_id, pr_type, weight_context, achieved_at in last_event_rows:
        last_by_template_and_type.setdefault(template_id, {}).setdefault(pr_type, []).append(
            (weight_context, achieved_at)
        )

    def _category_latest(template_id, category):
        """(weight_context, achieved_at) of the single most recent event in this
        category — maxing across the category's pr_types and, for a type with
        multiple weight contexts (max_reps), across those too."""
        by_type = last_by_template_and_type.get(template_id, {})
        candidates = [c for t in FEED_TYPE_FILTERS[category] for c in by_type.get(t, [])]
        return max(candidates, key=lambda c: c[1]) if candidates else None

    def _category_summary(template_id, category):
        latest = _category_latest(template_id, category)
        if not latest:
            return None
        weight_context, last_dt = latest
        return {
            'days_since_last_pr': (now - last_dt).days,
            'last_pr_at': last_dt.isoformat(),
            'weight_context': None if weight_context < 0 else weight_context,
        }

    last_event_by_template = {}
    for template_id, by_type in last_by_template_and_type.items():
        all_dates = [dt for entries in by_type.values() for _, dt in entries]
        if all_dates:
            last_event_by_template[template_id] = max(all_dates)
    days_since_last_pr = [
        {
            'exercise_template_id': template_id,
            'exercise_name': name,
            'workout_count': workout_count,
            'days_since_last_pr': (now - last_event_by_template[template_id]).days,
            'last_pr_at': last_event_by_template[template_id].isoformat(),
            'by_type': {
                category: _category_summary(template_id, category)
                for category in FEED_TYPE_FILTERS
            },
        }
        for template_id, name, workout_count in most_trained
        if template_id in last_event_by_template
    ]
    days_since_last_pr.sort(key=lambda r: r['days_since_last_pr'], reverse=True)

    return jsonify({
        'recent_events': recent_events,
        'recent_events_scope': 'all_time' if using_fallback else 'week',
        'page': page,
        'per_page': per_page,
        'total': pagination.total,
        'has_more': pagination.has_next,
        'workout_bests': workout_bests,
        'stats': {
            'prs_this_month': prs_this_month,
            'pr_streak_weeks': streak,
            'total_prs': len(event_dates),
            'days_since_last_pr': days_since_last_pr,
        },
    })


@pr_bp.get('/api/personal-records/history')
@jwt_required()
def get_pr_history():
    """PR progression for one exercise, oldest first — feeds the dashboard's
    over-time tables and sparklines. Unlike the feed, estimated_1rm is allowed
    here (surfaced as an "Est. 1RM trend" metric, never as a PR)."""
    user_id = get_jwt_identity()
    template_id = request.args.get('exercise_template_id', type=int)
    if not template_id:
        return jsonify({'message': 'exercise_template_id is required'}), 400
    pr_type = request.args.get('pr_type')
    weight_context = request.args.get('weight_context', type=float)

    query = (
        db.session.query(PREvent, Workout.name)
        .join(Workout, PREvent.workout_id == Workout.id)
        .filter(PREvent.user_id == user_id, PREvent.exercise_template_id == template_id)
    )
    if pr_type:
        query = query.filter(PREvent.pr_type == pr_type)
    if weight_context is not None:
        query = query.filter(PREvent.weight_context == weight_context)

    rows = query.order_by(PREvent.achieved_at, PREvent.id).all()
    return jsonify([
        {
            **event.to_dict(),
            'pr_label': _pr_label(event),
            'workout_name': workout_name,
        }
        for event, workout_name in rows
    ])


@pr_bp.get('/api/personal-records/<int:exercise_template_id>')
@jwt_required()
def get_prs_for_exercise(exercise_template_id):
    """Return PRs for a single exercise.

    Response:
    {
      "max_weight":      <float | null>,
      "estimated_1rm":   <float | null>,
      "per_weight_reps": [{ "weight": float, "max_reps": float, "achieved_at": str }],
      "best_times":      [{ "distance_km": float, "label": str, "time_min": float, "achieved_at": str }],
      "best_distances":  [{ "duration_min": float, "label": str, "distance_km": float, "achieved_at": str }]
    }
    """
    user_id = get_jwt_identity()
    prs = (
        PersonalRecord.query
        .filter_by(user_id=user_id, exercise_template_id=exercise_template_id)
        .all()
    )

    max_weight_pr   = next((p for p in prs if p.pr_type == 'max_weight'), None)
    est_1rm_pr      = next((p for p in prs if p.pr_type == 'estimated_1rm'), None)
    max_duration_pr = next((p for p in prs if p.pr_type == 'max_duration'), None)
    reps_prs = sorted(
        [p for p in prs if p.pr_type == 'max_reps' and p.weight_context >= 0],
        key=lambda p: p.weight_context,
        reverse=True,
    )
    time_prs = sorted(
        [p for p in prs if p.pr_type == 'best_time'],
        key=lambda p: p.weight_context,
    )
    dist_prs = sorted(
        [p for p in prs if p.pr_type == 'best_distance'],
        key=lambda p: p.weight_context,
    )

    return jsonify({
        'max_weight':    max_weight_pr.value if max_weight_pr else None,
        'estimated_1rm': est_1rm_pr.value if est_1rm_pr else None,
        'max_duration':  max_duration_pr.value if max_duration_pr else None,
        'per_weight_reps': [
            {
                'weight':      p.weight_context,
                'max_reps':    p.value,
                'achieved_at': p.achieved_at.isoformat() if p.achieved_at else None,
            }
            for p in reps_prs
        ],
        'best_times': [
            {
                'distance_km': p.weight_context,
                'label':       DISTANCE_LABELS.get(p.weight_context, f'{p.weight_context} km'),
                'time_min':    p.value,
                'achieved_at': p.achieved_at.isoformat() if p.achieved_at else None,
            }
            for p in time_prs
        ],
        'best_distances': [
            {
                'duration_min': p.weight_context,
                'label':        DURATION_LABELS.get(p.weight_context, f'{p.weight_context:.0f} min'),
                'distance_km':  p.value,
                'achieved_at':  p.achieved_at.isoformat() if p.achieved_at else None,
            }
            for p in dist_prs
        ],
    })
