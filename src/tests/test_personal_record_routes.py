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


# ---------------------------------------------------------------------------
# Cardio PRs must survive workout edits/deletes (recompute used to wipe them)
# ---------------------------------------------------------------------------

def post_cardio_workout(client, token, template_id, duration_min, distance_km, name='Morning Run'):
    payload = {
        'workoutName': name,
        'exercises': [{
            'name': 'Running',
            'exercise_template_id': template_id,
            'exercise_type': 'cardio',
            'sets': [{'cardio_duration': duration_min, 'distance': distance_km, 'distance_unit': 'km'}],
        }],
    }
    return client.post('/api/workouts', json=payload, headers=auth_headers(token))


def get_best_5k_time(user_id, template_id):
    from models import PersonalRecord
    pr = PersonalRecord.query.filter_by(
        user_id=user_id, exercise_template_id=template_id,
        pr_type='best_time', weight_context=5.0,
    ).first()
    return pr.value if pr else None


class TestCardioPrSurvivesRecompute:

    def _setup(self, client, auth_token):
        template_id = create_template(client, auth_token, name='Running', muscle_group='Core')
        res = post_cardio_workout(client, auth_token, template_id, duration_min=30, distance_km=5)
        assert res.status_code == 201
        return template_id, res.get_json()['id']

    def test_cardio_workout_creates_best_time_pr(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        template_id, _ = self._setup(client, auth_token)
        assert get_best_5k_time(user_id, template_id) == 30.0

    def test_editing_workout_preserves_cardio_pr(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        template_id, workout_id = self._setup(client, auth_token)
        res = client.patch(f'/api/workouts/{workout_id}', json={'workoutName': 'Renamed Run'},
                           headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert get_best_5k_time(user_id, template_id) == 30.0

    def test_editing_sets_recomputes_cardio_pr(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        template_id, workout_id = self._setup(client, auth_token)
        # Fetch the existing exercise/set ids, then slow the run down to 35 min
        details = client.get(f'/api/workouts/{workout_id}', headers=auth_headers(auth_token)).get_json()
        ex = details['exercises'][0]
        res = client.patch(f'/api/workouts/{workout_id}', json={
            'exercises': [{
                'id': ex['id'], 'name': ex['name'],
                'exercise_template_id': template_id, 'exercise_type': 'cardio',
                'sets': [{'id': ex['sets'][0]['id'], 'cardio_duration': 35, 'distance': 5, 'distance_unit': 'km'}],
            }],
        }, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert get_best_5k_time(user_id, template_id) == 35.0

    def test_deleting_best_workout_falls_back_to_remaining(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        template_id, _ = self._setup(client, auth_token)  # 30 min 5K
        res = post_cardio_workout(client, auth_token, template_id, 25, 5, name='Fast Run')
        fast_id = res.get_json()['id']
        assert get_best_5k_time(user_id, template_id) == 25.0

        client.delete(f'/api/workouts/{fast_id}', headers=auth_headers(auth_token))
        assert get_best_5k_time(user_id, template_id) == 30.0

    def test_deleting_only_cardio_workout_removes_prs(self, client, auth_token, registered_user):
        from models import PersonalRecord
        user_id = registered_user['user']['id']
        template_id, workout_id = self._setup(client, auth_token)
        client.delete(f'/api/workouts/{workout_id}', headers=auth_headers(auth_token))
        assert PersonalRecord.query.filter_by(
            user_id=user_id, exercise_template_id=template_id).count() == 0


# ---------------------------------------------------------------------------
# Bodyweight (weight-0) sets: earn max_reps PRs only — never max_weight/1RM
# ---------------------------------------------------------------------------

def post_bodyweight_workout(client, token, template_id, reps_list, name='Pull Day'):
    payload = {
        'workoutName': name,
        'exercises': [{
            'name': 'Pull Up',
            'exercise_template_id': template_id,
            'sets': [{'reps': r, 'weight': 0} for r in reps_list],
        }],
    }
    return client.post('/api/workouts', json=payload, headers=auth_headers(token))


class TestBodyweightRepPrs:

    def _template(self, client, token):
        return create_template(client, token, name='Pull Up', muscle_group='Back')

    def test_creates_max_reps_pr_at_weight_zero(self, client, auth_token, registered_user):
        from models import PersonalRecord
        user_id = registered_user['user']['id']
        tid = self._template(client, auth_token)
        res = post_bodyweight_workout(client, auth_token, tid, [8, 12, 10])
        assert res.status_code == 201

        prs = PersonalRecord.query.filter_by(user_id=user_id, exercise_template_id=tid).all()
        assert {p.pr_type for p in prs} == {'max_reps'}
        rep_pr = prs[0]
        assert rep_pr.weight_context == 0.0
        assert rep_pr.value == 12

    def test_no_zero_weight_max_weight_or_1rm(self, client, auth_token):
        tid = self._template(client, auth_token)
        post_bodyweight_workout(client, auth_token, tid, [10])
        data = client.get(f'/api/personal-records/{tid}', headers=auth_headers(auth_token)).get_json()
        assert data['max_weight'] is None
        assert data['estimated_1rm'] is None
        assert data['per_weight_reps'] == [
            {'weight': 0.0, 'max_reps': 10.0, 'achieved_at': data['per_weight_reps'][0]['achieved_at']},
        ]

    def test_beating_reps_fires_new_pr(self, client, auth_token):
        tid = self._template(client, auth_token)
        post_bodyweight_workout(client, auth_token, tid, [10])
        res = post_bodyweight_workout(client, auth_token, tid, [13], name='Pull Day 2')
        new_prs = res.get_json()['new_prs']
        assert any(p['pr_type'] == 'max_reps' and p['value'] == 13 for p in new_prs)

    def test_fewer_reps_is_not_a_pr(self, client, auth_token):
        tid = self._template(client, auth_token)
        post_bodyweight_workout(client, auth_token, tid, [10])
        res = post_bodyweight_workout(client, auth_token, tid, [7], name='Pull Day 2')
        assert res.get_json()['new_prs'] == []

    def test_recompute_preserves_bodyweight_rep_pr(self, client, auth_token, registered_user):
        from models import PersonalRecord
        user_id = registered_user['user']['id']
        tid = self._template(client, auth_token)
        wid = post_bodyweight_workout(client, auth_token, tid, [11]).get_json()['id']

        # Rename triggers a full PR recompute
        res = client.patch(f'/api/workouts/{wid}', json={'workoutName': 'Renamed'},
                           headers=auth_headers(auth_token))
        assert res.status_code == 200

        prs = PersonalRecord.query.filter_by(user_id=user_id, exercise_template_id=tid).all()
        assert {p.pr_type for p in prs} == {'max_reps'}
        assert prs[0].weight_context == 0.0
        assert prs[0].value == 11

    def test_mixed_weighted_and_bodyweight_sets(self, client, auth_token):
        """Weighted sets on the same exercise still earn weight PRs alongside the rep PR."""
        tid = self._template(client, auth_token)
        payload = {
            'workoutName': 'Mixed',
            'exercises': [{
                'name': 'Pull Up', 'exercise_template_id': tid,
                'sets': [{'reps': 10, 'weight': 0}, {'reps': 5, 'weight': 45}],
            }],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = client.get(f'/api/personal-records/{tid}', headers=auth_headers(auth_token)).get_json()
        assert data['max_weight'] == 45.0
        weights = {e['weight'] for e in data['per_weight_reps']}
        assert weights == {0.0, 45.0}
