"""Match other apps' exercise titles to the library.

Hevy and Strong both title exercises "Name (Equipment)", which splits onto our
name + equipment columns. Matching is exact on a normalised name: a loose
substring match ("Curl" → "Leg Curl") would file one lift's history and PRs
under another, so anything not matched becomes the user's custom exercise.
"""
import re

from models import db, ExerciseTemplate

_EQUIPMENT = {
    'barbell': 'Barbell',
    'dumbbell': 'Dumbbell',
    'cable': 'Cable',
    'machine': 'Machine',
    'smith machine': 'Smith Machine',
    'smith': 'Smith Machine',
    'kettlebell': 'Kettlebell',
    'ez bar': 'EZ Bar',
    'ez barbell': 'EZ Bar',
    'ez curl bar': 'EZ Bar',
    'bodyweight': 'Bodyweight',
    'body weight': 'Bodyweight',
    'weighted': 'Weighted',
    'weighted bodyweight': 'Weighted',
}

# Whole titles (normalised) the other apps spell differently from the library
_TITLE_ALIASES = {
    'Butterfly (Pec Deck)': ('Pec Deck', 'Machine'),
    'Treadmill': ('Running', 'Treadmill'),
    'Running (Treadmill)': ('Running', 'Treadmill'),
    'Rowing (Machine)': ('Rowing', 'Rowing Machine'),
    'Elliptical Trainer': ('Elliptical', 'Machine'),
    'Stair Machine': ('Stair Climber', 'Machine'),
    'Stairmaster': ('Stair Climber', 'Machine'),
    'Deadlift (Trap bar)': ('Trap Bar Deadlift', 'Other'),
    'Cycling (Indoor)': ('Cycling', 'Stationary Bike'),
    'Spinning': ('Cycling', 'Stationary Bike'),
}

# Names alone (normalised), equipment kept from the title
_NAME_ALIASES = {
    'Shoulder Press': 'Overhead Press',
    'Dumbbell Row': 'Single Arm Row',
    'Chest Dip': 'Dips',
    'Triceps Dip': 'Dips',
    'Standing Calf Raise': 'Calf Raise',
    'Seated Cable Row - V Grip': 'Seated Cable Row',
}

# With no equipment in the title, the library row it most likely means
_NO_EQUIPMENT_PREFERENCE = (None, 'Bodyweight', 'Barbell', 'Dumbbell', 'Machine', 'Cable')



def key(text: str) -> str:
    """Case, spacing, hyphens and a plural 's' don't make a different lift:
    "Pull-Ups", "pull ups" and "Pullup" all key to "pullup"."""
    t = (text or '').lower().replace('&', 'and')
    t = re.sub(r'\btriceps\b', 'tricep', t)
    t = re.sub(r'\bbiceps\b', 'bicep', t)
    # Letters and digits of any script: an a-z filter keyed every Cyrillic or
    # CJK title to '', so they all matched one exercise
    t = ''.join(ch for ch in t if ch.isalnum())
    if not t:
        # Emoji or punctuation only: the text itself is the only identity it has
        return (text or '').strip().lower()
    return t[:-1] if t.endswith('s') else t


def split_title(title: str) -> tuple[str, str | None, str | None]:
    """(name, our equipment label or None, the title's raw equipment text or None)."""
    title = (title or '').strip()
    # A trailing "(...)" with no ")" inside it. Plain string searches, not a
    # regex: the pattern this replaced backtracked quadratically on a title of
    # unclosed parentheses, and one such request held the only worker for 30s
    if not title.endswith(')'):
        return title, None, None
    inner = title[:-1]
    start = inner.find('(', inner.rfind(')') + 1)
    if start == -1:
        return title, None, None
    raw = inner[start + 1:].strip()
    return inner[:start].strip() or title, _EQUIPMENT.get(raw.lower()), raw or None


_TITLE_ALIAS_KEYS = {key(k): v for k, v in _TITLE_ALIASES.items()}
_NAME_ALIAS_KEYS = {key(k): key(v) for k, v in _NAME_ALIASES.items()}


class ExerciseMatcher:
    """Resolves titles against the global library plus this user's customs,
    library first, the way _match_exercises orders a name collision."""

    def __init__(self, user_id: int):
        templates = (
            ExerciseTemplate.query
            .filter(db.or_(ExerciseTemplate.user_id.is_(None), ExerciseTemplate.user_id == user_id))
            .order_by(ExerciseTemplate.user_id.is_(None).desc(), ExerciseTemplate.id)
            .all()
        )
        self._exact: dict[tuple, ExerciseTemplate] = {}
        self._by_name: dict[str, list[ExerciseTemplate]] = {}
        for t in templates:
            self._exact.setdefault((key(t.name), t.equipment), t)
            self._by_name.setdefault(key(t.name), []).append(t)

    def match(self, title: str, weighted: bool = False) -> ExerciseTemplate | None:
        """weighted: the title's sets carry added weight. Strong titles a dip
        "Triceps Dip" whether or not a belt was on, and Weighted keeps those
        PRs apart from the bodyweight ones."""
        alias = _TITLE_ALIAS_KEYS.get(key(title))
        if alias:
            name, equipment = alias
            hit = self._exact.get((key(name), equipment))
            if hit:
                return hit
        name, equipment, raw = split_title(title)
        name_key = key(name)
        aliased = _NAME_ALIAS_KEYS.get(name_key)
        # The aliased name finds the library row; the title's own name finds a
        # custom an earlier import made, since custom_identity names it that way
        for k in ((aliased, name_key) if aliased else (name_key,)):
            hit = self._lookup(k, equipment, raw, weighted)
            if hit:
                return hit
        return None

    def _lookup(self, name_key, equipment, raw, weighted):
        if raw and not equipment:
            # "(Band)", "(Assisted)": no library row is the same lift, only a
            # custom one an earlier import made under that label
            return self._exact.get((name_key, raw[:100]))
        if equipment:
            return self._exact.get((name_key, equipment))
        candidates = self._by_name.get(name_key, [])
        order = (('Weighted',) + _NO_EQUIPMENT_PREFERENCE) if weighted else _NO_EQUIPMENT_PREFERENCE
        for preferred in order:
            hit = next((t for t in candidates if t.equipment == preferred), None)
            if hit:
                return hit
        return candidates[0] if candidates else None

    def custom_identity(self, title: str) -> tuple[str, str | None]:
        """Name and equipment for a custom exercise made from an unmatched title."""
        name, equipment, raw = split_title(title)
        label = equipment or raw
        return name[:250], label[:100] if label else None
