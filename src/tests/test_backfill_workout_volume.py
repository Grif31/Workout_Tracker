"""
Tests for the `flask backfill-workout-volume` CLI command (src/app.py):
recomputes Workout.volume now that Bodyweight/Weighted equipment sets add
the user's bodyweight-at-the-time. Dry run by default; --apply to write.
"""
from models import db, Workout


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def _create_bodyweight_template(client, token, name='Pull Up', equipment='Bodyweight'):
    res = client.post(
        '/api/exercises',
        json={'name': name, 'muscle_group': 'Back', 'equipment': equipment},
        headers=auth_headers(token),
    )
    assert res.status_code == 201
    return res.get_json()['id']


def _create_bodyweight_workout(client, token, template_id, reps=10):
    payload = {
        'workoutName': 'Pull Day',
        'exercises': [{
            'name': 'Pull Up', 'exercise_template_id': template_id,
            'sets': [{'reps': reps, 'weight': 0, 'set_type': 'N'}],
        }],
    }
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()['id']


class TestBackfillWorkoutVolume:

    def test_dry_run_does_not_mutate_db(self, app, client, auth_token):
        # Create the workout BEFORE any bodyweight is logged, so its stored
        # Workout.volume (0) is stale once bodyweight is logged afterward.
        tid = _create_bodyweight_template(client, auth_token)
        wid = _create_bodyweight_workout(client, auth_token, tid, reps=10)
        client.post('/api/bodyweight', json={'weight': 180, 'date': '2026-01-01'}, headers=auth_headers(auth_token))

        with app.app_context():
            before = db.session.get(Workout, wid).volume

        runner = app.test_cli_runner()
        result = runner.invoke(args=['backfill-workout-volume'])
        assert result.exit_code == 0
        assert 'DRY RUN' in result.output
        assert '1 would change' in result.output

        with app.app_context():
            after = db.session.get(Workout, wid).volume
        assert after == before  # unchanged -- dry run must not persist

    def test_apply_mutates_to_recomputed_value(self, app, client, auth_token):
        tid = _create_bodyweight_template(client, auth_token)
        wid = _create_bodyweight_workout(client, auth_token, tid, reps=10)
        client.post('/api/bodyweight', json={'weight': 180, 'date': '2026-01-01'}, headers=auth_headers(auth_token))

        runner = app.test_cli_runner()
        result = runner.invoke(args=['backfill-workout-volume', '--apply'])
        assert result.exit_code == 0
        assert 'Done. 1 workout(s) updated.' in result.output

        with app.app_context():
            assert db.session.get(Workout, wid).volume == 1800.0

    def test_user_id_scopes_to_one_user(self, app, client, auth_token, auth_token2):
        tid1 = _create_bodyweight_template(client, auth_token)
        wid1 = _create_bodyweight_workout(client, auth_token, tid1, reps=10)
        client.post('/api/bodyweight', json={'weight': 180, 'date': '2026-01-01'}, headers=auth_headers(auth_token))

        tid2 = _create_bodyweight_template(client, auth_token2)
        wid2 = _create_bodyweight_workout(client, auth_token2, tid2, reps=10)
        client.post('/api/bodyweight', json={'weight': 200, 'date': '2026-01-01'}, headers=auth_headers(auth_token2))

        with app.app_context():
            user1_id = db.session.get(Workout, wid1).user_id

        runner = app.test_cli_runner()
        result = runner.invoke(args=['backfill-workout-volume', '--apply', '--user-id', str(user1_id)])
        assert result.exit_code == 0
        assert 'Scanned 1 workout(s)' in result.output

        with app.app_context():
            assert db.session.get(Workout, wid1).volume == 1800.0
            assert db.session.get(Workout, wid2).volume == 0.0  # untouched -- scoped out

    def test_no_bodyweight_ever_reported_and_left_unchanged(self, app, client, auth_token):
        tid = _create_bodyweight_template(client, auth_token)
        wid = _create_bodyweight_workout(client, auth_token, tid, reps=10)
        # No bodyweight logged at all for this user.

        runner = app.test_cli_runner()
        result = runner.invoke(args=['backfill-workout-volume', '--apply'])
        assert result.exit_code == 0
        assert '1 workout(s) belong to users who never logged a bodyweight' in result.output

        with app.app_context():
            assert db.session.get(Workout, wid).volume == 0.0
