"""
Seed script for ExerciseTemplate data.

Usage:
    python seed.py              # Seeds exercises and fetches images from ExerciseDB
    python seed.py --no-images  # Seeds exercises without fetching images
    python seed.py --backfill       # Update existing exercises that have no image_url
    python seed.py --refetch-images # Re-fetch ExerciseDB images for ALL exercises (overwrites existing)
    python seed.py --update-muscles # Update muscle_group on existing exercises to match list
    (--update-muscles and --refetch-images skip fields edited in /admin; add --force-admin-edits to overwrite them)

Requires RAPIDAPI_KEY in environment (from RapidAPI ExerciseDB subscription).
A local cache (exercisedb_cache.json) is written after the first fetch to avoid
burning API calls on repeat runs. Delete it to force a fresh fetch.
"""

import sys
import os
import json
import argparse
import time

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from models import db, ExerciseTemplate, ExerciseMuscleMapping
from utils.strength_standards import SEEDER_STANDARDS_MAP
from utils.exercise_descriptions import EXERCISE_DESCRIPTIONS
from utils.volume import derive_bodyweight_load_factor

EXERCISEDB_BASE      = 'https://exercisedb.p.rapidapi.com'
EXERCISEDB_CACHE     = os.path.join(os.path.dirname(__file__), 'exercisedb_cache.json')
CACHE_MAX_AGE_DAYS   = 30

# Map our equipment labels → ExerciseDB equipment strings
_EQUIP_MAP = {
    'barbell':       'barbell',
    'dumbbell':      'dumbbell',
    'cable':         'cable',
    'machine':       'leverage machine',
    'bodyweight':    'body weight',
    'smith machine': 'smith machine',
    'ez bar':        'ez barbell',
    'kettlebell':    'kettlebell',
    'weighted':      'weighted',
}

_exercisedb_cache: list | None = None

# ---------------------------------------------------------------------------
# Exercise data: (name, muscle_group, equipment)
# muscle_group is comma-separated when an exercise works multiple muscles.
# ---------------------------------------------------------------------------
EXERCISES = [
    # Chest
    ('Bench Press',             'Chest, Triceps, Shoulders', 'Barbell'),
    ('Bench Press',             'Chest, Triceps, Shoulders', 'Dumbbell'),
    ('Bench Press',             'Chest, Triceps, Shoulders', 'Smith Machine'),
    ('Bench Press',             'Chest, Triceps, Shoulders', 'Cable'),
    ('Incline Bench Press',     'Chest, Triceps, Shoulders', 'Barbell'),
    ('Incline Bench Press',     'Chest, Triceps, Shoulders', 'Dumbbell'),
    ('Incline Bench Press',     'Chest, Triceps, Shoulders', 'Smith Machine'),
    ('Incline Bench Press',     'Chest, Triceps, Shoulders', 'Cable'),
    ('Decline Bench Press',     'Chest, Triceps, Shoulders', 'Barbell'),
    ('Decline Bench Press',     'Chest, Triceps, Shoulders', 'Dumbbell'),
    ('Decline Bench Press',     'Chest, Triceps, Shoulders', 'Smith Machine'),
    ('Push Up',                 'Chest, Triceps, Shoulders', 'Bodyweight'),
    ('Chest Fly',               'Chest, Shoulders',          'Dumbbell'),
    ('Chest Fly',               'Chest, Shoulders',          'Cable'),
    ('Chest Fly',               'Chest, Shoulders',          'Machine'),
    ('Cable Crossover',         'Chest, Shoulders',          'Cable'),
    ('Pec Deck',                'Chest, Shoulders',          'Machine'),
    ('Chest Press',             'Chest, Triceps, Shoulders', 'Machine'),
    ('Incline Chest Press',     'Chest, Triceps, Shoulders', 'Machine'),
    ('Incline Chest Fly',       'Chest, Shoulders',          'Dumbbell'),
    ('Incline Chest Fly',       'Chest, Shoulders',          'Cable'),
    ('Low to High Cable Fly',   'Chest, Shoulders',          'Cable'),
    ('Floor Press',             'Chest, Triceps',            'Barbell'),
    ('Floor Press',             'Chest, Triceps',            'Dumbbell'),
    ('Incline Push Up',         'Chest, Triceps, Shoulders', 'Bodyweight'),
    ('Decline Push Up',         'Chest, Triceps, Shoulders', 'Bodyweight'),
    ('Diamond Push Up',         'Triceps, Chest',            'Bodyweight'),
    ('Push Up',                 'Chest, Triceps, Shoulders', 'Weighted'),
    ('Pullover',                'Chest, Back',               'Dumbbell'),

    # Back
    ('Pull Up',                 'Back, Biceps',              'Bodyweight'),
    ('Pull Up',                 'Back, Biceps',              'Weighted'),
    ('Chin Up',                 'Back, Biceps',              'Bodyweight'),
    ('Lat Pulldown',            'Back, Biceps',              'Cable'),
    ('Lat Pulldown',            'Back, Biceps',              'Machine'),
    ('Bent Over Row',           'Back, Biceps',              'Barbell'),
    ('Bent Over Row',           'Back, Biceps',              'Dumbbell'),
    ('Bent Over Row',           'Back, Biceps',              'Cable'),
    ('Seated Cable Row',        'Back, Biceps',              'Cable'),
    ('Deadlift',                'Back, Hamstrings, Quads',   'Barbell'),
    ('Deadlift',                'Back, Hamstrings, Quads',   'Smith Machine'),
    ('T-Bar Row',               'Back, Biceps',              'Barbell'),
    ('Single Arm Row',          'Back, Biceps',              'Dumbbell'),
    ('Single Arm Row',          'Back, Biceps',              'Cable'),
    ('Chin Up',                 'Back, Biceps',              'Weighted'),
    ('Neutral Grip Pull Up',    'Back, Biceps',              'Bodyweight'),
    ('Inverted Row',            'Back, Biceps',              'Bodyweight'),
    ('Chest Supported Row',     'Back, Biceps',              'Dumbbell'),
    ('Chest Supported Row',     'Back, Biceps',              'Machine'),
    ('Pendlay Row',             'Back, Biceps',              'Barbell'),
    ('Meadows Row',             'Back, Biceps',              'Barbell'),
    ('Seal Row',                'Back, Biceps',              'Barbell'),
    ('Straight Arm Pulldown',   'Back',                      'Cable'),
    ('Single Arm Lat Pulldown', 'Back, Biceps',              'Cable'),
    ('Trap Bar Deadlift',       'Quads, Glutes, Back, Hamstrings', 'Other'),
    ('Rack Pull',               'Back, Glutes, Hamstrings',  'Barbell'),
    ('Deficit Deadlift',        'Back, Hamstrings, Glutes, Quads', 'Barbell'),
    ('Back Extension',          'Back, Glutes, Hamstrings',  'Bodyweight'),
    ('Back Extension',          'Back, Glutes, Hamstrings',  'Weighted'),
    ('Shrug',                   'Back',                      'Barbell'),
    ('Shrug',                   'Back',                      'Dumbbell'),
    ('Shrug',                   'Back',                      'Smith Machine'),
    ('Shrug',                   'Back',                      'Machine'),

    # Shoulders
    ('Overhead Press',          'Shoulders, Triceps',        'Barbell'),
    ('Overhead Press',          'Shoulders, Triceps',        'Dumbbell'),
    ('Overhead Press',          'Shoulders, Triceps',        'Smith Machine'),
    ('Overhead Press',          'Shoulders, Triceps',        'Machine'),
    ('Lateral Raise',           'Shoulders',                 'Dumbbell'),
    ('Lateral Raise',           'Shoulders',                 'Cable'),
    ('Lateral Raise',           'Shoulders',                 'Machine'),
    ('Front Raise',             'Shoulders',                 'Barbell'),
    ('Front Raise',             'Shoulders',                 'Dumbbell'),
    ('Front Raise',             'Shoulders',                 'Cable'),
    ('Face Pull',               'Shoulders, Back',           'Cable'),
    ('Arnold Press',            'Shoulders, Triceps',        'Dumbbell'),
    ('Rear Delt Fly',           'Shoulders, Back',           'Dumbbell'),
    ('Rear Delt Fly',           'Shoulders, Back',           'Cable'),
    ('Rear Delt Fly',           'Shoulders, Back',           'Machine'),
    ('Overhead Press',          'Shoulders, Triceps',        'Kettlebell'),
    ('Upright Row',             'Shoulders, Back',           'Barbell'),
    ('Upright Row',             'Shoulders, Back',           'Dumbbell'),
    ('Upright Row',             'Shoulders, Back',           'Cable'),
    ('Push Press',              'Shoulders, Triceps, Quads', 'Barbell'),
    ('Z Press',                 'Shoulders, Triceps',        'Barbell'),
    ('Landmine Press',          'Shoulders, Chest, Triceps', 'Barbell'),
    ('Pike Push Up',            'Shoulders, Triceps',        'Bodyweight'),
    ('Handstand Push Up',       'Shoulders, Triceps',        'Bodyweight'),
    ('Y Raise',                 'Shoulders, Back',           'Dumbbell'),

    # Biceps
    ('Bicep Curl',              'Biceps, Forearms',          'Barbell'),
    ('Bicep Curl',              'Biceps, Forearms',          'Dumbbell'),
    ('Bicep Curl',              'Biceps, Forearms',          'EZ Bar'),
    ('Bicep Curl',              'Biceps, Forearms',          'Cable'),
    ('Bicep Curl',              'Biceps, Forearms',          'Machine'),
    ('Hammer Curl',             'Biceps, Forearms',          'Dumbbell'),
    ('Hammer Curl',             'Biceps, Forearms',          'Cable'),
    ('Preacher Curl',           'Biceps',                    'Barbell'),
    ('Preacher Curl',           'Biceps',                    'Dumbbell'),
    ('Preacher Curl',           'Biceps',                    'EZ Bar'),
    ('Preacher Curl',           'Biceps',                    'Machine'),
    ('Concentration Curl',      'Biceps',                    'Dumbbell'),
    ('Incline Curl',            'Biceps',                    'Dumbbell'),
    ('Spider Curl',             'Biceps',                    'Dumbbell'),
    ('Spider Curl',             'Biceps',                    'EZ Bar'),
    ('Bayesian Curl',           'Biceps',                    'Cable'),
    ('Drag Curl',               'Biceps',                    'Barbell'),
    ('Cross Body Hammer Curl',  'Biceps, Forearms',          'Dumbbell'),
    ('Zottman Curl',            'Biceps, Forearms',          'Dumbbell'),

    # Forearms
    ('Wrist Curl',              'Forearms',                  'Barbell'),
    ('Wrist Curl',              'Forearms',                  'Dumbbell'),
    ('Wrist Curl',              'Forearms',                  'Cable'),
    ('Reverse Wrist Curl',      'Forearms',                  'Barbell'),
    ('Reverse Wrist Curl',      'Forearms',                  'Dumbbell'),
    ('Reverse Wrist Curl',      'Forearms',                  'Cable'),
    ('Reverse Curl',            'Forearms, Biceps',          'Barbell'),
    ('Reverse Curl',            'Forearms, Biceps',          'Dumbbell'),
    ('Reverse Curl',            'Forearms, Biceps',          'EZ Bar'),
    ('Reverse Curl',            'Forearms, Biceps',          'Cable'),
    ('Farmer Walk',             'Forearms, Core',            'Dumbbell'),
    ('Farmer Walk',             'Forearms, Core',            'Kettlebell'),
    ('Dead Hang',               'Forearms, Back',            'Bodyweight'),
    ('Wrist Roller',            'Forearms',                  'Other'),
    ('Plate Pinch',             'Forearms',                  'Other'),
    ('Behind the Back Wrist Curl', 'Forearms',               'Barbell'),

    # Triceps
    ('Tricep Pushdown',         'Triceps',                   'Cable'),
    ('Tricep Pushdown',         'Triceps',                   'Machine'),
    ('Skull Crusher',           'Triceps',                   'Barbell'),
    ('Skull Crusher',           'Triceps',                   'Dumbbell'),
    ('Skull Crusher',           'Triceps',                   'EZ Bar'),
    ('Overhead Tricep Extension', 'Triceps',                 'Barbell'),
    ('Overhead Tricep Extension', 'Triceps',                 'Dumbbell'),
    ('Overhead Tricep Extension', 'Triceps',                 'EZ Bar'),
    ('Overhead Tricep Extension', 'Triceps',                 'Cable'),
    ('Close Grip Bench Press',  'Triceps, Chest',            'Barbell'),
    ('Close Grip Bench Press',  'Triceps, Chest',            'Smith Machine'),
    ('Dips',                    'Triceps, Chest, Shoulders', 'Bodyweight'),
    ('Dips',                    'Triceps, Chest, Shoulders', 'Weighted'),
    ('Tricep Kickback',         'Triceps',                   'Dumbbell'),
    ('Tricep Kickback',         'Triceps',                   'Cable'),
    ('JM Press',                'Triceps, Chest',            'Barbell'),
    ('Tate Press',              'Triceps',                   'Dumbbell'),
    ('Bench Dip',               'Triceps, Chest',            'Bodyweight'),

    # Quads
    ('Squat',                   'Quads, Hamstrings, Glutes', 'Barbell'),
    ('Squat',                   'Quads, Hamstrings, Glutes', 'Dumbbell'),
    ('Squat',                   'Quads, Hamstrings, Glutes', 'Smith Machine'),
    ('Squat',                   'Quads, Hamstrings, Glutes', 'Bodyweight'),
    ('Sissy Squat',             'Quads',                     'Bodyweight'),
    ('Leg Press',               'Quads, Hamstrings, Glutes', 'Machine'),
    ('Leg Extension',           'Quads',                     'Machine'),
    ('Hack Squat',              'Quads, Hamstrings, Glutes', 'Barbell'),
    ('Hack Squat',              'Quads, Hamstrings, Glutes', 'Machine'),
    ('Hack Squat',              'Quads, Hamstrings, Glutes', 'Smith Machine'),
    ('Lunges',                  'Quads, Hamstrings, Glutes', 'Barbell'),
    ('Lunges',                  'Quads, Hamstrings, Glutes', 'Dumbbell'),
    ('Lunges',                  'Quads, Hamstrings, Glutes', 'Bodyweight'),
    ('Bulgarian Split Squat',   'Quads, Hamstrings, Glutes', 'Barbell'),
    ('Bulgarian Split Squat',   'Quads, Hamstrings, Glutes', 'Dumbbell'),
    ('Bulgarian Split Squat',   'Quads, Hamstrings, Glutes', 'Smith Machine'),
    ('Bulgarian Split Squat',   'Quads, Hamstrings, Glutes', 'Bodyweight'),
    ('Front Squat',             'Quads, Glutes, Core',       'Barbell'),
    ('Front Squat',             'Quads, Glutes, Core',       'Smith Machine'),
    ('Goblet Squat',            'Quads, Glutes',             'Dumbbell'),
    ('Goblet Squat',            'Quads, Glutes',             'Kettlebell'),
    ('Box Squat',               'Quads, Glutes, Hamstrings', 'Barbell'),
    ('Pause Squat',             'Quads, Glutes, Hamstrings', 'Barbell'),
    ('Pendulum Squat',          'Quads, Glutes',             'Machine'),
    ('Belt Squat',              'Quads, Glutes',             'Machine'),
    ('Single Leg Press',        'Quads, Glutes',             'Machine'),
    ('Walking Lunge',           'Quads, Glutes, Hamstrings', 'Dumbbell'),
    ('Walking Lunge',           'Quads, Glutes, Hamstrings', 'Bodyweight'),
    ('Reverse Lunge',           'Quads, Glutes, Hamstrings', 'Dumbbell'),
    ('Reverse Lunge',           'Quads, Glutes, Hamstrings', 'Barbell'),
    ('Lateral Lunge',           'Quads, Glutes',             'Dumbbell'),
    ('Split Squat',             'Quads, Glutes',             'Dumbbell'),
    ('Pistol Squat',            'Quads, Glutes',             'Bodyweight'),
    ('Jump Squat',              'Quads, Glutes, Calves',     'Bodyweight'),
    ('Box Jump',                'Quads, Glutes, Calves',     'Bodyweight'),
    ('Wall Sit',                'Quads, Glutes',             'Bodyweight'),

    # Hamstrings
    ('Romanian Deadlift',       'Hamstrings, Glutes, Back',  'Barbell'),
    ('Romanian Deadlift',       'Hamstrings, Glutes, Back',  'Dumbbell'),
    ('Leg Curl',                'Hamstrings',                'Machine'),
    ('Leg Curl',                'Hamstrings',                'Dumbbell'),
    ('Sumo Deadlift',           'Hamstrings, Glutes, Back, Quads', 'Barbell'),
    ('Sumo Deadlift',           'Hamstrings, Glutes, Back, Quads', 'Dumbbell'),
    ('Good Morning',            'Hamstrings, Glutes, Back',  'Barbell'),
    ('Seated Leg Curl',         'Hamstrings',                'Machine'),
    ('Lying Leg Curl',          'Hamstrings',                'Machine'),
    ('Leg Curl',                'Hamstrings',                'Cable'),
    ('Nordic Curl',             'Hamstrings',                'Bodyweight'),
    ('Romanian Deadlift',       'Hamstrings, Glutes, Back',  'Smith Machine'),
    ('Romanian Deadlift',       'Hamstrings, Glutes, Back',  'Kettlebell'),
    ('Stiff Leg Deadlift',      'Hamstrings, Glutes, Back',  'Barbell'),
    ('Glute Ham Raise',         'Hamstrings, Glutes',        'Bodyweight'),

    # Calves
    ('Calf Raise',              'Calves',                    'Barbell'),
    ('Calf Raise',              'Calves',                    'Dumbbell'),
    ('Calf Raise',              'Calves',                    'Smith Machine'),
    ('Calf Raise',              'Calves',                    'Machine'),
    ('Calf Raise',              'Calves',                    'Bodyweight'),
    ('Seated Calf Raise',       'Calves',                    'Machine'),
    ('Seated Calf Raise',       'Calves',                    'Dumbbell'),
    ('Donkey Calf Raise',       'Calves',                    'Machine'),
    ('Donkey Calf Raise',       'Calves',                    'Bodyweight'),
    ('Single Leg Calf Raise',   'Calves',                    'Dumbbell'),
    ('Tibialis Raise',          'Calves',                    'Bodyweight'),

    # Glutes
    ('Hip Thrust',              'Glutes, Hamstrings',        'Barbell'),
    ('Hip Thrust',              'Glutes, Hamstrings',        'Dumbbell'),
    ('Hip Thrust',              'Glutes, Hamstrings',        'Smith Machine'),
    ('Hip Thrust',              'Glutes, Hamstrings',        'Machine'),
    ('Glute Bridge',            'Glutes, Hamstrings',        'Barbell'),
    ('Glute Bridge',            'Glutes, Hamstrings',        'Bodyweight'),
    ('Cable Kickback',          'Glutes',                    'Cable'),
    ('Donkey Kick',             'Glutes',                    'Bodyweight'),
    ('Donkey Kick',             'Glutes',                    'Cable'),
    ('Abductor Machine',        'Glutes',                    'Machine'),
    ('Step Up',                 'Glutes, Quads',             'Barbell'),
    ('Step Up',                 'Glutes, Quads',             'Dumbbell'),
    ('Step Up',                 'Glutes, Quads',             'Bodyweight'),
    ('Lateral Band Walk',       'Glutes',                    'Other'),
    ('Clamshell',               'Glutes',                    'Bodyweight'),
    ('Fire Hydrant',            'Glutes',                    'Bodyweight'),
    ('Single Leg Deadlift',     'Glutes, Hamstrings',        'Barbell'),
    ('Single Leg Deadlift',     'Glutes, Hamstrings',        'Dumbbell'),
    ('Single Leg Deadlift',     'Glutes, Hamstrings',        'Kettlebell'),
    ('Adductor Machine',        'Glutes',                    'Machine'),
    ('Copenhagen Plank',        'Glutes, Core',              'Bodyweight'),
    ('Cable Pull Through',      'Glutes, Hamstrings',        'Cable'),
    ('Kettlebell Swing',        'Glutes, Hamstrings, Back',  'Kettlebell'),
    ('Frog Pump',               'Glutes',                    'Bodyweight'),
    ('Single Leg Hip Thrust',   'Glutes, Hamstrings',        'Bodyweight'),
    ('Glute Bridge',            'Glutes, Hamstrings',        'Dumbbell'),
    ('Reverse Hyperextension',  'Glutes, Hamstrings',        'Machine'),

    # Core
    ('Plank',                   'Core, Shoulders',           'Bodyweight'),
    ('Crunch',                  'Core',                      'Bodyweight'),
    ('Hanging Leg Raise',       'Core',                      'Bodyweight'),
    ('Russian Twist',           'Core',                      'Dumbbell'),
    ('Russian Twist',           'Core',                      'Bodyweight'),
    ('Ab Wheel Rollout',        'Core, Shoulders',           'Bodyweight'),
    ('Cable Crunch',            'Core',                      'Cable'),
    ('Machine Crunch',          'Core',                      'Machine'),
    ('Decline Crunch',          'Core',                      'Bodyweight'),
    ('Side Plank',              'Core',                      'Bodyweight'),
    ('Hollow Hold',             'Core',                      'Bodyweight'),
    ('L-Sit',                   'Core',                      'Bodyweight'),
    ('Hanging Knee Raise',      'Core',                      'Bodyweight'),
    ('Toes to Bar',             'Core, Back',                'Bodyweight'),
    ("Captain's Chair Leg Raise", 'Core',                    'Machine'),
    ('Lying Leg Raise',         'Core',                      'Bodyweight'),
    ('Bicycle Crunch',          'Core',                      'Bodyweight'),
    ('Sit Up',                  'Core',                      'Bodyweight'),
    ('Dead Bug',                'Core',                      'Bodyweight'),
    ('Bird Dog',                'Core, Back',                'Bodyweight'),
    ('Mountain Climber',        'Core, Shoulders',           'Bodyweight'),
    ('Pallof Press',            'Core',                      'Cable'),
    ('Woodchopper',             'Core',                      'Cable'),
    ('Suitcase Carry',          'Core, Forearms',            'Dumbbell'),
    ('Turkish Get Up',          'Core, Shoulders',           'Kettlebell'),
]

# Timed holds: sets store the hold in cardio_duration, no reps or weight.
# Plank and Dead Hang were 'strength' until migration z4a5b6c7d8e9, so users
# can have reps-logged rows for them; exercise stats skip those on the hold chart.
DURATION_EXERCISES = {'Plank', 'Dead Hang', 'Side Plank', 'Hollow Hold', 'L-Sit', 'Wall Sit', 'Copenhagen Plank'}

# Exercises where more than one muscle group is genuinely co-primary — the
# default mapping rule (first-listed muscle in EXERCISES = primary, rest =
# secondary) doesn't fit these; the extra muscles below are promoted to
# primary too instead of relying on list order. Reviewed by hand, not
# inferred — squat and hip-hinge patterns stimulate these pairs equally
# unless the exercise variation is deliberately biasing one side.
MULTI_PRIMARY_OVERRIDES = {
    # Squat pattern: quads + glutes co-primary, hamstrings secondary (stabilizer)
    'Squat':                 {'Quads', 'Glutes'},
    'Leg Press':              {'Quads', 'Glutes'},
    'Hack Squat':              {'Quads', 'Glutes'},
    'Lunges':                  {'Quads', 'Glutes'},
    'Bulgarian Split Squat':   {'Quads', 'Glutes'},
    # Hip-hinge pattern: hamstrings + glutes co-primary, back secondary (stabilizer)
    'Romanian Deadlift':       {'Hamstrings', 'Glutes'},
    'Good Morning':            {'Hamstrings', 'Glutes'},
    # Conventional deadlift: posterior-chain compound — back + hamstrings +
    # glutes all fairly primary, quads more secondary (drive off the floor only)
    'Deadlift':                {'Back', 'Hamstrings', 'Glutes'},
    'Sumo Deadlift':           {'Back', 'Hamstrings', 'Glutes'},
    'Deficit Deadlift':        {'Back', 'Hamstrings', 'Glutes'},
    'Front Squat':             {'Quads', 'Glutes'},
    'Goblet Squat':            {'Quads', 'Glutes'},
    'Box Squat':               {'Quads', 'Glutes'},
    'Pause Squat':             {'Quads', 'Glutes'},
    'Pendulum Squat':          {'Quads', 'Glutes'},
    'Belt Squat':              {'Quads', 'Glutes'},
    'Single Leg Press':        {'Quads', 'Glutes'},
    'Walking Lunge':           {'Quads', 'Glutes'},
    'Reverse Lunge':           {'Quads', 'Glutes'},
    'Lateral Lunge':           {'Quads', 'Glutes'},
    'Split Squat':             {'Quads', 'Glutes'},
    'Pistol Squat':            {'Quads', 'Glutes'},
    'Stiff Leg Deadlift':      {'Hamstrings', 'Glutes'},
    # Trap bar sits between a squat and a hinge; rack pull is a top-half hinge
    'Trap Bar Deadlift':       {'Quads', 'Glutes', 'Back'},
    'Rack Pull':               {'Back', 'Glutes'},
    'Kettlebell Swing':        {'Glutes', 'Hamstrings'},
    'Cable Pull Through':      {'Glutes', 'Hamstrings'},
}

# Cardio exercises: (name, equipment)
CARDIO_EXERCISES = [
    ('Running', None),
    ('Running', 'Treadmill'),
    ('Cycling', None),
    ('Cycling', 'Stationary Bike'),
    ('Rowing', 'Rowing Machine'),
    ('Swimming', None),
    ('Elliptical', 'Machine'),
    ('Stair Climber', 'Machine'),
    ('Jump Rope', None),
    ('Walking', None),
    ('Walking', 'Treadmill'),
    ('Hiking', None),
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


def _normalize(text: str) -> list:
    """Lowercase word list, no punctuation."""
    import re
    return re.sub(r'[^a-z0-9 ]', ' ', text.lower()).split()


def _load_exercisedb() -> list:
    """
    Load all ExerciseDB exercises. Writes a local JSON cache after the first
    API fetch; subsequent calls within CACHE_MAX_AGE_DAYS use the cache.
    Returns list of dicts with keys: name, equipment, bodyPart, target, gifUrl.
    """
    global _exercisedb_cache
    if _exercisedb_cache is not None:
        return _exercisedb_cache

    if os.path.exists(EXERCISEDB_CACHE):
        age_days = (time.time() - os.path.getmtime(EXERCISEDB_CACHE)) / 86400
        if age_days < CACHE_MAX_AGE_DAYS:
            with open(EXERCISEDB_CACHE) as f:
                _exercisedb_cache = json.load(f)
            print(f'Using cached ExerciseDB data ({len(_exercisedb_cache)} exercises).\n', flush=True)
            return _exercisedb_cache

    from utils.exercisedb import PAGE_SIZE, fetch_page
    api_key = os.environ.get('RAPIDAPI_KEY', '')
    if not api_key:
        raise RuntimeError(
            'RAPIDAPI_KEY not set. Add it to .env or export it before running seed.py.'
        )

    # RapidAPI returns at most PAGE_SIZE rows whatever `limit` asks for, about
    # 135 calls for the whole catalog out of the plan's 690 a month.
    exercises: list = []
    offset = 0
    print('Fetching all ExerciseDB exercises (this may take a moment)…', flush=True)
    while True:
        batch = fetch_page(api_key, offset)
        for item in batch:
            exercises.append({
                'name':      item['name'],
                'equipment': item['equipment'],
                'bodyPart':  item['bodyPart'],
                'target':    item['target'],
                'gifUrl':    f'https://v2.exercisedb.io/image/{item["id"]}',
            })
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(0.2)

    print(f'  {len(exercises)} exercises fetched.', flush=True)
    with open(EXERCISEDB_CACHE, 'w') as f:
        json.dump(exercises, f)
    print(f'  Saved to {EXERCISEDB_CACHE}\n', flush=True)
    _exercisedb_cache = exercises
    return exercises


def _find_exercisedb_image(name: str, equipment: str = '') -> str | None:
    """Return the best-matching ExerciseDB GIF URL for name + equipment."""
    all_ex = _load_exercisedb()
    base_words = set(_normalize(name))
    if not base_words:
        return None
    target_equip = _EQUIP_MAP.get(equipment.lower(), '')
    threshold = len(base_words) * 0.7

    def best_in(candidates: list) -> str | None:
        top_score, top_gif = 0, None
        for ex in candidates:
            hits = len(base_words & set(_normalize(ex['name'])))
            if hits > top_score:
                top_score, top_gif = hits, ex['gifUrl']
        return top_gif if top_score >= threshold else None

    # Pass 1: matching equipment only
    if target_equip:
        result = best_in([ex for ex in all_ex if ex['equipment'] == target_equip])
        if result:
            return result
    # Pass 2: any equipment (fallback)
    return best_in(all_ex)


def fetch_image_url(name: str, equipment: str = '') -> str | None:
    """Return an ExerciseDB GIF URL for the given exercise, or None."""
    try:
        return _find_exercisedb_image(name, equipment)
    except Exception as exc:
        print(f'  [warn] {exc}')
        return None


def backfill_images():
    """Update all ExerciseTemplate rows that have no image_url using wger diagrams."""
    # Pre-load all wger data once
    _load_exercisedb()

    exercises = ExerciseTemplate.query.filter(
        (ExerciseTemplate.image_url == None) | (ExerciseTemplate.image_url == '')
    ).all()
    total = len(exercises)
    print(f'Found {total} exercises without images.\n')
    updated = 0
    for i, ex in enumerate(exercises, start=1):
        label = f'{ex.name} ({ex.equipment or "—"})'
        print(f'[{i}/{total}] {label} ...', end=' ', flush=True)
        url = fetch_image_url(ex.name, ex.equipment or '')
        if url:
            ex.image_url = url
            db.session.commit()
            updated += 1
            print('OK')
        else:
            print('no match')
    print(f'\nBackfill complete. Updated: {updated}/{total}')


def _admin_overrides(field, force):
    """Library exercise ids whose `field` was edited in the admin. The admin is
    the source of truth for what it edits, so these are skipped unless
    --force-admin-edits, which lists each one before overwriting it."""
    from utils.library_edits import admin_edited_fields
    edited = {ex_id for ex_id, fields in admin_edited_fields().items() if field in fields}
    if force and edited:
        print(f'--force-admin-edits: overwriting {field} edited in the admin on {len(edited)} exercise(s):')
        for ex in ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(edited)).order_by(ExerciseTemplate.name):
            print(f'  #{ex.id} {ex.name} ({ex.equipment or "—"})')
        print()
        return set()
    return edited


def refetch_images(force=False):
    """Re-fetch images for every library exercise, overwriting image_url,
    except ones whose image was picked in the admin."""
    _load_exercisedb()
    skip = _admin_overrides('image', force)

    exercises = ExerciseTemplate.query.filter(
        ExerciseTemplate.exercise_type != 'cardio',
        ExerciseTemplate.user_id.is_(None),
    ).all()
    kept = [ex for ex in exercises if ex.id in skip]
    exercises = [ex for ex in exercises if ex.id not in skip]
    if kept:
        print(f'Keeping {len(kept)} image(s) picked in the admin.\n')
    total = len(exercises)
    print(f'Re-fetching images for {total} strength exercises.\n')
    updated = 0
    cleared = 0
    for i, ex in enumerate(exercises, start=1):
        label = f'{ex.name} ({ex.equipment or "—"})'
        print(f'[{i}/{total}] {label} ...', end=' ', flush=True)
        url = fetch_image_url(ex.name, ex.equipment or '')
        if url:
            ex.image_url = url
            db.session.commit()
            updated += 1
            print('OK')
        else:
            ex.image_url = None
            db.session.commit()
            cleared += 1
            print('no match')
    print(f'\nDone. Updated: {updated}, Cleared: {cleared}')


def update_muscles(force=False):
    """Update muscle mappings on library exercises to match the EXERCISES
    list, except ones whose muscles were edited in the admin."""
    skip = _admin_overrides('muscles', force)
    total = len(EXERCISES)
    updated = 0
    skipped = 0
    for i, (name, muscle_group, equipment) in enumerate(EXERCISES, start=1):
        # user_id None: a user's custom exercise can share a library name
        ex = ExerciseTemplate.query.filter_by(name=name, equipment=equipment, user_id=None).first()
        if not ex:
            print(f'[{i}/{total}] Not found (skipping): {name} ({equipment})')
            skipped += 1
            continue
        if ex.id in skip:
            print(f'[{i}/{total}] Edited in the admin (keeping): {name} ({equipment})')
            skipped += 1
            continue
        # MULTI_PRIMARY_OVERRIDES exercises always rebuild: the assembled
        # muscle_group property lists primaries first, so once a second
        # muscle is promoted to primary the computed string reorders and
        # will never equal the static EXERCISES string again — comparing by
        # string alone would either perpetually skip them (before the first
        # fix) or perpetually "update" them (after it); forcing a rebuild
        # keeps this idempotent either way.
        if ex.muscle_group == muscle_group and name not in MULTI_PRIMARY_OVERRIDES:
            print(f'[{i}/{total}] Already up to date: {name} ({equipment})')
            skipped += 1
            continue
        print(f'[{i}/{total}] Updating: {name} ({equipment})  {ex.muscle_group!r} -> {muscle_group!r}')
        ExerciseMuscleMapping.query.filter_by(exercise_template_id=ex.id).delete()
        parts = [p.strip() for p in muscle_group.split(',') if p.strip()]
        extra_primaries = MULTI_PRIMARY_OVERRIDES.get(name, set())
        for j, mg in enumerate(parts):
            db.session.add(ExerciseMuscleMapping(
                exercise_template_id=ex.id,
                muscle_group=mg,
                is_primary=(j == 0) or (mg in extra_primaries),
            ))
        updated += 1
    db.session.commit()
    print(f'\nDone. Updated: {updated}, Skipped: {skipped}')


def main():
    parser = argparse.ArgumentParser(description='Seed exercise templates.')
    parser.add_argument('--no-images', action='store_true', help='Skip Wger image fetching')
    parser.add_argument('--backfill', action='store_true',
                        help='Update existing exercises that have no image_url')
    parser.add_argument('--refetch-images', action='store_true',
                        help='Re-fetch wger images for ALL exercises, overwriting existing image_url')
    parser.add_argument('--update-muscles', action='store_true',
                        help='Update muscle_group on existing exercises to match the list')
    parser.add_argument('--force-admin-edits', action='store_true',
                        help='With --update-muscles or --refetch-images: also overwrite fields edited in /admin')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.backfill:
            backfill_images()
            return

        if args.refetch_images:
            refetch_images(force=args.force_admin_edits)
            return

        if args.update_muscles:
            update_muscles(force=args.force_admin_edits)
            return

        added = 0
        skipped = 0

        # ── Strength exercises ────────────────────────────────────────────────
        total = len(EXERCISES)
        for i, (name, muscle_group, equipment) in enumerate(EXERCISES, start=1):
            existing = ExerciseTemplate.query.filter_by(
                name=name, equipment=equipment, user_id=None
            ).first()
            if existing:
                print(f'[{i}/{total}] Skipping (exists): {name} ({equipment})')
                skipped += 1
                continue

            image_url = None
            if not args.no_images:
                print(f'[{i}/{total}] Fetching image for: {name} ({equipment}) ...', end=' ', flush=True)
                image_url = fetch_image_url(name, equipment or '')
                print('OK' if image_url else 'no image')
            else:
                print(f'[{i}/{total}] Adding: {name} ({equipment})')

            sk = SEEDER_STANDARDS_MAP.get((name.lower(), equipment.lower() if equipment else None))
            new_ex = ExerciseTemplate(
                name=name,
                equipment=equipment,
                image_url=image_url,
                exercise_type='duration' if name in DURATION_EXERCISES else 'strength',
                standards_key=sk,
                description=EXERCISE_DESCRIPTIONS.get(name),
                bodyweight_load_factor=derive_bodyweight_load_factor(name, equipment),
            )
            db.session.add(new_ex)
            db.session.flush()
            parts = [p.strip() for p in muscle_group.split(',') if p.strip()]
            extra_primaries = MULTI_PRIMARY_OVERRIDES.get(name, set())
            for j, mg in enumerate(parts):
                db.session.add(ExerciseMuscleMapping(
                    exercise_template_id=new_ex.id,
                    muscle_group=mg,
                    is_primary=(j == 0) or (mg in extra_primaries),
                ))
            added += 1

        # ── Cardio exercises ──────────────────────────────────────────────────
        ctotal = len(CARDIO_EXERCISES)
        for i, (name, equipment) in enumerate(CARDIO_EXERCISES, start=1):
            existing = ExerciseTemplate.query.filter_by(
                name=name, equipment=equipment, exercise_type='cardio', user_id=None
            ).first()
            if existing:
                print(f'[C {i}/{ctotal}] Skipping (exists): {name} ({equipment})')
                skipped += 1
                continue

            print(f'[C {i}/{ctotal}] Adding cardio: {name} ({equipment or "Outdoor"})')
            new_ex = ExerciseTemplate(
                name=name,
                equipment=equipment,
                exercise_type='cardio',
                standards_key=SEEDER_STANDARDS_MAP.get((name.lower(), equipment.lower() if equipment else None)),
                description=EXERCISE_DESCRIPTIONS.get(name),
            )
            db.session.add(new_ex)
            db.session.flush()
            db.session.add(ExerciseMuscleMapping(
                exercise_template_id=new_ex.id,
                muscle_group='Cardio',
                is_primary=True,
            ))
            added += 1

        db.session.commit()
        print(f'\nDone. Added: {added}, Skipped: {skipped}')


if __name__ == '__main__':
    main()
