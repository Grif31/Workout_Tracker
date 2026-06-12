"""
Tests for user routes:
  GET    /api/me
  PATCH  /api/me
  DELETE /api/me
"""
import pytest


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

    def test_invalid_weight_unit_rejected(self, client, auth_token):
        res = client.patch('/api/me', json={'weight_unit': 'stones'}, headers=auth_headers(auth_token))
        assert res.status_code == 400
        assert 'message' in res.get_json()

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


# ---------------------------------------------------------------------------
# DELETE /api/me
# ---------------------------------------------------------------------------

def _build_full_account(client, token):
    """Create one of every user-owned record type via the API.
    Returns the custom exercise template id."""
    h = auth_headers(token)
    res = client.post('/api/exercises', json={
        'name': 'Custom Press', 'equipment': 'Barbell', 'muscle_group': 'Chest',
    }, headers=h)
    assert res.status_code == 201
    ex_id = res.get_json()['id']

    res = client.post('/api/workouts', json={
        'workoutName': 'Push Day',
        'exercises': [{
            'name': 'Custom Press', 'exercise_template_id': ex_id,
            'sets': [{'reps': 8, 'weight': 100}, {'reps': 5, 'weight': 120}],
        }],
    }, headers=h)
    assert res.status_code == 201

    res = client.post('/api/workout-templates', json={
        'name': 'Push Template', 'exercise_template_ids': [ex_id],
    }, headers=h)
    assert res.status_code == 201
    template_id = res.get_json()['id']

    res = client.post('/api/routines', json={
        'name': 'My Routine',
        'days': [{'label': 'Day 1', 'workout_template_id': template_id}],
    }, headers=h)
    assert res.status_code == 201
    routine_id = res.get_json()['id']
    client.post(f'/api/routines/{routine_id}/activate', headers=h)

    client.post('/api/bodyweight', json={'weight': 180}, headers=h)
    client.post('/api/measurements', json={'waist': 32}, headers=h)
    client.post('/api/me/device-token', json={'token': 'ExponentPushToken[x]', 'platform': 'ios'}, headers=h)
    return ex_id


class TestDeleteAccount:

    def test_requires_auth(self, client):
        res = client.delete('/api/me')
        assert res.status_code == 401

    def test_delete_user_with_full_data_succeeds(self, client, auth_token, registered_user):
        _build_full_account(client, auth_token)
        res = client.delete('/api/me', headers=auth_headers(auth_token))
        assert res.status_code == 200

    def test_login_fails_after_delete(self, client, auth_token):
        _build_full_account(client, auth_token)
        client.delete('/api/me', headers=auth_headers(auth_token))
        res = client.post('/api/login', json={
            'email': 'test@example.com', 'password': 'password123',
        })
        assert res.status_code == 401

    def test_all_owned_rows_removed(self, client, auth_token, registered_user):
        from models import (
            User, Workout, Exercise, Set, PersonalRecord, DeviceToken,
            BodyweightLog, BodyMeasurement, Routine, RoutineDay,
            WorkoutTemplate, WorkoutTemplateExercise, ExerciseTemplate,
            ExerciseMuscleMapping,
        )
        user_id = registered_user['user']['id']
        ex_id = _build_full_account(client, auth_token)
        # Sanity: PRs were created from the workout
        assert PersonalRecord.query.filter_by(user_id=user_id).count() > 0

        res = client.delete('/api/me', headers=auth_headers(auth_token))
        assert res.status_code == 200

        assert User.query.get(user_id) is None
        assert Workout.query.filter_by(user_id=user_id).count() == 0
        assert Exercise.query.count() == 0
        assert Set.query.count() == 0
        assert PersonalRecord.query.filter_by(user_id=user_id).count() == 0
        assert DeviceToken.query.filter_by(user_id=user_id).count() == 0
        assert BodyweightLog.query.filter_by(user_id=user_id).count() == 0
        assert BodyMeasurement.query.filter_by(user_id=user_id).count() == 0
        assert Routine.query.filter_by(user_id=user_id).count() == 0
        assert RoutineDay.query.count() == 0
        assert WorkoutTemplate.query.filter_by(user_id=user_id).count() == 0
        assert WorkoutTemplateExercise.query.count() == 0
        assert ExerciseTemplate.query.get(ex_id) is None
        assert ExerciseMuscleMapping.query.filter_by(exercise_template_id=ex_id).count() == 0

    def test_other_users_data_untouched(self, client, auth_token, auth_token2):
        _build_full_account(client, auth_token)
        h2 = auth_headers(auth_token2)
        client.post('/api/workouts', json={
            'workoutName': 'User2 Day',
            'exercises': [{'name': 'Squat', 'sets': [{'reps': 5, 'weight': 200}]}],
        }, headers=h2)

        client.delete('/api/me', headers=auth_headers(auth_token))

        res = client.get('/api/workouts', headers=h2)
        workouts = res.get_json()
        assert len(workouts) == 1
        assert workouts[0]['name'] == 'User2 Day'


# ---------------------------------------------------------------------------
# PATCH /api/me — weight unit switch converts stored data
# ---------------------------------------------------------------------------

def _setup_lbs_user_with_data(client, token):
    """lbs user with one workout (100 lb x8, 120 lb x5) and a 200 lb bodyweight log."""
    h = auth_headers(token)
    res = client.post('/api/exercises', json={
        'name': 'Bench X', 'equipment': 'Barbell', 'muscle_group': 'Chest',
    }, headers=h)
    ex_id = res.get_json()['id']
    client.post('/api/workouts', json={
        'workoutName': 'W',
        'exercises': [{
            'name': 'Bench X', 'exercise_template_id': ex_id,
            'sets': [{'reps': 8, 'weight': 100}, {'reps': 5, 'weight': 120}],
        }],
    }, headers=h)
    client.post('/api/bodyweight', json={'weight': 200}, headers=h)
    return ex_id


class TestWeightUnitConversion:

    def _set_weights(self, client, token):
        res = client.get('/api/workouts?include_exercises=true', headers=auth_headers(token))
        sets = res.get_json()[0]['exercises'][0]['sets']
        return sorted(s['weight'] for s in sets)

    def test_switch_to_kg_converts_set_weights(self, client, auth_token):
        _setup_lbs_user_with_data(client, auth_token)
        res = client.patch('/api/me', json={'weight_unit': 'kg'}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        weights = self._set_weights(client, auth_token)
        assert weights[0] == pytest.approx(45.36, abs=0.01)
        assert weights[1] == pytest.approx(54.43, abs=0.01)

    def test_switch_to_kg_converts_prs(self, client, auth_token, registered_user):
        from models import PersonalRecord
        user_id = registered_user['user']['id']
        _setup_lbs_user_with_data(client, auth_token)
        client.patch('/api/me', json={'weight_unit': 'kg'}, headers=auth_headers(auth_token))

        max_weight = PersonalRecord.query.filter_by(user_id=user_id, pr_type='max_weight').first()
        assert max_weight.value == pytest.approx(120 * 0.453592, abs=0.01)
        est_1rm = PersonalRecord.query.filter_by(user_id=user_id, pr_type='estimated_1rm').first()
        assert est_1rm.value == pytest.approx(120 * (1 + 5 / 30) * 0.453592, abs=0.1)
        max_reps = PersonalRecord.query.filter_by(user_id=user_id, pr_type='max_reps')\
            .order_by(PersonalRecord.weight_context).first()
        assert max_reps.weight_context == pytest.approx(45.36, abs=0.01)
        assert max_reps.value == 8  # reps are not weights — must not be scaled

    def test_switch_to_kg_converts_bodyweight_and_logs(self, client, auth_token):
        _setup_lbs_user_with_data(client, auth_token)
        client.patch('/api/me', json={'weight_unit': 'kg'}, headers=auth_headers(auth_token))
        me = client.get('/api/me', headers=auth_headers(auth_token)).get_json()
        assert me['bodyweight'] == pytest.approx(90.72, abs=0.01)
        logs = client.get('/api/bodyweight', headers=auth_headers(auth_token)).get_json()
        assert logs[0]['weight'] == pytest.approx(90.72, abs=0.01)

    def test_round_trip_restores_values(self, client, auth_token):
        _setup_lbs_user_with_data(client, auth_token)
        client.patch('/api/me', json={'weight_unit': 'kg'}, headers=auth_headers(auth_token))
        client.patch('/api/me', json={'weight_unit': 'lbs'}, headers=auth_headers(auth_token))
        weights = self._set_weights(client, auth_token)
        assert weights[0] == pytest.approx(100, abs=0.01)
        assert weights[1] == pytest.approx(120, abs=0.01)

    def test_same_unit_patch_is_noop(self, client, auth_token):
        _setup_lbs_user_with_data(client, auth_token)
        client.patch('/api/me', json={'weight_unit': 'lbs'}, headers=auth_headers(auth_token))
        assert self._set_weights(client, auth_token) == [100, 120]

    def test_bodyweight_in_same_patch_not_double_converted(self, client, auth_token):
        _setup_lbs_user_with_data(client, auth_token)
        res = client.patch('/api/me', json={'weight_unit': 'kg', 'bodyweight': 90},
                           headers=auth_headers(auth_token))
        assert res.get_json()['bodyweight'] == 90

    def test_total_volume_stat_unchanged_after_switch(self, client, auth_token):
        _setup_lbs_user_with_data(client, auth_token)
        before = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()['total_volume']
        client.patch('/api/me', json={'weight_unit': 'kg'}, headers=auth_headers(auth_token))
        after = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()['total_volume']
        assert after == pytest.approx(before, abs=1)
