"""
Tests for exercise routes:
  GET    /api/exercises
  POST   /api/exercises
  DELETE /api/exercises/<id>
"""


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def seed_global_exercise(name='Barbell Bench Press', equipment='Barbell'):
    """Insert a library exercise (user_id IS NULL) directly."""
    from models import db, ExerciseTemplate
    tmpl = ExerciseTemplate(name=name, equipment=equipment)
    db.session.add(tmpl)
    db.session.commit()
    return tmpl.id


class TestGetExercises:

    def test_returns_empty_list_when_no_exercises(self, client, auth_token):
        res = client.get('/api/exercises', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_all_exercises(self, client, auth_token):
        client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'}, headers=auth_headers(auth_token))
        client.post('/api/exercises', json={'name': 'Bench Press', 'muscle_group': 'Chest'}, headers=auth_headers(auth_token))

        res = client.get('/api/exercises', headers=auth_headers(auth_token))
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 2

    def test_returns_correct_fields(self, client, auth_token):
        client.post('/api/exercises', json={'name': 'Deadlift', 'muscle_group': 'Back'}, headers=auth_headers(auth_token))

        res = client.get('/api/exercises', headers=auth_headers(auth_token))
        exercise = res.get_json()[0]
        assert 'id' in exercise
        assert 'name' in exercise
        assert 'muscle_group' in exercise

    def test_primary_muscles_names_every_primary(self, client, auth_token, app):
        """muscle_group lists primaries first but can't say where they end, so
        the workout log's per-muscle set counts read primary_muscles."""
        from models import db, ExerciseMuscleMapping
        with app.app_context():
            tmpl_id = seed_global_exercise('Romanian Deadlift', 'Barbell')
            db.session.add_all([
                ExerciseMuscleMapping(exercise_template_id=tmpl_id, muscle_group='Hamstrings', is_primary=True),
                ExerciseMuscleMapping(exercise_template_id=tmpl_id, muscle_group='Glutes', is_primary=True),
                ExerciseMuscleMapping(exercise_template_id=tmpl_id, muscle_group='Lower Back', is_primary=False),
            ])
            db.session.commit()

        res = client.get('/api/exercises', headers=auth_headers(auth_token))
        exercise = res.get_json()[0]
        assert exercise['muscle_group'].split(', ')[2] == 'Lower Back'
        assert sorted(exercise['primary_muscles']) == ['Glutes', 'Hamstrings']

    def test_requires_auth(self, client):
        res = client.get('/api/exercises')
        assert res.status_code == 401


class TestAddExercise:

    def test_add_exercise_success(self, client, auth_token):
        res = client.post('/api/exercises', json={
            'name': 'Squat',
            'muscle_group': 'Quads',
        }, headers=auth_headers(auth_token))
        assert res.status_code == 201
        assert 'message' in res.get_json()

    def test_exercise_appears_in_list_after_creation(self, client, auth_token):
        client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'}, headers=auth_headers(auth_token))

        res = client.get('/api/exercises', headers=auth_headers(auth_token))
        names = [e['name'] for e in res.get_json()]
        assert 'Squat' in names

    def test_add_exercise_missing_name(self, client, auth_token):
        res = client.post('/api/exercises', json={'muscle_group': 'Quads'}, headers=auth_headers(auth_token))
        assert res.status_code == 400
        assert 'message' in res.get_json()

    def test_add_exercise_empty_name(self, client, auth_token):
        res = client.post('/api/exercises', json={'name': '   ', 'muscle_group': 'Quads'}, headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_add_exercise_duplicate_name(self, client, auth_token):
        client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'}, headers=auth_headers(auth_token))
        res = client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'}, headers=auth_headers(auth_token))
        assert res.status_code == 400
        assert 'Already Exists' in res.get_json()['message']

    def test_add_exercise_stores_muscle_group(self, client, auth_token):
        client.post('/api/exercises', json={'name': 'Curl', 'muscle_group': 'Biceps'}, headers=auth_headers(auth_token))

        res = client.get('/api/exercises', headers=auth_headers(auth_token))
        exercise = next(e for e in res.get_json() if e['name'] == 'Curl')
        assert exercise['muscle_group'] == 'Biceps'

    def test_requires_auth(self, client):
        res = client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'})
        assert res.status_code == 401


class TestDeleteExercise:

    def _create_custom(self, client, token, name='My Custom Lift'):
        res = client.post('/api/exercises', json={
            'name': name, 'equipment': 'Dumbbell', 'muscle_group': 'Shoulders',
        }, headers=auth_headers(token))
        assert res.status_code == 201
        return res.get_json()['id']

    def test_requires_auth(self, client):
        assert client.delete('/api/exercises/1').status_code == 401

    def test_delete_own_custom_exercise(self, client, auth_token):
        h = auth_headers(auth_token)
        ex_id = self._create_custom(client, auth_token)
        res = client.delete(f'/api/exercises/{ex_id}', headers=h)
        assert res.status_code == 200
        names = [e['name'] for e in client.get('/api/exercises', headers=h).get_json()]
        assert 'My Custom Lift' not in names

    def test_delete_missing_exercise_returns_404(self, client, auth_token):
        res = client.delete('/api/exercises/99999', headers=auth_headers(auth_token))
        assert res.status_code == 404

    def test_cannot_delete_global_library_exercise(self, client, auth_token):
        global_id = seed_global_exercise()
        res = client.delete(f'/api/exercises/{global_id}', headers=auth_headers(auth_token))
        assert res.status_code == 403
        # still visible in the library
        ids = [e['id'] for e in client.get('/api/exercises', headers=auth_headers(auth_token)).get_json()]
        assert global_id in ids

    def test_cannot_delete_another_users_custom_exercise(self, client, auth_token, auth_token2):
        ex_id = self._create_custom(client, auth_token)
        res = client.delete(f'/api/exercises/{ex_id}', headers=auth_headers(auth_token2))
        assert res.status_code == 403
        names = [e['name'] for e in client.get('/api/exercises', headers=auth_headers(auth_token)).get_json()]
        assert 'My Custom Lift' in names

    def test_deleting_exercise_leaves_logged_workout_intact(self, client, auth_token):
        """A custom exercise already logged in a workout can still be deleted;
        the workout and its sets are not removed with it."""
        h = auth_headers(auth_token)
        ex_id = self._create_custom(client, auth_token, name='Logged Lift')
        client.post('/api/workouts', json={
            'workoutName': 'Session',
            'exercises': [{
                'name': 'Logged Lift', 'exercise_template_id': ex_id,
                'sets': [{'reps': 10, 'weight': 50}],
            }],
        }, headers=h)

        res = client.delete(f'/api/exercises/{ex_id}', headers=h)
        assert res.status_code == 200

        workouts = client.get('/api/workouts?include_exercises=true', headers=h).get_json()
        assert len(workouts) == 1
        assert workouts[0]['exercises'][0]['sets'][0]['reps'] == 10


class TestUpdateExercise:

    def _create_custom(self, client, token, name='My Custom Lift', exercise_type='strength'):
        res = client.post('/api/exercises', json={
            'name': name, 'equipment': 'Dumbbell', 'muscle_group': 'Shoulders', 'exercise_type': exercise_type,
        }, headers=auth_headers(token))
        assert res.status_code == 201
        return res.get_json()['id']

    def _log(self, client, h, ex_id, name):
        res = client.post('/api/workouts', json={
            'workoutName': 'Session',
            'exercises': [{'name': name, 'exercise_template_id': ex_id, 'sets': [{'reps': 10, 'weight': 50}]}],
        }, headers=h)
        assert res.status_code == 201

    def _get(self, client, h, ex_id):
        return next(e for e in client.get('/api/exercises', headers=h).get_json() if e['id'] == ex_id)

    def test_requires_auth(self, client):
        assert client.put('/api/exercises/1', json={'name': 'X'}).status_code == 401

    def test_edits_name_equipment_and_muscles(self, client, auth_token):
        h = auth_headers(auth_token)
        ex_id = self._create_custom(client, auth_token)
        res = client.put(f'/api/exercises/{ex_id}', json={
            'name': 'Cable Y Raise', 'equipment': 'Cable', 'muscle_group': 'Shoulders, Upper Back',
        }, headers=h)
        assert res.status_code == 200
        assert res.get_json()['exercise']['name'] == 'Cable Y Raise'
        ex = self._get(client, h, ex_id)
        assert ex['equipment'] == 'Cable'
        assert ex['muscle_group'] == 'Shoulders, Upper Back'
        assert ex['primary_muscles'] == ['Shoulders']

    def test_rename_carries_to_logged_rows_and_keeps_history(self, client, auth_token):
        h = auth_headers(auth_token)
        ex_id = self._create_custom(client, auth_token, name='Old Name')
        self._log(client, h, ex_id, 'Old Name')

        res = client.put(f'/api/exercises/{ex_id}', json={
            'name': 'New Name', 'equipment': 'Dumbbell', 'muscle_group': 'Shoulders',
        }, headers=h)
        assert res.status_code == 200

        workouts = client.get('/api/workouts?include_exercises=true', headers=h).get_json()
        assert workouts[0]['exercises'][0]['name'] == 'New Name'
        stats = client.get(f'/api/stats/exercise?name=New%20Name&exercise_template_id={ex_id}', headers=h).get_json()
        assert len(stats['history']) == 1

    def test_logging_type_changes_while_unlogged(self, client, auth_token):
        h = auth_headers(auth_token)
        ex_id = self._create_custom(client, auth_token)
        res = client.put(f'/api/exercises/{ex_id}', json={
            'name': 'My Custom Lift', 'equipment': 'Dumbbell', 'muscle_group': 'Shoulders', 'exercise_type': 'duration',
        }, headers=h)
        assert res.status_code == 200
        assert self._get(client, h, ex_id)['exercise_type'] == 'duration'

    def test_logging_type_locked_once_logged(self, client, auth_token):
        h = auth_headers(auth_token)
        ex_id = self._create_custom(client, auth_token)
        self._log(client, h, ex_id, 'My Custom Lift')
        res = client.put(f'/api/exercises/{ex_id}', json={
            'name': 'Renamed', 'equipment': 'Dumbbell', 'muscle_group': 'Shoulders', 'exercise_type': 'cardio',
        }, headers=h)
        assert res.status_code == 400
        ex = self._get(client, h, ex_id)
        assert ex['exercise_type'] == 'strength'
        assert ex['name'] == 'My Custom Lift'

    def test_keeping_own_name_is_not_a_duplicate(self, client, auth_token):
        ex_id = self._create_custom(client, auth_token)
        res = client.put(f'/api/exercises/{ex_id}', json={
            'name': 'My Custom Lift', 'equipment': 'Dumbbell', 'muscle_group': 'Chest',
        }, headers=auth_headers(auth_token))
        assert res.status_code == 200

    def test_cannot_take_another_exercises_name(self, client, auth_token):
        seed_global_exercise('Barbell Bench Press', 'Barbell')
        ex_id = self._create_custom(client, auth_token)
        res = client.put(f'/api/exercises/{ex_id}', json={
            'name': 'Barbell Bench Press', 'equipment': 'Barbell', 'muscle_group': 'Chest',
        }, headers=auth_headers(auth_token))
        assert res.status_code == 400
        assert 'Already Exists' in res.get_json()['message']

    def test_cannot_edit_global_library_exercise(self, client, auth_token):
        global_id = seed_global_exercise()
        res = client.put(f'/api/exercises/{global_id}', json={'name': 'Hijacked'}, headers=auth_headers(auth_token))
        assert res.status_code == 403

    def test_cannot_edit_another_users_custom_exercise(self, client, auth_token, auth_token2):
        ex_id = self._create_custom(client, auth_token)
        res = client.put(f'/api/exercises/{ex_id}', json={'name': 'Hijacked'}, headers=auth_headers(auth_token2))
        assert res.status_code == 403
        assert self._get(client, auth_headers(auth_token), ex_id)['name'] == 'My Custom Lift'

    def test_missing_exercise_returns_404(self, client, auth_token):
        assert client.put('/api/exercises/99999', json={'name': 'X'}, headers=auth_headers(auth_token)).status_code == 404
