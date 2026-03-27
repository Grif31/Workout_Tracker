"""
Seed script for ExerciseTemplate data.

Usage:
    python seed.py              # Seeds exercises and fetches images from Wger API
    python seed.py --no-images  # Seeds exercises without fetching images
"""

import sys
import os
import argparse
import time

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from models import db, ExerciseTemplate

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


def fetch_image_url(name: str) -> str | None:
    """Try to fetch an exercise image URL from the Wger public API."""
    try:
        import urllib.request
        import urllib.parse
        import json

        # Step 1: search for the exercise by name
        search_term = urllib.parse.quote(name)
        search_url = (
            f'https://wger.de/api/v2/exercise/search/'
            f'?term={search_term}&language=english&format=json'
        )
        with urllib.request.urlopen(search_url, timeout=10) as resp:
            search_data = json.loads(resp.read().decode())

        suggestions = search_data.get('suggestions', [])
        if not suggestions:
            return None

        first = suggestions[0]
        data = first.get('data', {})
        image = data.get('image')
        if image:
            return image

        base_id = data.get('base_id')
        if not base_id:
            return None

        time.sleep(0.3)

        # Step 2: fetch images for the exercise base
        images_url = (
            f'https://wger.de/api/v2/exerciseimage/'
            f'?exercise_base_id={base_id}&format=json'
        )
        with urllib.request.urlopen(images_url, timeout=10) as resp:
            images_data = json.loads(resp.read().decode())

        results = images_data.get('results', [])
        if results:
            return results[0].get('image')

    except Exception:
        pass

    return None


def main():
    parser = argparse.ArgumentParser(description='Seed exercise templates.')
    parser.add_argument('--no-images', action='store_true', help='Skip Wger image fetching')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        added = 0
        skipped = 0
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
                print(f'[{i}/{total}] Fetching image for: {name} ...', end=' ', flush=True)
                image_url = fetch_image_url(name)
                print('got image' if image_url else 'no image')
                time.sleep(0.3)
            else:
                print(f'[{i}/{total}] Adding: {name} ({equipment})')

            exercise = ExerciseTemplate(
                name=name,
                muscle_group=muscle_group,
                equipment=equipment,
                image_url=image_url,
            )
            db.session.add(exercise)
            added += 1

        db.session.commit()
        print(f'\nDone. Added: {added}, Skipped: {skipped}')


if __name__ == '__main__':
    main()
