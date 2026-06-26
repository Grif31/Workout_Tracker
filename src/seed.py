"""
Seed script for ExerciseTemplate data.

Usage:
    python seed.py              # Seeds exercises and fetches images from ExerciseDB
    python seed.py --no-images  # Seeds exercises without fetching images
    python seed.py --backfill       # Update existing exercises that have no image_url
    python seed.py --refetch-images # Re-fetch ExerciseDB images for ALL exercises (overwrites existing)
    python seed.py --update-muscles # Update muscle_group on existing exercises to match list

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

    # Back
    ('Pull Up',                 'Back, Biceps',              'Bodyweight'),
    ('Pull Up',                 'Back, Biceps',              'Weighted'),
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

    # Hamstrings
    ('Romanian Deadlift',       'Hamstrings, Glutes, Back',  'Barbell'),
    ('Romanian Deadlift',       'Hamstrings, Glutes, Back',  'Dumbbell'),
    ('Leg Curl',                'Hamstrings',                'Machine'),
    ('Leg Curl',                'Hamstrings',                'Dumbbell'),
    ('Sumo Deadlift',           'Hamstrings, Glutes, Back, Quads', 'Barbell'),
    ('Sumo Deadlift',           'Hamstrings, Glutes, Back, Quads', 'Dumbbell'),
    ('Good Morning',            'Hamstrings, Glutes, Back',  'Barbell'),

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
]

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

    import requests as http_requests
    api_key = os.environ.get('RAPIDAPI_KEY', '')
    if not api_key:
        raise RuntimeError(
            'RAPIDAPI_KEY not set. Add it to .env or export it before running seed.py.'
        )

    headers = {
        'X-RapidAPI-Key':  api_key,
        'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
    }
    exercises: list = []
    limit, offset = 1300, 0
    print('Fetching all ExerciseDB exercises (this may take a moment)…', flush=True)
    while True:
        url = f'{EXERCISEDB_BASE}/exercises?limit={limit}&offset={offset}'
        resp = http_requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        for item in batch:
            exercises.append({
                'name':      item['name'],
                'equipment': item['equipment'],
                'bodyPart':  item['bodyPart'],
                'target':    item['target'],
                'gifUrl':    f'https://v2.exercisedb.io/image/{item["id"]}',
            })
        if len(batch) < limit:
            break
        offset += limit
        time.sleep(0.5)

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


def refetch_images():
    """Re-fetch wger diagram URLs for ALL exercises, overwriting any existing image_url."""
    _load_exercisedb()

    exercises = ExerciseTemplate.query.filter(
        ExerciseTemplate.exercise_type != 'cardio'
    ).all()
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


def update_muscles():
    """Update muscle mappings on existing exercises to match the EXERCISES list."""
    total = len(EXERCISES)
    updated = 0
    skipped = 0
    for i, (name, muscle_group, equipment) in enumerate(EXERCISES, start=1):
        ex = ExerciseTemplate.query.filter_by(name=name, equipment=equipment).first()
        if not ex:
            print(f'[{i}/{total}] Not found (skipping): {name} ({equipment})')
            skipped += 1
            continue
        if ex.muscle_group == muscle_group:
            print(f'[{i}/{total}] Already up to date: {name} ({equipment})')
            skipped += 1
            continue
        print(f'[{i}/{total}] Updating: {name} ({equipment})  {ex.muscle_group!r} -> {muscle_group!r}')
        ExerciseMuscleMapping.query.filter_by(exercise_template_id=ex.id).delete()
        parts = [p.strip() for p in muscle_group.split(',') if p.strip()]
        for j, mg in enumerate(parts):
            db.session.add(ExerciseMuscleMapping(
                exercise_template_id=ex.id,
                muscle_group=mg,
                is_primary=(j == 0),
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
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.backfill:
            backfill_images()
            return

        if args.refetch_images:
            refetch_images()
            return

        if args.update_muscles:
            update_muscles()
            return

        added = 0
        skipped = 0

        # ── Strength exercises ────────────────────────────────────────────────
        total = len(EXERCISES)
        for i, (name, muscle_group, equipment) in enumerate(EXERCISES, start=1):
            existing = ExerciseTemplate.query.filter_by(
                name=name, equipment=equipment
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
                exercise_type='strength',
                standards_key=sk,
            )
            db.session.add(new_ex)
            db.session.flush()
            parts = [p.strip() for p in muscle_group.split(',') if p.strip()]
            for j, mg in enumerate(parts):
                db.session.add(ExerciseMuscleMapping(
                    exercise_template_id=new_ex.id,
                    muscle_group=mg,
                    is_primary=(j == 0),
                ))
            added += 1

        # ── Cardio exercises ──────────────────────────────────────────────────
        ctotal = len(CARDIO_EXERCISES)
        for i, (name, equipment) in enumerate(CARDIO_EXERCISES, start=1):
            existing = ExerciseTemplate.query.filter_by(
                name=name, equipment=equipment, exercise_type='cardio'
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
