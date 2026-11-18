"""Supersets: the grouping rules (mirrored in the app's __tests__/supersets.test.ts,
same cases), saving and editing a workout's groups, and Hevy imports keeping them."""
from types import SimpleNamespace

import pytest

from utils.importers import parse
from utils.supersets import normalize_superset_groups, superset_group_value
from tests.test_import import LIBRARY, _import, _library


def hdrs(token):
    return {'Authorization': f'Bearer {token}'}


# ── Rules ────────────────────────────────────────────────────
# Each case: exercises in order as (exercise_type, superset_group), then the
# groups normalize leaves. Keep in step with NORMALIZE_CASES in supersets.test.ts.
NORMALIZE_CASES = [
    ('a pair is kept', [('strength', 1), ('strength', 1)], [1, 1]),
    ('keys are renumbered by first appearance', [('strength', 7), ('strength', 7), ('strength', 3), ('strength', 3)], [1, 1, 2, 2]),
    ('a tri-set is kept', [('strength', 2), ('strength', 2), ('duration', 2)], [1, 1, 1]),
    ('a group of one dissolves', [('strength', 1), ('strength', None)], [None, None]),
    ('cardio leaves its group', [('strength', 1), ('cardio', 1)], [None, None]),
    ('cardio in the middle splits the run', [('strength', 1), ('cardio', 1), ('strength', 1), ('strength', 1)], [None, None, None, None]),
    ('a stray away from its group is dropped', [('strength', 1), ('strength', 1), ('strength', None), ('strength', 1)], [1, 1, None, None]),
    ('neighbouring groups stay apart', [('strength', 1), ('strength', 1), ('strength', 2), ('strength', 2), ('strength', None)], [1, 1, 2, 2, None]),
    ('nothing grouped stays ungrouped', [('strength', None), ('cardio', None)], [None, None]),
]


@pytest.mark.parametrize('name,exercises,expected', NORMALIZE_CASES, ids=[c[0] for c in NORMALIZE_CASES])
def test_normalize(name, exercises, expected):
    objs = [SimpleNamespace(order=i, exercise_type=t, superset_group=g) for i, (t, g) in enumerate(exercises)]
    normalize_superset_groups(objs)
    assert [o.superset_group for o in objs] == expected


def test_normalize_follows_order_not_list_position():
    a = SimpleNamespace(order=0, exercise_type='strength', superset_group=1)
    b = SimpleNamespace(order=2, exercise_type='strength', superset_group=1)
    c = SimpleNamespace(order=1, exercise_type='strength', superset_group=1)
    normalize_superset_groups([b, a, c])
    assert [a.superset_group, c.superset_group, b.superset_group] == [1, 1, 1]


@pytest.mark.parametrize('value,expected', [
    (1, 1), (3.0, 3), (200, 200), (0, None), (201, None), (-1, None),
    (True, None), ('1', None), ([1], None), ({}, None), (None, None), (float('nan'), None),
])
def test_superset_group_value(value, expected):
    assert superset_group_value(value) == expected


# ── Saving ───────────────────────────────────────────────────

def _payload(*groups, kinds=None):
    kinds = kinds or ['strength'] * len(groups)
    return {
        'workoutName': 'Push',
        'exercises': [
            {'name': f'Lift {i}', 'exercise_type': k, 'superset_group': g,
             'sets': [{'reps': 5, 'weight': 100}] if k != 'cardio' else [{'cardio_duration': 10, 'distance': 2}]}
            for i, (g, k) in enumerate(zip(groups, kinds))
        ],
    }


def _groups(client, token, workout_id):
    res = client.get(f'/api/workouts/{workout_id}', headers=hdrs(token))
    assert res.status_code == 200
    exercises = sorted(res.get_json()['exercises'], key=lambda e: e['order'])
    return exercises, [e['superset_group'] for e in exercises]


def _create(client, token, payload):
    res = client.post('/api/workouts', json=payload, headers=hdrs(token))
    assert res.status_code == 201, res.get_json()
    return res.get_json()['id']


def test_create_saves_and_normalizes_groups(client, auth_token):
    wid = _create(client, auth_token, _payload(5, 5, None, 9))
    _, groups = _groups(client, auth_token, wid)
    assert groups == [1, 1, None, None]


def test_garbage_groups_save_the_workout_ungrouped(client, auth_token):
    payload = _payload(1, 1)
    payload['exercises'][0]['superset_group'] = 'A'
    payload['exercises'][1]['superset_group'] = {'x': 1}
    wid = _create(client, auth_token, payload)
    _, groups = _groups(client, auth_token, wid)
    assert groups == [None, None]


def test_cardio_never_joins(client, auth_token):
    wid = _create(client, auth_token, _payload(1, 1, kinds=['strength', 'cardio']))
    _, groups = _groups(client, auth_token, wid)
    assert groups == [None, None]


def test_edit_can_pair_and_unpair(client, auth_token):
    wid = _create(client, auth_token, _payload(None, None, None))
    exercises, _ = _groups(client, auth_token, wid)
    body = {'exercises': [{**e, 'superset_group': g} for e, g in zip(exercises, (None, 4, 4))]}
    assert client.patch(f'/api/workouts/{wid}', json=body, headers=hdrs(auth_token)).status_code == 200
    exercises, groups = _groups(client, auth_token, wid)
    assert groups == [None, 1, 1]

    body = {'exercises': [{**e, 'superset_group': None} for e in exercises]}
    assert client.patch(f'/api/workouts/{wid}', json=body, headers=hdrs(auth_token)).status_code == 200
    assert _groups(client, auth_token, wid)[1] == [None, None, None]


def test_edit_from_an_older_build_keeps_groups(client, auth_token):
    """Builds from before supersets send no superset_group: the stored one stays."""
    wid = _create(client, auth_token, _payload(1, 1))
    exercises, _ = _groups(client, auth_token, wid)
    body = {'exercises': [{k: v for k, v in e.items() if k != 'superset_group'} for e in exercises]}
    assert client.patch(f'/api/workouts/{wid}', json=body, headers=hdrs(auth_token)).status_code == 200
    assert _groups(client, auth_token, wid)[1] == [1, 1]


def test_removing_a_partner_on_edit_dissolves_the_pair(client, auth_token):
    wid = _create(client, auth_token, _payload(1, 1, None))
    exercises, _ = _groups(client, auth_token, wid)
    body = {'exercises': [exercises[0], exercises[2]]}
    assert client.patch(f'/api/workouts/{wid}', json=body, headers=hdrs(auth_token)).status_code == 200
    assert _groups(client, auth_token, wid)[1] == [None, None]


def test_export_has_the_group(client, auth_token):
    _create(client, auth_token, _payload(1, 1))
    res = client.get('/api/workouts/export', headers=hdrs(auth_token))
    lines = res.get_data(as_text=True).strip().splitlines()
    assert lines[0].endswith(',superset_group')
    assert all(line.endswith(',1') for line in lines[1:])


# ── Hevy import ──────────────────────────────────────────────

HEVY_SUPERSET = '''title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe
Push,"15 Jan 2024, 18:00","15 Jan 2024, 19:00",,Bench Press (Barbell),0,,0,normal,185,5,,,
Push,"15 Jan 2024, 18:00","15 Jan 2024, 19:00",,Bench Press (Barbell),0,,1,normal,185,5,,,
Push,"15 Jan 2024, 18:00","15 Jan 2024, 19:00",,Bent Over Row (Barbell),0,,0,normal,135,8,,,
Push,"15 Jan 2024, 18:00","15 Jan 2024, 19:00",,Squat (Barbell),,,0,normal,225,5,,,
'''


def test_hevy_parser_reads_superset_id():
    exercises = parse('hevy', HEVY_SUPERSET).workouts[0].exercises
    assert [e.superset for e in exercises] == ['0', '0', None]


def test_hevy_import_keeps_supersets(app, client, auth_token):
    from models import Workout
    _library(app, *LIBRARY)
    assert _import(client, auth_token, 'hevy', HEVY_SUPERSET).status_code == 201
    with app.app_context():
        workout = Workout.query.one()
        exercises = sorted(workout.exercises, key=lambda e: e.order)
        assert [e.superset_group for e in exercises] == [1, 1, None]


# ── Templates and routines ───────────────────────────────────

def _template_groups(client, token, template_id):
    res = client.get(f'/api/workout-templates/{template_id}', headers=hdrs(token))
    assert res.status_code == 200
    return [(e['name'], e['superset_group']) for e in res.get_json()['exercises']]


def _make_template(client, token, ids, groups=None):
    _make_template.count = getattr(_make_template, 'count', 0) + 1
    body = {'name': f'Push {_make_template.count}', 'exercise_template_ids': ids}
    if groups is not None:
        body['superset_groups'] = groups
    res = client.post('/api/workout-templates', json=body, headers=hdrs(token))
    assert res.status_code == 201, res.get_json()
    return res.get_json()['id']


@pytest.fixture
def lib(app):
    return _library(app, *LIBRARY)


def test_template_saves_and_normalizes_groups(client, auth_token, lib):
    ids = [lib[('Bench Press', 'Barbell')], lib[('Bent Over Row', 'Barbell')], lib[('Squat', 'Barbell')], lib[('Running', None)]]
    tid = _make_template(client, auth_token, ids, [5, 5, 9, 9])
    # Squat's partner is cardio, so that pair dissolves
    assert _template_groups(client, auth_token, tid) == [
        ('Bench Press', 1), ('Bent Over Row', 1), ('Squat', None), ('Running', None)]


def test_template_without_groups_and_garbage_groups(client, auth_token, lib):
    ids = [lib[('Bench Press', 'Barbell')], lib[('Squat', 'Barbell')]]
    assert [g for _, g in _template_groups(client, auth_token, _make_template(client, auth_token, ids))] == [None, None]
    for junk in ['x', {'a': 1}, [True, 'y'], [1]]:
        tid = _make_template(client, auth_token, ids, junk)
        assert [g for _, g in _template_groups(client, auth_token, tid)] == [None, None]


def test_template_groups_stay_with_their_exercise_when_an_id_is_dropped(client, auth_token, lib):
    hidden = 999_999
    ids = [lib[('Squat', 'Barbell')], hidden, lib[('Bench Press', 'Barbell')], lib[('Bent Over Row', 'Barbell')]]
    tid = _make_template(client, auth_token, ids, [None, 1, 2, 2])
    assert _template_groups(client, auth_token, tid) == [
        ('Squat', None), ('Bench Press', 1), ('Bent Over Row', 1)]


def test_template_edit_pairs_and_older_build_keeps_groups(client, auth_token, lib):
    bench, row, squat = lib[('Bench Press', 'Barbell')], lib[('Bent Over Row', 'Barbell')], lib[('Squat', 'Barbell')]
    tid = _make_template(client, auth_token, [bench, row, squat])
    res = client.patch(f'/api/workout-templates/{tid}', headers=hdrs(auth_token),
                       json={'exercise_template_ids': [bench, row, squat], 'superset_groups': [1, 1, None]})
    assert res.status_code == 200
    assert [g for _, g in _template_groups(client, auth_token, tid)] == [1, 1, None]

    # An older build reorders without sending groups: each exercise keeps its own
    res = client.patch(f'/api/workout-templates/{tid}', headers=hdrs(auth_token),
                       json={'exercise_template_ids': [squat, bench, row]})
    assert res.status_code == 200
    assert _template_groups(client, auth_token, tid) == [('Squat', None), ('Bench Press', 1), ('Bent Over Row', 1)]

    # Renaming alone leaves the exercises and groups be
    client.patch(f'/api/workout-templates/{tid}', headers=hdrs(auth_token), json={'name': 'Push Renamed'})
    assert [g for _, g in _template_groups(client, auth_token, tid)] == [None, 1, 1]


def test_routine_day_keeps_groups(client, auth_token, lib):
    bench, row = lib[('Bench Press', 'Barbell')], lib[('Bent Over Row', 'Barbell')]
    res = client.post('/api/routines', headers=hdrs(auth_token), json={
        'name': 'Split', 'days': [{'label': 'Push', 'exercise_template_ids': [bench, row], 'superset_groups': [3, 3]}],
    })
    assert res.status_code == 201, res.get_json()
    exercises = res.get_json()['days'][0]['workout_template']['exercises']
    assert [e['superset_group'] for e in exercises] == [1, 1]


# ── AI-generated plans ───────────────────────────────────────

import json as _json
import os as _os
import sys as _sys
from unittest.mock import patch as _patch

from routes.ai_routes import _superset_directive
from tests.test_ai_routes import _make_anthropic_mock


def _generate(client, token, ai_json, **payload):
    body = {'days_per_week': 3, 'goal': 'hypertrophy', 'experience': 'intermediate',
            'generate_type': 'routine', 'session_length_min': 45, **payload}
    mock_ant = _make_anthropic_mock(ai_json)
    with _patch.dict(_sys.modules, {'anthropic': mock_ant}), _patch.dict(_os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
        res = client.post('/api/ai/generate', json=body, headers=hdrs(token))
    assert res.status_code == 200, res.get_json()
    prompt = mock_ant.Anthropic.return_value.messages.create.call_args[1]['messages'][0]['content']
    return res.get_json(), prompt


def _ex(name, superset=None):
    return {'exercise': name, 'sets': 3, 'reps': '10-12', 'rpe': None, 'superset': superset}


@pytest.mark.parametrize('goal,experience,minutes,expected', [
    ('hypertrophy', 'beginner', 30, 'Do NOT use supersets'),
    ('hypertrophy', 'intermediate', 90, 'Do NOT use supersets'),
    ('strength', 'intermediate', 60, 'Do NOT use supersets'),
    ('strength', 'intermediate', 45, 'At most ONE superset pair per day, accessories only'),
    ('hypertrophy', 'intermediate', 45, '1-2 superset pairs per day'),
    ('general', 'advanced', 60, 'At most ONE superset pair per day, usually arm isolation'),
])
def test_superset_allowance_follows_the_profile(goal, experience, minutes, expected):
    assert _superset_directive(goal, experience, minutes).startswith(expected)


def test_generated_routine_marks_pairs_and_keeps_the_reason(client, auth_token, lib):
    ai = {'name': 'Split', 'description': 'x', 'days': [{
        'label': 'Upper',
        'superset_note': 'Paired to keep this under 45 minutes!',
        'exercises': [_ex('Bench Press'), _ex('Dips', 'A'), _ex('Pull Up', 'A'), _ex('Squat', 'B'), _ex('Running', 'B')],
    }, {
        'label': 'Lower', 'superset_note': 'A reason with no pair left',
        'exercises': [_ex('Squat', 'A'), _ex('Bench Press'), _ex('Bent Over Row', 'A')],
    }]}
    data, prompt = _generate(client, auth_token, ai)
    assert 'Supersets: 1-2 superset pairs per day' in prompt
    upper, lower = data['days']
    # Cardio can't pair, so B dissolves; A is numbered 1
    assert [(e['name'], e['superset_group']) for e in upper['exercises']] == [
        ('Bench Press', None), ('Dips', 1), ('Pull Up', 1), ('Squat', None), ('Running', None)]
    assert upper['superset_note'] == 'Paired to keep this under 45 minutes.'
    # Not next to each other: no pair, so no note either
    assert [e['superset_group'] for e in lower['exercises']] == [None, None, None]
    assert lower['superset_note'] is None


def test_generated_template_marks_pairs(client, auth_token, lib):
    ai = {'name': 'Arms', 'superset_note': None,
          'exercises': [_ex('Dips', 1), _ex('Pull Up', 1), _ex('Plank', 'nope'), _ex('Squat', True)]}
    data, _ = _generate(client, auth_token, ai, generate_type='template')
    assert [e['superset_group'] for e in data['exercises']] == [1, 1, None, None]
    assert data['superset_note'] is None


def test_saving_an_ai_plan_keeps_its_supersets(client, auth_token, lib):
    dips, pull, squat = lib[('Dips', 'Bodyweight')], lib[('Pull Up', 'Bodyweight')], lib[('Squat', 'Barbell')]
    res = client.post('/api/ai/save', headers=hdrs(auth_token), json={
        'type': 'routine', 'name': 'Split',
        'days': [{'label': 'Upper', 'exercise_ids': [squat, dips, pull], 'superset_groups': [None, 1, 1]}],
    })
    assert res.status_code == 201, res.get_json()
    routine = client.get(f"/api/routines/{res.get_json()['id']}", headers=hdrs(auth_token)).get_json()
    assert [e['superset_group'] for e in routine['days'][0]['workout_template']['exercises']] == [None, 1, 1]

    res = client.post('/api/ai/save', headers=hdrs(auth_token), json={
        'type': 'template', 'name': 'Arms', 'exercise_ids': [dips, pull], 'superset_groups': [2, 2],
    })
    assert res.status_code == 201
    assert [g for _, g in _template_groups(client, auth_token, res.get_json()['id'])] == [1, 1]
