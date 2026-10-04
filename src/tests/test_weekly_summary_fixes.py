"""Weekly summary: kg units, the most-improved baseline, and training time."""
from datetime import date, timedelta

import pytest


def _h(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def kg(client, auth_token):
    client.patch('/api/me', json={'weight_unit': 'kg'}, headers=_h(auth_token))
    return _h(auth_token)


def _log(client, h, days_ago, exercises, duration=None):
    body = {'workoutName': 'W', 'date': (date.today() - timedelta(days=days_ago)).isoformat(), 'exercises': exercises}
    if duration is not None:
        body['duration'] = duration
    assert client.post('/api/workouts', json=body, headers=h).status_code == 201


def _bench(client, h):
    return client.post('/api/exercises', json={'name': 'Bench K2', 'equipment': 'Barbell', 'muscle_group': 'Chest'},
                       headers=h).get_json()['id']


def _summary(client, h):
    return client.get(f'/api/stats/weekly-summary?week={date.today().isoformat()}', headers=h).get_json()


def test_most_improved_lift_stays_in_kg_and_ignores_high_rep_sets(client, kg):
    ex = _bench(client, kg)
    lift = lambda sets: [{'name': 'Bench K2', 'exercise_template_id': ex, 'sets': sets}]
    # Last week: 100 x 5 (Epley 116.7), plus 60 x 30, which raw Epley calls 120
    _log(client, kg, 7, lift([{'reps': 5, 'weight': 100}, {'reps': 30, 'weight': 60}]))
    # This week: 105 x 5 = 122.5
    _log(client, kg, 0, lift([{'reps': 5, 'weight': 105}]))

    mil = _summary(client, kg)['most_improved_lift']
    # In kg, not x2.2 (it read ~270)
    assert mil['this_best'] == 122.5
    # Baseline is the 5-rep set, not the 30-rep one
    assert mil['prev_best'] == pytest.approx(116.7, abs=0.1)
    assert mil['gain'] == pytest.approx(5.8, abs=0.1)


def test_rolling_average_volume_is_in_kg(client, kg):
    ex = _bench(client, kg)
    _log(client, kg, 7, [{'name': 'Bench K2', 'exercise_template_id': ex, 'sets': [{'reps': 5, 'weight': 100}]}])
    # 500 kg over the 4 weeks before this one
    assert _summary(client, kg)['rolling_avg_volume'] == 125


def test_training_time_counts_cardio_logged_after_the_fact(client, auth_token):
    h = _h(auth_token)
    # A 45 min run entered in a minute, and a 60 min lift with a 10 min warm-up jog
    _log(client, h, 0, [{'name': 'Run Q', 'exercise_type': 'cardio', 'sets': [{'cardio_duration': 45, 'distance': 8}]}], duration=1)
    _log(client, h, 0, [
        {'name': 'Jog Q', 'exercise_type': 'cardio', 'sets': [{'cardio_duration': 10}]},
        {'name': 'Squat Q', 'sets': [{'reps': 5, 'weight': 225}]},
    ], duration=60)
    assert _summary(client, h)['total_duration_min'] == 105
