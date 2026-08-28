"""
Tests for GET /api/stats/strength-score — specifically that a logged true
1RM (an actual single-rep set) takes priority over an Epley-estimated 1RM
from a different, submaximal set, even when the estimate is numerically
higher. Epley tends to overestimate at higher rep ranges, so a user's real,
achieved single should never be overridden by a formula guess.
"""
from models import db, ExerciseTemplate


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def create_standards_exercise(client, token, name, standards_key, muscle_group='Chest'):
    res = client.post('/api/exercises', json={'name': name, 'muscle_group': muscle_group}, headers=auth_headers(token))
    assert res.status_code == 201
    tid = res.get_json()['id']
    tmpl = db.session.get(ExerciseTemplate, tid)
    tmpl.standards_key = standards_key
    db.session.commit()
    return tid


def post_strength_workout(client, token, template_id, exercise_name, sets):
    payload = {
        'workoutName': 'Test Workout',
        'exercises': [{
            'name': exercise_name,
            'exercise_template_id': template_id,
            'sets': sets,
        }],
    }
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()


class TestTrueOneRepMaxPriority:

    def test_true_1rm_overrides_higher_epley_estimate(self, client, auth_token, registered_user):
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')

        # 250x6 -> Epley estimate = 250 * (1 + 6/30) = 300 lbs (inflated).
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 6, 'weight': 250}])
        # A real, achieved 285 lb single -- lower than the inflated estimate,
        # but this IS how strong the user actually is.
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 285}])

        res = client.get('/api/stats/strength-score', headers=auth_headers(auth_token))
        assert res.status_code == 200
        body = res.get_json()

        bench = next(e for e in body['big6'] if e['exercise'] == 'Bench Press')
        assert bench['estimated_1rm'] == 285

    def test_falls_back_to_estimate_when_no_true_1rm_logged(self, client, auth_token, registered_user):
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')

        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 6, 'weight': 250}])

        res = client.get('/api/stats/strength-score', headers=auth_headers(auth_token))
        assert res.status_code == 200
        body = res.get_json()

        bench = next(e for e in body['big6'] if e['exercise'] == 'Bench Press')
        assert bench['estimated_1rm'] == 300
