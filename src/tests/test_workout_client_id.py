"""A workout saved twice is saved once (TODO.md section 22, Phase 5).

The app sends its own `client_id` with every new workout. A save that timed out
may still have landed, and the offline queue then sends the same payload again;
the server must answer with the first workout instead of creating a second.
"""
from datetime import datetime as real_datetime

import pytest

import routes.workout_routes as workout_routes
from models import User, Workout, db

CID = 'a1b2c3d4e5f6g7h8i9j0'


def _h(token):
    return {'Authorization': f'Bearer {token}'}


def _workout(client_id=CID, **extra):
    body = {
        'workoutName': 'Push Day',
        'exercises': [{'name': 'Bench Press', 'sets': [{'reps': 5, 'weight': 185}, {'reps': 5, 'weight': 185}]}],
        **extra,
    }
    if client_id is not None:
        body['client_id'] = client_id
    return body


def _count(user_token_client, token):
    res = user_token_client.get('/api/workouts', headers=_h(token)).get_json()
    return len(res if isinstance(res, list) else res.get('workouts', []))


def test_a_repeated_save_returns_the_first_workout(client, auth_token):
    first = client.post('/api/workouts', json=_workout(), headers=_h(auth_token))
    assert first.status_code == 201
    again = client.post('/api/workouts', json=_workout(), headers=_h(auth_token))
    assert again.status_code == 200
    body = again.get_json()
    assert body['id'] == first.get_json()['id']
    assert body['already_saved'] is True
    assert Workout.query.filter_by(client_id=CID).count() == 1


def test_the_repeat_answers_with_the_same_keys_but_no_new_prs(client, auth_token):
    # PRs need a library exercise behind the lift
    tid = client.post('/api/exercises', json={'name': 'Bench Press', 'muscle_group': 'Chest'},
                      headers=_h(auth_token)).get_json()['id']
    body = _workout()
    body['exercises'][0]['exercise_template_id'] = tid
    first = client.post('/api/workouts', json=body, headers=_h(auth_token)).get_json()
    assert first['new_prs']
    again = client.post('/api/workouts', json=body, headers=_h(auth_token)).get_json()
    assert again['new_prs'] == []
    assert set(first) - {'message'} <= set(again)
    assert again['total_sets'] == 2
    assert again['total_reps'] == 10


def test_different_client_ids_are_different_workouts(client, auth_token):
    client.post('/api/workouts', json=_workout('first-workout-01'), headers=_h(auth_token))
    res = client.post('/api/workouts', json=_workout('second-workout-2'), headers=_h(auth_token))
    assert res.status_code == 201
    assert Workout.query.count() == 2


def test_without_a_client_id_nothing_changes(client, auth_token):
    # Builds from before client_id: every save is a new workout, as before
    assert client.post('/api/workouts', json=_workout(None), headers=_h(auth_token)).status_code == 201
    assert client.post('/api/workouts', json=_workout(None), headers=_h(auth_token)).status_code == 201
    assert Workout.query.count() == 2


def test_the_same_client_id_from_two_accounts_is_two_workouts(client, auth_token, auth_token2):
    assert client.post('/api/workouts', json=_workout(), headers=_h(auth_token)).status_code == 201
    assert client.post('/api/workouts', json=_workout(), headers=_h(auth_token2)).status_code == 201
    assert Workout.query.filter_by(client_id=CID).count() == 2


@pytest.mark.parametrize('bad', ['short', 'x' * 65, 12345678, ['a' * 10]])
def test_rejects_a_malformed_client_id(client, auth_token, bad):
    res = client.post('/api/workouts', json=_workout(bad), headers=_h(auth_token))
    assert res.status_code == 400


def test_two_saves_racing_with_the_same_id_still_make_one(client, auth_token, monkeypatch):
    """The second save passes the duplicate check before the first is written,
    then loses to it at the unique constraint; it must return the first one."""
    first_id = {}

    class _RacingDatetime(real_datetime):
        @classmethod
        def strptime(cls, value, fmt):
            # Runs after the duplicate check and before the insert: the other
            # save lands here
            if not first_id:
                w = Workout(user_id=User.query.first().id, name='Push Day', client_id=CID, date=real_datetime(2026, 10, 16))
                db.session.add(w)
                db.session.commit()
                first_id['id'] = w.id
            return real_datetime.strptime(value, fmt)

    monkeypatch.setattr(workout_routes, 'datetime', _RacingDatetime)
    res = client.post('/api/workouts', json=_workout(date='2026-10-16'), headers=_h(auth_token))
    assert res.status_code == 200
    assert res.get_json()['id'] == first_id['id']
    assert Workout.query.filter_by(client_id=CID).count() == 1
