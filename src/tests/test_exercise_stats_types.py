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


def test_hold_that_used_to_be_logged_as_reps_charts_only_the_holds(client, auth_token):
    # Library Plank was 'strength' until migration z4a5b6c7d8e9: the older row
    # has reps and no hold time, and must not decide the layout or join the chart
    from models import db, ExerciseTemplate
    tmpl = ExerciseTemplate(name='Plank', equipment='Bodyweight', exercise_type='duration')
    db.session.add(tmpl)
    db.session.commit()
    _log(client, auth_token, 5, {'name': 'Plank', 'exercise_template_id': tmpl.id, 'exercise_type': 'strength',
                                 'sets': [{'reps': 1, 'weight': 0}]})
    _log(client, auth_token, 1, {'name': 'Plank', 'exercise_template_id': tmpl.id, 'exercise_type': 'duration',
                                 'sets': [{'cardio_duration': 1.0}]})

    data = client.get(f'/api/stats/exercise?name=Plank&exercise_template_id={tmpl.id}',
                      headers=_h(auth_token)).get_json()

    assert data['exercise_type'] == 'duration'
    assert data['totals'] == {'total_workouts': 1, 'total_sets': 1, 'total_duration': 1.0}
    assert data['personal_bests']['longest_hold'] == 1.0


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
