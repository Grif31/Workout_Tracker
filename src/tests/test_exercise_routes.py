"""
Tests for exercise routes:
  GET  /api/exercises
  POST /api/exercises
"""


class TestGetExercises:

    def test_returns_empty_list_when_no_exercises(self, client):
        res = client.get('/api/exercises')
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_all_exercises(self, client):
        client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'})
        client.post('/api/exercises', json={'name': 'Bench Press', 'muscle_group': 'Chest'})

        res = client.get('/api/exercises')
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 2

    def test_returns_correct_fields(self, client):
        client.post('/api/exercises', json={'name': 'Deadlift', 'muscle_group': 'Back'})

        res = client.get('/api/exercises')
        exercise = res.get_json()[0]
        assert 'id' in exercise
        assert 'name' in exercise
        assert 'muscle_group' in exercise

    def test_no_auth_required(self, client):
        res = client.get('/api/exercises')
        assert res.status_code == 200


class TestAddExercise:

    def test_add_exercise_success(self, client):
        res = client.post('/api/exercises', json={
            'name': 'Squat',
            'muscle_group': 'Quads',
        })
        assert res.status_code == 201
        assert 'message' in res.get_json()

    def test_exercise_appears_in_list_after_creation(self, client):
        client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'})

        res = client.get('/api/exercises')
        names = [e['name'] for e in res.get_json()]
        assert 'Squat' in names

    def test_add_exercise_missing_name(self, client):
        res = client.post('/api/exercises', json={'muscle_group': 'Quads'})
        assert res.status_code == 400
        assert 'message' in res.get_json()

    def test_add_exercise_empty_name(self, client):
        res = client.post('/api/exercises', json={'name': '   ', 'muscle_group': 'Quads'})
        assert res.status_code == 400

    def test_add_exercise_duplicate_name(self, client):
        client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'})
        res = client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'})
        assert res.status_code == 400
        assert 'Already Exists' in res.get_json()['message']

    def test_add_exercise_stores_muscle_group(self, client):
        client.post('/api/exercises', json={'name': 'Curl', 'muscle_group': 'Biceps'})

        res = client.get('/api/exercises')
        exercise = next(e for e in res.get_json() if e['name'] == 'Curl')
        assert exercise['muscle_group'] == 'Biceps'

    def test_no_auth_required(self, client):
        res = client.post('/api/exercises', json={'name': 'Squat', 'muscle_group': 'Quads'})
        assert res.status_code == 201
