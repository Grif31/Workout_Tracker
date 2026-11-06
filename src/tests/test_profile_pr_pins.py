"""
Profile's displayed PRs:
  GET/PUT /api/personal-records/pins
  previous_value on GET /api/personal-records
"""
from models import db, ProfilePRPin, ExerciseTemplate
from tests.test_personal_record_routes import auth_headers, create_template


def post_bench(client, token, template_id, sets):
    return client.post('/api/workouts', json={
        'workoutName': 'Bench Day', 'notes': '', 'duration': 45,
        'exercises': [{'name': 'Bench Press', 'exercise_template_id': template_id, 'sets': sets}],
    }, headers=auth_headers(token))


def get_pins(client, token):
    res = client.get('/api/personal-records/pins', headers=auth_headers(token))
    assert res.status_code == 200
    return res.get_json()


def put_pins(client, token, pins):
    return client.put('/api/personal-records/pins', json={'pins': pins}, headers=auth_headers(token))


class TestProfilePins:

    def test_not_saved_until_chosen(self, client, auth_token):
        assert get_pins(client, auth_token) == {'message': 'ok', 'saved': False, 'pins': []}

    def test_saves_in_order_and_reads_back(self, client, auth_token):
        bench = create_template(client, auth_token)
        squat = create_template(client, auth_token, name='Squat', muscle_group='Legs')
        post_bench(client, auth_token, bench, [{'reps': 5, 'weight': 225}])
        client.post('/api/workouts', json={
            'workoutName': 'Legs', 'notes': '', 'duration': 45,
            'exercises': [{'name': 'Squat', 'exercise_template_id': squat, 'sets': [{'reps': 5, 'weight': 315}]}],
        }, headers=auth_headers(auth_token))

        res = put_pins(client, auth_token, [
            {'exercise_template_id': squat, 'pr_type': 'max_weight'},
            {'exercise_template_id': bench, 'pr_type': 'max_reps', 'weight_context': 225},
        ])
        assert res.status_code == 200
        body = get_pins(client, auth_token)
        assert body['saved'] is True
        assert body['pins'] == [
            {'exercise_template_id': squat, 'pr_type': 'max_weight', 'weight_context': None},
            {'exercise_template_id': bench, 'pr_type': 'max_reps', 'weight_context': 225},
        ]

    def test_choosing_none_is_remembered(self, client, auth_token):
        assert put_pins(client, auth_token, []).status_code == 200
        assert get_pins(client, auth_token) == {'message': 'ok', 'saved': True, 'pins': []}

    def test_leaves_out_a_pin_whose_pr_is_gone(self, client, auth_token):
        bench = create_template(client, auth_token)
        workout_id = post_bench(client, auth_token, bench, [{'reps': 5, 'weight': 225}]).get_json()['id']
        put_pins(client, auth_token, [{'exercise_template_id': bench, 'pr_type': 'max_weight'}])
        client.delete(f'/api/workouts/{workout_id}', headers=auth_headers(auth_token))
        assert get_pins(client, auth_token)['pins'] == []

    def test_rejects_more_than_three(self, client, auth_token):
        bench = create_template(client, auth_token)
        pins = [{'exercise_template_id': bench, 'pr_type': 'max_reps', 'weight_context': w} for w in (1, 2, 3, 4)]
        assert put_pins(client, auth_token, pins).status_code == 400

    def test_rejects_duplicates(self, client, auth_token):
        bench = create_template(client, auth_token)
        pin = {'exercise_template_id': bench, 'pr_type': 'max_weight'}
        assert put_pins(client, auth_token, [pin, pin]).status_code == 400

    def test_rejects_estimated_1rm(self, client, auth_token):
        bench = create_template(client, auth_token)
        assert put_pins(client, auth_token, [{'exercise_template_id': bench, 'pr_type': 'estimated_1rm'}]).status_code == 400

    def test_rejects_another_users_custom_exercise(self, client, auth_token, auth_token2):
        theirs = create_template(client, auth_token2, name='Secret Lift')
        assert db.session.get(ExerciseTemplate, theirs).user_id is not None
        res = put_pins(client, auth_token, [{'exercise_template_id': theirs, 'pr_type': 'max_weight'}])
        assert res.status_code == 400
        assert ProfilePRPin.query.count() == 0

    def test_a_bad_second_pin_is_a_400(self, client, auth_token):
        bench = create_template(client, auth_token)
        res = put_pins(client, auth_token, [
            {'exercise_template_id': bench, 'pr_type': 'max_weight'},
            {'exercise_template_id': bench, 'pr_type': 'nope'},
        ])
        assert res.status_code == 400

    def test_pins_are_per_user(self, client, auth_token, auth_token2):
        bench = create_template(client, auth_token)
        put_pins(client, auth_token, [{'exercise_template_id': bench, 'pr_type': 'max_weight'}])
        assert get_pins(client, auth_token2)['saved'] is False

    def test_unit_switch_converts_a_max_reps_pin(self, client, auth_token):
        bench = create_template(client, auth_token)
        post_bench(client, auth_token, bench, [{'reps': 8, 'weight': 100}])
        put_pins(client, auth_token, [
            {'exercise_template_id': bench, 'pr_type': 'max_reps', 'weight_context': 100},
            {'exercise_template_id': bench, 'pr_type': 'max_weight'},
        ])
        client.patch('/api/me', json={'weight_unit': 'kg'}, headers=auth_headers(auth_token))

        pins = get_pins(client, auth_token)['pins']
        record = next(r for r in client.get('/api/personal-records', headers=auth_headers(auth_token)).get_json()
                      if r['pr_type'] == 'max_reps')
        assert pins[0]['weight_context'] == record['weight_context'] == 45.5
        assert pins[1]['weight_context'] is None


class TestPreviousValue:

    def test_first_pr_has_none(self, client, auth_token):
        bench = create_template(client, auth_token)
        post_bench(client, auth_token, bench, [{'reps': 5, 'weight': 225}])
        records = client.get('/api/personal-records', headers=auth_headers(auth_token)).get_json()
        max_weight = next(r for r in records if r['pr_type'] == 'max_weight')
        assert max_weight['previous_value'] is None

    def test_beaten_pr_carries_the_value_it_beat(self, client, auth_token):
        bench = create_template(client, auth_token)
        post_bench(client, auth_token, bench, [{'reps': 5, 'weight': 225}])
        post_bench(client, auth_token, bench, [{'reps': 5, 'weight': 235}])
        records = client.get('/api/personal-records', headers=auth_headers(auth_token)).get_json()
        max_weight = next(r for r in records if r['pr_type'] == 'max_weight')
        assert (max_weight['value'], max_weight['previous_value']) == (235, 225)
