from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, PersonalRecord, ExerciseTemplate

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
}


def _cardio_pr_label(pr):
    if pr.pr_type == 'best_time':
        dist_label = DISTANCE_LABELS.get(pr.weight_context, f'{pr.weight_context} km')
        return f'{dist_label} Best Time'
    if pr.pr_type == 'best_distance':
        dur_label = DURATION_LABELS.get(pr.weight_context, f'{pr.weight_context:.0f} min')
        return f'{dur_label} Best Distance'
    return pr.pr_type


@pr_bp.get('/api/personal-records')
@jwt_required()
def get_personal_records():
    """Return all PRs for the current user.

    max_reps records with weight_context < 0 are legacy (pre-per-weight) and are skipped.
    """
    user_id = get_jwt_identity()
    rows = (
        db.session.query(PersonalRecord, ExerciseTemplate)
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .filter(PersonalRecord.user_id == user_id)
        .filter(
            ~((PersonalRecord.pr_type == 'max_reps') & (PersonalRecord.weight_context < 0))
        )
        .order_by(ExerciseTemplate.name, PersonalRecord.pr_type, PersonalRecord.weight_context.desc())
        .all()
    )

    result = []
    for pr, tmpl in rows:
        if pr.pr_type in ('best_time', 'best_distance'):
            label = _cardio_pr_label(pr)
        else:
            label = PR_LABELS.get(pr.pr_type, pr.pr_type)
        primary_muscle = (tmpl.muscle_group or '').split(',')[0].strip()
        result.append({
            **pr.to_dict(),
            'exercise_name': tmpl.name,
            'pr_label': label,
            'muscle_group': primary_muscle,
        })
    return jsonify(result)


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

    max_weight_pr = next((p for p in prs if p.pr_type == 'max_weight'), None)
    est_1rm_pr    = next((p for p in prs if p.pr_type == 'estimated_1rm'), None)
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
