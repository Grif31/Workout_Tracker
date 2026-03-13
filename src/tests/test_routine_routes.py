"""
Tests for routine routes:
  POST   /api/routines
  GET    /api/routines
  GET    /api/routines/<id>
  PATCH  /api/routines/<id>
  DELETE /api/routines/<id>
  POST   /api/routines/deactivate
  POST   /api/routines/<id>/activate
"""


def create_exercise(client, name='Squat', muscle='Quads'):
    client.post('/api/exercises', json={'name': name, 'muscle_group': muscle})
    exercises = client.get('/api/exercises').get_json()
    return next(e['id'] for e in exercises if e['name'] == name)


def create_routine(client, auth_token, name='PPL Split', days=None):
    if days is None:
        days = [{'label': 'Push', 'exercise_template_ids': []}]
    return client.post('/api/routines', json={
        'name': name,
        'days': days,
    }, headers={'Authorization': f'Bearer {auth_token}'})


class TestCreateRoutine:

    def test_create_success(self, client, auth_token):
        res = create_routine(client, auth_token)
        assert res.status_code == 201
        data = res.get_json()
        assert data['name'] == 'PPL Split'
        assert 'id' in data

    def test_create_with_multiple_days(self, client, auth_token):
        days = [
            {'label': 'Push', 'exercise_template_ids': []},
            {'label': 'Pull', 'exercise_template_ids': []},
            {'label': 'Legs', 'exercise_template_ids': []},
        ]
        res = create_routine(client, auth_token, 'PPL', days)
        assert res.status_code == 201
        assert res.get_json()['day_count'] == 3

    def test_create_days_with_exercises(self, client, auth_token):
        ex_id = create_exercise(client, 'Bench Press', 'Chest')
        days = [{'label': 'Push', 'exercise_template_ids': [ex_id]}]
        res = create_routine(client, auth_token, 'Push Routine', days)
        assert res.status_code == 201
        day = res.get_json()['days'][0]
        assert len(day['workout_template']['exercises']) == 1
        assert day['workout_template']['exercises'][0]['name'] == 'Bench Press'

    def test_create_requires_name(self, client, auth_token):
        res = client.post('/api/routines',
                          json={'name': '', 'days': [{'label': 'Day 1', 'exercise_template_ids': []}]},
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 400

    def test_create_requires_at_least_one_day(self, client, auth_token):
        res = client.post('/api/routines',
                          json={'name': 'Test', 'days': []},
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 400

    def test_create_requires_auth(self, client):
        res = client.post('/api/routines',
                          json={'name': 'Test', 'days': [{'label': 'Day 1', 'exercise_template_ids': []}]})
        assert res.status_code == 401

    def test_day_label_defaults_when_missing(self, client, auth_token):
        res = client.post('/api/routines',
                          json={'name': 'Test', 'days': [{'exercise_template_ids': []}]},
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 201
        day = res.get_json()['days'][0]
        assert 'Day 1' in day['label']

    def test_description_is_optional(self, client, auth_token):
        res = client.post('/api/routines',
                          json={'name': 'Test', 'days': [{'label': 'A', 'exercise_template_ids': []}]},
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 201


class TestListRoutines:

    def test_returns_empty_list(self, client, auth_token):
        res = client.get('/api/routines', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_all_user_routines(self, client, auth_token):
        create_routine(client, auth_token, 'Routine A')
        create_routine(client, auth_token, 'Routine B')
        res = client.get('/api/routines', headers={'Authorization': f'Bearer {auth_token}'})
        assert len(res.get_json()) == 2

    def test_list_includes_day_count(self, client, auth_token):
        days = [{'label': 'A', 'exercise_template_ids': []},
                {'label': 'B', 'exercise_template_ids': []}]
        create_routine(client, auth_token, 'Two-Day', days)
        res = client.get('/api/routines', headers={'Authorization': f'Bearer {auth_token}'})
        assert res.get_json()[0]['day_count'] == 2

    def test_requires_auth(self, client):
        res = client.get('/api/routines')
        assert res.status_code == 401


class TestGetRoutine:

    def test_get_by_id(self, client, auth_token):
        routine_id = create_routine(client, auth_token, 'My Plan').get_json()['id']
        res = client.get(f'/api/routines/{routine_id}',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json()['name'] == 'My Plan'

    def test_includes_days(self, client, auth_token):
        days = [{'label': 'Push', 'exercise_template_ids': []}]
        routine_id = create_routine(client, auth_token, 'PPL', days).get_json()['id']
        res = client.get(f'/api/routines/{routine_id}',
                         headers={'Authorization': f'Bearer {auth_token}'})
        data = res.get_json()
        assert len(data['days']) == 1
        assert data['days'][0]['label'] == 'Push'

    def test_returns_404_for_missing(self, client, auth_token):
        res = client.get('/api/routines/99999',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404

    def test_requires_auth(self, client):
        res = client.get('/api/routines/1')
        assert res.status_code == 401


class TestUpdateRoutine:

    def test_update_name(self, client, auth_token):
        routine_id = create_routine(client, auth_token, 'Old Name').get_json()['id']
        res = client.patch(f'/api/routines/{routine_id}',
                           json={'name': 'New Name'},
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json()['name'] == 'New Name'

    def test_update_description(self, client, auth_token):
        routine_id = create_routine(client, auth_token).get_json()['id']
        res = client.patch(f'/api/routines/{routine_id}',
                           json={'description': 'A great split'},
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json()['description'] == 'A great split'

    def test_returns_404_for_missing(self, client, auth_token):
        res = client.patch('/api/routines/99999',
                           json={'name': 'x'},
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404


class TestDeleteRoutine:

    def test_delete_success(self, client, auth_token):
        routine_id = create_routine(client, auth_token).get_json()['id']
        res = client.delete(f'/api/routines/{routine_id}',
                            headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200

    def test_deleted_routine_not_found(self, client, auth_token):
        routine_id = create_routine(client, auth_token).get_json()['id']
        client.delete(f'/api/routines/{routine_id}',
                      headers={'Authorization': f'Bearer {auth_token}'})
        res = client.get(f'/api/routines/{routine_id}',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404

    def test_delete_cascades_days(self, client, auth_token):
        days = [{'label': 'A', 'exercise_template_ids': []}]
        routine_id = create_routine(client, auth_token, 'Test', days).get_json()['id']
        client.delete(f'/api/routines/{routine_id}',
                      headers={'Authorization': f'Bearer {auth_token}'})
        res = client.get(f'/api/routines/{routine_id}',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404

    def test_returns_404_for_missing(self, client, auth_token):
        res = client.delete('/api/routines/99999',
                            headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404


class TestActiveRoutine:

    def test_activate_success(self, client, auth_token):
        routine_id = create_routine(client, auth_token).get_json()['id']
        res = client.post(f'/api/routines/{routine_id}/activate',
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json()['active_routine_id'] == routine_id

    def test_activate_other_users_routine_returns_404(self, client, auth_token, auth_token2):
        routine_id = create_routine(client, auth_token).get_json()['id']
        res = client.post(f'/api/routines/{routine_id}/activate',
                          headers={'Authorization': f'Bearer {auth_token2}'})
        assert res.status_code == 404

    def test_activate_nonexistent_returns_404(self, client, auth_token):
        res = client.post('/api/routines/9999/activate',
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404

    def test_deactivate_success(self, client, auth_token):
        routine_id = create_routine(client, auth_token).get_json()['id']
        client.post(f'/api/routines/{routine_id}/activate',
                    headers={'Authorization': f'Bearer {auth_token}'})
        res = client.post('/api/routines/deactivate',
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json()['active_routine_id'] is None

    def test_activate_replaces_previous_active(self, client, auth_token):
        id1 = create_routine(client, auth_token, name='A').get_json()['id']
        id2 = create_routine(client, auth_token, name='B').get_json()['id']
        client.post(f'/api/routines/{id1}/activate',
                    headers={'Authorization': f'Bearer {auth_token}'})
        res = client.post(f'/api/routines/{id2}/activate',
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.get_json()['active_routine_id'] == id2

    def test_activate_requires_auth(self, client, auth_token):
        routine_id = create_routine(client, auth_token).get_json()['id']
        res = client.post(f'/api/routines/{routine_id}/activate')
        assert res.status_code == 401

    def test_deactivate_requires_auth(self, client):
        res = client.post('/api/routines/deactivate')
        assert res.status_code == 401
