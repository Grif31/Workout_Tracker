"""Hevy: Profile → Settings → Export & Import Data → Export Workouts.

One row per set, the workout's title and start time repeated on each. The
weight and distance columns are named for the account's unit (weight_kg or
weight_lbs, distance_km or distance_miles).
"""
from utils.importers import (
    ImportFormatError, ParsedExercise, ParsedFile, ParsedSet, ParsedWorkout,
    parse_datetime, read_rows, to_float, to_reps, to_rpe,
)

_SET_TYPES = {'normal': 'N', 'warmup': 'W', 'dropset': 'D', 'failure': 'F'}
_REQUIRED = ('title', 'start_time', 'exercise_title')


def parse(text: str) -> ParsedFile:
    header, rows = read_rows(text)
    if not all(col in header for col in _REQUIRED):
        raise ImportFormatError(
            "This doesn't look like a Hevy export: it needs title, start_time and "
            'exercise_title columns.')

    weight_col, weight_unit = next(
        ((c, u) for c, u in (('weight_kg', 'kg'), ('weight_lbs', 'lbs')) if c in header), (None, None))
    dist_col, dist_unit = next(
        ((c, u) for c, u in (('distance_km', 'km'), ('distance_miles', 'mi'), ('distance_mi', 'mi')) if c in header),
        (None, None))

    workouts: dict[tuple, ParsedWorkout] = {}
    for row in rows:
        title = row.get('title') or 'Workout'
        started = parse_datetime(row.get('start_time'))
        exercise_title = row.get('exercise_title')
        if not started or not exercise_title:
            continue
        start, has_time = started
        key = (title, start)
        w = workouts.get(key)
        if w is None:
            ended = parse_datetime(row.get('end_time'))
            duration = int((ended[0] - start).total_seconds()) if ended and ended[0] > start else None
            w = workouts[key] = ParsedWorkout(
                title=title, start=start, has_time=has_time, duration_seconds=duration,
                notes=row.get('description') or None,
            )
        # A new exercise whenever the title changes: the same lift done twice
        # in one session stays two entries, as it was logged
        if not w.exercises or w.exercises[-1].title != exercise_title:
            w.exercises.append(ParsedExercise(title=exercise_title))
        # Notes may sit on any of the exercise's rows, not only its first
        if not w.exercises[-1].notes and row.get('exercise_notes'):
            w.exercises[-1].notes = row.get('exercise_notes')
        distance = to_float(row.get(dist_col)) if dist_col else None
        w.exercises[-1].sets.append(ParsedSet(
            set_type=_SET_TYPES.get((row.get('set_type') or '').lower(), 'N'),
            reps=to_reps(row.get('reps')),
            weight=to_float(row.get(weight_col)) if weight_col else None,
            seconds=to_float(row.get('duration_seconds')),
            distance=distance,
            distance_unit=dist_unit if distance else None,
            rpe=to_rpe(row.get('rpe')),
        ))
    return ParsedFile(workouts=list(workouts.values()), weight_unit=weight_unit)
