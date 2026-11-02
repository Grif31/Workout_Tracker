"""Numbers for the admin's Coach and AI usage pages. Plain functions over
rows the route already fetched, so each can be tested without a page."""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from schemas import INSIGHT_FEEDBACK_REASONS
from utils import admin_charts
from utils.ai_client import estimate_cost

# Prompt or model changes to the insights, shown on the weekly helpful-rate
# trend so a step in it can be matched to its cause. Add a line per change:
# (date shipped, a few words for the chart, the full description).
PROMPT_CHANGES = [
    (date(2026, 10, 15), 'Votes in prompt', 'Votes quoted into the insights prompt'),
    (date(2026, 10, 16), 'Reasons', 'Thumbs-down reasons, each with its own instruction'),
]

# Fixed order, so an endpoint keeps its chart color whatever else is present
AI_ENDPOINTS = ['insights', 'weekly-review', 'generate']


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
        changes = [(short, label) for d, short, label in PROMPT_CHANGES if week <= d < week + timedelta(days=7)]
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


def coach_weekly_chart(weekly):
    points, markers = [], []
    for i, w in enumerate(weekly):
        rows = []
        if w['rate'] is not None:
            rows.append([f"{w['rate']}%", 'helpful', 'key-0'])
        rows.append([str(w['votes']), 'votes', None])
        rows += [['', label, None] for _, label in w['changes']]
        points.append({'label': w['week'].strftime('%m/%d'), 'value': w['rate'],
                       'tip': {'head': 'Week of ' + w['week'].strftime('%m/%d/%Y'), 'rows': rows}})
        if w['changes']:
            short = w['changes'][0][0] if len(w['changes']) == 1 else f"{len(w['changes'])} changes"
            markers.append({'index': i, 'label': short})
    return admin_charts.line_chart(points, y_max=100, fmt='pct', markers=markers, label_every=2)


def ai_daily_charts(by_day):
    """Calls stacked by endpoint, and estimated cost on a chart of its own:
    two measures, two scales, two charts. by_day is newest first."""
    days = list(reversed(by_day))
    calls, cost = [], []
    for d in days:
        head = d['day'].strftime('%a %m/%d')
        rows = [[str(d['by_endpoint'].get(ep, 0)), ep, f'key-{i}'] for i, ep in enumerate(AI_ENDPOINTS)]
        rows.append([str(d['calls']), 'total', None])
        if d['failures']:
            rows.append([str(d['failures']), 'failed', None])
        calls.append({'label': d['day'].strftime('%m/%d'), 'parts': dict(d['by_endpoint']),
                      'tip': {'head': head, 'rows': rows}})
        cost.append({'label': d['day'].strftime('%m/%d'), 'parts': {'cost': d['cost']},
                     'tip': {'head': head, 'rows': [[f"${d['cost']:.4f}", 'estimated', 'key-0'],
                                                    [str(d['calls']), 'calls', None]]}})
    return (admin_charts.stacked_columns(calls, AI_ENDPOINTS, label_every=5),
            admin_charts.stacked_columns(cost, ['cost'], fmt='money', height=170, label_every=5))


# The paywall `source` each entry point passes (utils/paywall.ts in the app),
# named for the page. An unknown source shows as itself.
PAYWALL_SOURCE_LABELS = {
    'templates': 'Template limit',
    'routines': 'Routine limit',
    'ai_coach': 'AI Coach',
    'muscle_volume': 'Muscle volume',
    'weekly_review': 'Weekly review',
    'pr_velocity': 'PR velocity',
    'strength_score': 'Strength Score',
    'endurance_score': 'Endurance Score',
    'app_icon': 'App icon',
    'account': 'Account settings',
    None: 'No source',
}

# Funnel steps in order: (key, label)
PAYWALL_STEPS = [
    ('shown', 'Saw a locked teaser'),
    ('viewed', 'Opened the paywall'),
    ('started', 'Started a purchase'),
    ('purchased', 'Bought Premium'),
]

PURCHASE_OUTCOME_LABELS = {
    'purchased': 'Bought',
    'cancelled': 'Cancelled at the App Store sheet',
    'pending': 'Waiting for approval (Ask to Buy)',
    'network': "Couldn't reach the App Store",
    'already_owned': 'Already owned',
    'failed': 'Failed',
}

RESTORE_OUTCOME_LABELS = {
    'restored': 'Restored',
    'none': 'Nothing to restore',
    'failed': "Couldn't reach the App Store",
}


def _who(r):
    # A deleted account's rows keep counting, each as its own person
    return r.user_id if r.user_id is not None else ('row', r.id)


def _step_of(r):
    if r.event == 'upsell_shown':
        return 'shown'
    if r.event == 'paywall_viewed':
        return 'viewed'
    if r.event == 'purchase_started':
        return 'started'
    if r.event == 'purchase' and r.outcome == 'purchased':
        return 'purchased'
    return None


def _funnel(rows):
    people = {key: set() for key, _ in PAYWALL_STEPS}
    for r in rows:
        step = _step_of(r)
        if step:
            people[step].add(_who(r))
    counts = {key: len(p) for key, p in people.items()}
    counts['conversion'] = _rate(counts['purchased'], counts['viewed'])
    return counts


def paywall_funnel(rows):
    """People (not events) at each step, and the share of paywall openers
    who bought."""
    return _funnel(rows)


def paywall_by_source(rows):
    """The funnel per source, most opened first. Every event carries the
    source that opened the paywall, so a purchase is credited to it."""
    groups = defaultdict(list)
    for r in rows:
        groups[r.source].append(r)
    out = [{'source': s, 'label': PAYWALL_SOURCE_LABELS.get(s, s), **_funnel(g)} for s, g in groups.items()]
    out.sort(key=lambda g: (-g['viewed'], -g['shown'], g['label']))
    return out


def paywall_by_plan(rows):
    """Picked, started and bought per plan, and how many of the purchases
    began with a free trial."""
    out = {p: {'plan': p, 'selected': 0, 'started': 0, 'purchased': 0, 'trials': 0}
           for p in ('annual', 'monthly', 'lifetime')}
    for r in rows:
        g = out.get(r.plan)
        if g is None:
            continue
        if r.event == 'plan_selected':
            g['selected'] += 1
        elif r.event == 'purchase_started':
            g['started'] += 1
        elif r.event == 'purchase' and r.outcome == 'purchased':
            g['purchased'] += 1
            g['trials'] += 1 if r.trial else 0
    return list(out.values())


def paywall_outcomes(rows, event, labels):
    counts = Counter(r.outcome for r in rows if r.event == event)
    return [{'outcome': k, 'label': label, 'count': counts.get(k, 0)} for k, label in labels.items()]


def paywall_by_day(rows, today, days=30):
    """Oldest first, every day in the window even with no events."""
    buckets = {today - timedelta(days=i): {'viewed': set(), 'purchased': set()} for i in reversed(range(days))}
    for r in rows:
        b = buckets.get(r.created_at.date())
        step = _step_of(r)
        if b is not None and step in b:
            b[step].add(_who(r))
    return [{'day': d, 'viewed': len(b['viewed']), 'purchased': len(b['purchased'])} for d, b in buckets.items()]


def paywall_daily_chart(by_day):
    """People opening the paywall each day, purchases stacked on top of the
    rest so a column's height is everyone who opened it."""
    columns = []
    for d in by_day:
        rest = max(d['viewed'] - d['purchased'], 0)
        columns.append({
            'label': d['day'].strftime('%m/%d'),
            'parts': {'purchased': d['purchased'], 'viewed': rest},
            'tip': {'head': d['day'].strftime('%a %m/%d'),
                    'rows': [[str(d['viewed']), 'opened the paywall', None],
                             [str(d['purchased']), 'bought', 'key-0']]},
        })
    return admin_charts.stacked_columns(columns, ['purchased', 'viewed'], label_every=5)
