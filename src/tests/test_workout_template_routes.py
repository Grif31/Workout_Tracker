"""
Tests for workout template routes:
  POST   /api/workout-templates
  GET    /api/workout-templates
  GET    /api/workout-templates/<id>
  PATCH  /api/workout-templates/<id>
  DELETE /api/workout-templates/<id>
"""


def create_exercise(client, name='Squat', muscle='Quads'):
    client.post('/api/exercises', json={'name': name, 'muscle_group': muscle})
    exercises = client.get('/api/exercises').get_json()
    return next(e['id'] for e in exercises if e['name'] == name)


def create_template(client, auth_token, name='Chest Day', ex_ids=None):
    return client.post('/api/workout-templates', json={
        'name': name,
        'exercise_template_ids': ex_ids or [],
    }, headers={'Authorization': f'Bearer {auth_token}'})


class TestCreateWorkoutTemplate:

    def test_create_success(self, client, auth_token):
        res = create_template(client, auth_token, 'Push Day')
        assert res.status_code == 201
        data = res.get_json()
        assert data['name'] == 'Push Day'
        assert 'id' in data

    def test_create_with_exercises(self, client, auth_token):
        ex_id = create_exercise(client, 'Bench Press', 'Chest')
        res = create_template(client, auth_token, 'Chest Day', [ex_id])
        assert res.status_code == 201
        data = res.get_json()
        assert len(data['exercises']) == 1
        assert data['exercises'][0]['name'] == 'Bench Press'

    def test_create_requires_auth(self, client):
        res = client.post('/api/workout-templates', json={'name': 'Push Day'})
        assert res.status_code == 401

    def test_create_requires_name(self, client, auth_token):
        res = client.post('/api/workout-templates', json={'name': '   '},
                          headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 400

    def test_create_ignores_invalid_exercise_ids(self, client, auth_token):
        res = create_template(client, auth_token, 'Day A', [99999])
        assert res.status_code == 201
        assert res.get_json()['exercises'] == []


class TestListWorkoutTemplates:

    def test_returns_empty_list(self, client, auth_token):
        res = client.get('/api/workout-templates',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_only_own_templates(self, client, auth_token):
        create_template(client, auth_token, 'Push Day')
        create_template(client, auth_token, 'Pull Day')
        res = client.get('/api/workout-templates',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert len(res.get_json()) == 2

    def test_requires_auth(self, client):
        res = client.get('/api/workout-templates')
        assert res.status_code == 401


class TestGetWorkoutTemplate:

    def test_get_by_id(self, client, auth_token):
        template_id = create_template(client, auth_token, 'Leg Day').get_json()['id']
        res = client.get(f'/api/workout-templates/{template_id}',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json()['name'] == 'Leg Day'

    def test_returns_404_for_missing(self, client, auth_token):
        res = client.get('/api/workout-templates/99999',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404

    def test_requires_auth(self, client):
        res = client.get('/api/workout-templates/1')
        assert res.status_code == 401


class TestUpdateWorkoutTemplate:

    def test_update_name(self, client, auth_token):
        template_id = create_template(client, auth_token, 'Old Name').get_json()['id']
        res = client.patch(f'/api/workout-templates/{template_id}',
                           json={'name': 'New Name'},
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert res.get_json()['name'] == 'New Name'

    def test_update_exercises(self, client, auth_token):
        ex_id = create_exercise(client, 'Deadlift', 'Back')
        template_id = create_template(client, auth_token, 'Back Day').get_json()['id']
        res = client.patch(f'/api/workout-templates/{template_id}',
                           json={'exercise_template_ids': [ex_id]},
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200
        assert len(res.get_json()['exercises']) == 1

    def test_returns_404_for_missing(self, client, auth_token):
        res = client.patch('/api/workout-templates/99999', json={'name': 'x'},
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404


class TestDeleteWorkoutTemplate:

    def test_delete_success(self, client, auth_token):
        template_id = create_template(client, auth_token, 'Temp').get_json()['id']
        res = client.delete(f'/api/workout-templates/{template_id}',
                            headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200

    def test_deleted_template_not_found(self, client, auth_token):
        template_id = create_template(client, auth_token, 'Gone').get_json()['id']
        client.delete(f'/api/workout-templates/{template_id}',
                      headers={'Authorization': f'Bearer {auth_token}'})
        res = client.get(f'/api/workout-templates/{template_id}',
                         headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404

    def test_returns_404_for_missing(self, client, auth_token):
        res = client.delete('/api/workout-templates/99999',
                            headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 404
