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
    gender          = fields.Str(validate=validate.OneOf(['male', 'female']), load_default=None, allow_none=True)
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
class WorkoutSchema(_Base):
    workoutName = fields.Str(required=True, validate=validate.Length(min=1))
    exercises   = fields.List(fields.Dict(), required=True)
    notes       = fields.Str(load_default=None)
    duration    = fields.Int(load_default=None)
    date        = fields.Str(load_default=None)

# No load_default — missing fields excluded to preserve 'if field in data' PATCH semantics.
class UpdateWorkoutSchema(_Base):
    workoutName = fields.Str()
    exercises   = fields.List(fields.Dict())
    notes       = fields.Str()
    duration    = fields.Int()
    date        = fields.Str()

# ── Routine ───────────────────────────────────────────────────
class RoutineSchema(_Base):
    name        = fields.Str(required=True, validate=validate.Length(min=1))
    days        = fields.List(fields.Dict(), required=True)
    description = fields.Str(load_default=None)

# ── Workout Template ──────────────────────────────────────────
class WorkoutTemplateSchema(_Base):
    name                  = fields.Str(required=True, validate=validate.Length(min=1))
    exercise_template_ids = fields.List(fields.Int(), load_default=[])

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
class AiGenerateSchema(_Base):
    days_per_week      = fields.Int(required=True, validate=validate.Range(min=1, max=7))
    goal               = fields.Str(required=True)
    experience         = fields.Str(required=True)
    generate_type      = fields.Str(required=True, validate=validate.OneOf(['routine', 'workout', 'template']))
    equipment          = fields.Str(load_default='full_gym')
    session_length_min = fields.Int(load_default=60)
    avoid              = fields.Str(load_default='none')
    muscles            = fields.List(fields.Str(), load_default=[])
