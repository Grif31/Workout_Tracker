"""
Seed script for ExerciseTemplate data.

Usage:
    python seed.py              # Seeds exercises and fetches images from Wger API
    python seed.py --no-images  # Seeds exercises without fetching images
    python seed.py --backfill       # Update existing exercises that have no image_url
    python seed.py --refetch-images # Re-fetch wger images for ALL exercises (overwrites existing)
    python seed.py --update-muscles # Update muscle_group on existing exercises to match list
"""

import sys
import os
import argparse
import time

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from models import db, ExerciseTemplate, ExerciseMuscleMapping
from utils.strength_standards import SEEDER_STANDARDS_MAP

WGER_BASE = 'https://wger.de'

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


_wger_cache: tuple | None = None  # (name_to_base, base_to_image)

# Map our equipment labels to words wger uses in exercise names
_EQUIP_WORDS = {
    'barbell':      ['barbell'],
    'dumbbell':     ['dumbbell'],
    'cable':        ['cable'],
    'machine':      ['machine'],
    'bodyweight':   ['bodyweight'],
    'smith machine':['smith'],
    'ez bar':       ['ez', 'curl'],
    'kettlebell':   ['kettlebell'],
}


def _normalize(text: str) -> list:
    """Lowercase word list, no punctuation."""
    import re
    return re.sub(r'[^a-z0-9 ]', ' ', text.lower()).split()


def _load_wger() -> tuple:
    """
    Download all wger English exercise names and images in bulk (≈24 requests).
    Returns (name_to_base, base_to_image).
      name_to_base  : {lowercase_name: base_id}
      base_to_image : {base_id: absolute_image_url}
    """
    global _wger_cache
    if _wger_cache is not None:
        return _wger_cache

    import urllib.request, json

    name_to_base: dict[str, int] = {}
    base_to_image: dict[int, str] = {}

    print('Fetching wger exercise names...', flush=True)
    offset, limit = 0, 100
    while True:
        url = (f'{WGER_BASE}/api/v2/exercise-translation/'
               f'?format=json&language=2&limit={limit}&offset={offset}')
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read().decode())
        for item in data['results']:
            name_to_base[item['name'].lower().strip()] = item['exercise']
        if not data.get('next'):
            break
        offset += limit
        time.sleep(0.15)
    print(f'  {len(name_to_base)} exercise names loaded.', flush=True)

    print('Fetching wger exercise images...', flush=True)
    offset = 0
    while True:
        url = (f'{WGER_BASE}/api/v2/exerciseimage/'
               f'?format=json&limit={limit}&offset={offset}')
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read().decode())
        for item in data['results']:
            bid = item['exercise']
            img = item.get('image', '')
            if not img:
                continue
            url_abs = img if img.startswith('http') else f'{WGER_BASE}{img}'
            # Prefer is_main; keep first otherwise
            if bid not in base_to_image or item.get('is_main'):
                base_to_image[bid] = url_abs
        if not data.get('next'):
            break
        offset += limit
        time.sleep(0.15)
    print(f'  {len(base_to_image)} exercise images loaded.\n', flush=True)

    _wger_cache = (name_to_base, base_to_image)
    return _wger_cache


def _find_wger_image(name: str, equipment: str = '') -> str | None:
    """Find the best wger diagram for the given exercise name + equipment.

    Ranks candidates by (base_word_hits, equip_word_hits) so exercise identity
    is the primary key and equipment specificity is the tie-breaker. An entry
    like 'Barbell Bench Press' will beat 'Bench Press' when equipment='Barbell'.
    """
    name_to_base, base_to_image = _load_wger()

    equip_lower = equipment.lower()
    equip_words = _EQUIP_WORDS.get(equip_lower, [equip_lower] if equip_lower else [])
    base_words = _normalize(name)

    best_base = 0
    best_equip = -1
    best_bid = None

    for wger_name, bid in name_to_base.items():
        if bid not in base_to_image:
            continue
        cand = wger_name.lower()
        base_hits = sum(1 for w in base_words if w in cand)
        equip_hits = sum(1 for w in equip_words if w in cand)
        if (base_hits, equip_hits) > (best_base, best_equip):
            best_base = base_hits
            best_equip = equip_hits
            best_bid = bid

    # Require at least 70% of base exercise words to match
    if best_bid and best_base >= len(base_words) * 0.7:
        return base_to_image[best_bid]
    return None


def fetch_image_url(name: str, equipment: str = '') -> str | None:
    """Return a wger diagram URL for the given exercise, or None."""
    try:
        return _find_wger_image(name, equipment)
    except Exception:
        return None


def backfill_images():
    """Update all ExerciseTemplate rows that have no image_url using wger diagrams."""
    # Pre-load all wger data once
    _load_wger()

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
    _load_wger()

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
