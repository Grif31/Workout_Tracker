"""
Tests for user routes:
  GET   /api/me
  PATCH /api/me
"""


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


# ---------------------------------------------------------------------------
# GET /api/me
# ---------------------------------------------------------------------------

class TestGetCurrentUser:

    def test_returns_user_profile(self, client, auth_token, registered_user):
        res = client.get('/api/me', headers=auth_headers(auth_token))
        assert res.status_code == 200
        data = res.get_json()
        assert data['email'] == 'test@example.com'
        assert data['username'] == 'testuser'

    def test_includes_workouts_list(self, client, auth_token):
        res = client.get('/api/me', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert 'workouts' in res.get_json()

    def test_workouts_empty_by_default(self, client, auth_token):
        res = client.get('/api/me', headers=auth_headers(auth_token))
        assert res.get_json()['workouts'] == []

    def test_requires_auth(self, client):
        res = client.get('/api/me')
        assert res.status_code == 401

    def test_workout_appears_in_workouts_list(self, client, auth_token):
        client.post('/api/workouts', json={
            'workoutName': 'Push Day', 'notes': '', 'duration': 45, 'exercises': []
        }, headers=auth_headers(auth_token))
        res = client.get('/api/me', headers=auth_headers(auth_token))
        workouts = res.get_json()['workouts']
        assert len(workouts) == 1
        assert workouts[0]['name'] == 'Push Day'


# ---------------------------------------------------------------------------
# PATCH /api/me
# ---------------------------------------------------------------------------

class TestUpdateUserInfo:

    def test_update_name(self, client, auth_token):
        res = client.patch('/api/me', json={'name': 'Griffin'}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['name'] == 'Griffin'

    def test_update_bio(self, client, auth_token):
        res = client.patch('/api/me', json={'bio': 'Lifting since 2020'}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['bio'] == 'Lifting since 2020'

    def test_update_weight_unit_to_kg(self, client, auth_token):
        res = client.patch('/api/me', json={'weight_unit': 'kg'}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['weight_unit'] == 'kg'

    def test_invalid_weight_unit_defaults_to_lbs(self, client, auth_token):
        res = client.patch('/api/me', json={'weight_unit': 'stones'}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['weight_unit'] == 'lbs'

    def test_update_bodyweight(self, client, auth_token):
        res = client.patch('/api/me', json={'bodyweight': 185.5}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['bodyweight'] == 185.5

    def test_update_height(self, client, auth_token):
        res = client.patch('/api/me', json={'height': 72.0}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['height'] == 72.0

    def test_blank_name_stored_as_none(self, client, auth_token):
        res = client.patch('/api/me', json={'name': '   '}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['name'] is None

    def test_update_profile_pic_url(self, client, auth_token):
        res = client.patch('/api/me', json={'profile_pic_url': 'https://example.com/pic.jpg'}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json()['profile_pic_url'] == 'https://example.com/pic.jpg'

    def test_partial_update_does_not_clear_other_fields(self, client, auth_token):
        client.patch('/api/me', json={'name': 'Griffin'}, headers=auth_headers(auth_token))
        client.patch('/api/me', json={'bio': 'Athlete'}, headers=auth_headers(auth_token))
        res = client.get('/api/me', headers=auth_headers(auth_token))
        data = res.get_json()
        assert data['name'] == 'Griffin'
        assert data['bio'] == 'Athlete'

    def test_requires_auth(self, client):
        res = client.patch('/api/me', json={'name': 'Hacker'})
        assert res.status_code == 401
