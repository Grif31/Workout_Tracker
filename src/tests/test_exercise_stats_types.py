"""/api/stats/exercise for timed holds and cardio pace."""
from datetime import date, timedelta


def _h(token):
    return {'Authorization': f'Bearer {token}'}


def _log(client, token, days_ago, exercise):
    res = client.post('/api/workouts', json={
        'workoutName': 'W', 'date': (date.today() - timedelta(days=days_ago)).isoformat(),
        'exercises': [exercise],
    }, headers=_h(token))
    assert res.status_code == 201, res.get_json()


def test_holds_report_time_not_reps(client, auth_token):
    _log(client, auth_token, 1, {'name': 'Plank', 'exercise_type': 'duration', 'sets': [
        {'cardio_duration': 0.5, 'set_type': 'W'},
        {'cardio_duration': 1.5, 'set_type': 'N'},
        {'cardio_duration': 1.0, 'set_type': 'N'},
    ]})
    data = client.get('/api/stats/exercise?name=Plank', headers=_h(auth_token)).get_json()

    assert data['exercise_type'] == 'duration'
    assert data['personal_bests']['longest_hold'] == 1.5
    # Warm-ups don't count toward the totals
    assert data['totals'] == {'total_workouts': 1, 'total_sets': 2, 'total_duration': 2.5}
    assert [s['cardio_duration'] for s in data['history'][0]['sets']] == [0.5, 1.5, 1.0]


def test_average_pace_is_total_time_over_total_distance(client, auth_token):
    # 10 km in 50 min, then 1 km in 4 min plus a 10 min walk logged without distance
    _log(client, auth_token, 2, {'name': 'Run X', 'exercise_type': 'cardio', 'sets': [
        {'cardio_duration': 50, 'distance': 10, 'distance_unit': 'km'},
    ]})
    _log(client, auth_token, 1, {'name': 'Run X', 'exercise_type': 'cardio', 'sets': [
        {'cardio_duration': 4, 'distance': 1, 'distance_unit': 'km'},
        {'cardio_duration': 10},
    ]})
    data = client.get('/api/stats/exercise?name=Run X', headers=_h(auth_token)).get_json()

    # (50 + 4) / 11, not the mean of 5 and 14 min/km
    assert data['avg_pace'] == round(54 / 11, 4)
    newest, oldest = data['history']
    assert newest['distance_km'] == 1 and newest['pace'] == 4
    assert oldest['distance_km'] == 10 and oldest['pace'] == 5
    # Total time still counts the walk
    assert data['totals']['total_duration'] == 64
