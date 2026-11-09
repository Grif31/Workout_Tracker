"""Per-field validation inside workout, routine and template payloads (TODO §5).

Every value inside an exercise, a set or a routine day reaches a typed column.
Junk must be a 400 that names the field, never a 500 that rolls the save back.
Safe values are converted rather than refused, so a workout queued offline by
an older build still saves: a decimal reps is rounded, a numeric string read
as a number.
"""
import pytest

from models import db, Exercise, Set, Workout


def hdrs(token):
    return {'Authorization': f'Bearer {token}'}


def _post(client, token, exercise=None, set_=None):
    s = {'reps': 5, 'weight': 100, 'set_type': 'N'}
    s.update(set_ or {})
    ex = {'name': 'Bench Press', 'sets': [s]}
    ex.update(exercise or {})
    return client.post('/api/workouts', json={'workoutName': 'Push', 'exercises': [ex]}, headers=hdrs(token))


BAD_SETS = [
    {'reps': 'lots'},
    {'reps': [5]},
    {'reps': True},
    {'reps': -1},
    {'rpe': 11},
    {'rpe': 0},
    {'rpe': 'hard'},
    {'set_type': 'X'},
    {'set_type': 5},
    {'order': 'first'},
    {'id': 'abc'},
    {'id': [1]},
    {'intensity': 'fast'},
    {'intensity': 1e300},
]

BAD_EXERCISES = [
    {'name': 'x' * 251},
    {'exercise_type': 'yoga'},
    {'exercise_type': ['cardio']},
    {'exercise_template_id': []},
    {'exercise_template_id': 'seven'},
    {'id': {'a': 1}},
    {'order': 'last'},
    {'notes': {'a': 1}},
    {'route_polyline': 42},
]


@pytest.mark.parametrize('bad', BAD_SETS, ids=lambda b: repr(b))
def test_bad_set_values_are_a_400(client, auth_token, bad):
    res = _post(client, auth_token, set_=bad)
    assert res.status_code == 400, res.get_json()
    assert next(iter(bad)) in str(res.get_json())


@pytest.mark.parametrize('bad', BAD_EXERCISES, ids=lambda b: repr(b)[:40])
def test_bad_exercise_values_are_a_400(client, auth_token, bad):
    res = _post(client, auth_token, exercise=bad)
    assert res.status_code == 400, res.get_json()
    assert next(iter(bad)) in str(res.get_json())


def test_safe_values_are_converted_not_refused(app, client, auth_token):
    res = _post(client, auth_token, exercise={'order': 0.0, 'exercise_type': 'Strength'},
                set_={'reps': '8.4', 'rpe': 7.6, 'order': '0', 'weight': '100'})
    assert res.status_code == 201, res.get_json()
    with app.app_context():
        s = Set.query.join(Exercise).filter(Exercise.workout_id == res.get_json()['id']).one()
        assert (s.reps, s.rpe, s.order, s.weight) == (8, 8, 0, 100.0)
        assert isinstance(s.reps, int) and isinstance(s.rpe, int)
        assert db.session.get(Exercise, s.exercise_id).exercise_type == 'strength'


def test_empty_values_read_as_unset(app, client, auth_token):
    res = _post(client, auth_token, set_={'reps': '', 'rpe': None, 'set_type': None, 'weight': ''})
    assert res.status_code == 201, res.get_json()
    with app.app_context():
        s = Set.query.join(Exercise).filter(Exercise.workout_id == res.get_json()['id']).one()
        assert s.reps is None and s.rpe is None and s.set_type == 'N'


def test_what_the_app_sends_still_saves(client, auth_token):
    # WorkoutLog's strength, duration and cardio set shapes (buildPayload)
    payload = {'workoutName': 'Mixed', 'duration': 50, 'exercises': [
        {'name': 'Bench Press', 'exercise_template_id': None, 'exercise_type': 'strength', 'notes': None, 'order': 0,
         'sets': [{'id': None, 'reps': 5, 'weight': 135, 'order': 0, 'set_type': 'W', 'rpe': None}]},
        {'name': 'Plank', 'exercise_type': 'duration', 'notes': None, 'order': 1,
         'sets': [{'order': 0, 'set_type': 'N', 'reps': None, 'weight': None, 'cardio_duration': 1.5}]},
        {'name': 'Running', 'exercise_type': 'cardio', 'notes': None, 'order': 2,
         'sets': [{'order': 0, 'set_type': 'N', 'reps': None, 'weight': None, 'cardio_duration': 30,
                   'distance': 5, 'distance_unit': 'km', 'intensity': 6}]},
    ]}
    res = client.post('/api/workouts', json=payload, headers=hdrs(auth_token))
    assert res.status_code == 201, res.get_json()


def test_edits_are_checked_too(client, auth_token):
    wid = _post(client, auth_token).get_json()['id']
    detail = client.get(f'/api/workouts/{wid}', headers=hdrs(auth_token)).get_json()
    ex = detail['exercises'][0]
    ex['sets'][0]['rpe'] = 42
    res = client.put(f'/api/workouts/{wid}', json={'exercises': [ex]}, headers=hdrs(auth_token))
    assert res.status_code == 400 and 'rpe' in str(res.get_json())


# ── Routines and templates ────────────────────────────────────

def _routine(client, token, day):
    return client.post('/api/routines', json={'name': 'PPL', 'days': [day]}, headers=hdrs(token))


BAD_DAYS = [
    {'label': {'a': 1}},
    {'label': 'x' * 101},
    {'workout_template_id': [1]},
    {'workout_template_id': 'one'},
    {'exercise_template_ids': 'all'},
    {'exercise_template_ids': [[1]]},
    {'programming': 'heavy'},
    {'programming': [1, 2]},
]


@pytest.mark.parametrize('bad', BAD_DAYS, ids=lambda b: repr(b)[:40])
def test_bad_routine_days_are_a_400(client, auth_token, bad):
    res = _routine(client, auth_token, bad)
    assert res.status_code == 400, res.get_json()
    assert next(iter(bad)) in str(res.get_json())


def test_a_good_routine_day_still_saves(client, auth_token):
    res = _routine(client, auth_token, {'label': 'Push', 'exercise_template_ids': [],
                                        'programming': [{'exercise_template_id': 1, 'sets': 3, 'reps': '8-10'}]})
    assert res.status_code == 201, res.get_json()


def test_routine_days_must_be_objects(client, auth_token):
    res = client.post('/api/routines', json={'name': 'PPL', 'days': ['Push']}, headers=hdrs(auth_token))
    assert res.status_code == 400


def test_template_programming_must_be_a_list_of_objects(client, auth_token):
    res = client.post('/api/workout-templates', json={'name': 'Push', 'programming': ['3x8']}, headers=hdrs(auth_token))
    assert res.status_code == 400 and 'programming' in str(res.get_json())
