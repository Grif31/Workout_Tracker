"""Strong: Settings → Export Strong Data (export in English).

One row per set. Older exports name no units (weights are in whatever unit the
account used, so the user says which); newer ones put them in the header
("Weight (kg)", "Distance (meters)", "Duration (sec)") and may use ';'.
"""
import re

from utils.importers import (
    ImportFormatError, ParsedExercise, ParsedFile, ParsedSet, ParsedWorkout,
    parse_datetime, parse_duration_seconds, read_rows, to_float, to_reps, to_rpe,
)

_SET_TYPES = {'w': 'W', 'd': 'D', 'f': 'F'}


def _column(header, *names, prefix=None):
    for n in names:
        if n in header:
            return n
    if prefix:
        return next((h for h in header if h.startswith(prefix)), None)
    return None


def _paren_unit(col):
    m = re.search(r'\(([^)]*)\)', col or '')
    return m.group(1).strip().lower() if m else None


def parse(text: str) -> ParsedFile:
    header, rows, delim = read_rows(text)
    date_col = _column(header, 'date')
    name_col = _column(header, 'workout name')
    exercise_col = _column(header, 'exercise name')
    if not (date_col and exercise_col):
        raise ImportFormatError(
            "This doesn't look like a Strong export: it needs Date and Exercise Name "
            'columns. Export it from Strong in English.')

    number_col = _column(header, 'workout #')
    duration_col = _column(header, 'workout duration', prefix='duration')
    duration_unit = 'sec' if 'sec' in (_paren_unit(duration_col) or '') else 'min'
    weight_col = _column(header, prefix='weight')
    weight_unit = {'kg': 'kg', 'kgs': 'kg', 'lb': 'lbs', 'lbs': 'lbs'}.get(_paren_unit(weight_col))
    distance_col = _column(header, prefix='distance')
    dist_paren = _paren_unit(distance_col)
    dist_factor, dist_unit = {
        'meters': (0.001, 'km'), 'm': (0.001, 'km'), 'km': (1, 'km'),
        'mi': (1, 'mi'), 'miles': (1, 'mi'), 'feet': (1 / 5280, 'mi'), 'ft': (1 / 5280, 'mi'),
    }.get(dist_paren, (1, None))
    seconds_col = _column(header, 'seconds', prefix='seconds')

    workouts: dict[tuple, ParsedWorkout] = {}
    for row in rows:
        order = (row.get('set order') or '').strip()
        if order.lower().startswith('rest'):
            continue
        started = parse_datetime(row.get(date_col))
        exercise_title = row.get(exercise_col)
        if not started or not exercise_title:
            continue
        start, has_time = started
        title = (row.get(name_col) if name_col else None) or 'Workout'
        key = (row.get(number_col),) if number_col and row.get(number_col) else (title, start)
        w = workouts.get(key)
        if w is None:
            w = workouts[key] = ParsedWorkout(
                title=title, start=start, has_time=has_time,
                duration_seconds=parse_duration_seconds(row.get(duration_col), duration_unit, delim) if duration_col else None,
                notes=row.get('workout notes') or None,
            )
        if not w.exercises or w.exercises[-1].title != exercise_title:
            w.exercises.append(ParsedExercise(title=exercise_title))
        # Strong writes the note on one set's row, not necessarily the first
        if not w.exercises[-1].notes and row.get('notes'):
            w.exercises[-1].notes = row.get('notes')
        distance = to_float(row.get(distance_col), delim) if distance_col else None
        if distance is not None:
            distance = round(distance * dist_factor, 3)
        w.exercises[-1].sets.append(ParsedSet(
            set_type=_SET_TYPES.get(order.lower(), 'N'),
            reps=to_reps(row.get('reps'), delim),
            weight=to_float(row.get(weight_col), delim) if weight_col else None,
            seconds=to_float(row.get(seconds_col), delim) if seconds_col else None,
            distance=distance,
            distance_unit=dist_unit if distance else None,
            rpe=to_rpe(row.get('rpe'), delim),
        ))
    return ParsedFile(workouts=list(workouts.values()), weight_unit=weight_unit)
