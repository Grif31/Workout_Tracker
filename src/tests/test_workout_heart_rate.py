"""
Heart rate on workouts (Apple Health / Health Connect).

avg/max bpm are written by the phone after a workout saves. They are
nullable on purpose: "no wearable" must stay distinguishable from a
measured value, so these tests pin down that None round-trips as None
rather than collapsing to 0.
"""
from tests.test_workout_routes import WORKOUT_PAYLOAD, create_workout


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_workout_without_heart_rate_stores_null(client, auth_token):
    res = create_workout(client, auth_token)
    assert res.status_code == 201, res.get_json()
    body = res.get_json()

    got = client.get(f"/api/workouts/{body['id']}", headers=_auth(auth_token)).get_json()
    assert got['avg_heart_rate'] is None
    assert got['max_heart_rate'] is None


def test_heart_rate_round_trips_on_create(client, auth_token):
    payload = {**WORKOUT_PAYLOAD, 'avg_heart_rate': 132, 'max_heart_rate': 171}
    res = create_workout(client, auth_token, payload)
    assert res.status_code == 201, res.get_json()

    got = client.get(f"/api/workouts/{res.get_json()['id']}", headers=_auth(auth_token)).get_json()
    assert got['avg_heart_rate'] == 132
    assert got['max_heart_rate'] == 171


def test_patch_sets_and_clears_heart_rate(client, auth_token):
    wid = create_workout(client, auth_token).get_json()['id']

    res = client.patch(f'/api/workouts/{wid}',
                       json={'avg_heart_rate': 120, 'max_heart_rate': 160},
                       headers=_auth(auth_token))
    assert res.status_code == 200, res.get_json()
    got = client.get(f'/api/workouts/{wid}', headers=_auth(auth_token)).get_json()
    assert (got['avg_heart_rate'], got['max_heart_rate']) == (120, 160)

    # Explicit null clears it -- the user edited a run whose trace was wrong.
    res = client.patch(f'/api/workouts/{wid}',
                       json={'avg_heart_rate': None, 'max_heart_rate': None},
                       headers=_auth(auth_token))
    assert res.status_code == 200, res.get_json()
    got = client.get(f'/api/workouts/{wid}', headers=_auth(auth_token)).get_json()
    assert got['avg_heart_rate'] is None
    assert got['max_heart_rate'] is None


def test_patch_without_heart_rate_leaves_it_untouched(client, auth_token):
    """PATCH semantics: an omitted field must not be wiped."""
    payload = {**WORKOUT_PAYLOAD, 'avg_heart_rate': 140, 'max_heart_rate': 180}
    wid = create_workout(client, auth_token, payload).get_json()['id']

    res = client.patch(f'/api/workouts/{wid}', json={'notes': 'edited'}, headers=_auth(auth_token))
    assert res.status_code == 200, res.get_json()

    got = client.get(f'/api/workouts/{wid}', headers=_auth(auth_token)).get_json()
    assert got['avg_heart_rate'] == 140
    assert got['max_heart_rate'] == 180


def test_implausible_heart_rate_is_rejected(client, auth_token):
    for bad in (0, 19, 261, 900):
        payload = {**WORKOUT_PAYLOAD, 'avg_heart_rate': bad}
        res = create_workout(client, auth_token, payload)
        assert res.status_code == 400, f'{bad} bpm should be rejected, got {res.status_code}'
