"""Numbers for the admin's Coach and AI usage pages. Plain functions over
rows the route already fetched, so each can be tested without a page."""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from schemas import INSIGHT_FEEDBACK_REASONS
from utils.ai_client import estimate_cost

# Prompt or model changes to the insights, shown on the weekly helpful-rate
# trend so a step in it can be matched to its cause. Add a line per change.
PROMPT_CHANGES = [
    (date(2026, 10, 15), 'Votes quoted into the insights prompt'),
    (date(2026, 10, 16), 'Thumbs-down reasons, each with its own instruction'),
]


# The app's own chip labels (INSIGHT_REASONS in CoachScreen.tsx), so the page
# reads the way users voted
REASON_LABELS = {
    'known': 'Already knew this',
    'irrelevant': 'Not for my goal',
    'wrong': 'Looks wrong',
    'vague': 'Too vague',
    None: 'No reason given',
}


def _rate(helpful, votes):
    return round(100 * helpful / votes) if votes else None


def _monday(d):
    return d - timedelta(days=d.weekday())


def votes_by_type(rows):
    """Helpful rate and the thumbs-down reasons for each insight type, most
    voted first."""
    groups = defaultdict(list)
    for r in rows:
        groups[r.insight_type or 'untyped'].append(r)
    out = []
    for insight_type, votes in groups.items():
        helpful = sum(1 for v in votes if v.helpful)
        reasons = Counter(v.reason for v in votes if not v.helpful)
        out.append({
            'type': insight_type,
            'votes': len(votes),
            'helpful': helpful,
            'rate': _rate(helpful, len(votes)),
            'reasons': {r: reasons.get(r, 0) for r in INSIGHT_FEEDBACK_REASONS},
            'no_reason': reasons.get(None, 0),
        })
    out.sort(key=lambda g: (-g['votes'], g['type']))
    return out


def reason_totals(rows):
    counts = Counter(r.reason for r in rows if not r.helpful)
    return {**{r: counts.get(r, 0) for r in INSIGHT_FEEDBACK_REASONS}, None: counts.get(None, 0)}


def weekly_helpful_rate(rows, today, weeks=12):
    """One row per week (Monday start), oldest first, with any prompt changes
    that landed that week."""
    first = _monday(today) - timedelta(weeks=weeks - 1)
    buckets = {first + timedelta(weeks=i): [0, 0] for i in range(weeks)}
    for r in rows:
        week = _monday(r.created_at.date())
        if week in buckets:
            buckets[week][0] += 1
            buckets[week][1] += 1 if r.helpful else 0
    out = []
    for week, (votes, helpful) in buckets.items():
        changes = [label for d, label in PROMPT_CHANGES if week <= d < week + timedelta(days=7)]
        out.append({'week': week, 'votes': votes, 'helpful': helpful,
                    'rate': _rate(helpful, votes), 'changes': changes})
    return out


def most_voted_down(rows, min_not_helpful=2, limit=20):
    groups = defaultdict(lambda: {'not_helpful': 0, 'helpful': 0, 'type': None, 'last': None})
    for r in rows:
        g = groups[r.title]
        g['not_helpful' if not r.helpful else 'helpful'] += 1
        g['type'] = r.insight_type or g['type']
        g['last'] = max(g['last'], r.created_at) if g['last'] else r.created_at
    out = [{'title': title, **g} for title, g in groups.items() if g['not_helpful'] >= min_not_helpful]
    out.sort(key=lambda g: (-g['not_helpful'], g['helpful'], g['title']))
    return out[:limit]


def _percentile(values, pct):
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(round(pct / 100 * (len(values) - 1))))]


def _row_cost(r):
    return estimate_cost(r.model, r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_write_tokens)


def ai_by_endpoint(rows):
    groups = defaultdict(list)
    for r in rows:
        groups[r.endpoint].append(r)
    out = []
    for endpoint, calls in groups.items():
        failures = sum(1 for c in calls if not c.ok)
        latencies = [c.latency_ms for c in calls if c.ok]
        out.append({
            'endpoint': endpoint,
            'calls': len(calls),
            'failures': failures,
            'failure_rate': round(100 * failures / len(calls)),
            'p50': _percentile(latencies, 50),
            'p95': _percentile(latencies, 95),
            'input_tokens': sum(c.input_tokens or 0 for c in calls),
            'output_tokens': sum(c.output_tokens or 0 for c in calls),
            'cost': sum(_row_cost(c) for c in calls),
        })
    out.sort(key=lambda g: (-g['calls'], g['endpoint']))
    return out


def ai_by_day(rows, today, days=30):
    """Newest first, every day in the window even with no calls."""
    buckets = {today - timedelta(days=i): {'calls': 0, 'failures': 0, 'cost': 0.0, 'by_endpoint': Counter()}
               for i in range(days)}
    for r in rows:
        b = buckets.get(r.created_at.date())
        if b is None:
            continue
        b['calls'] += 1
        b['failures'] += 0 if r.ok else 1
        b['cost'] += _row_cost(r)
        b['by_endpoint'][r.endpoint] += 1
    return [{'day': d, **b} for d, b in buckets.items()]


def ai_top_users(rows, usernames, limit=10):
    groups = defaultdict(lambda: {'calls': 0, 'cost': 0.0})
    for r in rows:
        if r.user_id is None:
            continue
        groups[r.user_id]['calls'] += 1
        groups[r.user_id]['cost'] += _row_cost(r)
    out = [{'user_id': uid, 'username': usernames.get(uid), **g} for uid, g in groups.items()]
    out.sort(key=lambda g: (-g['calls'], -g['cost'], g['user_id']))
    return out[:limit]


def ai_totals(rows):
    return {'calls': len(rows), 'failures': sum(1 for r in rows if not r.ok),
            'cost': sum(_row_cost(r) for r in rows)}


def month_start(now: datetime):
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
