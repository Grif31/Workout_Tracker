"""Workout history imports from other apps' CSV exports.

Each parser turns a file into the same shape (ParsedWorkout → ParsedExercise →
ParsedSet) in the file's own units; matching exercises and converting units
happens in routes/import_routes.py, which knows the user.
"""
import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime


class ImportFormatError(ValueError):
    """The file isn't the export it was picked as. The message is shown to the user."""


@dataclass
class ParsedSet:
    set_type: str = 'N'
    reps: int | None = None
    weight: float | None = None
    seconds: float | None = None
    distance: float | None = None
    distance_unit: str | None = None   # 'km' | 'mi' | None (file doesn't say)
    rpe: int | None = None


@dataclass
class ParsedExercise:
    title: str
    notes: str | None = None
    sets: list[ParsedSet] = field(default_factory=list)


@dataclass
class ParsedWorkout:
    title: str
    start: datetime
    has_time: bool
    duration_seconds: int | None = None
    notes: str | None = None
    exercises: list[ParsedExercise] = field(default_factory=list)


@dataclass
class ParsedFile:
    workouts: list[ParsedWorkout]
    weight_unit: str | None   # 'kg' | 'lbs', or None when the file doesn't say


# Real exports stay far under these (a decade of daily training is ~4,000
# workouts and ~100,000 set rows). The whole import runs in one request on one
# worker, so an unbounded file is an outage for everyone, not a slow import.
MAX_ROWS = 150_000
MAX_WORKOUTS = 5_000
MAX_CELL_CHARS = 5_000
_TOO_LARGE = 'This file is too large to import. Split it into smaller files, or contact support.'


def read_rows(text: str) -> tuple[list[str], list[dict], str]:
    """Header (lowercased, trimmed), rows and delimiter of a CSV whose delimiter
    may be ',' or ';' (Strong exports with semicolons in some versions and locales)."""
    text = text.lstrip('﻿')
    first_line = text.split('\n', 1)[0]
    delimiter = ';' if first_line.count(';') > first_line.count(',') else ','
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = []
    try:
        try:
            header = next(reader)
        except StopIteration:
            raise ImportFormatError('The file is empty.')
        header = [h.strip().lower() for h in header]
        for raw in reader:
            if not any(cell.strip() for cell in raw):
                continue
            if any(len(cell) > MAX_CELL_CHARS for cell in raw):
                raise ImportFormatError("This file has a value that is too long to be a workout export.")
            if len(rows) >= MAX_ROWS:
                raise ImportFormatError(_TOO_LARGE)
            rows.append({h: (raw[i].strip() if i < len(raw) else '') for i, h in enumerate(header)})
    except csv.Error:
        # The csv module's own field limit, or a NUL byte
        raise ImportFormatError("This file couldn't be read as a CSV export.")
    return header, rows, delimiter


_DATETIME_FORMATS = (
    '%d %b %Y, %H:%M',      # Hevy: "26 Jan 2024, 18:03"
    '%d %b %Y %H:%M',
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%d %H:%M',
    '%b %d, %Y, %H:%M',
    '%b %d, %Y %H:%M',
    '%d %B %Y, %H:%M',
)


# Neither app existed before this, and date maths near year 1 overflows
# (the streak count in utils/achievements.py subtracts weeks)
_EARLIEST_YEAR = 1990


def parse_datetime(value: str) -> tuple[datetime, bool] | None:
    """(local wall-clock datetime, whether the value carried a time of day).
    None for a value that isn't a believable date, which skips the row."""
    value = (value or '').strip()
    if not value:
        return None
    parsed = None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00')).replace(tzinfo=None), len(value) > 10
    except ValueError:
        for fmt in _DATETIME_FORMATS:
            try:
                parsed = datetime.strptime(value, fmt), True
                break
            except ValueError:
                continue
    if parsed is None or parsed[0].year < _EARLIEST_YEAR:
        return None
    return parsed


_THOUSANDS = re.compile(r'^-?\d{1,3}(,\d{3})+(\.\d+)?$')


def to_float(value: str, delimiter: str = ',') -> float | None:
    value = (value or '').strip()
    if delimiter != ';' and _THOUSANDS.match(value):
        # A comma file quotes "1,000": a thousands separator, not 1.0. In a
        # semicolon file (a decimal-comma locale) the same text is 1.0
        value = value.replace(',', '')
    elif value.count(',') == 1 and '.' not in value:
        value = value.replace(',', '.')
    if not value:
        return None
    try:
        f = float(value)
    except ValueError:
        return None
    return f if f == f and abs(f) != float('inf') else None


def to_reps(value: str, delimiter: str = ',') -> int | None:
    f = to_float(value, delimiter)
    return int(round(f)) if f is not None and f >= 0 else None


def to_rpe(value: str, delimiter: str = ',') -> int | None:
    f = to_float(value, delimiter)
    if f is None:
        return None
    r = int(round(f))
    return r if 1 <= r <= 10 else None


_HMS = re.compile(r'^(?:(\d+):)?(\d+):(\d+)$')
_UNITS = re.compile(r'(\d+(?:\.\d+)?)\s*(h|m|s)', re.I)


def parse_duration_seconds(value: str, bare_number_unit: str = 'min', delimiter: str = ',') -> int | None:
    """'1h 5m', '45m', '01:02:00', '62:00', or a bare number in bare_number_unit."""
    value = (value or '').strip()
    if not value:
        return None
    try:
        m = _HMS.match(value)
        if m:
            h, mi, s = int(m.group(1) or 0), int(m.group(2)), int(m.group(3))
            return h * 3600 + mi * 60 + s
        parts = _UNITS.findall(value)
        if parts:
            mult = {'h': 3600, 'm': 60, 's': 1}
            return int(sum(float(n) * mult[u.lower()] for n, u in parts))
        f = to_float(value, delimiter)
        if f is None or f < 0:
            return None
        return int(f if bare_number_unit == 'sec' else f * 60)
    except (ValueError, OverflowError):
        # Thousands of digits: int() refuses the string, or the float is inf
        return None


def set_is_empty(s: ParsedSet) -> bool:
    return not (s.reps or s.weight or s.seconds or s.distance)


def parse(source: str, text: str) -> ParsedFile:
    from utils.importers import hevy, strong
    parser = {'hevy': hevy.parse, 'strong': strong.parse}[source]
    parsed = parser(text)
    if len(parsed.workouts) > MAX_WORKOUTS:
        raise ImportFormatError(_TOO_LARGE)
    for w in parsed.workouts:
        for ex in w.exercises:
            ex.sets = [s for s in ex.sets if not set_is_empty(s)]
        w.exercises = [ex for ex in w.exercises if ex.sets]
    parsed.workouts = [w for w in parsed.workouts if w.exercises]
    if not parsed.workouts:
        raise ImportFormatError('No workouts with logged sets were found in the file.')
    parsed.workouts.sort(key=lambda w: w.start)
    return parsed
