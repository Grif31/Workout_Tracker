"""
Tests for personal record routes:
  GET /api/personal-records
  GET /api/personal-records/<exercise_template_id>
"""


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


WORKOUT_WITH_TEMPLATE = {
    'workoutName': 'Bench Day',
    'notes': '',
    'duration': 45,
    'exercises': [
        {
            'name': 'Bench Press',
            'exercise_template_id': None,  # filled in per-test after template creation
            'sets': [
                {'reps': 5, 'weight': 225},
                {'reps': 3, 'weight': 245},
            ],
        }
    ],
}


def create_template(client, token, name='Bench Press', muscle_group='Chest'):
    hdrs = auth_headers(token)
    res = client.post('/api/exercises', json={'name': name, 'muscle_group': muscle_group}, headers=hdrs)
    return res.get_json().get('id') or \
        next(e['id'] for e in client.get('/api/exercises', headers=hdrs).get_json() if e['name'] == name)


def post_workout_with_template(client, token, template_id):
    payload = {
        'workoutName': 'Bench Day',
        'notes': '',
        'duration': 45,
        'exercises': [
            {
                'name': 'Bench Press',
                'exercise_template_id': template_id,
                'sets': [
                    {'reps': 5, 'weight': 225},
                    {'reps': 3, 'weight': 245},
                ],
            }
        ],
    }
    return client.post('/api/workouts', json=payload, headers=auth_headers(token))


# ---------------------------------------------------------------------------
# GET /api/personal-records
# ---------------------------------------------------------------------------

class TestGetPersonalRecords:

    def test_returns_empty_list_with_no_records(self, client, auth_token):
        res = client.get('/api/personal-records', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json() == []

    def test_records_created_after_workout(self, client, auth_token):
        template_id = create_template(client, auth_token)
        post_workout_with_template(client, auth_token, template_id)
        res = client.get('/api/personal-records', headers=auth_headers(auth_token))
        assert res.status_code == 200
        records = res.get_json()
        assert len(records) > 0

    def test_record_contains_expected_fields(self, client, auth_token):
        template_id = create_template(client, auth_token)
        post_workout_with_template(client, auth_token, template_id)
        record = client.get('/api/personal-records', headers=auth_headers(auth_token)).get_json()[0]
        assert 'pr_type' in record
        assert 'value' in record
        assert 'exercise_name' in record
        assert 'pr_label' in record

    def test_creates_pr_types_for_weight_and_reps(self, client, auth_token):
        template_id = create_template(client, auth_token)
        post_workout_with_template(client, auth_token, template_id)
        records = client.get('/api/personal-records', headers=auth_headers(auth_token)).get_json()
        pr_types = {r['pr_type'] for r in records}
        assert 'max_weight' in pr_types
        assert 'max_reps' in pr_types
        assert 'estimated_1rm' in pr_types

    def test_only_returns_own_records(self, client, auth_token, auth_token2):
        template_id = create_template(client, auth_token)
        post_workout_with_template(client, auth_token, template_id)
        res = client.get('/api/personal-records', headers=auth_headers(auth_token2))
        assert res.get_json() == []

    def test_requires_auth(self, client):
        res = client.get('/api/personal-records')
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/personal-records/<exercise_template_id>
# ---------------------------------------------------------------------------

class TestGetPrsForExercise:
    # The endpoint now returns a structured object:
    # { max_weight, estimated_1rm, per_weight_reps: [{ weight, max_reps, achieved_at }] }

    def test_returns_structured_response_for_exercise_with_no_records(self, client, auth_token):
        res = client.get('/api/personal-records/9999', headers=auth_headers(auth_token))
        assert res.status_code == 200
        data = res.get_json()
        assert data['max_weight'] is None
        assert data['estimated_1rm'] is None
        assert data['per_weight_reps'] == []

    def test_returns_max_weight_after_workout(self, client, auth_token):
        template_id = create_template(client, auth_token)
        post_workout_with_template(client, auth_token, template_id)
        data = client.get(f'/api/personal-records/{template_id}', headers=auth_headers(auth_token)).get_json()
        assert data['max_weight'] == 245.0  # heaviest set in the payload

    def test_returns_per_weight_reps_after_workout(self, client, auth_token):
        template_id = create_template(client, auth_token)
        post_workout_with_template(client, auth_token, template_id)
        data = client.get(f'/api/personal-records/{template_id}', headers=auth_headers(auth_token)).get_json()
        weights = [e['weight'] for e in data['per_weight_reps']]
        assert 225.0 in weights  # 5 reps at 225 in the payload
        assert 245.0 in weights  # 3 reps at 245 in the payload

    def test_does_not_return_records_for_other_exercise(self, client, auth_token):
        t1 = create_template(client, auth_token, name='Bench Press', muscle_group='Chest')
        t2 = create_template(client, auth_token, name='Squat', muscle_group='Quads')
        post_workout_with_template(client, auth_token, t1)
        data = client.get(f'/api/personal-records/{t2}', headers=auth_headers(auth_token)).get_json()
        assert data['max_weight'] is None
        assert data['per_weight_reps'] == []

    def test_only_returns_own_records(self, client, auth_token, auth_token2):
        template_id = create_template(client, auth_token)
        post_workout_with_template(client, auth_token, template_id)
        data = client.get(f'/api/personal-records/{template_id}', headers=auth_headers(auth_token2)).get_json()
        assert data['max_weight'] is None
        assert data['per_weight_reps'] == []

    def test_requires_auth(self, client):
        res = client.get('/api/personal-records/1')
        assert res.status_code == 401
