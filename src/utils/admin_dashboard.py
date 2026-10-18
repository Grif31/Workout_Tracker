"""The admin dashboard's attention rules and week-over-week figures. Plain
functions over values the route gathered, so each rule can be tested on the
data that should trip it."""
from datetime import timedelta

# AI failures in the last 24 hours: with little traffic any failure is worth
# a look; with more, only a rate above 5% is.
AI_LOW_VOLUME = 20
AI_FAILURE_RATE = 0.05
AI_FAILURE_RATE_BAD = 0.20
QUOTA_LOW = 100


def ai_failure_alert(calls, failures):
    if not failures:
        return None
    rate = failures / calls if calls else 1
    if calls >= AI_LOW_VOLUME and rate <= AI_FAILURE_RATE:
        return None
    return {
        'level': 'bad' if rate >= AI_FAILURE_RATE_BAD else 'warn',
        'text': f'{failures} of {calls} AI call{"s" if calls != 1 else ""} failed in the last 24 hours',
        'link': 'admin.admin_ai',
    }


def looks_wrong_alert(new_count):
    if not new_count:
        return None
    return {
        'level': 'warn',
        'text': f'{new_count} new "Looks wrong" vote{"s" if new_count != 1 else ""} since you last opened the Coach page',
        'link': 'admin.admin_coach',
    }


def quota_alert(remaining):
    if remaining is None or remaining >= QUOTA_LOW:
        return None
    return {
        'level': 'bad' if remaining < 20 else 'warn',
        'text': f'{remaining} RapidAPI calls left this month for exercise GIFs',
        'link': 'admin.admin_exercises',
    }


def daily_counts(dates, today, days=14):
    """How many of `dates` fall on each of the last `days` days, oldest first."""
    first = today - timedelta(days=days - 1)
    counts = [0] * days
    for d in dates:
        i = (d - first).days
        if 0 <= i < days:
            counts[i] += 1
    return counts


def daily_distinct(pairs, today, days=14):
    """Distinct ids per day from (date, id) pairs, oldest first."""
    first = today - timedelta(days=days - 1)
    sets = [set() for _ in range(days)]
    for d, ident in pairs:
        i = (d - first).days
        if 0 <= i < days:
            sets[i].add(ident)
    return [len(s) for s in sets]


def change(current, previous):
    """Signed change and its direction against the period before, or None
    when there's nothing to compare with."""
    if previous is None:
        return None
    diff = current - previous
    return {'diff': diff, 'direction': 'up' if diff > 0 else 'down' if diff < 0 else 'flat'}


def rate(helpful, total):
    return round(100 * helpful / total) if total else None


def migration_alert(state):
    if state['state'] != 'behind':
        return None
    return {'level': 'bad',
            'text': f"Database is on migration {', '.join(state['current']) or 'none'}, the code expects "
                    f"{', '.join(state['heads'])}",
            'link': 'admin.admin_system'}


def env_alert(missing):
    if not missing:
        return None
    return {'level': 'bad',
            'text': f"Required env var{'s' if len(missing) != 1 else ''} not set: {', '.join(missing)}",
            'link': 'admin.admin_system'}


def premium_ready_alert(checklist):
    if not checklist['ready'] or checklist['enforced']:
        return None
    return {'level': 'warn',
            'text': 'The premium checklist is green: PREMIUM_ENFORCED can be turned on',
            'link': 'admin.admin_system'}
