"""ExerciseDB (RapidAPI) access and the admin's GIF search.

The plan allows 690 calls a month and returns at most 10 exercises per page
whatever `limit` asks for, so the catalog is copied into our own table once
and searched here; only thumbnails and the final download go upstream.
"""
import re
from datetime import datetime

import requests as http_requests

HOST = 'exercisedb.p.rapidapi.com'
PAGE_SIZE = 10
# Cloudflare's bot-fight-mode 403s (error 1010) requests with no User-Agent,
# so every RapidAPI call sends one alongside the API key headers.
_USER_AGENT = {'User-Agent': 'Mozilla/5.0 (compatible; AreteAdmin/1.0)'}

# The last quota RapidAPI reported, shown on the admin page. In-process only:
# unknown again after a restart until the next upstream call.
quota = {'remaining': None, 'limit': None, 'at': None}

OUR_TO_EXERCISEDB_EQUIP = {
    'Barbell':       'barbell',
    'Dumbbell':      'dumbbell',
    'Cable':         'cable',
    'Machine':       'leverage machine',
    'Bodyweight':    'body weight',
    'Smith Machine': 'smith machine',
    'EZ Bar':        'ez barbell',
    'Kettlebell':    'kettlebell',
    'Weighted':      'weighted',
}

# Our muscle groups to ExerciseDB's `target` values, for ranking.
OUR_TO_EXERCISEDB_TARGETS = {
    'Chest':      {'pectorals', 'serratus anterior'},
    'Back':       {'lats', 'upper back', 'spine', 'traps'},
    'Shoulders':  {'delts'},
    'Biceps':     {'biceps'},
    'Triceps':    {'triceps'},
    'Quads':      {'quads'},
    'Hamstrings': {'hamstrings'},
    'Glutes':     {'glutes', 'abductors', 'adductors'},
    'Calves':     {'calves'},
    'Core':       {'abs'},
    'Forearms':   {'forearms'},
}


def headers(api_key):
    return {'X-RapidAPI-Key': api_key, 'X-RapidAPI-Host': HOST, **_USER_AGENT}


def _note_quota(resp):
    remaining = resp.headers.get('X-RateLimit-Requests-Remaining')
    if remaining is not None and str(remaining).isdigit():
        quota['remaining'] = int(remaining)
        limit = resp.headers.get('X-RateLimit-Requests-Limit')
        quota['limit'] = int(limit) if limit and str(limit).isdigit() else None
        quota['at'] = datetime.now()


def error_message(exc):
    """RapidAPI puts the useful text (e.g. "monthly quota exceeded") in the
    response body's JSON, not in the exception string."""
    response = getattr(exc, 'response', None)
    if response is not None:
        try:
            return response.json().get('message', str(exc))
        except Exception:
            pass
    return str(exc)


def fetch_page(api_key, offset):
    """One page of the catalog. Fewer than PAGE_SIZE rows means the end."""
    resp = http_requests.get(
        f'https://{HOST}/exercises',
        params={'limit': PAGE_SIZE, 'offset': offset},
        headers=headers(api_key),
        timeout=15,
    )
    _note_quota(resp)
    resp.raise_for_status()
    return resp.json()


def fetch_image(api_key, exercisedb_id, resolution):
    """Returns (bytes, content type). These ids only resolve through RapidAPI's
    own /image endpoint with the key, never a public CDN, so the app can't
    point at ExerciseDB directly."""
    resp = http_requests.get(
        f'https://{HOST}/image',
        params={'exerciseId': exercisedb_id, 'resolution': resolution},
        headers=headers(api_key),
        timeout=15,
    )
    _note_quota(resp)
    resp.raise_for_status()
    return resp.content, resp.headers.get('Content-Type', 'image/gif')


# ── Search ────────────────────────────────────────────────────

# Applied to each word, on both the query and the catalog name.
_WORD_ALIASES = {
    'db': 'dumbbell', 'dumbell': 'dumbbell', 'dumbells': 'dumbbell',
    'bb': 'barbell', 'kb': 'kettlebell',
    'flye': 'fly', 'flyes': 'fly', 'flies': 'fly',
    'latissimus': 'lat',
    'bodyweight': 'body weight',
}
# Words people write apart or together; both sides become the joined form.
_JOINS = [
    ('pull up', 'pullup'), ('push up', 'pushup'), ('chin up', 'chinup'),
    ('sit up', 'situp'), ('step up', 'stepup'), ('pull down', 'pulldown'),
    ('push down', 'pushdown'), ('pull over', 'pullover'), ('dead lift', 'deadlift'),
    ('kick back', 'kickback'), ('skull crusher', 'skullcrusher'),
]
# Query-only: shorthand that ExerciseDB spells out. The query is also tried
# with each phrase replaced, and a name matching either counts.
_PHRASE_ALIASES = {
    'rdl': 'romanian deadlift',
    'sldl': 'stiff leg deadlift',
    'ohp': 'overhead press',
    'skullcrusher': 'lying triceps extension',
    'military press': 'overhead press',
    'overhead press': 'shoulder press',
    'lat pulldown': 'pulldown',
}


def _word(w):
    w = _WORD_ALIASES.get(w, w)
    if len(w) >= 3 and w.endswith('s') and not w.endswith('ss'):
        w = w[:-1]
    return _WORD_ALIASES.get(w, w)


def normalize(text):
    words = re.sub(r'[^a-z0-9 ]', ' ', (text or '').lower()).split()
    joined = ' '.join(_word(w) for w in words)
    for apart, together in _JOINS:
        joined = re.sub(rf'\b{apart}\b', together, joined)
    return joined.split()


def _query_variants(query_tokens):
    """The query plus every rewrite the phrase aliases allow, followed through
    chains (military press -> overhead press -> shoulder press)."""
    variants = [query_tokens]
    i = 0
    while i < len(variants) and len(variants) < 8:
        joined = ' '.join(variants[i])
        for phrase, replacement in _PHRASE_ALIASES.items():
            pattern = rf'\b{phrase}\b'
            if re.search(pattern, joined):
                alt = normalize(re.sub(pattern, replacement, joined))
                if alt not in variants:
                    variants.append(alt)
        i += 1
    return variants


def _token_hits(query_tokens, name_tokens, prefix_last):
    """How many query words appear among the name's words. The last query word
    may match as a prefix, so results keep up while typing."""
    hits = 0
    for i, q in enumerate(query_tokens):
        if q in name_tokens or (prefix_last and i == len(query_tokens) - 1
                                and any(t.startswith(q) for t in name_tokens)):
            hits += 1
    return hits


def highlight(name, query_tokens):
    """The name's words, each paired with whether the query matched it."""
    qs = set(query_tokens)
    last = query_tokens[-1] if query_tokens else None
    out = []
    for word in name.split():
        toks = normalize(word)
        bold = any(t in qs or (last and t.startswith(last)) for t in toks)
        out.append([word, bold])
    return out


def search(entries, query, *, equipment=None, body_part=None, target=None,
           our_muscle_group=None, prefix_last=True):
    """Ranks catalog entries (dicts with name / equipment / body_part / target)
    for a query.

    Every query word must appear, in any order. Ranked by fewest words the
    query didn't ask for (so "bench press" puts "barbell bench press" above
    "barbell incline bench press"), then by the target muscle matching our
    primary muscle group. With fewer than 5 full matches, names missing one
    query word come back separately as close matches.

    Returns (matches, close, query_tokens).
    """
    base = normalize(query)
    variants = _query_variants(base) if base else [[]]
    wanted_targets = set()
    if our_muscle_group:
        primary = our_muscle_group.split(',')[0].strip()
        wanted_targets = OUR_TO_EXERCISEDB_TARGETS.get(primary, set())

    full, near = [], []
    for e in entries:
        if equipment and e['equipment'] != equipment:
            continue
        if body_part and e['body_part'] != body_part:
            continue
        if target and e['target'] != target:
            continue
        name_tokens = normalize(e['name'])
        best = None
        for q in variants:
            hits = _token_hits(q, name_tokens, prefix_last)
            missing = len(q) - hits
            extra = max(len(name_tokens) - hits, 0)
            key = (missing, extra)
            if best is None or key < best:
                best = key
        missing, extra = best
        rank = (extra, 0 if e['target'] in wanted_targets else 1, e['name'])
        if missing == 0:
            full.append((rank, e))
        elif missing == 1 and len(base) >= 2:
            near.append((rank, e))

    full.sort(key=lambda r: r[0])
    near.sort(key=lambda r: r[0])
    matches = [e for _, e in full]
    close = [e for _, e in near] if len(matches) < 5 else []
    return matches, close, base
