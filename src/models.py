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
    active_routine_id = db.Column(db.Integer, nullable=True)
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
        }


class Workout(db.Model):
    __tablename__ = "workouts"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.now())
    name = db.Column(db.String(250))
    notes = db.Column(db.String(250))
    duration = db.Column(db.Integer)
    volume = db.Column(db.Float)
    exercises = db.relationship('Exercise', backref='workouts', cascade="all, delete-orphan", lazy=True)

    def to_dict(self, include_exercises=False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "date": self.date.isoformat() if self.date else None,
            "notes": self.notes,
            "duration": self.duration,
            "volume": self.volume,
        }
        if include_exercises:
            data["exercises"] = [ex.to_dict(include_sets=True) for ex in self.exercises]
        return data

    def calculate_volume(self):
        """Helper to compute total weight lifted."""
        total = 0
        for ex in self.exercises:
            for s in ex.sets:
                total += (s.reps or 0) * (s.weight or 0)
        self.volume = total
        return total

class Exercise(db.Model):
    __tablename__ = "exercises"
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column(db.Integer, db.ForeignKey('workouts.id'), nullable=False)
    name = db.Column (db.String(250), nullable=False)
    sets = db.relationship('Set', backref='exercises', cascade="all, delete-orphan", lazy=True)

    def to_dict(self, include_sets=False):
        data = {
            "id": self.id,
            "workout_id": self.workout_id,
            "name": self.name,
        }
        if include_sets:
            data["sets"] = [s.to_dict() for s in self.sets]
        return data

# ── WorkoutTemplate (was: Routine) ─────────────────────────────────────────
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


class ExerciseTemplate(db.Model):
    __tablename__ = "exerciseTemplates"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(250), nullable=False)
    muscle_group = db.Column(db.String(250), nullable=False)
    equipment = db.Column(db.String(100), nullable=True)
    image_url = db.Column(db.Text, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('name', 'equipment', name='uq_exercise_name_equipment'),
    )

    workout_templates = db.relationship(
        "WorkoutTemplate",
        secondary="workout_template_exercises",
        back_populates="exercises",
    )


class Set(db.Model):
    __tablename__ = "sets"
    id = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id'), nullable=False)
    reps = db.Column(db.Integer, nullable=False)
    weight = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "exercise_id": self.exercise_id,
            "reps": self.reps,
            "weight": self.weight,
        }
