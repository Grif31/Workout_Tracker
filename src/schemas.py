from marshmallow import Schema, fields, validate, validates_schema, ValidationError, EXCLUDE


class _Base(Schema):
    """All schemas ignore unknown fields so extra JSON keys never cause 400s."""
    class Meta:
        unknown = EXCLUDE


# ── Auth ─────────────────────────────────────────────────────
class LoginSchema(_Base):
    identifier = fields.Str(required=True)
    password   = fields.Str(required=True)

class SignupSchema(_Base):
    username = fields.Str(required=True, validate=validate.Length(min=2, max=50))
    email    = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=6))

class ForgotPasswordSchema(_Base):
    email = fields.Email(required=True)

class ResetPasswordSchema(Schema):
    email        = fields.Email(required=True)
    otp          = fields.Str(required=True)
    new_password = fields.Str(required=True, validate=validate.Length(min=6))

class ChangePasswordSchema(Schema):
    current_password = fields.Str(required=True)
    new_password     = fields.Str(required=True, validate=validate.Length(min=6))
    confirm_password = fields.Str(required=True)

    @validates_schema
    def passwords_match(self, data, **kwargs):
        if data.get('new_password') != data.get('confirm_password'):
            raise ValidationError('Passwords do not match.', 'confirm_password')

# ── User ─────────────────────────────────────────────────────
# No load_default on optional fields — missing fields excluded from dict,
# preserving the 'if field in data' PATCH semantics in update_user_info.
class UpdateProfileSchema(_Base):
    name            = fields.Str()
    bio             = fields.Str()
    profile_pic_url = fields.Str()
    bodyweight      = fields.Float()
    height          = fields.Float()
    weight_unit     = fields.Str(validate=validate.OneOf(['kg', 'lbs']))
    # gender had a load_default and so was injected as None into every partial
    # PATCH, wiping it whenever Settings sent only weight_unit. Sending an
    # explicit null still clears it.
    gender          = fields.Str(validate=validate.OneOf(['male', 'female']), allow_none=True)
    birth_date      = fields.Date(allow_none=True)

class DeviceTokenSchema(_Base):
    token    = fields.Str(required=True)
    platform = fields.Str(load_default='unknown')

# ── Exercise ─────────────────────────────────────────────────
class ExerciseSchema(_Base):
    name          = fields.Str(required=True, validate=validate.Length(min=1))
    muscle_group  = fields.Str(load_default=None)
    equipment     = fields.Str(load_default=None)
    exercise_type = fields.Str(load_default='strength', validate=validate.OneOf(['strength', 'cardio', 'duration']))

# ── Workout ───────────────────────────────────────────────────
def _validate_exercises(exercises):
    # The routes index ex['name'] and iterate ex['sets'] directly, so a
    # malformed exercise has to fail here as a 400 rather than there as a 500.
    for i, ex in enumerate(exercises):
        if not isinstance(ex.get('name'), str) or not ex['name'].strip():
            raise ValidationError(f'exercise {i + 1} needs a name')
        sets = ex.get('sets', [])
        if not isinstance(sets, list) or not all(isinstance(s, dict) for s in sets):
            raise ValidationError(f'exercise {i + 1} sets must be a list of objects')


class WorkoutSchema(_Base):
    workoutName = fields.Str(required=True, validate=validate.Length(min=1))
    exercises   = fields.List(fields.Dict(), required=True, validate=_validate_exercises)
    notes       = fields.Str(load_default=None)
    duration    = fields.Int(load_default=None)
    date        = fields.Str(load_default=None)
    # Bounds are a plausibility gate on wearable data, not a medical range --
    # HealthKit will hand back stray samples from a loose strap.
    avg_heart_rate = fields.Int(load_default=None, allow_none=True, validate=validate.Range(min=20, max=260))
    max_heart_rate = fields.Int(load_default=None, allow_none=True, validate=validate.Range(min=20, max=260))

# No load_default — missing fields excluded to preserve 'if field in data' PATCH semantics.
class UpdateWorkoutSchema(_Base):
    workoutName = fields.Str()
    exercises   = fields.List(fields.Dict(), validate=_validate_exercises)
    notes       = fields.Str()
    duration    = fields.Int()
    date        = fields.Str()
    avg_heart_rate = fields.Int(allow_none=True, validate=validate.Range(min=20, max=260))
    max_heart_rate = fields.Int(allow_none=True, validate=validate.Range(min=20, max=260))

# ── Routine ───────────────────────────────────────────────────
class RoutineSchema(_Base):
    name        = fields.Str(required=True, validate=validate.Length(min=1))
    days        = fields.List(fields.Dict(), required=True)
    description = fields.Str(load_default=None)

# No load_default, so 'if field in data' PATCH semantics hold.
class UpdateRoutineSchema(_Base):
    name        = fields.Str()
    days        = fields.List(fields.Dict())
    description = fields.Str(allow_none=True)

# ── Workout Template ──────────────────────────────────────────
class WorkoutTemplateSchema(_Base):
    name                  = fields.Str(required=True, validate=validate.Length(min=1))
    exercise_template_ids = fields.List(fields.Int(), load_default=[])
    # Per-exercise sets/reps. Accepted on create because the app now creates a
    # template on its first save, so programming entered beforehand has to
    # arrive with the POST rather than a later PATCH.
    programming           = fields.List(fields.Dict(), load_default=None)

class UpdateWorkoutTemplateSchema(_Base):
    name                  = fields.Str()
    exercise_template_ids = fields.List(fields.Int())
    programming           = fields.List(fields.Dict(), allow_none=True)

# ── Bodyweight ────────────────────────────────────────────────
class BodyweightSchema(_Base):
    weight = fields.Float(required=True)
    date   = fields.Str(load_default=None)

# ── Measurements ─────────────────────────────────────────────
# Fields match the route's BodyMeasurement columns exactly.
_MEASUREMENT_FIELDS = ['waist', 'chest', 'right_arm', 'left_arm', 'right_leg', 'left_leg']

class MeasurementSchema(_Base):
    date = fields.Str(load_default=None)

    @validates_schema
    def at_least_one_measurement(self, data, **kwargs):
        if not any(data.get(f) is not None for f in _MEASUREMENT_FIELDS):
            raise ValidationError('At least one measurement field is required.')

for _f in _MEASUREMENT_FIELDS:
    MeasurementSchema._declared_fields[_f] = fields.Float(load_default=None)

# ── AI ────────────────────────────────────────────────────────
# Every string here is interpolated into a prompt billed per token. The app
# sends short option keys for all but `notes`, whose input caps at
# AI_NOTES_MAX_LEN, so these only stop hand-built requests from inflating it.
AI_OPTION_MAX_LEN = 100
AI_NOTES_MAX_LEN  = 1000
_ai_option = validate.Length(max=AI_OPTION_MAX_LEN)

class AiGenerateSchema(_Base):
    days_per_week      = fields.Int(required=True, validate=validate.Range(min=1, max=7))
    goal               = fields.Str(required=True, validate=_ai_option)
    experience         = fields.Str(required=True, validate=_ai_option)
    generate_type      = fields.Str(required=True, validate=validate.OneOf(['routine', 'workout', 'template']))
    equipment          = fields.Str(load_default='full_gym', validate=_ai_option)
    session_length_min = fields.Int(load_default=60, validate=validate.Range(min=1, max=600))
    avoid              = fields.Str(load_default='none', validate=_ai_option)
    muscles            = fields.List(fields.Str(validate=_ai_option), load_default=[],
                                     validate=validate.Length(max=30))
    notes              = fields.Str(load_default=None, allow_none=True,
                                    validate=validate.Length(max=AI_NOTES_MAX_LEN))

# Bounds for persisting an AI preview. Generation caps a routine at 7 days
# (days_per_week) and the preview screen can't add any, and no real day holds
# anywhere near 50 exercises; the limits exist so one request can't write
# thousands of rows, not to encode a product rule.
AI_SAVE_MAX_DAYS      = 7
AI_SAVE_MAX_EXERCISES = 50

class _AiSaveDaySchema(_Base):
    label        = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    exercise_ids = fields.List(fields.Int(), load_default=list,
                               validate=validate.Length(max=AI_SAVE_MAX_EXERCISES))
    programming  = fields.List(fields.Dict(), load_default=None, allow_none=True,
                               validate=validate.Length(max=AI_SAVE_MAX_EXERCISES))

class AiSaveSchema(_Base):
    type         = fields.Str(required=True, validate=validate.OneOf(['routine', 'template']))
    name         = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=100))
    description  = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=1000))
    days         = fields.List(fields.Nested(_AiSaveDaySchema), load_default=list,
                               validate=validate.Length(max=AI_SAVE_MAX_DAYS))
    exercise_ids = fields.List(fields.Int(), load_default=list,
                               validate=validate.Length(max=AI_SAVE_MAX_EXERCISES))
    programming  = fields.List(fields.Dict(), load_default=None, allow_none=True,
                               validate=validate.Length(max=AI_SAVE_MAX_EXERCISES))

class AiInsightsSchema(_Base):
    experience = fields.Str(load_default=None, validate=_ai_option)
    goal       = fields.Str(load_default=None, validate=_ai_option)
    avoid      = fields.Str(load_default=None, validate=_ai_option)
