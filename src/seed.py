"""
Seed script for ExerciseTemplate data.

Usage:
    python seed.py              # Seeds exercises and fetches images from Wger API
    python seed.py --no-images  # Seeds exercises without fetching images
    python seed.py --backfill   # Update existing exercises that have no image_url
"""

import sys
import os
import argparse
import time

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from models import db, ExerciseTemplate

WGER_BASE = 'https://wger.de'

# ---------------------------------------------------------------------------
# Exercise data: (name, muscle_group, equipment)
# ---------------------------------------------------------------------------
EXERCISES = [
    # Chest
    ('Bench Press', 'Chest', 'Barbell'),
    ('Bench Press', 'Chest', 'Dumbbell'),
    ('Bench Press', 'Chest', 'Smith Machine'),
    ('Bench Press', 'Chest', 'Cable'),
    ('Incline Bench Press', 'Chest', 'Barbell'),
    ('Incline Bench Press', 'Chest', 'Dumbbell'),
    ('Incline Bench Press', 'Chest', 'Smith Machine'),
    ('Incline Bench Press', 'Chest', 'Cable'),
    ('Decline Bench Press', 'Chest', 'Barbell'),
    ('Decline Bench Press', 'Chest', 'Dumbbell'),
    ('Decline Bench Press', 'Chest', 'Smith Machine'),
    ('Push Up', 'Chest', 'Bodyweight'),
    ('Chest Fly', 'Chest', 'Dumbbell'),
    ('Chest Fly', 'Chest', 'Cable'),
    ('Chest Fly', 'Chest', 'Machine'),
    ('Cable Crossover', 'Chest', 'Cable'),

    # Back
    ('Pull Up', 'Back', 'Bodyweight'),
    ('Lat Pulldown', 'Back', 'Cable'),
    ('Lat Pulldown', 'Back', 'Machine'),
    ('Bent Over Row', 'Back', 'Barbell'),
    ('Bent Over Row', 'Back', 'Dumbbell'),
    ('Bent Over Row', 'Back', 'Cable'),
    ('Seated Cable Row', 'Back', 'Cable'),
    ('Deadlift', 'Back', 'Barbell'),
    ('Deadlift', 'Back', 'Smith Machine'),
    ('T-Bar Row', 'Back', 'Barbell'),
    ('Single Arm Row', 'Back', 'Dumbbell'),

    # Shoulders
    ('Overhead Press', 'Shoulders', 'Barbell'),
    ('Overhead Press', 'Shoulders', 'Dumbbell'),
    ('Overhead Press', 'Shoulders', 'Smith Machine'),
    ('Overhead Press', 'Shoulders', 'Machine'),
    ('Lateral Raise', 'Shoulders', 'Dumbbell'),
    ('Lateral Raise', 'Shoulders', 'Cable'),
    ('Lateral Raise', 'Shoulders', 'Machine'),
    ('Front Raise', 'Shoulders', 'Barbell'),
    ('Front Raise', 'Shoulders', 'Dumbbell'),
    ('Front Raise', 'Shoulders', 'Cable'),
    ('Face Pull', 'Shoulders', 'Cable'),
    ('Arnold Press', 'Shoulders', 'Dumbbell'),
    ('Rear Delt Fly', 'Shoulders', 'Dumbbell'),
    ('Rear Delt Fly', 'Shoulders', 'Cable'),
    ('Rear Delt Fly', 'Shoulders', 'Machine'),

    # Biceps
    ('Bicep Curl', 'Biceps', 'Barbell'),
    ('Bicep Curl', 'Biceps', 'Dumbbell'),
    ('Bicep Curl', 'Biceps', 'EZ Bar'),
    ('Bicep Curl', 'Biceps', 'Cable'),
    ('Bicep Curl', 'Biceps', 'Machine'),
    ('Hammer Curl', 'Biceps', 'Dumbbell'),
    ('Hammer Curl', 'Biceps', 'Cable'),
    ('Preacher Curl', 'Biceps', 'Barbell'),
    ('Preacher Curl', 'Biceps', 'Dumbbell'),
    ('Preacher Curl', 'Biceps', 'EZ Bar'),
    ('Preacher Curl', 'Biceps', 'Machine'),
    ('Concentration Curl', 'Biceps', 'Dumbbell'),
    ('Incline Curl', 'Biceps', 'Dumbbell'),

    # Triceps
    ('Tricep Pushdown', 'Triceps', 'Cable'),
    ('Tricep Pushdown', 'Triceps', 'Machine'),
    ('Skull Crusher', 'Triceps', 'Barbell'),
    ('Skull Crusher', 'Triceps', 'Dumbbell'),
    ('Skull Crusher', 'Triceps', 'EZ Bar'),
    ('Overhead Tricep Extension', 'Triceps', 'Barbell'),
    ('Overhead Tricep Extension', 'Triceps', 'Dumbbell'),
    ('Overhead Tricep Extension', 'Triceps', 'EZ Bar'),
    ('Overhead Tricep Extension', 'Triceps', 'Cable'),
    ('Close Grip Bench Press', 'Triceps', 'Barbell'),
    ('Close Grip Bench Press', 'Triceps', 'Smith Machine'),
    ('Dips', 'Triceps', 'Bodyweight'),
    ('Tricep Kickback', 'Triceps', 'Dumbbell'),
    ('Tricep Kickback', 'Triceps', 'Cable'),

    # Quads
    ('Squat', 'Quads', 'Barbell'),
    ('Squat', 'Quads', 'Dumbbell'),
    ('Squat', 'Quads', 'Smith Machine'),
    ('Squat', 'Quads', 'Bodyweight'),
    ('Leg Press', 'Quads', 'Machine'),
    ('Leg Extension', 'Quads', 'Machine'),
    ('Hack Squat', 'Quads', 'Barbell'),
    ('Hack Squat', 'Quads', 'Machine'),
    ('Hack Squat', 'Quads', 'Smith Machine'),
    ('Lunges', 'Quads', 'Barbell'),
    ('Lunges', 'Quads', 'Dumbbell'),
    ('Lunges', 'Quads', 'Bodyweight'),
    ('Bulgarian Split Squat', 'Quads', 'Barbell'),
    ('Bulgarian Split Squat', 'Quads', 'Dumbbell'),
    ('Bulgarian Split Squat', 'Quads', 'Bodyweight'),

    # Hamstrings
    ('Romanian Deadlift', 'Hamstrings', 'Barbell'),
    ('Romanian Deadlift', 'Hamstrings', 'Dumbbell'),
    ('Leg Curl', 'Hamstrings', 'Machine'),
    ('Leg Curl', 'Hamstrings', 'Dumbbell'),
    ('Sumo Deadlift', 'Hamstrings', 'Barbell'),
    ('Sumo Deadlift', 'Hamstrings', 'Dumbbell'),
    ('Good Morning', 'Hamstrings', 'Barbell'),

    # Calves
    ('Calf Raise', 'Calves', 'Barbell'),
    ('Calf Raise', 'Calves', 'Dumbbell'),
    ('Calf Raise', 'Calves', 'Smith Machine'),
    ('Calf Raise', 'Calves', 'Machine'),
    ('Calf Raise', 'Calves', 'Bodyweight'),
    ('Seated Calf Raise', 'Calves', 'Machine'),
    ('Seated Calf Raise', 'Calves', 'Dumbbell'),
    ('Donkey Calf Raise', 'Calves', 'Machine'),
    ('Donkey Calf Raise', 'Calves', 'Bodyweight'),

    # Core
    ('Plank', 'Core', 'Bodyweight'),
    ('Crunch', 'Core', 'Bodyweight'),
    ('Hanging Leg Raise', 'Core', 'Bodyweight'),
    ('Russian Twist', 'Core', 'Dumbbell'),
    ('Russian Twist', 'Core', 'Bodyweight'),
    ('Ab Wheel Rollout', 'Core', 'Bodyweight'),
    ('Cable Crunch', 'Core', 'Cable'),
    ('Decline Crunch', 'Core', 'Bodyweight'),
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


def _word_score(query_words: list, candidate_name: str) -> float:
    """Fraction of query words that appear in the candidate name."""
    cand = candidate_name.lower()
    if not query_words:
        return 0.0
    hits = sum(1 for w in query_words if w in cand)
    return hits / len(query_words)


def _find_wger_image(name: str, equipment: str = '') -> str | None:
    """Find the best wger diagram for the given exercise name + equipment."""
    name_to_base, base_to_image = _load_wger()

    equip_lower = equipment.lower()
    equip_words = _EQUIP_WORDS.get(equip_lower, [equip_lower] if equip_lower else [])

    # Build query word list: exercise name words + equipment words
    base_words = _normalize(name)
    query_with_equip = base_words + equip_words

    best_score, best_bid = 0.0, None

    for wger_name, bid in name_to_base.items():
        if bid not in base_to_image:
            continue
        # Score against (name + equipment) query first
        score = _word_score(query_with_equip, wger_name)
        if score > best_score:
            best_score = score
            best_bid = bid

    # Require at least the base exercise words to match
    base_threshold = len(base_words) / max(len(query_with_equip), 1) * 0.7
    if best_bid and best_score >= max(0.5, base_threshold):
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


def main():
    parser = argparse.ArgumentParser(description='Seed exercise templates.')
    parser.add_argument('--no-images', action='store_true', help='Skip Wger image fetching')
    parser.add_argument('--backfill', action='store_true',
                        help='Update existing exercises that have no image_url')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.backfill:
            backfill_images()
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

            db.session.add(ExerciseTemplate(
                name=name,
                muscle_group=muscle_group,
                equipment=equipment,
                image_url=image_url,
                exercise_type='strength',
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
            db.session.add(ExerciseTemplate(
                name=name,
                muscle_group='Cardio',
                equipment=equipment,
                exercise_type='cardio',
            ))
            added += 1

        db.session.commit()
        print(f'\nDone. Added: {added}, Skipped: {skipped}')


if __name__ == '__main__':
    main()
