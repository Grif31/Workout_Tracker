from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, PersonalRecord, ExerciseTemplate

pr_bp = Blueprint('pr_bp', __name__)

PR_LABELS = {
    'max_weight':    'Max Weight',
    'max_reps':      'Max Reps',
    'estimated_1rm': 'Estimated 1RM',
}


@pr_bp.get('/api/personal-records')
@jwt_required()
def get_personal_records():
    user_id = get_jwt_identity()
    rows = (
        db.session.query(PersonalRecord, ExerciseTemplate.name)
        .join(ExerciseTemplate, PersonalRecord.exercise_template_id == ExerciseTemplate.id)
        .filter(PersonalRecord.user_id == user_id)
        .order_by(ExerciseTemplate.name, PersonalRecord.pr_type)
        .all()
    )
    return jsonify([
        {**pr.to_dict(), 'exercise_name': name, 'pr_label': PR_LABELS.get(pr.pr_type, pr.pr_type)}
        for pr, name in rows
    ])


@pr_bp.get('/api/personal-records/<int:exercise_template_id>')
@jwt_required()
def get_prs_for_exercise(exercise_template_id):
    user_id = get_jwt_identity()
    prs = (
        PersonalRecord.query
        .filter_by(user_id=user_id, exercise_template_id=exercise_template_id)
        .all()
    )
    return jsonify([
        {**pr.to_dict(), 'pr_label': PR_LABELS.get(pr.pr_type, pr.pr_type)}
        for pr in prs
    ])
