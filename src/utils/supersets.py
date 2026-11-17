"""Superset grouping rules, mirrored by utils/supersets.ts in the app (the two
share test cases).

Exercises in one workout that share a superset_group form a superset. A group's
members are always next to each other in exercise order, a group needs at least
two members, and cardio never joins one. The stored numbers are only keys: they
are renumbered 1..n in order of first appearance, and the app shows them as
letters (A, B, ...) worked out from position.
"""

MAX_SUPERSET_GROUP = 200


def superset_group_value(value):
    """A group key from a request, or None. Never raises: a bad value only
    costs the grouping, which must not fail the whole workout save."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or not 1 <= value <= MAX_SUPERSET_GROUP:
        return None
    return int(value)


def normalize_superset_groups(exercises):
    """Rewrites superset_group on a workout's exercises (any objects with
    order, superset_group and exercise_type) so they follow the rules above.
    Exercises are taken in `order`, ties kept in list order."""
    ordered = sorted(exercises, key=lambda e: e.order if e.order is not None else 0)
    for ex in ordered:
        if (ex.exercise_type or 'strength').lower() == 'cardio':
            ex.superset_group = None

    runs = []
    for ex in ordered:
        if ex.superset_group is not None and runs and runs[-1][0] == ex.superset_group:
            runs[-1][1].append(ex)
        else:
            runs.append((ex.superset_group, [ex]))

    seen = set()
    next_group = 1
    for key, members in runs:
        if key is None:
            continue
        # Only a key's first run survives: a member dragged away from its
        # partners leaves the superset rather than splitting it in two
        if key in seen or len(members) < 2:
            for ex in members:
                ex.superset_group = None
            seen.add(key)
            continue
        seen.add(key)
        for ex in members:
            ex.superset_group = next_group
        next_group += 1
