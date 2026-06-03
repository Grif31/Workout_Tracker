from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "user"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(250), unique=True, nullable=False)
    username = db.Column(db.String(250), unique=True, nullable=False)
    password = db.Column(db.String(250), nullable=False)
    name = db.Column(db.String(100))
    bio = db.Column(db.Text)
    profile_pic_url = db.Column(db.Text)
    bodyweight = db.Column(db.Float, nullable=True)
    height = db.Column(db.Float, nullable=True)
    weight_unit = db.Column(db.String(3), default='lbs', nullable=True)
    active_routine_id = db.Column(db.Integer, db.ForeignKey('routines.id', ondelete='SET NULL'), nullable=True)
    reset_otp_hash    = db.Column(db.String(64), nullable=True)
    reset_otp_expiry  = db.Column(db.DateTime,   nullable=True)
    is_social_only    = db.Column(db.Boolean,    default=False, nullable=False)
    gender            = db.Column(db.String(10),  nullable=True)   # 'male' | 'female' | None
    workouts = db.relationship('Workout', backref='user', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'name': self.name,
            'bio': self.bio,
            'profile_pic_url': self.profile_pic_url,
            'bodyweight': self.bodyweight,
            'height': self.height,
            'weight_unit': self.weight_unit or 'lbs',
            'active_routine_id': self.active_routine_id,
            'gender': self.gender,
        }


class Workout(db.Model):
    __tablename__ = "workouts"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.now)
    name = db.Column(db.String(250))
    notes = db.Column(db.Text)
    duration = db.Column(db.Integer)
    volume = db.Column(db.Float)  # always stored in lbs; convert on display
    exercises = db.relationship('Exercise', backref='workouts', cascade="all, delete-orphan", lazy=True)

    __table_args__ = (
        db.Index('ix_workouts_user_date', 'user_id', 'date'),
    )

    def to_dict(self, include_exercises=False):
        is_cardio = any((e.exercise_type or 'strength').lower() == 'cardio' for e in self.exercises)
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "date": self.date.isoformat() if self.date else None,
            "notes": self.notes,
            "duration": self.duration,
            "volume": self.volume,
            "workout_type": "cardio" if is_cardio else "strength",
        }
        if is_cardio and self.exercises:
            first_set = self.exercises[0].sets[0] if self.exercises[0].sets else None
            data['cardio_duration'] = float(first_set.cardio_duration) if first_set and first_set.cardio_duration else None
            data['distance'] = float(first_set.distance) if first_set and first_set.distance else None
            data['distance_unit'] = first_set.distance_unit if first_set and first_set.distance_unit else 'km'
        if include_exercises:
            data["exercises"] = [ex.to_dict(include_sets=True) for ex in self.exercises]
        return data

    def calculate_volume(self, weight_unit: str = 'lbs') -> float:
        """Sum reps × weight across all strength sets. Always stored in lbs.
        Pass the user's weight_unit so kg entries are normalised before storing."""
        kg_to_lbs = 2.20462
        total = 0.0
        for ex in self.exercises:
            if (ex.exercise_type or 'strength').lower() == 'cardio':
                continue
            for s in ex.sets:
                w = s.weight or 0.0
                if weight_unit == 'kg':
                    w *= kg_to_lbs
                total += (s.reps or 0) * w
        self.volume = total
        return total

class Exercise(db.Model):
    __tablename__ = "exercises"
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column(db.Integer, db.ForeignKey('workouts.id'), nullable=False, index=True)
    name = db.Column(db.String(250), nullable=False)
    exercise_template_id = db.Column(db.Integer, db.ForeignKey('exerciseTemplates.id', ondelete='SET NULL'), nullable=True)
    order = db.Column(db.Integer, nullable=True)
    exercise_type = db.Column(db.String(10), nullable=False, server_default='strength')
    route_polyline = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    sets = db.relationship('Set', backref='exercises', cascade="all, delete-orphan", lazy=True, order_by='Set.order')

    def to_dict(self, include_sets=False):
        tmpl = db.session.get(ExerciseTemplate, self.exercise_template_id) if self.exercise_template_id else None
        data = {
            "id": self.id,
            "workout_id": self.workout_id,
            "name": self.name,
            "exercise_template_id": self.exercise_template_id,
            "order": self.order,
            "exercise_type": (self.exercise_type or 'strength').lower(),
            "route_polyline": self.route_polyline,
            "notes": self.notes,
            "equipment": tmpl.equipment if tmpl else None,
            "muscle_group": tmpl.muscle_group if tmpl else None,
        }
        if include_sets:
            data["sets"] = [s.to_dict() for s in self.sets]
        return data

# ── WorkoutTemplate ─────────────────────────────────────────
# A single-day workout plan with a list of exercises.
# Used as the building block for multi-day Routines.

class WorkoutTemplate(db.Model):
    __tablename__ = "workout_templates"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(250), nullable=False)

    exercises = db.relationship(
        "ExerciseTemplate",
        secondary="workout_template_exercises",
        back_populates="workout_templates",
    )

    def to_dict(self, include_exercises=False):
        data = {"id": self.id, "user_id": self.user_id, "name": self.name}
        if include_exercises:
            data["exercises"] = [
                {"id": e.id, "name": e.name, "muscle_group": e.muscle_group}
                for e in self.exercises
            ]
        return data


class WorkoutTemplateExercise(db.Model):
    __tablename__ = "workout_template_exercises"
    id = db.Column(db.Integer, primary_key=True)
    workout_template_id = db.Column(db.Integer, db.ForeignKey("workout_templates.id"), nullable=False)
    exercise_template_id = db.Column(db.Integer, db.ForeignKey("exerciseTemplates.id"), nullable=False)
    order = db.Column(db.Integer)


# ── Routine ─────────────────────────────────────────────────────────────────
# A multi-day workout plan (e.g. PPL, 5-day split).
# Each day references a WorkoutTemplate via RoutineDay.

class Routine(db.Model):
    __tablename__ = "routines"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(250), nullable=False)
    description = db.Column(db.Text, nullable=True)
    days = db.relationship(
        "RoutineDay",
        backref="routine",
        cascade="all, delete-orphan",
        order_by="RoutineDay.day_order",
    )

    def to_dict(self, include_days=False):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "day_count": len(self.days),
        }
        if include_days:
            data["days"] = [d.to_dict() for d in self.days]
        return data

# Day in a Routine, which references a WorkoutTemplate. The day_order field determines the sequence of days in the routine.
class RoutineDay(db.Model):
    __tablename__ = "routine_days"
    id = db.Column(db.Integer, primary_key=True)
    routine_id = db.Column(db.Integer, db.ForeignKey("routines.id"), nullable=False)
    workout_template_id = db.Column(db.Integer, db.ForeignKey("workout_templates.id"), nullable=False)
    day_order = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(100), nullable=True)
    workout_template = db.relationship("WorkoutTemplate")

    def to_dict(self):
        return {
            "id": self.id,
            "day_order": self.day_order,
            "label": self.label,
            "workout_template": self.workout_template.to_dict(include_exercises=True),
        }

# ── ExerciseTemplate ─────────────────────────────────────────
# A master list of exercises with metadata (muscle group, equipment, etc).
class ExerciseTemplate(db.Model):
    __tablename__ = "exerciseTemplates"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(250), nullable=False)
    equipment = db.Column(db.String(100), nullable=True)
    image_url = db.Column(db.Text, nullable=True)
    exercise_type = db.Column(db.String(10), nullable=False, server_default='strength')

    __table_args__ = (
        db.UniqueConstraint('name', 'equipment', name='uq_exercise_name_equipment'),
    )

    muscle_mappings = db.relationship(
        'ExerciseMuscleMapping',
        cascade='all, delete-orphan',
        lazy='select',
    )

    workout_templates = db.relationship(
        "WorkoutTemplate",
        secondary="workout_template_exercises",
        back_populates="exercises",
    )

    @property
    def muscle_group(self) -> str:
        """Assembles the comma-separated muscle string from the join table: primary first."""
        primaries = [m.muscle_group for m in self.muscle_mappings if m.is_primary]
        secondaries = [m.muscle_group for m in self.muscle_mappings if not m.is_primary]
        return ', '.join(primaries + secondaries)


# ── ExerciseMuscleMapping ─────────────────────────────────────
# Join table: one row per (exercise, muscle). is_primary=True marks the main mover.
class ExerciseMuscleMapping(db.Model):
    __tablename__ = "exercise_muscle_mappings"
    id = db.Column(db.Integer, primary_key=True)
    exercise_template_id = db.Column(
        db.Integer,
        db.ForeignKey('exerciseTemplates.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    muscle_group = db.Column(db.String(50), nullable=False)
    is_primary = db.Column(db.Boolean, nullable=False, default=True)

    __table_args__ = (
        db.UniqueConstraint('exercise_template_id', 'muscle_group', name='uq_exercise_muscle'),
    )

# ── Set ─────────────────────────────────────────────────────────────────
# A single set of an exercise, with reps and weight. Linked to Exercise via exercise_id.
class Set(db.Model):
    __tablename__ = "sets"
    id = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id'), nullable=False, index=True)
    reps = db.Column(db.Integer, nullable=True)
    weight = db.Column(db.Float, nullable=True)
    order = db.Column(db.Integer, nullable=True)
    set_type = db.Column(db.String(1), default='N', nullable=True)  # N=Normal W=Warmup D=Drop F=Failure
    cardio_duration = db.Column(db.Float, nullable=True)   # minutes
    distance = db.Column(db.Float, nullable=True)
    distance_unit = db.Column(db.String(5), nullable=True)  # 'km' or 'mi'
    intensity = db.Column(db.Float, nullable=True)          # pace or watts
    rpe = db.Column(db.Integer, nullable=True)               # 1-10 rating of perceived exertion

    def to_dict(self):
        return {
            "id": self.id,
            "exercise_id": self.exercise_id,
            "reps": self.reps,
            "weight": self.weight,
            "order": self.order,
            "set_type": self.set_type or 'N',
            "cardio_duration": self.cardio_duration,
            "distance": self.distance,
            "distance_unit": self.distance_unit,
            "intensity": self.intensity,
            "rpe": self.rpe,
        }

# ── DeviceToken ─────────────────────────────────────────────
class DeviceToken(db.Model):
    __tablename__ = "device_tokens"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    token = db.Column(db.Text, nullable=False)
    platform = db.Column(db.String(10), nullable=False)  # 'ios' | 'android'
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (db.UniqueConstraint('user_id', name='uq_device_token_user'),)

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "platform": self.platform}


# ── BodyweightLog ─────────────────────────────────────────
# Logs of user's bodyweight over time, with timestamp. Linked to User via user_id.
class BodyweightLog(db.Model):
    __tablename__ = "bodyweight_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    weight = db.Column(db.Float, nullable=False)
    date = db.Column(db.DateTime, default=datetime.now, nullable=False)

    __table_args__ = (
        db.Index('ix_bodyweight_user_date', 'user_id', 'date'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "weight": self.weight,
            "date": self.date.isoformat() if self.date else None,
        }

# ── BodyMeasurement ─────────────────────────────────────────
class BodyMeasurement(db.Model):
    __tablename__ = "body_measurements"
    id      = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    date    = db.Column(db.DateTime, default=datetime.now, nullable=False)
    waist     = db.Column(db.Float, nullable=True)
    chest     = db.Column(db.Float, nullable=True)
    right_arm = db.Column(db.Float, nullable=True)
    left_arm  = db.Column(db.Float, nullable=True)
    right_leg = db.Column(db.Float, nullable=True)
    left_leg  = db.Column(db.Float, nullable=True)

    __table_args__ = (db.Index('ix_measurements_user_date', 'user_id', 'date'),)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "date": self.date.isoformat() if self.date else None,
            "waist": self.waist,
            "chest": self.chest,
            "right_arm": self.right_arm,
            "left_arm": self.left_arm,
            "right_leg": self.right_leg,
            "left_leg": self.left_leg,
        }


# ── ProgressPhoto ─────────────────────────────────────────
class ProgressPhoto(db.Model):
    __tablename__ = "progress_photos"
    id        = db.Column(db.Integer, primary_key=True)
    user_id   = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    date      = db.Column(db.DateTime, default=datetime.now, nullable=False)
    photo_url = db.Column(db.Text, nullable=False)
    notes     = db.Column(db.String(250), nullable=True)

    __table_args__ = (db.Index('ix_progress_photos_user_date', 'user_id', 'date'),)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "date": self.date.isoformat() if self.date else None,
            "photo_url": self.photo_url,
            "notes": self.notes,
        }


# ── PersonalRecord ─────────────────────────────────────────
# User's personal record for a specific exercise and PR type (max weight, estimated 1RM, max reps).
# Linked to User, ExerciseTemplate, and optionally the Set where the PR was achieved.
class PersonalRecord(db.Model):
    __tablename__ = "personal_records"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    exercise_template_id = db.Column(db.Integer, db.ForeignKey('exerciseTemplates.id', ondelete='CASCADE'), nullable=False)
    pr_type = db.Column(db.String(20), nullable=False)  # 'max_weight', 'estimated_1rm', 'max_reps'
    value = db.Column(db.Float, nullable=False)
    # For max_reps: the weight at which these reps were achieved.
    # For max_weight / estimated_1rm: -1.0 (sentinel, no weight context needed).
    weight_context = db.Column(db.Float, nullable=False, default=-1.0)
    achieved_at = db.Column(db.DateTime, nullable=False)
    set_id = db.Column(db.Integer, db.ForeignKey('sets.id', ondelete='SET NULL'), nullable=True)

    __table_args__ = (
        db.UniqueConstraint(
            'user_id', 'exercise_template_id', 'pr_type', 'weight_context',
            name='uq_pr_user_exercise_type_weight',
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "exercise_template_id": self.exercise_template_id,
            "pr_type": self.pr_type,
            "value": self.value,
            "weight_context": None if self.weight_context < 0 else self.weight_context,
            "achieved_at": self.achieved_at.isoformat() if self.achieved_at else None,
            "set_id": self.set_id,
        }


# ── StrengthScoreSnapshot ─────────────────────────────────────
# Records the user's overall strength percentile score once per day.
class StrengthScoreSnapshot(db.Model):
    __tablename__ = 'strength_score_snapshots'
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False, index=True)
    score      = db.Column(db.Float, nullable=False)   # overall percentile 0–100
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'score': self.score,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
