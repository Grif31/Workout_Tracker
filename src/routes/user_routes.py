import os
from flask import Blueprint, jsonify, request, current_app, g
from werkzeug.utils import secure_filename
from datetime import datetime
from models import (
    db, User, Workout, Exercise, Set, DeviceToken, PersonalRecord,
    StrengthScoreSnapshot, BodyweightLog, BodyMeasurement, ProgressPhoto,
    Routine, RoutineDay, WorkoutTemplate, WorkoutTemplateExercise,
    ExerciseTemplate, ExerciseMuscleMapping,
)
from flask_jwt_extended import  jwt_required, get_jwt_identity
from schemas import UpdateProfileSchema, DeviceTokenSchema
from utils.validation import validate_body

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB

_update_profile_schema = UpdateProfileSchema()
_device_token_schema   = DeviceTokenSchema()

def _allowed(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

user_bp = Blueprint('user_bp', __name__)

KG_PER_LB = 0.453592
LBS_PER_KG = 2.20462


def convert_weight_value(value: float, new_unit: str) -> float:
    """Convert a single weight to the new unit, snapped to the nearest 0.5
    (lb or kg) so converted values read like real plate loads. Round-tripping
    kg↔lbs can therefore drift by up to half a unit — accepted trade-off."""
    factor = LBS_PER_KG if new_unit == 'lbs' else KG_PER_LB
    return round(value * factor * 2) / 2


def _convert_stored_weights(user_id: int, new_unit: str) -> None:
    """Bulk-convert stored weights when the user switches kg↔lbs, preserving the
    invariant that stored values are always in the user's current unit.
    Excludes Workout.volume (canonical lbs) and cardio PR weight_context
    (those hold km/minute milestone targets, not weights)."""
    factor = KG_PER_LB if new_unit == 'kg' else LBS_PER_KG

    def _converted(col):
        # SQL twin of convert_weight_value: snap to the nearest 0.5 lb/kg
        return db.func.round(col * factor * 2) / 2.0

    exercise_ids = (
        db.session.query(Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user_id)
        .scalar_subquery()
    )
    Set.query.filter(
        Set.exercise_id.in_(exercise_ids),
        Set.weight.isnot(None),
    ).update({Set.weight: _converted(Set.weight)}, synchronize_session=False)

    PersonalRecord.query.filter(
        PersonalRecord.user_id == user_id,
        PersonalRecord.pr_type.in_(('max_weight', 'estimated_1rm')),
    ).update({PersonalRecord.value: _converted(PersonalRecord.value)}, synchronize_session=False)

    PersonalRecord.query.filter(
        PersonalRecord.user_id == user_id,
        PersonalRecord.pr_type == 'max_reps',
        PersonalRecord.weight_context > 0,
    ).update({PersonalRecord.weight_context: _converted(PersonalRecord.weight_context)}, synchronize_session=False)

    BodyweightLog.query.filter_by(user_id=user_id).update(
        {BodyweightLog.weight: _converted(BodyweightLog.weight)}, synchronize_session=False)

@user_bp.get('/api/me')
@jwt_required()
def get_current_user():
    userId = get_jwt_identity()
    user = User.query.filter_by(id=userId).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
    workouts = Workout.query.filter_by(user_id=userId).all()
    return jsonify({
        **user.to_dict(),
        'workouts': [{'id': w.id, 'name': w.name, 'date': w.date.isoformat(), 'notes': w.notes} for w in workouts],
    }), 200

@user_bp.patch('/api/me')
@jwt_required()
@validate_body(_update_profile_schema)
def update_user_info():
    userId = get_jwt_identity()
    user = User.query.filter_by(id=userId).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
    data = g.validated
    if "name" in data:
        user.name = data["name"].strip() or None
    if "bio" in data:
        user.bio = data["bio"].strip() or None
    if "profile_pic_url" in data:
        user.profile_pic_url = data["profile_pic_url"]
    if "bodyweight" in data:
        user.bodyweight = float(data["bodyweight"]) if data["bodyweight"] not in (None, '') else None
    if "height" in data:
        user.height = float(data["height"]) if data["height"] not in (None, '') else None
    if "weight_unit" in data:
        new_unit = data["weight_unit"] if data["weight_unit"] in ('lbs', 'kg') else 'lbs'
        old_unit = user.weight_unit or 'lbs'
        if new_unit != old_unit:
            _convert_stored_weights(user.id, new_unit)
            # If this PATCH also carries a bodyweight, it's already in the new
            # unit (set above) — only convert the previously stored value.
            if "bodyweight" not in data and user.bodyweight is not None:
                user.bodyweight = convert_weight_value(user.bodyweight, new_unit)
        user.weight_unit = new_unit
    if "gender" in data:
        user.gender = data["gender"] if data["gender"] in ('male', 'female') else None
    if "birth_date" in data:
        user.birth_date = data["birth_date"]  # marshmallow already parses to date object

    db.session.commit()
    return jsonify(user.to_dict()), 200

@user_bp.post('/api/me/avatar')
@jwt_required()
def upload_avatar():
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404

    if 'avatar' not in request.files:
        return jsonify({'message': 'No file provided'}), 400
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400
    if not _allowed(file.filename):
        return jsonify({'message': 'File type not allowed. Use jpg, png, or webp.'}), 400

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_AVATAR_BYTES:
        return jsonify({'message': 'File too large (max 5 MB)'}), 400

    avatars_dir = os.path.join(current_app.static_folder, 'avatars')
    os.makedirs(avatars_dir, exist_ok=True)

    ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
    filename = f'{user_id}.{ext}'

    # Remove any old avatar with a different extension
    for old_ext in ALLOWED_EXTENSIONS - {ext}:
        old_path = os.path.join(avatars_dir, f'{user_id}.{old_ext}')
        if os.path.exists(old_path):
            os.remove(old_path)

    file.save(os.path.join(avatars_dir, filename))

    relative_path = f'/static/avatars/{filename}'
    user.profile_pic_url = relative_path
    db.session.commit()

    avatar_url = f'{request.host_url.rstrip("/")}{relative_path}'
    return jsonify({'avatar_url': avatar_url}), 200


@user_bp.post('/api/me/device-token')
@jwt_required()
@validate_body(_device_token_schema)
def register_device_token():
    user_id = get_jwt_identity()
    data = g.validated
    token = data['token']
    platform = data['platform']
    existing = DeviceToken.query.filter_by(user_id=user_id).first()
    if existing:
        existing.token = token
        existing.platform = platform
        existing.updated_at = datetime.now()
    else:
        db.session.add(DeviceToken(user_id=user_id, token=token, platform=platform))
    db.session.commit()
    return jsonify({'message': 'ok'}), 200


@user_bp.delete('/api/me/device-token')
@jwt_required()
def deregister_device_token():
    user_id = get_jwt_identity()
    DeviceToken.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({'message': 'ok'}), 200


def _delete_all_user_data(user_id: int) -> None:
    """Delete every row owned by the user in FK-safe order.

    workouts.user_id / workout_templates.user_id / routines.user_id have no
    DB-level delete cascade, so deleting the user row directly raises an
    IntegrityError for any user with data.
    """
    # Rows that only reference the user
    for model in (PersonalRecord, StrengthScoreSnapshot, DeviceToken,
                  BodyweightLog, BodyMeasurement, ProgressPhoto):
        model.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    # Sets → Exercises → Workouts
    exercise_ids = (
        db.session.query(Exercise.id)
        .join(Workout, Exercise.workout_id == Workout.id)
        .filter(Workout.user_id == user_id)
        .scalar_subquery()
    )
    Set.query.filter(Set.exercise_id.in_(exercise_ids)).delete(synchronize_session=False)
    workout_ids = db.session.query(Workout.id).filter_by(user_id=user_id).scalar_subquery()
    Exercise.query.filter(Exercise.workout_id.in_(workout_ids)).delete(synchronize_session=False)
    Workout.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    # RoutineDays → Routines (clear the user's active_routine pointer first)
    User.query.filter_by(id=user_id).update({'active_routine_id': None}, synchronize_session=False)
    routine_ids = db.session.query(Routine.id).filter_by(user_id=user_id).scalar_subquery()
    RoutineDay.query.filter(RoutineDay.routine_id.in_(routine_ids)).delete(synchronize_session=False)
    Routine.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    # Template join rows → WorkoutTemplates (routine days referencing them are gone)
    template_ids = db.session.query(WorkoutTemplate.id).filter_by(user_id=user_id).scalar_subquery()
    WorkoutTemplateExercise.query.filter(
        WorkoutTemplateExercise.workout_template_id.in_(template_ids)
    ).delete(synchronize_session=False)
    WorkoutTemplate.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    # Custom exercise templates (only the owner can reference them, and those
    # references — exercises, template joins, PRs — were deleted above)
    custom_template_ids = db.session.query(ExerciseTemplate.id).filter_by(user_id=user_id).scalar_subquery()
    ExerciseMuscleMapping.query.filter(
        ExerciseMuscleMapping.exercise_template_id.in_(custom_template_ids)
    ).delete(synchronize_session=False)
    ExerciseTemplate.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    User.query.filter_by(id=user_id).delete(synchronize_session=False)


@user_bp.delete('/api/me')
@jwt_required()
def delete_account():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    try:
        _delete_all_user_data(user_id)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception('Account deletion failed for user %s', user_id)
        return jsonify({'message': 'Internal server error'}), 500

    avatars_dir = os.path.join(current_app.static_folder, 'avatars')
    for ext in ALLOWED_EXTENSIONS:
        path = os.path.join(avatars_dir, f'{user_id}.{ext}')
        if os.path.exists(path):
            os.remove(path)

    return jsonify({'message': 'Account deleted'}), 200

