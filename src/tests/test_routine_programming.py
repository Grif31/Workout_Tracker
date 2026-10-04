"""A routine day built from exercises in Create Routine keeps its sets/reps/RPE."""
import json


def _h(token):
    return {'Authorization': f'Bearer {token}'}


def _exercise(client, h, name):
    return client.post('/api/exercises', json={'name': name, 'muscle_group': 'Chest', 'equipment': 'Barbell'},
                       headers=h).get_json()['id']


def test_new_day_programming_is_saved_with_its_template(client, auth_token):
    h = _h(auth_token)
    bench = _exercise(client, h, 'Bench RP')
    prog = [{'exercise_template_id': bench, 'sets': 4, 'reps': '6-8', 'rpe': 8}]
    res = client.post('/api/routines', json={
        'name': 'Upper', 'days': [{'label': 'Push', 'exercise_template_ids': [bench], 'programming': prog}],
    }, headers=h)
    assert res.status_code == 201
    routine = client.get(f"/api/routines/{res.get_json()['id']}", headers=h).get_json()
    assert json.loads(routine['days'][0]['workout_template']['programming_json']) == prog


def test_editing_a_routine_keeps_new_day_programming(client, auth_token):
    h = _h(auth_token)
    bench = _exercise(client, h, 'Bench RP2')
    rid = client.post('/api/routines', json={'name': 'R', 'days': [{'label': 'A', 'exercise_template_ids': [bench]}]},
                      headers=h).get_json()['id']
    prog = [{'exercise_template_id': bench, 'sets': 3, 'reps': '10', 'rpe': None}]
    assert client.patch(f'/api/routines/{rid}', json={
        'days': [{'label': 'B', 'exercise_template_ids': [bench], 'programming': prog}],
    }, headers=h).status_code == 200
    routine = client.get(f'/api/routines/{rid}', headers=h).get_json()
    assert json.loads(routine['days'][0]['workout_template']['programming_json']) == prog
