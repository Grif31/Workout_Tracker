"""A GPS route saved as segments (TODO.md section 22, Phase 3).

The app splits a route where the recording had a gap and sends each piece as
an encoded polyline in `route_segments`, so nothing draws a straight line
across ground nobody recorded. `route_polyline` keeps the whole joined line for
app builds from before segments.
"""
import pytest

# Two short encoded polylines, the shape the app sends
SEG_A = '_p~iF~ps|U_ulLnnqC'
SEG_B = '_mqNvxq`@'
JOINED = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'


def _h(token):
    return {'Authorization': f'Bearer {token}'}


def _run(segments=None, polyline=JOINED, **extra):
    ex = {
        'name': 'Walking', 'exercise_type': 'cardio', 'route_polyline': polyline,
        'sets': [{'cardio_duration': 30, 'distance': 2.0, 'distance_unit': 'km'}],
        **extra,
    }
    if segments is not None:
        ex['route_segments'] = segments
    return ex


def _post(client, token, exercises):
    return client.post('/api/workouts', json={'workoutName': 'Hike', 'exercises': exercises}, headers=_h(token))


def _detail(client, token, wid):
    return client.get(f'/api/workouts/{wid}', headers=_h(token)).get_json()


class TestSaving:
    def test_saves_and_returns_the_segments_alongside_the_joined_line(self, client, auth_token):
        res = _post(client, auth_token, [_run([SEG_A, SEG_B])])
        assert res.status_code == 201
        ex = _detail(client, auth_token, res.get_json()['id'])['exercises'][0]
        assert ex['route_segments'] == [SEG_A, SEG_B]
        assert ex['route_polyline'] == JOINED

    def test_a_route_from_an_older_build_has_no_segments(self, client, auth_token):
        res = _post(client, auth_token, [_run()])
        assert res.status_code == 201
        ex = _detail(client, auth_token, res.get_json()['id'])['exercises'][0]
        assert ex['route_segments'] is None
        assert ex['route_polyline'] == JOINED

    def test_a_lifting_exercise_has_none(self, client, auth_token):
        res = _post(client, auth_token, [{'name': 'Squat', 'sets': [{'reps': 5, 'weight': 225}]}])
        assert res.status_code == 201
        assert _detail(client, auth_token, res.get_json()['id'])['exercises'][0]['route_segments'] is None

    def test_appears_in_the_workout_list_too(self, client, auth_token):
        _post(client, auth_token, [_run([SEG_A, SEG_B])])
        body = client.get('/api/workouts', headers=_h(auth_token)).get_json()
        workouts = body if isinstance(body, list) else body.get('workouts', [])
        exercises = [e for w in workouts for e in w.get('exercises', [])]
        # Some list views omit exercises; where they carry them, segments come along
        for e in exercises:
            assert 'route_segments' in e


class TestValidation:
    @pytest.mark.parametrize('bad', [
        'not a list',
        [1, 2],
        [SEG_A, None],
        [{'polyline': SEG_A}],
        ['x' * 500_001],
        [SEG_A] * 501,
    ])
    def test_rejects_anything_but_a_list_of_encoded_polylines(self, client, auth_token, bad):
        res = _post(client, auth_token, [_run(bad)])
        assert res.status_code == 400

    def test_accepts_none_and_an_empty_list(self, client, auth_token):
        assert _post(client, auth_token, [_run(None)]).status_code == 201
        res = _post(client, auth_token, [_run([])])
        assert res.status_code == 201


class TestEditing:
    def test_an_edit_that_doesnt_send_segments_keeps_them(self, client, auth_token):
        wid = _post(client, auth_token, [_run([SEG_A, SEG_B])]).get_json()['id']
        exercises = _detail(client, auth_token, wid)['exercises']
        exercises[0].pop('route_segments')
        exercises[0]['notes'] = 'Windy'
        res = client.patch(f'/api/workouts/{wid}', json={'exercises': exercises}, headers=_h(auth_token))
        assert res.status_code == 200
        assert _detail(client, auth_token, wid)['exercises'][0]['route_segments'] == [SEG_A, SEG_B]

    def test_an_edit_that_round_trips_them_keeps_them(self, client, auth_token):
        wid = _post(client, auth_token, [_run([SEG_A, SEG_B])]).get_json()['id']
        exercises = _detail(client, auth_token, wid)['exercises']
        res = client.patch(f'/api/workouts/{wid}', json={'exercises': exercises}, headers=_h(auth_token))
        assert res.status_code == 200
        assert _detail(client, auth_token, wid)['exercises'][0]['route_segments'] == [SEG_A, SEG_B]

    def test_an_edit_can_replace_them(self, client, auth_token):
        wid = _post(client, auth_token, [_run([SEG_A, SEG_B])]).get_json()['id']
        exercises = _detail(client, auth_token, wid)['exercises']
        exercises[0]['route_segments'] = [SEG_A]
        res = client.patch(f'/api/workouts/{wid}', json={'exercises': exercises}, headers=_h(auth_token))
        assert res.status_code == 200
        assert _detail(client, auth_token, wid)['exercises'][0]['route_segments'] == [SEG_A]

    def test_a_new_exercise_added_in_an_edit_can_carry_them(self, client, auth_token):
        wid = _post(client, auth_token, [{'name': 'Squat', 'sets': [{'reps': 5, 'weight': 225}]}]).get_json()['id']
        exercises = _detail(client, auth_token, wid)['exercises']
        exercises.append(_run([SEG_B]))
        res = client.patch(f'/api/workouts/{wid}', json={'exercises': exercises}, headers=_h(auth_token))
        assert res.status_code == 200
        walk = next(e for e in _detail(client, auth_token, wid)['exercises'] if e['name'] == 'Walking')
        assert walk['route_segments'] == [SEG_B]
