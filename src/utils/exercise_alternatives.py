"""Which exercises to leave out of a swap list for each injury the user flagged.

The areas are the coach profile's avoid options, and AVOID_MAP in
routes/ai_routes.py tells the AI Coach the same things in prose. Matching is on
the exercise name because the library has no movement-pattern field; the
exceptions are the lifts AVOID_MAP itself names as safe.
"""

# area -> (name fragments that rule an exercise out, fragments that rescue it)
INJURY_RULES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    'lower_back': (
        ('deadlift', 'good morning', 'bent over row', 'bent-over row', 'barbell row', 'pendlay',
         'hyperextension', 'back extension'),
        ('romanian', 'trap bar', 'hex bar'),
    ),
    'knees': (
        ('squat', 'leg press', 'lunge', 'leg extension', 'sissy', 'jump'),
        (),
    ),
    'shoulders': (
        ('overhead press', 'shoulder press', 'military press', 'push press', 'arnold press',
         'upright row', 'behind the neck', 'behind neck', 'handstand'),
        (),
    ),
}


def is_excluded(name: str, avoid: list[str]) -> bool:
    """True when the exercise loads an area the user has flagged."""
    lowered = (name or '').lower()
    for area in avoid:
        banned, safe = INJURY_RULES.get(area, ((), ()))
        if any(b in lowered for b in banned) and not any(s in lowered for s in safe):
            return True
    return False
