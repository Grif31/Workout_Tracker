"""add 106 strength and 22 cardio exercises to the library

Production gets library exercises from migrations, not seed.py, so the new
seed.py entries land here too. The list is frozen (a later edit to seed.py
must not rewrite history); tests/test_exercise_library.py checks that every
row below still matches seed.py. Descriptions are read from
utils/exercise_descriptions.py at upgrade time, the way backfill-descriptions
does. Images are not fetched here; they're added by hand on the admin
exercises page (its "no image" filter lists these rows).

Revision ID: y3z4a5b6c7d8
Revises: x2y3z4a5b6c7
Create Date: 2026-10-16

"""
import os
import sys

from alembic import op
import sqlalchemy as sa

revision = 'y3z4a5b6c7d8'
down_revision = 'x2y3z4a5b6c7'
branch_labels = None
depends_on = None

# (name, equipment, exercise_type, muscles, primary muscles, standards_key, bodyweight_load_factor)
STRENGTH = [
    ('Pec Deck', 'Machine', 'strength', ['Chest', 'Shoulders'], ['Chest'], 'Chest Fly Machine', None),
    ('Chest Press', 'Machine', 'strength', ['Chest', 'Triceps', 'Shoulders'], ['Chest'], 'Chest Press Machine', None),
    ('Incline Chest Press', 'Machine', 'strength', ['Chest', 'Triceps', 'Shoulders'], ['Chest'], None, None),
    ('Incline Chest Fly', 'Dumbbell', 'strength', ['Chest', 'Shoulders'], ['Chest'], None, None),
    ('Incline Chest Fly', 'Cable', 'strength', ['Chest', 'Shoulders'], ['Chest'], None, None),
    ('Low to High Cable Fly', 'Cable', 'strength', ['Chest', 'Shoulders'], ['Chest'], None, None),
    ('Floor Press', 'Barbell', 'strength', ['Chest', 'Triceps'], ['Chest'], None, None),
    ('Floor Press', 'Dumbbell', 'strength', ['Chest', 'Triceps'], ['Chest'], None, None),
    ('Incline Push Up', 'Bodyweight', 'strength', ['Chest', 'Triceps', 'Shoulders'], ['Chest'], None, 0.6),
    ('Decline Push Up', 'Bodyweight', 'strength', ['Chest', 'Triceps', 'Shoulders'], ['Chest'], None, 0.6),
    ('Diamond Push Up', 'Bodyweight', 'strength', ['Triceps', 'Chest'], ['Triceps'], None, 0.6),
    ('Push Up', 'Weighted', 'strength', ['Chest', 'Triceps', 'Shoulders'], ['Chest'], None, 0.6),
    ('Pullover', 'Dumbbell', 'strength', ['Chest', 'Back'], ['Chest'], None, None),
    ('Single Arm Row', 'Cable', 'strength', ['Back', 'Biceps'], ['Back'], None, None),
    ('Chin Up', 'Weighted', 'strength', ['Back', 'Biceps'], ['Back'], 'Pull-up', 1.0),
    ('Neutral Grip Pull Up', 'Bodyweight', 'strength', ['Back', 'Biceps'], ['Back'], 'Pull-up', 1.0),
    ('Inverted Row', 'Bodyweight', 'strength', ['Back', 'Biceps'], ['Back'], None, 0.6),
    ('Chest Supported Row', 'Dumbbell', 'strength', ['Back', 'Biceps'], ['Back'], None, None),
    ('Chest Supported Row', 'Machine', 'strength', ['Back', 'Biceps'], ['Back'], None, None),
    ('Pendlay Row', 'Barbell', 'strength', ['Back', 'Biceps'], ['Back'], 'Barbell Row', None),
    ('Meadows Row', 'Barbell', 'strength', ['Back', 'Biceps'], ['Back'], None, None),
    ('Seal Row', 'Barbell', 'strength', ['Back', 'Biceps'], ['Back'], None, None),
    ('Straight Arm Pulldown', 'Cable', 'strength', ['Back'], ['Back'], None, None),
    ('Single Arm Lat Pulldown', 'Cable', 'strength', ['Back', 'Biceps'], ['Back'], None, None),
    ('Trap Bar Deadlift', 'Other', 'strength', ['Quads', 'Glutes', 'Back', 'Hamstrings'], ['Quads', 'Glutes', 'Back'], None, None),
    ('Rack Pull', 'Barbell', 'strength', ['Back', 'Glutes', 'Hamstrings'], ['Back', 'Glutes'], None, None),
    ('Deficit Deadlift', 'Barbell', 'strength', ['Back', 'Hamstrings', 'Glutes', 'Quads'], ['Back', 'Hamstrings', 'Glutes'], None, None),
    ('Back Extension', 'Bodyweight', 'strength', ['Back', 'Glutes', 'Hamstrings'], ['Back'], None, 0.35),
    ('Back Extension', 'Weighted', 'strength', ['Back', 'Glutes', 'Hamstrings'], ['Back'], None, 0.35),
    ('Shrug', 'Barbell', 'strength', ['Back'], ['Back'], None, None),
    ('Shrug', 'Dumbbell', 'strength', ['Back'], ['Back'], None, None),
    ('Shrug', 'Smith Machine', 'strength', ['Back'], ['Back'], None, None),
    ('Shrug', 'Machine', 'strength', ['Back'], ['Back'], None, None),
    ('Overhead Press', 'Kettlebell', 'strength', ['Shoulders', 'Triceps'], ['Shoulders'], None, None),
    ('Upright Row', 'Barbell', 'strength', ['Shoulders', 'Back'], ['Shoulders'], None, None),
    ('Upright Row', 'Dumbbell', 'strength', ['Shoulders', 'Back'], ['Shoulders'], None, None),
    ('Upright Row', 'Cable', 'strength', ['Shoulders', 'Back'], ['Shoulders'], None, None),
    ('Push Press', 'Barbell', 'strength', ['Shoulders', 'Triceps', 'Quads'], ['Shoulders'], None, None),
    ('Z Press', 'Barbell', 'strength', ['Shoulders', 'Triceps'], ['Shoulders'], None, None),
    ('Landmine Press', 'Barbell', 'strength', ['Shoulders', 'Chest', 'Triceps'], ['Shoulders'], None, None),
    ('Pike Push Up', 'Bodyweight', 'strength', ['Shoulders', 'Triceps'], ['Shoulders'], None, 0.6),
    ('Handstand Push Up', 'Bodyweight', 'strength', ['Shoulders', 'Triceps'], ['Shoulders'], None, 1.0),
    ('Y Raise', 'Dumbbell', 'strength', ['Shoulders', 'Back'], ['Shoulders'], None, None),
    ('Spider Curl', 'Dumbbell', 'strength', ['Biceps'], ['Biceps'], None, None),
    ('Spider Curl', 'EZ Bar', 'strength', ['Biceps'], ['Biceps'], None, None),
    ('Bayesian Curl', 'Cable', 'strength', ['Biceps'], ['Biceps'], None, None),
    ('Drag Curl', 'Barbell', 'strength', ['Biceps'], ['Biceps'], None, None),
    ('Cross Body Hammer Curl', 'Dumbbell', 'strength', ['Biceps', 'Forearms'], ['Biceps'], None, None),
    ('Zottman Curl', 'Dumbbell', 'strength', ['Biceps', 'Forearms'], ['Biceps'], None, None),
    ('Behind the Back Wrist Curl', 'Barbell', 'strength', ['Forearms'], ['Forearms'], None, None),
    ('JM Press', 'Barbell', 'strength', ['Triceps', 'Chest'], ['Triceps'], None, None),
    ('Tate Press', 'Dumbbell', 'strength', ['Triceps'], ['Triceps'], None, None),
    ('Bench Dip', 'Bodyweight', 'strength', ['Triceps', 'Chest'], ['Triceps'], None, 0.5),
    ('Front Squat', 'Barbell', 'strength', ['Quads', 'Glutes', 'Core'], ['Quads', 'Glutes'], 'Front Squat', None),
    ('Front Squat', 'Smith Machine', 'strength', ['Quads', 'Glutes', 'Core'], ['Quads', 'Glutes'], 'Front Squat', None),
    ('Goblet Squat', 'Dumbbell', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, None),
    ('Goblet Squat', 'Kettlebell', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, None),
    ('Box Squat', 'Barbell', 'strength', ['Quads', 'Glutes', 'Hamstrings'], ['Quads', 'Glutes'], None, None),
    ('Pause Squat', 'Barbell', 'strength', ['Quads', 'Glutes', 'Hamstrings'], ['Quads', 'Glutes'], None, None),
    ('Pendulum Squat', 'Machine', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, None),
    ('Belt Squat', 'Machine', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, None),
    ('Single Leg Press', 'Machine', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, None),
    ('Walking Lunge', 'Dumbbell', 'strength', ['Quads', 'Glutes', 'Hamstrings'], ['Quads', 'Glutes'], None, None),
    ('Walking Lunge', 'Bodyweight', 'strength', ['Quads', 'Glutes', 'Hamstrings'], ['Quads', 'Glutes'], None, 0.85),
    ('Reverse Lunge', 'Dumbbell', 'strength', ['Quads', 'Glutes', 'Hamstrings'], ['Quads', 'Glutes'], None, None),
    ('Reverse Lunge', 'Barbell', 'strength', ['Quads', 'Glutes', 'Hamstrings'], ['Quads', 'Glutes'], None, None),
    ('Lateral Lunge', 'Dumbbell', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, None),
    ('Split Squat', 'Dumbbell', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, None),
    ('Pistol Squat', 'Bodyweight', 'strength', ['Quads', 'Glutes'], ['Quads', 'Glutes'], None, 1.0),
    ('Jump Squat', 'Bodyweight', 'strength', ['Quads', 'Glutes', 'Calves'], ['Quads'], None, 0.85),
    ('Box Jump', 'Bodyweight', 'strength', ['Quads', 'Glutes', 'Calves'], ['Quads'], None, 0.85),
    ('Wall Sit', 'Bodyweight', 'duration', ['Quads', 'Glutes'], ['Quads'], None, 0.6),
    ('Seated Leg Curl', 'Machine', 'strength', ['Hamstrings'], ['Hamstrings'], 'Leg Curl', None),
    ('Lying Leg Curl', 'Machine', 'strength', ['Hamstrings'], ['Hamstrings'], 'Leg Curl', None),
    ('Leg Curl', 'Cable', 'strength', ['Hamstrings'], ['Hamstrings'], None, None),
    ('Nordic Curl', 'Bodyweight', 'strength', ['Hamstrings'], ['Hamstrings'], None, 0.85),
    ('Romanian Deadlift', 'Smith Machine', 'strength', ['Hamstrings', 'Glutes', 'Back'], ['Hamstrings', 'Glutes'], 'Romanian Deadlift', None),
    ('Romanian Deadlift', 'Kettlebell', 'strength', ['Hamstrings', 'Glutes', 'Back'], ['Hamstrings', 'Glutes'], None, None),
    ('Stiff Leg Deadlift', 'Barbell', 'strength', ['Hamstrings', 'Glutes', 'Back'], ['Hamstrings', 'Glutes'], None, None),
    ('Glute Ham Raise', 'Bodyweight', 'strength', ['Hamstrings', 'Glutes'], ['Hamstrings'], None, 0.85),
    ('Single Leg Calf Raise', 'Dumbbell', 'strength', ['Calves'], ['Calves'], None, None),
    ('Tibialis Raise', 'Bodyweight', 'strength', ['Calves'], ['Calves'], None, 0.0),
    ('Adductor Machine', 'Machine', 'strength', ['Glutes'], ['Glutes'], None, None),
    ('Copenhagen Plank', 'Bodyweight', 'duration', ['Glutes', 'Core'], ['Glutes'], None, 0.6),
    ('Cable Pull Through', 'Cable', 'strength', ['Glutes', 'Hamstrings'], ['Glutes', 'Hamstrings'], None, None),
    ('Kettlebell Swing', 'Kettlebell', 'strength', ['Glutes', 'Hamstrings', 'Back'], ['Glutes', 'Hamstrings'], None, None),
    ('Frog Pump', 'Bodyweight', 'strength', ['Glutes'], ['Glutes'], None, 0.35),
    ('Single Leg Hip Thrust', 'Bodyweight', 'strength', ['Glutes', 'Hamstrings'], ['Glutes'], None, 0.35),
    ('Glute Bridge', 'Dumbbell', 'strength', ['Glutes', 'Hamstrings'], ['Glutes'], None, None),
    ('Reverse Hyperextension', 'Machine', 'strength', ['Glutes', 'Hamstrings'], ['Glutes'], None, None),
    ('Side Plank', 'Bodyweight', 'duration', ['Core'], ['Core'], None, 0.6),
    ('Hollow Hold', 'Bodyweight', 'duration', ['Core'], ['Core'], None, 0.6),
    ('L-Sit', 'Bodyweight', 'duration', ['Core'], ['Core'], None, 0.6),
    ('Hanging Knee Raise', 'Bodyweight', 'strength', ['Core'], ['Core'], None, 0.35),
    ('Toes to Bar', 'Bodyweight', 'strength', ['Core', 'Back'], ['Core'], None, 0.35),
    ("Captain's Chair Leg Raise", 'Machine', 'strength', ['Core'], ['Core'], None, None),
    ('Lying Leg Raise', 'Bodyweight', 'strength', ['Core'], ['Core'], None, 0.35),
    ('Bicycle Crunch', 'Bodyweight', 'strength', ['Core'], ['Core'], None, 0.35),
    ('Sit Up', 'Bodyweight', 'strength', ['Core'], ['Core'], None, 0.35),
    ('Dead Bug', 'Bodyweight', 'strength', ['Core'], ['Core'], None, 0.0),
    ('Bird Dog', 'Bodyweight', 'strength', ['Core', 'Back'], ['Core'], None, 0.0),
    ('Mountain Climber', 'Bodyweight', 'strength', ['Core', 'Shoulders'], ['Core'], None, 0.6),
    ('Pallof Press', 'Cable', 'strength', ['Core'], ['Core'], None, None),
    ('Woodchopper', 'Cable', 'strength', ['Core'], ['Core'], None, None),
    ('Suitcase Carry', 'Dumbbell', 'strength', ['Core', 'Forearms'], ['Core'], None, None),
    ('Turkish Get Up', 'Kettlebell', 'strength', ['Core', 'Shoulders'], ['Core'], None, None),
]
CARDIO = [
    ('Rowing', None),
    ('Assault Bike', 'Machine'),
    ('Ski Erg', 'Machine'),
    ('Trail Running', None),
    ('Sprints', None),
    ('Rucking', None),
    ('Burpees', None),
    ('Battle Ropes', None),
    ('Sled Push', None),
    ('Boxing', None),
    ('Basketball', None),
    ('Soccer', None),
    ('Tennis', None),
    ('Pickleball', None),
    ('Yoga', None),
    ('Pilates', None),
    ('HIIT', None),
    ('Dance', None),
    ('Rock Climbing', None),
    ('Skiing', None),
    ('Snowboarding', None),
    ('Kayaking', None),
]


def _insert(bind, name, equipment, etype, muscles, primaries, sk, load_factor, description):
    existing = bind.execute(
        sa.text(
            'SELECT id FROM "exerciseTemplates" '
            'WHERE name = :name AND equipment IS NOT DISTINCT FROM :eq AND user_id IS NULL'
        ),
        {'name': name, 'eq': equipment},
    ).fetchone()
    if existing:
        return
    tmpl_id = bind.execute(
        sa.text(
            'INSERT INTO "exerciseTemplates" '
            '(name, equipment, exercise_type, standards_key, description, bodyweight_load_factor) '
            'VALUES (:name, :eq, :etype, :sk, :desc, :lf) RETURNING id'
        ),
        {'name': name, 'eq': equipment, 'etype': etype, 'sk': sk, 'desc': description, 'lf': load_factor},
    ).fetchone()[0]
    for muscle in muscles:
        bind.execute(
            sa.text(
                'INSERT INTO exercise_muscle_mappings (exercise_template_id, muscle_group, is_primary) '
                'VALUES (:tid, :mg, :prim)'
            ),
            {'tid': tmpl_id, 'mg': muscle, 'prim': muscle in primaries},
        )


def upgrade():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
    from utils.exercise_descriptions import EXERCISE_DESCRIPTIONS

    bind = op.get_bind()
    for name, equipment, etype, muscles, primaries, sk, lf in STRENGTH:
        _insert(bind, name, equipment, etype, muscles, primaries, sk, lf, EXERCISE_DESCRIPTIONS.get(name))
    for name, equipment in CARDIO:
        _insert(bind, name, equipment, 'cardio', ['Cardio'], ['Cardio'], None, None, EXERCISE_DESCRIPTIONS.get(name))


def downgrade():
    # Rows someone has already logged or put in a template stay: deleting them
    # would null out workout history and break template FKs.
    bind = op.get_bind()
    for name, equipment in [(r[0], r[1]) for r in STRENGTH] + CARDIO:
        row = bind.execute(
            sa.text(
                'SELECT t.id FROM "exerciseTemplates" t '
                'WHERE t.name = :name AND t.equipment IS NOT DISTINCT FROM :eq AND t.user_id IS NULL '
                'AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.exercise_template_id = t.id) '
                'AND NOT EXISTS (SELECT 1 FROM workout_template_exercises w WHERE w.exercise_template_id = t.id)'
            ),
            {'name': name, 'eq': equipment},
        ).fetchone()
        if not row:
            continue
        # Explicit, because SQLite (local dev) doesn't enforce the ON DELETE CASCADE
        bind.execute(sa.text('DELETE FROM exercise_muscle_mappings WHERE exercise_template_id = :id'), {'id': row[0]})
        bind.execute(sa.text('DELETE FROM "exerciseTemplates" WHERE id = :id'), {'id': row[0]})
