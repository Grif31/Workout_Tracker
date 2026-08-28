"""
Tests for workout routes:
  GET    /api/workouts
  GET    /api/workouts/recent
  GET    /api/workouts/<id>
  POST   /api/workouts
  DELETE /api/workouts/<id>
  PATCH  /api/workouts/<id>
"""
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

WORKOUT_PAYLOAD = {
    'workoutName': 'Leg Day',
    'notes': 'Felt strong',
    'duration': 60,
    'exercises': [
        {
            'name': 'Squat',
            'sets': [
                {'reps': 5, 'weight': 225},
                {'reps': 5, 'weight': 235},
            ],
        },
        {
            'name': 'Leg Press',
            'sets': [
                {'reps': 10, 'weight': 180},
            ],
        },
    ],
}


def create_workout(client, token, payload=None):
    """Helper: POST a workout and return the response."""
    return client.post(
        '/api/workouts',
        json=payload or WORKOUT_PAYLOAD,
        headers={'Authorization': f'Bearer {token}'},
    )


def get_workout_id(client, token):
    """Helper: return the id of the first existing workout (assumes one has already been created)."""
    res = client.get('/api/workouts', headers={'Authorization': f'Bearer {token}'})
    return res.get_json()[0]['id']


# ---------------------------------------------------------------------------
# GET /api/workouts
# ---------------------------------------------------------------------------

class TestGetWorkouts:

    def test_returns_empty_list_when_no_workouts(self, client, auth_token):
        res = client.get('/api/workouts', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_workouts_for_user(self, client, auth_token):
        create_workout(client, auth_token)
        res = client.get('/api/workouts', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['name'] == 'Leg Day'

    def test_requires_auth(self, client):
        res = client.get('/api/workouts')
        assert res.status_code == 401

    def test_only_returns_own_workouts(self, client, auth_token):
        # Create a second user
        client.post('/api/signup', json={
            'username': 'otheruser', 'email': 'other@example.com', 'password': 'pass123'
        })
        other_login = client.post('/api/login', json={
            'email': 'other@example.com', 'password': 'pass123'
        })
        other_token = other_login.get_json()['access_token']

        # Each user creates a workout
        create_workout(client, auth_token)
        create_workout(client, other_token, {**WORKOUT_PAYLOAD, 'workoutName': 'Other Push Day'})

        # Each user should only see their own
        res = client.get('/api/workouts', headers={'Authorization': f'Bearer {auth_token}'})
        assert len(res.get_json()) == 1
        assert res.get_json()[0]['name'] == 'Leg Day'

        res2 = client.get('/api/workouts', headers={'Authorization': f'Bearer {other_token}'})
        assert len(res2.get_json()) == 1
        assert res2.get_json()[0]['name'] == 'Other Push Day'


# ---------------------------------------------------------------------------
# GET /api/workouts/recent
# ---------------------------------------------------------------------------

class TestGetRecentWorkouts:

    def test_returns_at_most_5(self, client, auth_token):
        for i in range(7):
            create_workout(client, auth_token, {**WORKOUT_PAYLOAD, 'workoutName': f'Workout {i}'})

        res = client.get('/api/workouts/recent', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert len(res.get_json()) <= 5

    def test_returns_empty_when_no_workouts(self, client, auth_token):
        res = client.get('/api/workouts/recent', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json() == []

    def test_requires_auth(self, client):
        res = client.get('/api/workouts/recent')
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/workouts/<id>
# ---------------------------------------------------------------------------

class TestGetWorkoutDetails:

    def test_returns_workout_with_exercises(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)

        res = client.get(
            f'/api/workouts/{workout_id}',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data['name'] == 'Leg Day'
        assert 'exercises' in data
        assert len(data['exercises']) == 2
        assert data['exercises'][0]['name'] == 'Squat'
        assert len(data['exercises'][0]['sets']) == 2

    def test_requires_auth(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)
        res = client.get(f'/api/workouts/{workout_id}')
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/workouts
# ---------------------------------------------------------------------------

class TestCreateWorkout:

    def test_create_workout_success(self, client, auth_token):
        res = create_workout(client, auth_token)
        assert res.status_code == 201
        assert 'message' in res.get_json()

    def test_create_workout_missing_name(self, client, auth_token):
        payload = {**WORKOUT_PAYLOAD, 'workoutName': ''}
        res = create_workout(client, auth_token, payload)
        assert res.status_code == 400

    def test_create_workout_calculates_volume(self, client, auth_token):
        # Volume = (5*225) + (5*235) + (10*180) = 1125 + 1175 + 1800 = 4100
        create_workout(client, auth_token)
        res = client.get('/api/workouts', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.get_json()[0]['volume'] == 4100.0

    def test_create_workout_stores_exercises_and_sets(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)
        res = client.get(
            f'/api/workouts/{workout_id}',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        data = res.get_json()
        squat = next(e for e in data['exercises'] if e['name'] == 'Squat')
        assert len(squat['sets']) == 2
        assert squat['sets'][0]['reps'] == 5
        assert squat['sets'][0]['weight'] == 225.0

    def test_create_workout_without_exercises(self, client, auth_token):
        res = create_workout(client, auth_token, {'workoutName': 'Rest Day', 'exercises': []})
        assert res.status_code == 201

    def test_requires_auth(self, client):
        res = client.post('/api/workouts', json=WORKOUT_PAYLOAD)
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/workouts -- whole-workout PRs (is_best_volume / is_best_reps)
# ---------------------------------------------------------------------------

class TestWorkoutRecords:

    def test_first_workout_sets_both_records(self, client, auth_token):
        # Nothing to beat yet -- any first workout is trivially a record.
        res = create_workout(client, auth_token)
        data = res.get_json()
        assert data['is_best_volume'] is True
        assert data['is_best_reps'] is True

    def test_smaller_second_workout_is_not_a_record(self, client, auth_token):
        create_workout(client, auth_token)  # volume 4100, reps 20
        smaller = {
            'workoutName': 'Light Day',
            'exercises': [{'name': 'Curl', 'sets': [{'reps': 8, 'weight': 20}]}],
        }
        res = create_workout(client, auth_token, smaller)
        data = res.get_json()
        assert data['is_best_volume'] is False
        assert data['is_best_reps'] is False

    def test_records_are_independent_per_metric(self, client, auth_token):
        create_workout(client, auth_token)  # volume 4100, reps 20
        # Two heavy singles: volume 6000 (beats 4100) but only 2 reps (doesn't beat 20).
        heavy_low_reps = {
            'workoutName': 'Heavy Day',
            'exercises': [{'name': 'Deadlift', 'sets': [
                {'reps': 1, 'weight': 3000},
                {'reps': 1, 'weight': 3000},
            ]}],
        }
        res = create_workout(client, auth_token, heavy_low_reps)
        data = res.get_json()
        assert data['is_best_volume'] is True
        assert data['is_best_reps'] is False

    def test_zero_volume_or_reps_never_counts_as_a_record(self, client, auth_token):
        res = create_workout(client, auth_token, {'workoutName': 'Rest Day', 'exercises': []})
        data = res.get_json()
        assert data['is_best_volume'] is False
        assert data['is_best_reps'] is False


# ---------------------------------------------------------------------------
# DELETE /api/workouts/<id>
# ---------------------------------------------------------------------------

class TestDeleteWorkout:

    def test_delete_workout_success(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)

        res = client.delete(
            f'/api/workouts/{workout_id}',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 200

        # Confirm it's gone
        remaining = client.get('/api/workouts', headers={'Authorization': f'Bearer {auth_token}'})
        assert remaining.get_json() == []

    def test_requires_auth(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)
        res = client.delete(f'/api/workouts/{workout_id}')
        assert res.status_code == 401

    def test_cannot_delete_another_users_workout(self, client, auth_token):
        # Create workout as primary user
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)

        # Second user tries to delete it
        client.post('/api/signup', json={
            'username': 'otheruser', 'email': 'other@example.com', 'password': 'pass123'
        })
        other_login = client.post('/api/login', json={
            'email': 'other@example.com', 'password': 'pass123'
        })
        other_token = other_login.get_json()['access_token']

        # The delete should not remove the original user's workout
        client.delete(
            f'/api/workouts/{workout_id}',
            headers={'Authorization': f'Bearer {other_token}'},
        )
        remaining = client.get('/api/workouts', headers={'Authorization': f'Bearer {auth_token}'})
        assert len(remaining.get_json()) == 1


# ---------------------------------------------------------------------------
# PATCH /api/workouts/<id>
# ---------------------------------------------------------------------------

class TestUpdateWorkout:

    def test_update_name(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)

        res = client.patch(
            f'/api/workouts/{workout_id}',
            json={'workoutName': 'Updated Name'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 200
        assert res.get_json()['name'] == 'Updated Name'

    def test_update_notes(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)

        res = client.patch(
            f'/api/workouts/{workout_id}',
            json={'notes': 'Updated notes'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 200
        assert res.get_json()['notes'] == 'Updated notes'

    def test_update_recalculates_volume(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)

        # Replace all exercises with a single set
        res = client.patch(
            f'/api/workouts/{workout_id}',
            json={
                'exercises': [
                    {'name': 'Deadlift', 'sets': [{'reps': 3, 'weight': 315}]}
                ]
            },
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 200
        # Volume = 3 * 315 = 945
        assert res.get_json()['volume'] == 945.0

    def test_update_invalid_date_format(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)

        res = client.patch(
            f'/api/workouts/{workout_id}',
            json={'date': 'not-a-date'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 400

    def test_update_nonexistent_workout(self, client, auth_token):
        res = client.patch(
            '/api/workouts/99999',
            json={'name': 'Ghost'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 404

    def test_requires_auth(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)
        res = client.patch(f'/api/workouts/{workout_id}', json={'name': 'No auth'})
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# Bodyweight-aware volume (Bodyweight / Weighted equipment)
# ---------------------------------------------------------------------------

def create_template(client, token, name, equipment):
    res = client.post(
        '/api/exercises',
        json={'name': name, 'muscle_group': 'Back', 'equipment': equipment},
        headers={'Authorization': f'Bearer {token}'},
    )
    return res.get_json()['id']


def log_bodyweight(client, token, weight, date_str):
    return client.post(
        '/api/bodyweight',
        json={'weight': weight, 'date': date_str},
        headers={'Authorization': f'Bearer {token}'},
    )


class TestBodyweightVolume:

    def test_bodyweight_exercise_volume_includes_bodyweight(self, client, auth_token):
        log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = create_template(client, auth_token, 'Pull Up', 'Bodyweight')
        res = create_workout(client, auth_token, {
            'workoutName': 'Pull Day',
            'exercises': [{
                'name': 'Pull Up',
                'exercise_template_id': tid,
                'sets': [{'reps': 10, 'weight': 0}],
            }],
        })
        assert res.status_code == 201
        # 10 reps * 180 lbs bodyweight = 1800
        assert res.get_json()['total_volume'] == 1800

        workout_id = res.get_json()['id']
        detail = client.get(f'/api/workouts/{workout_id}', headers={'Authorization': f'Bearer {auth_token}'})
        assert detail.get_json()['volume'] == 1800.0

        recent = client.get('/api/workouts/recent', headers={'Authorization': f'Bearer {auth_token}'})
        assert recent.get_json()[0]['volume'] == 1800.0

    def test_weighted_exercise_volume_includes_bodyweight_plus_added_weight(self, client, auth_token):
        log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = create_template(client, auth_token, 'Pull Up', 'Weighted')
        res = create_workout(client, auth_token, {
            'workoutName': 'Pull Day',
            'exercises': [{
                'name': 'Pull Up',
                'exercise_template_id': tid,
                'sets': [{'reps': 5, 'weight': 25}],
            }],
        })
        # 5 reps * (25 added + 180 bodyweight) = 1025
        assert res.get_json()['total_volume'] == 1025

    def test_non_bodyweight_equipment_unaffected_by_bodyweight(self, client, auth_token):
        log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = create_template(client, auth_token, 'Bench Press', 'Barbell')
        res = create_workout(client, auth_token, {
            'workoutName': 'Push Day',
            'exercises': [{
                'name': 'Bench Press',
                'exercise_template_id': tid,
                'sets': [{'reps': 5, 'weight': 135}],
            }],
        })
        # 5 * 135 = 675 -- bodyweight must not leak into ordinary equipment
        assert res.get_json()['total_volume'] == 675

    def test_no_bodyweight_ever_logged_is_graceful_noop(self, client, auth_token):
        tid = create_template(client, auth_token, 'Pull Up', 'Bodyweight')
        res = create_workout(client, auth_token, {
            'workoutName': 'Pull Day',
            'exercises': [{
                'name': 'Pull Up',
                'exercise_template_id': tid,
                'sets': [{'reps': 10, 'weight': 0}],
            }],
        })
        assert res.status_code == 201
        # No bodyweight logged -- falls back to raw stored weight (0), no crash.
        assert res.get_json()['total_volume'] == 0

    def test_update_uses_bodyweight_at_workout_date_not_current(self, client, auth_token):
        tid = create_template(client, auth_token, 'Pull Up', 'Bodyweight')
        # Old bodyweight near the workout's date, newer/different "current" bodyweight logged after.
        log_bodyweight(client, auth_token, 170, '2026-01-01')
        create = create_workout(client, auth_token, {
            'workoutName': 'Pull Day',
            'date': '2026-01-02',
            'exercises': [{
                'name': 'Pull Up',
                'exercise_template_id': tid,
                'sets': [{'reps': 10, 'weight': 0}],
            }],
        })
        workout_id = create.get_json()['id']
        log_bodyweight(client, auth_token, 200, '2026-06-01')

        # Edit the past workout (e.g. tweak notes) -- volume recompute should
        # still use the bodyweight logged near 2026-01-02, not the newer 200.
        res = client.patch(
            f'/api/workouts/{workout_id}',
            json={'notes': 'edited'},
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 200
        assert res.get_json()['volume'] == 1700.0  # 10 * 170, not 10 * 200

    def test_export_csv_includes_bodyweight_in_volume_column(self, client, auth_token):
        log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = create_template(client, auth_token, 'Pull Up', 'Bodyweight')
        create_workout(client, auth_token, {
            'workoutName': 'Pull Day',
            'exercises': [{
                'name': 'Pull Up',
                'exercise_template_id': tid,
                'sets': [{'reps': 10, 'weight': 0}],
            }],
        })
        res = client.get('/api/workouts/export', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert '1800' in res.get_data(as_text=True)
