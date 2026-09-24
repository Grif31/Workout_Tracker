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
from datetime import datetime


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
# GET /api/workouts/dates
# ---------------------------------------------------------------------------

class TestGetWorkoutDates:

    def _dates(self, client, token):
        res = client.get('/api/workouts/dates', headers={'Authorization': f'Bearer {token}'})
        assert res.status_code == 200
        return res.get_json()['dates']

    def test_requires_auth(self, client):
        assert client.get('/api/workouts/dates').status_code == 401

    def test_empty_when_no_workouts(self, client, auth_token):
        assert self._dates(client, auth_token) == []

    def test_returns_iso_date_strings_sorted_ascending(self, client, auth_token):
        for d in ('2024-03-10', '2024-01-05', '2024-02-20'):
            create_workout(client, auth_token, {**WORKOUT_PAYLOAD, 'date': d})
        assert self._dates(client, auth_token) == ['2024-01-05', '2024-02-20', '2024-03-10']

    def test_same_day_workouts_collapse_to_one_entry(self, client, auth_token):
        create_workout(client, auth_token, {**WORKOUT_PAYLOAD, 'workoutName': 'AM', 'date': '2024-05-01'})
        create_workout(client, auth_token, {**WORKOUT_PAYLOAD, 'workoutName': 'PM', 'date': '2024-05-01'})
        assert self._dates(client, auth_token) == ['2024-05-01']

    def test_scoped_to_current_user(self, client, auth_token, auth_token2):
        create_workout(client, auth_token, {**WORKOUT_PAYLOAD, 'date': '2024-06-01'})
        assert self._dates(client, auth_token2) == []


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

    def test_exercise_carries_template_display_fields(self, client, auth_token, app):
        """Perform Again / Edit rebuild a WorkoutLog prefill straight from this
        payload, so it has to carry everything the log screen shows -- the GIF
        included."""
        from models import db, ExerciseTemplate, ExerciseMuscleMapping
        with app.app_context():
            tmpl = ExerciseTemplate(
                name='Push-Up', equipment='Bodyweight',
                image_url='/media/push-up.gif', bodyweight_load_factor=0.6,
            )
            db.session.add(tmpl)
            db.session.commit()
            # muscle_group is derived from the mapping join table, not a column
            db.session.add(ExerciseMuscleMapping(
                exercise_template_id=tmpl.id, muscle_group='Chest', is_primary=True,
            ))
            db.session.commit()
            tmpl_id = tmpl.id

        create_workout(client, auth_token, {
            'workoutName': 'Push Day',
            'exercises': [{
                'name': 'Push-Up',
                'exercise_template_id': tmpl_id,
                'sets': [{'reps': 20, 'weight': 0}],
            }],
        })
        workout_id = get_workout_id(client, auth_token)

        res = client.get(
            f'/api/workouts/{workout_id}',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.status_code == 200
        ex = res.get_json()['exercises'][0]
        assert ex['image_url'] == '/media/push-up.gif'
        assert ex['muscle_group'] == 'Chest'
        assert ex['equipment'] == 'Bodyweight'
        assert ex['bodyweight_load_factor'] == 0.6

    def test_exercise_display_fields_none_without_a_template(self, client, auth_token):
        create_workout(client, auth_token)
        workout_id = get_workout_id(client, auth_token)
        res = client.get(
            f'/api/workouts/{workout_id}',
            headers={'Authorization': f'Bearer {auth_token}'},
        )
        assert res.get_json()['exercises'][0]['image_url'] is None

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
# POST/PATCH /api/workouts -- non-integer reps in the payload
#
# Regression (found in prod logs 2026-09-10, 18 crashes over 7 days): Set.reps
# is an Integer column, but the workout payload is unvalidated (WorkoutSchema
# types `exercises` as a bare list of dicts) and the RN reps input used
# keyboardType="numeric", whose iOS keypad offers a decimal point. SQLAlchemy
# does not coerce on attribute assignment, so 8.5 stayed a float in memory,
# int()-truncated to 8 in the max_reps PR lookup, matched no set, and a bare
# next() raised StopIteration -- a 500 that rolled the entire workout back
# before it was ever committed, silently losing the user's session.
# ---------------------------------------------------------------------------

class TestNonIntegerReps:

    AUTH = staticmethod(lambda token: {'Authorization': f'Bearer {token}'})

    def _template(self, client, token):
        res = client.post(
            '/api/exercises',
            json={'name': 'Bench Press', 'muscle_group': 'Chest'},
            headers=self.AUTH(token),
        )
        assert res.status_code == 201
        return res.get_json()['id']

    def _payload(self, tid, reps):
        return {
            'workoutName': 'Push Day',
            'exercises': [{
                'name': 'Bench Press',
                'exercise_template_id': tid,
                'sets': [{'reps': reps, 'weight': 135}],
            }],
        }

    def test_decimal_reps_saves_instead_of_500(self, client, auth_token):
        tid = self._template(client, auth_token)
        res = create_workout(client, auth_token, self._payload(tid, 8.5))
        assert res.status_code == 201

    def test_decimal_reps_stored_as_rounded_int(self, client, auth_token):
        tid = self._template(client, auth_token)
        create_workout(client, auth_token, self._payload(tid, 8.5))
        workout_id = get_workout_id(client, auth_token)
        data = client.get(f'/api/workouts/{workout_id}', headers=self.AUTH(auth_token)).get_json()
        assert data['exercises'][0]['sets'][0]['reps'] == 8

    def test_decimal_reps_still_records_the_max_reps_pr(self, client, auth_token):
        tid = self._template(client, auth_token)
        create_workout(client, auth_token, self._payload(tid, 8.5))
        prs = client.get(f'/api/personal-records/{tid}', headers=self.AUTH(auth_token)).get_json()
        entry = next(p for p in prs['per_weight_reps'] if p['weight'] == 135)
        assert entry['max_reps'] == 8

    def test_decimal_reps_on_edit_does_not_500(self, client, auth_token):
        tid = self._template(client, auth_token)
        create_workout(client, auth_token, self._payload(tid, 8))
        workout_id = get_workout_id(client, auth_token)
        res = client.patch(
            f'/api/workouts/{workout_id}',
            json=self._payload(tid, 10.5),
            headers=self.AUTH(auth_token),
        )
        assert res.status_code == 200

    def test_numeric_string_reps_does_not_crash(self, client, auth_token):
        # The payload is unvalidated, so a stringified number must not 500
        # either (it previously raised TypeError on the `r <= 15` comparison).
        tid = self._template(client, auth_token)
        res = create_workout(client, auth_token, self._payload(tid, '9'))
        assert res.status_code == 201
        workout_id = get_workout_id(client, auth_token)
        data = client.get(f'/api/workouts/{workout_id}', headers=self.AUTH(auth_token)).get_json()
        assert data['exercises'][0]['sets'][0]['reps'] == 9

    def test_below_two_decimal_reps_still_skips_max_reps(self, client, auth_token):
        # 1.5 truncated to 1 always hit the `best_reps < 2` guard, so it never
        # crashed -- it must still round to 2 now and not regress into a PR of 1
        tid = self._template(client, auth_token)
        create_workout(client, auth_token, self._payload(tid, 1.5))
        workout_id = get_workout_id(client, auth_token)
        data = client.get(f'/api/workouts/{workout_id}', headers=self.AUTH(auth_token)).get_json()
        assert data['exercises'][0]['sets'][0]['reps'] == 2


# ---------------------------------------------------------------------------
# GET /api/workouts?date= -- the dashboard renders these with the same card as
# /api/workouts/recent, so both responses must carry the same fields.
# ---------------------------------------------------------------------------

class TestWorkoutsByDate:

    def _today(self):
        return datetime.now().date().isoformat()

    def test_returns_workout_card_fields(self, client, auth_token):
        create_workout(client, auth_token)
        res = client.get(f'/api/workouts?date={self._today()}',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 1
        w = data[0]
        assert w['num_exercises'] == 2
        assert w['total_reps'] == 20  # 5 + 5 + 10
        assert w['pr_count'] == 0     # payload exercises carry no template id
        assert 'muscles' in w

    def test_matches_recent_shape(self, client, auth_token):
        create_workout(client, auth_token)
        hdrs = {'Authorization': f'Bearer {auth_token}'}
        by_date = client.get(f'/api/workouts?date={self._today()}', headers=hdrs).get_json()[0]
        recent = client.get('/api/workouts/recent', headers=hdrs).get_json()[0]
        assert set(by_date) == set(recent)

    def test_pr_count_excludes_estimated_1rm(self, client, auth_token):
        # A first-time exercise earns max_weight, estimated_1rm and max_reps.
        # estimated_1rm is never shown to users as a PR, so the card counts 2.
        hdrs = {'Authorization': f'Bearer {auth_token}'}
        ex = client.post('/api/exercises', json={'name': 'Bench Press', 'muscle_group': 'Chest'}, headers=hdrs)
        ex_id = ex.get_json()['id']
        create_workout(client, auth_token, {
            'workoutName': 'Push Day',
            'exercises': [{
                'name': 'Bench Press', 'exercise_template_id': ex_id,
                'sets': [{'reps': 5, 'weight': 100}],
            }],
        })
        recent = client.get('/api/workouts/recent', headers=hdrs).get_json()[0]
        by_date = client.get(f'/api/workouts?date={self._today()}', headers=hdrs).get_json()[0]
        assert recent['pr_count'] == 2
        assert by_date['pr_count'] == 2

    def test_other_day_returns_empty(self, client, auth_token):
        create_workout(client, auth_token)
        res = client.get('/api/workouts?date=2020-01-01',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.get_json() == []


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


# ---------------------------------------------------------------------------
# GPS best efforts — segments the phone extracts from a tracked run, fed
# through the same PR pipeline as logged sets.
# ---------------------------------------------------------------------------

def _h(token):
    return {'Authorization': f'Bearer {token}'}


class TestCardioBestEfforts:

    def _template(self, client, token):
        res = client.post('/api/exercises',
                          json={'name': 'Running', 'muscle_group': 'Core', 'exercise_type': 'cardio'},
                          headers=_h(token))
        return res.get_json()['id']

    def _log_run(self, client, token, tid, distance_km, duration_min, best_efforts=None, name='Morning Run'):
        exercise = {
            'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
            'sets': [{'cardio_duration': duration_min, 'distance': distance_km, 'distance_unit': 'km'}],
        }
        if best_efforts is not None:
            exercise['best_efforts'] = best_efforts
        res = client.post('/api/workouts',
                          json={'workoutName': name, 'exercises': [exercise]},
                          headers=_h(token))
        assert res.status_code == 201
        return res.get_json()['id']

    def _pr(self, client, token, tid, pr_type, context):
        # Read the row directly: /api/personal-records returns every PR the
        # user has, and these assertions are about one milestone at a time.
        from models import PersonalRecord
        for r in PersonalRecord.query.filter_by(exercise_template_id=tid, pr_type=pr_type).all():
            if abs((r.weight_context or 0) - context) < 1e-6:
                return r.value
        return None

    def _detail(self, client, token, wid):
        return client.get(f'/api/workouts/{wid}', headers=_h(token)).get_json()

    def test_a_scanned_split_beats_the_whole_run_extrapolation(self, client, auth_token):
        # A 10 km run in 60 min extrapolates to a 30:00 5K. The scan found the
        # runner's real best 5K inside it: 26:00.
        tid = self._template(client, auth_token)
        self._log_run(client, auth_token, tid, 10, 60, best_efforts=[
            {'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': 26.0},
        ])
        assert self._pr(client, auth_token, tid, 'best_time', 5.0) == pytest.approx(26.0)

    def test_a_slower_scanned_effort_never_replaces_a_better_pr(self, client, auth_token):
        tid = self._template(client, auth_token)
        self._log_run(client, auth_token, tid, 5, 22, name='Fast 5K')
        self._log_run(client, auth_token, tid, 10, 60, name='Long Run', best_efforts=[
            {'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': 29.0},
        ])
        assert self._pr(client, auth_token, tid, 'best_time', 5.0) == pytest.approx(22.0)

    def test_duration_efforts_produce_best_distance_prs(self, client, auth_token):
        # The whole-run average over 60 min is 10 km, so 10 minutes extrapolates
        # to 1.67 km; the scan's best 10-minute window covered 2.4 km.
        tid = self._template(client, auth_token)
        self._log_run(client, auth_token, tid, 10, 60, best_efforts=[
            {'milestone_type': 'duration', 'distance_km': 2.4, 'duration_min': 10.0},
        ])
        assert self._pr(client, auth_token, tid, 'best_distance', 10.0) == pytest.approx(2.4, abs=0.01)

    def test_efforts_survive_an_edit_to_another_workout(self, client, auth_token):
        # The regression this design exists to prevent: editing any workout for
        # this exercise replays PRs from scratch off what is stored on the
        # Exercise, so efforts living only in the original request would vanish.
        tid = self._template(client, auth_token)
        self._log_run(client, auth_token, tid, 10, 60, name='Intervals', best_efforts=[
            {'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': 26.0},
        ])
        other = self._log_run(client, auth_token, tid, 6, 36, name='Easy Run')

        res = client.patch(f'/api/workouts/{other}', json={'notes': 'felt easy'}, headers=_h(auth_token))
        assert res.status_code == 200
        assert self._pr(client, auth_token, tid, 'best_time', 5.0) == pytest.approx(26.0)

    def test_editing_the_run_by_hand_clears_its_efforts(self, client, auth_token):
        # Correcting the distance says the trace was wrong, so splits derived
        # from it cannot stand as all-time PRs.
        tid = self._template(client, auth_token)
        wid = self._log_run(client, auth_token, tid, 10, 60, best_efforts=[
            {'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': 26.0},
        ])
        ex = self._detail(client, auth_token, wid)['exercises'][0]
        assert ex['best_efforts']

        ex['sets'][0]['distance'] = 8.0
        res = client.patch(f'/api/workouts/{wid}', json={'exercises': [ex]}, headers=_h(auth_token))
        assert res.status_code == 200

        after = self._detail(client, auth_token, wid)
        assert not after['exercises'][0].get('best_efforts')
        # PRs fall back to the corrected whole-run extrapolation: 8 km in 60 min
        assert self._pr(client, auth_token, tid, 'best_time', 5.0) == pytest.approx(60 * 5 / 8)

    def test_an_untouched_exercise_keeps_its_efforts_when_a_sibling_is_edited(self, client, auth_token):
        tid = self._template(client, auth_token)
        res = client.post('/api/workouts', json={
            'workoutName': 'Brick',
            'exercises': [
                {'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                 'sets': [{'cardio_duration': 60, 'distance': 10, 'distance_unit': 'km'}],
                 'best_efforts': [{'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': 26.0}]},
                {'name': 'Squat', 'sets': [{'reps': 5, 'weight': 225}]},
            ],
        }, headers=_h(auth_token))
        assert res.status_code == 201
        wid = res.get_json()['id']

        exercises = self._detail(client, auth_token, wid)['exercises']
        squat = next(e for e in exercises if e['name'] == 'Squat')
        squat['sets'][0]['reps'] = 8

        res = client.patch(f'/api/workouts/{wid}', json={'exercises': exercises}, headers=_h(auth_token))
        assert res.status_code == 200

        run = next(e for e in self._detail(client, auth_token, wid)['exercises'] if e['name'] == 'Running')
        assert run['best_efforts']
        assert self._pr(client, auth_token, tid, 'best_time', 5.0) == pytest.approx(26.0)

    def test_a_round_tripped_set_value_is_not_treated_as_an_edit(self, client, auth_token):
        # The app sends set values back as strings; that alone must not count as
        # the user correcting the trace.
        tid = self._template(client, auth_token)
        wid = self._log_run(client, auth_token, tid, 10, 60, best_efforts=[
            {'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': 26.0},
        ])
        ex = self._detail(client, auth_token, wid)['exercises'][0]
        ex['sets'][0]['distance'] = '10.0'
        ex['sets'][0]['cardio_duration'] = '60'

        res = client.patch(f'/api/workouts/{wid}', json={'exercises': [ex]}, headers=_h(auth_token))
        assert res.status_code == 200
        assert self._detail(client, auth_token, wid)['exercises'][0]['best_efforts']

    @pytest.mark.parametrize('payload', [
        'not-a-list',
        [{'milestone_type': 'bogus', 'distance_km': 5.0, 'duration_min': 26.0}],
        [{'milestone_type': 'distance', 'distance_km': 'abc', 'duration_min': 26.0}],
        [{'milestone_type': 'distance', 'duration_min': 26.0}],
        [{'milestone_type': 'distance', 'distance_km': 0, 'duration_min': 26.0}],
        [{'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': -3}],
        ['nonsense'],
    ])
    def test_malformed_efforts_are_dropped_without_losing_the_run(self, client, auth_token, payload):
        # A queued offline run must never be rejected outright over a scan
        # artifact, and garbage must never reach the PR upsert.
        tid = self._template(client, auth_token)
        wid = self._log_run(client, auth_token, tid, 10, 60, best_efforts=payload)
        assert not self._detail(client, auth_token, wid)['exercises'][0].get('best_efforts')
        # The run itself still produced its ordinary extrapolated PR
        assert self._pr(client, auth_token, tid, 'best_time', 5.0) == pytest.approx(30.0)

    def test_deleting_the_workout_removes_its_efforts(self, client, auth_token):
        from models import CardioBestEffort
        tid = self._template(client, auth_token)
        wid = self._log_run(client, auth_token, tid, 10, 60, best_efforts=[
            {'milestone_type': 'distance', 'distance_km': 5.0, 'duration_min': 26.0},
        ])
        assert CardioBestEffort.query.count() == 1
        assert client.delete(f'/api/workouts/{wid}', headers=_h(auth_token)).status_code == 200
        assert CardioBestEffort.query.count() == 0
