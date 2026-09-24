"""
Suite-wide guardrails, run against every route in the app's url_map rather
than one route at a time, so a route added later is covered without anyone
remembering to write these tests for it:

  - every route needs auth unless it's on the public allowlist
  - a brand-new user with no profile and no data never gets a 500
  - malformed JSON bodies and garbage query params get a 4xx, never a 500

A 500 here is almost always an unguarded int()/strptime()/.strip() on user
input or a division over an empty result set.
"""
import re

import pytest


def hdrs(token):
    return {'Authorization': f'Bearer {token}'}


# Routes that are public on purpose (CLAUDE.md: auth endpoints, legal pages,
# the health probe). /admin/* uses HTTP Basic Auth and is checked separately.
PUBLIC = {
    '/', '/privacy', '/terms', '/health',
    '/static/<path:filename>', '/brand/<path:filename>',
    '/api/signup', '/api/login', '/api/refresh', '/api/auth/social',
    '/api/forgot-password', '/api/verify-otp', '/api/reset-password',
}

# Call out to Anthropic, Apple/Google or send email; covered by their own
# tests with those services mocked.
EXTERNAL = {'/api/ai/generate', '/api/ai/insights', '/api/ai/save', '/api/auth/social'}


def _api_rules(app):
    for rule in app.url_map.iter_rules():
        for method in sorted(rule.methods - {'HEAD', 'OPTIONS'}):
            yield rule.rule, method


def _fill(rule, ids=None):
    """Substitute URL params: a real owned id when we have one, else 1."""
    ids = ids or {}

    def sub(m):
        conv, name = m.group(1), m.group(2)
        if conv == 'int':
            return str(ids.get((rule, name), ids.get(name, 1)))
        return 'x'
    return re.sub(r'<(?:(\w+):)?(\w+)>', lambda m: sub(m) if m.group(1) else 'x', rule)


def _call(client, method, url, **kw):
    return getattr(client, method.lower())(url, **kw)


# ---------------------------------------------------------------------------
# Auth coverage
# ---------------------------------------------------------------------------

def test_every_non_public_route_requires_auth(app, client):
    unprotected = []
    for rule, method in _api_rules(app):
        if rule in PUBLIC:
            continue
        res = _call(client, method, _fill(rule), json={})
        if res.status_code != 401:
            unprotected.append(f'{method} {rule} -> {res.status_code}')
    assert not unprotected, (
        'Routes answered without credentials. Add @jwt_required() (or Basic '
        'Auth for /admin), or add the route to PUBLIC if it is public on '
        f'purpose: {unprotected}'
    )


def test_garbage_bearer_token_is_rejected_not_crashing(app, client):
    bad = []
    for rule, method in _api_rules(app):
        if rule in PUBLIC or rule.startswith('/admin'):
            continue
        res = _call(client, method, _fill(rule), json={}, headers={'Authorization': 'Bearer not.a.jwt'})
        if res.status_code not in (401, 422):
            bad.append(f'{method} {rule} -> {res.status_code}')
    assert not bad, bad


# ---------------------------------------------------------------------------
# Brand-new user, no profile (no gender/bodyweight/birth date), no data
# ---------------------------------------------------------------------------

def _get_rules_without_params(app):
    return sorted(
        rule for rule, method in _api_rules(app)
        if method == 'GET' and rule.startswith('/api/') and '<' not in rule
    )


def test_fresh_user_can_open_every_screen(app, client, auth_token):
    crashed = []
    for rule in _get_rules_without_params(app):
        res = client.get(rule, headers=hdrs(auth_token))
        if res.status_code >= 500:
            crashed.append(f'GET {rule} -> {res.status_code}')
    assert not crashed, crashed


def test_fresh_user_id_routes_answer_404_not_500(app, client, auth_token):
    crashed = []
    for rule, method in _api_rules(app):
        if not rule.startswith('/api/') or '<int:' not in rule or rule in EXTERNAL:
            continue
        res = _call(client, method, _fill(rule, {n: 999999 for n in re.findall(r'<int:(\w+)>', rule)}),
                    json={}, headers=hdrs(auth_token))
        if res.status_code >= 500:
            crashed.append(f'{method} {rule} -> {res.status_code}')
    assert not crashed, crashed


# ---------------------------------------------------------------------------
# Malformed input
# ---------------------------------------------------------------------------

@pytest.fixture
def owned_ids(client, auth_token):
    """One of each resource the id routes act on, owned by the caller, so the
    fuzz reaches the code past the ownership lookup."""
    h = hdrs(auth_token)
    client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180}, headers=h)
    client.post('/api/workouts', json={
        'workoutName': 'W', 'duration': 30,
        'exercises': [{'name': 'Bench Press', 'sets': [{'reps': 5, 'weight': 135}]}],
    }, headers=h)
    workout_id = client.get('/api/workouts', headers=h).get_json()[0]['id']
    exercise_id = client.post('/api/exercises', json={'name': 'Guardrail Curl', 'muscle_group': 'Biceps'},
                              headers=h).get_json()['id']
    template_id = client.post('/api/workout-templates', json={
        'name': 'T', 'exercises': [{'exercise_template_id': exercise_id}],
    }, headers=h).get_json().get('id', 1)
    routine = client.post('/api/routines', json={
        'name': 'R', 'days': [{'day_number': 1, 'template_id': template_id}],
    }, headers=h).get_json()
    bw_id = client.post('/api/bodyweight', json={'weight': 180}, headers=h).get_json()['id']
    m_id = client.post('/api/measurements', json={'waist': 32}, headers=h).get_json()['id']
    return {
        'workoutId': workout_id, 'workout_id': workout_id,
        'template_id': template_id, 'routine_id': routine.get('id', 1),
        'exercise_id': exercise_id, 'exercise_template_id': exercise_id,
        ('/api/bodyweight/<int:entry_id>', 'entry_id'): bw_id,
        ('/api/measurements/<int:entry_id>', 'entry_id'): m_id,
    }


# Wrong types for the field names the app's bodies actually use.
_WRONG = ['abc', -1, 10**12, None, [], {}, True, '2026-13-45', '']
_FIELDS = [
    'weight', 'date', 'reps', 'name', 'workoutName', 'exercises', 'sets', 'duration',
    'notes', 'email', 'password', 'username', 'bodyweight', 'gender', 'birth_date',
    'weight_unit', 'waist', 'chest', 'days', 'day_number', 'template_id',
    'exercise_template_id', 'muscle_group', 'equipment', 'token', 'platform',
    'current_password', 'new_password', 'otp', 'rpe', 'set_type', 'distance',
    'cardio_duration', 'exercise_type', 'route_polyline', 'start_time', 'end_time',
]


def _bodies():
    yield 'not json'
    yield []
    yield {}
    for wrong in _WRONG:
        yield {f: wrong for f in _FIELDS}
    # Nested garbage where lists of objects are expected
    for inner in ['x', [None], [{}], [{'sets': 'x'}], [{'sets': [None]}], [{'sets': [{'reps': 'x', 'weight': 'y'}]}],
                  [{'name': 'Squat', 'sets': [{'reps': 5, 'weight': 100, 'set_type': 'Z', 'rpe': 99}]}]]:
        yield {'workoutName': 'W', 'name': 'N', 'exercises': inner, 'days': inner}


def _write_rules(app):
    for rule, method in _api_rules(app):
        if method in ('POST', 'PUT', 'PATCH') and rule.startswith('/api/') and rule not in EXTERNAL:
            yield rule, method


def test_malformed_bodies_never_500(app, client, auth_token, owned_ids):
    crashed = set()
    for rule, method in _write_rules(app):
        url = _fill(rule, owned_ids)
        for body in _bodies():
            kw = {'data': body, 'content_type': 'application/json'} if isinstance(body, str) else {'json': body}
            res = _call(client, method, url, headers=hdrs(auth_token), **kw)
            if res.status_code >= 500:
                crashed.add(f'{method} {rule} <- {str(body)[:80]}')
                break
    assert not crashed, sorted(crashed)


_GARBAGE_QUERY = (
    'exercise_id=abc&exercise_template_id=abc&template_id=abc&id=abc&date=nope&start=nope&end=nope'
    '&week_start=nope&week=nope&limit=abc&offset=-5&page=abc&days=abc&weeks=abc&range=zzz&period=zzz'
    '&metric=zzz&pr_type=zzz&weight_context=abc&type=zzz&include_exercises=maybe&format=zzz&months=abc'
)


def test_garbage_query_params_never_500(app, client, auth_token, owned_ids):
    crashed = []
    for rule, method in _api_rules(app):
        if method != 'GET' or not rule.startswith('/api/'):
            continue
        res = client.get(f'{_fill(rule, owned_ids)}?{_GARBAGE_QUERY}', headers=hdrs(auth_token))
        if res.status_code >= 500:
            crashed.append(f'GET {rule} -> {res.status_code}')
    assert not crashed, crashed


def test_bad_local_date_header_is_ignored(app, client, auth_token, owned_ids):
    crashed = []
    for value in ['nope', '2026-02-30', '9999-99-99', '']:
        for rule in _get_rules_without_params(app):
            res = client.get(rule, headers={**hdrs(auth_token), 'X-Local-Date': value})
            if res.status_code >= 500:
                crashed.append(f'GET {rule} X-Local-Date={value!r} -> {res.status_code}')
    assert not crashed, crashed
