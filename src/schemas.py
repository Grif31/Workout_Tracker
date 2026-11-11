import math

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
# The app sends the avatar as a 300px JPEG data URL, about 30 KB of text.
PROFILE_PIC_MAX_LEN = 400_000

class UpdateProfileSchema(_Base):
    # user.name is String(100): without the cap Postgres raises on a longer one and the save 500s
    name            = fields.Str(validate=validate.Length(max=100))
    bio             = fields.Str(validate=validate.Length(max=1000))
    profile_pic_url = fields.Str(validate=validate.Length(max=PROFILE_PIC_MAX_LEN))
    # null clears these. Edit Profile sends height: null when the field is
    # empty, which used to be rejected and blocked the whole save.
    bodyweight      = fields.Float(allow_none=True)
    height          = fields.Float(allow_none=True, validate=validate.Range(min=20, max=108))
    weight_unit     = fields.Str(validate=validate.OneOf(['kg', 'lbs']))
    distance_unit   = fields.Str(validate=validate.OneOf(['mi', 'km']))
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
# Generous bounds on a GPS route's segments: one per gap in the recording, so
# hundreds would mean a broken client; a segment of a long ride encodes to tens
# of kilobytes at most
MAX_ROUTE_SEGMENTS = 500
MAX_SEGMENT_LENGTH = 500_000
# Above any bike on a descent; the app drops readings past its own, lower caps
MAX_SPEED_KMH = 200


EXERCISE_TYPES = ('strength', 'cardio', 'duration')
SET_TYPES = ('N', 'W', 'D', 'F')
MAX_NAME_LENGTH = 250      # Exercise.name
MAX_LABEL_LENGTH = 100     # RoutineDay.label
MAX_ORDER = 10_000
MAX_REPS = 10_000
MAX_LIST = 200             # exercises in a day, programming rows


def _whole(value, name, lo, hi):
    """A whole number for an Integer column, or None. A decimal is rounded and
    a numeric string read, never refused: SQLAlchemy keeps a float as it came in
    memory while Postgres stores it rounded, and that desync (a decimal reps)
    crashed the PR maths and lost a whole save on 2026-09-10."""
    if value is None or value == '':
        return None
    if isinstance(value, bool) or isinstance(value, (list, dict)):
        raise ValidationError(f'{name} must be a whole number')
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValidationError(f'{name} must be a whole number')
    if not math.isfinite(number) or not lo <= round(number) <= hi:
        raise ValidationError(f'{name} must be between {lo} and {hi}')
    return int(round(number))


def _row_id(value, name):
    """An existing row's id, or None. Matched against sets of ids, where a list
    or dict would raise a TypeError (unhashable) and fail the save as a 500."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError(f'{name} must be a whole number id')
    return value


def _text(value, name, max_length=None):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError(f'{name} must be text')
    if max_length is not None and len(value) > max_length:
        raise ValidationError(f'{name} is longer than {max_length} characters')
    return value


def _validate_exercises(exercises):
    # Every value here reaches a typed column, so junk has to fail as a 400
    # that names the field rather than as a 500 that rolls the save back.
    # Values are written back normalised: the routes read the same dicts.
    for i, ex in enumerate(exercises):
        where = f'exercise {i + 1}'
        if not isinstance(ex.get('name'), str) or not ex['name'].strip():
            raise ValidationError(f'{where} needs a name')
        _text(ex['name'], f'{where} name', MAX_NAME_LENGTH)
        if ex.get('exercise_type') is not None:
            kind = ex['exercise_type'].lower() if isinstance(ex['exercise_type'], str) else None
            if kind not in EXERCISE_TYPES:
                raise ValidationError(f'{where} exercise_type must be one of {", ".join(EXERCISE_TYPES)}')
            ex['exercise_type'] = kind
        for field in ('id', 'exercise_template_id'):
            if field in ex:
                ex[field] = _row_id(ex[field], f'{where} {field}')
        if 'order' in ex:
            ex['order'] = _whole(ex['order'], f'{where} order', 0, MAX_ORDER)
        for field in ('notes', 'route_polyline'):
            if field in ex:
                _text(ex[field], f'{where} {field}')
        sets = ex.get('sets', [])
        if not isinstance(sets, list) or not all(isinstance(s, dict) for s in sets):
            raise ValidationError(f'exercise {i + 1} sets must be a list of objects')
        segments = ex.get('route_segments')
        if segments is not None and not (
            isinstance(segments, list)
            and len(segments) <= MAX_ROUTE_SEGMENTS
            and all(isinstance(seg, str) and len(seg) <= MAX_SEGMENT_LENGTH for seg in segments)
        ):
            raise ValidationError(f'exercise {i + 1} route_segments must be a list of encoded polylines')
        if ex.get('negative_split') is not None and not isinstance(ex['negative_split'], bool):
            raise ValidationError(f'exercise {i + 1} negative_split must be true or false')
        # A top speed feeds what the app shows, never PRs, but a string would
        # reach the Float column and fail the save as a 500
        for k, s in enumerate(sets):
            at = f'{where} set {k + 1}'
            speed = s.get('max_speed')
            if speed is not None and (isinstance(speed, bool) or not isinstance(speed, (int, float)) or not 0 <= speed <= MAX_SPEED_KMH):
                raise ValidationError(f'{at} max_speed must be a number of km/h')
            for field, bound in SET_NUMBER_BOUNDS.items():
                if field in s:
                    s[field] = _set_number(s[field], bound, f'{at} {field}')
            if s.get('distance_unit') not in (None, '', 'km', 'mi'):
                raise ValidationError(f'{at} distance_unit must be km or mi')
            if 'id' in s:
                s['id'] = _row_id(s['id'], f'{at} id')
            for field, lo, hi in (('reps', 0, MAX_REPS), ('rpe', 1, 10), ('order', 0, MAX_ORDER)):
                if field in s:
                    s[field] = _whole(s[field], f'{at} {field}', lo, hi)
            if 'set_type' in s:
                if s['set_type'] in (None, ''):
                    s['set_type'] = 'N'
                elif s['set_type'] not in SET_TYPES:
                    raise ValidationError(f'{at} set_type must be one of {", ".join(SET_TYPES)}')


# Far past any real set: they exist to keep Infinity, 1e300 and the like out
# of PR rows, where a non-finite value breaks the app's JSON.parse for good
SET_NUMBER_BOUNDS = {
    'weight': 10_000,
    'cardio_duration': 100_000,   # minutes
    'distance': 10_000,           # km or mi
    'elevation_gain': 100_000,    # metres
    'intensity': 10_000,          # pace per unit, or watts
}


def _set_number(value, bound, name):
    """A set's number as a float, or None. Numeric strings are converted rather
    than refused: some callers send them, and SQLAlchemy keeps a string as it
    came in memory, so the PR maths after the flush would compare str to int.
    The set dicts are shared with the validated payload (fields.Dict copies only
    the exercise), which is what makes the conversion reach the route."""
    if value is None or value == '':
        return None
    if isinstance(value, bool) or isinstance(value, (list, dict)):
        raise ValidationError(f'{name} must be a number')
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValidationError(f'{name} must be a number')
    if not math.isfinite(number) or abs(number) > bound:
        raise ValidationError(f'{name} is out of range')
    return number


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
    # The app's id for this workout, so a repeated save returns the first one
    client_id = fields.Str(load_default=None, allow_none=True, validate=validate.Length(min=8, max=64))
    # The phone's local hour the workout started (the Eos badge)
    local_start_hour = fields.Int(load_default=None, allow_none=True, validate=validate.Range(min=0, max=23))

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
def _validate_programming(rows, name='programming'):
    """Sets/reps/RPE per exercise, stored as JSON and read back by the app's
    template prefill, which expects a list of objects."""
    if rows is None:
        return
    if not isinstance(rows, list) or len(rows) > MAX_LIST or not all(isinstance(r, dict) for r in rows):
        raise ValidationError(f'{name} must be a list of objects')


def _validate_days(days):
    # Same reasoning as _validate_exercises: each value reaches a typed column
    # or a query, where junk was a 500
    for i, day in enumerate(days):
        where = f'day {i + 1}'
        if not isinstance(day, dict):
            raise ValidationError(f'{where} must be an object')
        if 'label' in day:
            _text(day['label'], f'{where} label', MAX_LABEL_LENGTH)
        if 'workout_template_id' in day:
            day['workout_template_id'] = _row_id(day['workout_template_id'], f'{where} workout_template_id')
        ids = day.get('exercise_template_ids')
        if ids is not None and not (
            isinstance(ids, list) and len(ids) <= MAX_LIST
            and all(isinstance(x, int) and not isinstance(x, bool) for x in ids)
        ):
            raise ValidationError(f'{where} exercise_template_ids must be a list of ids')
        _validate_programming(day.get('programming'), f'{where} programming')


class RoutineSchema(_Base):
    name        = fields.Str(required=True, validate=validate.Length(min=1))
    days        = fields.List(fields.Dict(), required=True, validate=_validate_days)
    description = fields.Str(load_default=None)

# No load_default, so 'if field in data' PATCH semantics hold.
class UpdateRoutineSchema(_Base):
    name        = fields.Str()
    days        = fields.List(fields.Dict(), validate=_validate_days)
    description = fields.Str(allow_none=True)

# ── Workout Template ──────────────────────────────────────────
class WorkoutTemplateSchema(_Base):
    name                  = fields.Str(required=True, validate=validate.Length(min=1))
    exercise_template_ids = fields.List(fields.Int(), load_default=[])
    # Per-exercise sets/reps. Accepted on create because the app now creates a
    # template on its first save, so programming entered beforehand has to
    # arrive with the POST rather than a later PATCH.
    programming           = fields.List(fields.Dict(), load_default=None, validate=validate.Length(max=MAX_LIST))

class UpdateWorkoutTemplateSchema(_Base):
    name                  = fields.Str()
    exercise_template_ids = fields.List(fields.Int())
    programming           = fields.List(fields.Dict(), allow_none=True, validate=validate.Length(max=MAX_LIST))

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


class _AvoidField(fields.Field):
    """Areas to avoid, as a list of option keys. The coach profile lets the
    user pick several, but older app builds send only one as a bare string
    (and 'none' for nothing), so both shapes load to the same list."""

    def _deserialize(self, value, attr, data, **kwargs):
        items = [value] if isinstance(value, str) else value
        if (not isinstance(items, list) or len(items) > 10
                or not all(isinstance(v, str) and len(v) <= AI_OPTION_MAX_LEN for v in items)):
            raise ValidationError('Must be an option key or a list of them.')
        return [v for v in items if v and v != 'none']

class AiGenerateSchema(_Base):
    days_per_week      = fields.Int(required=True, validate=validate.Range(min=1, max=7))
    goal               = fields.Str(required=True, validate=_ai_option)
    experience         = fields.Str(required=True, validate=_ai_option)
    generate_type      = fields.Str(required=True, validate=validate.OneOf(['routine', 'workout', 'template']))
    equipment          = fields.Str(load_default='full_gym', validate=_ai_option)
    session_length_min = fields.Int(load_default=60, validate=validate.Range(min=1, max=600))
    avoid              = _AvoidField(load_default=list)
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
    starter      = fields.Bool(load_default=False)

class AiInsightsSchema(_Base):
    experience = fields.Str(load_default=None, validate=_ai_option)
    goal       = fields.Str(load_default=None, validate=_ai_option)
    avoid      = _AvoidField(load_default=list)


INSIGHT_FEEDBACK_REASONS = ['known', 'irrelevant', 'wrong', 'vague']


# ── Profile PR pins ──────────────────────────────────────────
# estimated_1rm is left out: it is never shown to users as a PR
PROFILE_PIN_PR_TYPES = ['max_weight', 'max_reps', 'best_time', 'best_distance',
                        'max_duration', 'longest_distance', 'max_elevation']
MAX_PROFILE_PR_PINS = 3


class ProfilePRPinSchema(_Base):
    exercise_template_id = fields.Int(required=True, strict=True)
    pr_type        = fields.Str(required=True, validate=validate.OneOf(PROFILE_PIN_PR_TYPES))
    weight_context = fields.Float(load_default=None, allow_none=True, allow_nan=False)


class ProfilePRPinsSchema(_Base):
    pins = fields.List(fields.Nested(ProfilePRPinSchema), required=True,
                       validate=validate.Length(max=MAX_PROFILE_PR_PINS))


# ── Paywall events ───────────────────────────────────────────
# The app's PurchaseOutcome and RestoreOutcome (context/PurchaseContext.tsx)
PAYWALL_EVENTS = ['upsell_shown', 'paywall_viewed', 'plan_selected', 'purchase_started', 'purchase', 'restore']
PAYWALL_PLANS = ['annual', 'monthly', 'lifetime']
PURCHASE_OUTCOMES = ['purchased', 'cancelled', 'pending', 'network', 'already_owned', 'failed']
RESTORE_OUTCOMES = ['restored', 'none', 'failed']


class PaywallEventSchema(_Base):
    event   = fields.Str(required=True, validate=validate.OneOf(PAYWALL_EVENTS))
    # Free-form so a new paywall entry point needs no server change
    source  = fields.Str(load_default=None, allow_none=True,
                         validate=validate.Regexp(r'^[a-z0-9_]{1,32}$'))
    plan    = fields.Str(load_default=None, allow_none=True, validate=validate.OneOf(PAYWALL_PLANS))
    trial   = fields.Bool(load_default=None, allow_none=True)
    outcome = fields.Str(load_default=None, allow_none=True,
                         validate=validate.OneOf(sorted(set(PURCHASE_OUTCOMES + RESTORE_OUTCOMES))))

    @validates_schema
    def outcome_fits_event(self, data, **kwargs):
        allowed = {'purchase': PURCHASE_OUTCOMES, 'restore': RESTORE_OUTCOMES}.get(data.get('event'))
        if allowed is not None and data.get('outcome') not in allowed:
            raise ValidationError(f"Must be one of: {', '.join(allowed)}.", 'outcome')


class AiInsightFeedbackSchema(_Base):
    type    = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=32))
    title   = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    body    = fields.Str(required=True, validate=validate.Length(min=1, max=1000))
    # null takes a vote back
    helpful = fields.Bool(required=True, allow_none=True)
    reason  = fields.Str(load_default=None, allow_none=True, validate=validate.OneOf(INSIGHT_FEEDBACK_REASONS))


class AiWeeklyReviewSchema(AiInsightsSchema):
    # The Monday of the Weekly Summary week being reviewed; absent = the last 7 days
    week_start = fields.Date(load_default=None)


# ── Achievements ─────────────────────────────────────────────
class AchievementPinsSchema(_Base):
    # In display order; an empty list pins nothing
    keys = fields.List(fields.Str(validate=validate.Length(min=1, max=48)),
                       required=True, validate=validate.Length(max=3))

class AchievementsSeenSchema(_Base):
    # Omitted: every unseen badge is marked seen
    keys = fields.List(fields.Str(validate=validate.Length(min=1, max=48)),
                       load_default=None, allow_none=True, validate=validate.Length(max=200))


# ── Import ────────────────────────────────────────────────────
IMPORT_SOURCES = ('hevy', 'strong')

class ImportSchema(_Base):
    source = fields.Str(required=True, validate=validate.OneOf(IMPORT_SOURCES))
    # The CSV itself, read as text on the phone (MAX_CONTENT_LENGTH caps it)
    csv = fields.Str(required=True, validate=validate.Length(min=1))
    # Only for a file that doesn't say (older Strong exports)
    weight_unit = fields.Str(load_default=None, allow_none=True, validate=validate.OneOf(('kg', 'lbs')))
