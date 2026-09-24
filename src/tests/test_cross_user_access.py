"""
Cross-user access: one user must never read, change or delete another user's
workouts, workout templates or routines, and must not be able to pull another
user's private custom exercises into their own templates by id.

Every id-based route answers 404 for someone else's row (not 403, so ids
can't be probed for existence), and the owner's data must be untouched.
"""
import pytest

from models import db, ExerciseTemplate


def hdrs(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def alice(auth_token):
    return auth_token


@pytest.fixture
def bob(auth_token2):
    return auth_token2


def make_workout(client, token, name='Leg Day'):
    res = client.post('/api/workouts', json={
        'workoutName': name,
        'notes': 'private notes',
        'duration': 45,
        'exercises': [{'name': 'Squat', 'sets': [{'reps': 5, 'weight': 225}]}],
    }, headers=hdrs(token))
    assert res.status_code in (200, 201), res.get_json()
    return client.get('/api/workouts', headers=hdrs(token)).get_json()[0]['id']


def make_custom_exercise(client, token, name):
    res = client.post('/api/exercises', json={'name': name, 'muscle_group': 'Chest'}, headers=hdrs(token))
    assert res.status_code == 201
    return res.get_json()['id']


def make_global_exercise(name='Barbell Row'):
    ex = ExerciseTemplate(name=name, equipment='Barbell', user_id=None)
    db.session.add(ex)
    db.session.commit()
    return ex.id


def make_template(client, token, name='Push A', ex_ids=()):
    res = client.post('/api/workout-templates', json={'name': name, 'exercise_template_ids': list(ex_ids)},
                      headers=hdrs(token))
    assert res.status_code == 201, res.get_json()
    return res.get_json()['id']


def make_routine(client, token, name='PPL', days=None):
    res = client.post('/api/routines', json={
        'name': name,
        'days': days or [{'label': 'Push', 'exercise_template_ids': []}],
    }, headers=hdrs(token))
    assert res.status_code == 201, res.get_json()
    return res.get_json()['id']


class TestWorkouts:

    def test_cannot_read(self, client, alice, bob):
        wid = make_workout(client, alice)
        res = client.get(f'/api/workouts/{wid}', headers=hdrs(bob))
        assert res.status_code == 404
        assert 'private notes' not in res.get_data(as_text=True)

    @pytest.mark.parametrize('method', ['patch', 'put'])
    def test_cannot_edit(self, client, alice, bob, method):
        wid = make_workout(client, alice)
        res = getattr(client, method)(f'/api/workouts/{wid}', json={
            'workoutName': 'Hijacked', 'notes': '', 'exercises': [],
        }, headers=hdrs(bob))
        assert res.status_code == 404

        mine = client.get(f'/api/workouts/{wid}', headers=hdrs(alice)).get_json()
        assert mine['name'] == 'Leg Day'
        assert mine['notes'] == 'private notes'
        assert len(mine['exercises']) == 1

    def test_cannot_delete(self, client, alice, bob):
        wid = make_workout(client, alice)
        res = client.delete(f'/api/workouts/{wid}', headers=hdrs(bob))
        assert res.status_code == 404
        assert client.get(f'/api/workouts/{wid}', headers=hdrs(alice)).status_code == 200

    def test_not_listed_for_other_user(self, client, alice, bob):
        make_workout(client, alice)
        assert client.get('/api/workouts', headers=hdrs(bob)).get_json() == []


class TestWorkoutTemplates:

    def test_cannot_read(self, client, alice, bob):
        tid = make_template(client, alice)
        assert client.get(f'/api/workout-templates/{tid}', headers=hdrs(bob)).status_code == 404

    def test_cannot_edit(self, client, alice, bob):
        ex = make_global_exercise()
        tid = make_template(client, alice, ex_ids=[ex])
        res = client.patch(f'/api/workout-templates/{tid}', json={'name': 'Hijacked', 'exercise_template_ids': []},
                           headers=hdrs(bob))
        assert res.status_code == 404

        mine = client.get(f'/api/workout-templates/{tid}', headers=hdrs(alice)).get_json()
        assert mine['name'] == 'Push A'
        assert [e['id'] for e in mine['exercises']] == [ex]

    def test_cannot_delete(self, client, alice, bob):
        tid = make_template(client, alice)
        assert client.delete(f'/api/workout-templates/{tid}', headers=hdrs(bob)).status_code == 404
        assert client.get(f'/api/workout-templates/{tid}', headers=hdrs(alice)).status_code == 200

    def test_not_listed_for_other_user(self, client, alice, bob):
        make_template(client, alice)
        assert client.get('/api/workout-templates', headers=hdrs(bob)).get_json() == []


class TestRoutines:

    def test_cannot_read(self, client, alice, bob):
        rid = make_routine(client, alice)
        assert client.get(f'/api/routines/{rid}', headers=hdrs(bob)).status_code == 404

    def test_cannot_edit(self, client, alice, bob):
        rid = make_routine(client, alice)
        res = client.patch(f'/api/routines/{rid}', json={
            'name': 'Hijacked', 'days': [{'label': 'X', 'exercise_template_ids': []}],
        }, headers=hdrs(bob))
        assert res.status_code == 404

        mine = client.get(f'/api/routines/{rid}', headers=hdrs(alice)).get_json()
        assert mine['name'] == 'PPL'
        assert [d['label'] for d in mine['days']] == ['Push']

    def test_cannot_delete(self, client, alice, bob):
        rid = make_routine(client, alice)
        assert client.delete(f'/api/routines/{rid}', headers=hdrs(bob)).status_code == 404
        assert client.get(f'/api/routines/{rid}', headers=hdrs(alice)).status_code == 200

    def test_cannot_activate(self, client, alice, bob):
        rid = make_routine(client, alice)
        assert client.post(f'/api/routines/{rid}/activate', headers=hdrs(bob)).status_code == 404

    def test_not_listed_for_other_user(self, client, alice, bob):
        make_routine(client, alice)
        assert client.get('/api/routines', headers=hdrs(bob)).get_json() == []

    def test_cannot_build_a_routine_from_another_users_template(self, client, alice, bob):
        tid = make_template(client, alice, name='Alice Secret Split')
        res = client.post('/api/routines', json={
            'name': 'Mine', 'days': [{'label': 'Day 1', 'workout_template_id': tid}],
        }, headers=hdrs(bob))
        assert res.status_code == 404
        assert 'Alice Secret Split' not in res.get_data(as_text=True)

    def test_cannot_patch_in_another_users_template(self, client, alice, bob):
        tid = make_template(client, alice, name='Alice Secret Split')
        rid = make_routine(client, bob, name='Bob PPL')
        res = client.patch(f'/api/routines/{rid}', json={
            'days': [{'label': 'Day 1', 'workout_template_id': tid}],
        }, headers=hdrs(bob))
        assert res.status_code == 404
        assert 'Alice Secret Split' not in res.get_data(as_text=True)


class TestPrivateCustomExercises:
    """Templates echo each exercise's name and image, so an unfiltered id
    lookup leaked other users' custom exercises to anyone guessing ids."""

    SECRET = 'Alice Secret Press'

    @pytest.fixture
    def ids(self, client, alice, bob):
        return {
            'alice_custom': make_custom_exercise(client, alice, self.SECRET),
            'bob_custom': make_custom_exercise(client, bob, 'Bob Curl'),
            'global': make_global_exercise(),
        }

    def _names(self, template_dict):
        return [e['name'] for e in template_dict['exercises']]

    def test_template_create_keeps_own_and_global_in_order(self, client, bob, ids):
        tid = make_template(client, bob, ex_ids=[ids['global'], ids['alice_custom'], ids['bob_custom']])
        tmpl = client.get(f'/api/workout-templates/{tid}', headers=hdrs(bob)).get_json()
        assert self._names(tmpl) == ['Barbell Row', 'Bob Curl']

    def test_template_create_response_does_not_leak(self, client, bob, ids):
        res = client.post('/api/workout-templates', json={'name': 'Probe', 'exercise_template_ids': [ids['alice_custom']]},
                          headers=hdrs(bob))
        assert res.status_code == 201
        assert self.SECRET not in res.get_data(as_text=True)
        assert res.get_json()['exercises'] == []

    def test_template_update_does_not_leak(self, client, bob, ids):
        tid = make_template(client, bob)
        res = client.patch(f'/api/workout-templates/{tid}',
                           json={'exercise_template_ids': [ids['alice_custom'], ids['bob_custom']]},
                           headers=hdrs(bob))
        assert res.status_code == 200
        assert self.SECRET not in res.get_data(as_text=True)
        assert self._names(res.get_json()) == ['Bob Curl']

    def test_routine_create_does_not_leak(self, client, bob, ids):
        res = client.post('/api/routines', json={
            'name': 'Probe', 'days': [{'label': 'A', 'exercise_template_ids': [ids['alice_custom'], ids['global']]}],
        }, headers=hdrs(bob))
        assert res.status_code == 201
        assert self.SECRET not in res.get_data(as_text=True)
        assert self._names(res.get_json()['days'][0]['workout_template']) == ['Barbell Row']

    def test_routine_update_does_not_leak(self, client, bob, ids):
        rid = make_routine(client, bob)
        res = client.patch(f'/api/routines/{rid}', json={
            'days': [{'label': 'A', 'exercise_template_ids': [ids['alice_custom'], ids['bob_custom']]}],
        }, headers=hdrs(bob))
        assert res.status_code == 200
        assert self.SECRET not in res.get_data(as_text=True)
        assert self._names(res.get_json()['days'][0]['workout_template']) == ['Bob Curl']

    def test_ai_save_routine_does_not_leak(self, client, bob, ids):
        res = client.post('/api/ai/save', json={
            'type': 'routine', 'name': 'AI Probe',
            'days': [{'label': 'A', 'exercise_ids': [ids['alice_custom'], ids['global']]}],
        }, headers=hdrs(bob))
        assert res.status_code == 201
        routine = client.get(f"/api/routines/{res.get_json()['id']}", headers=hdrs(bob))
        assert self.SECRET not in routine.get_data(as_text=True)
        assert self._names(routine.get_json()['days'][0]['workout_template']) == ['Barbell Row']

    def test_ai_save_template_does_not_leak(self, client, bob, ids):
        res = client.post('/api/ai/save', json={
            'type': 'template', 'name': 'AI Probe', 'exercise_ids': [ids['alice_custom'], ids['bob_custom']],
        }, headers=hdrs(bob))
        assert res.status_code == 201
        tmpl = client.get(f"/api/workout-templates/{res.get_json()['id']}", headers=hdrs(bob))
        assert self.SECRET not in tmpl.get_data(as_text=True)
        assert self._names(tmpl.get_json()) == ['Bob Curl']

    def test_workout_create_does_not_leak(self, client, bob, ids):
        """The workout write path takes exercise_template_id straight off the
        body, and the PR queries join ExerciseTemplate without a visibility
        filter, so an unchecked id came back out through the PR routes."""
        res = client.post('/api/workouts', json={
            'workoutName': 'Probe',
            'exercises': [{'name': 'Probe Lift', 'exercise_template_id': ids['alice_custom'],
                           'sets': [{'reps': 5, 'weight': 225}]}],
        }, headers=hdrs(bob))
        assert res.status_code in (200, 201), res.get_json()
        wid = res.get_json()['id']

        detail = client.get(f'/api/workouts/{wid}', headers=hdrs(bob))
        assert self.SECRET not in detail.get_data(as_text=True)
        assert detail.get_json()['exercises'][0]['exercise_template_id'] is None

        for path in ('/api/personal-records', '/api/personal-records/dashboard'):
            leak = client.get(path, headers=hdrs(bob))
            assert self.SECRET not in leak.get_data(as_text=True), path

    def test_workout_update_does_not_leak(self, client, bob, ids):
        wid = make_workout(client, bob, name='Probe')
        detail = client.get(f'/api/workouts/{wid}', headers=hdrs(bob)).get_json()
        ex_id = detail['exercises'][0]['id']

        res = client.put(f'/api/workouts/{wid}', json={
            'exercises': [{'id': ex_id, 'name': 'Squat',
                           'exercise_template_id': ids['alice_custom'],
                           'sets': [{'reps': 5, 'weight': 225}]}],
        }, headers=hdrs(bob))
        assert res.status_code == 200, res.get_json()

        after = client.get(f'/api/workouts/{wid}', headers=hdrs(bob))
        assert self.SECRET not in after.get_data(as_text=True)
        assert after.get_json()['exercises'][0]['exercise_template_id'] is None

    def test_workout_update_does_not_leak_via_new_exercise(self, client, bob, ids):
        wid = make_workout(client, bob, name='Probe')
        res = client.put(f'/api/workouts/{wid}', json={
            'exercises': [{'name': 'Added Lift', 'exercise_template_id': ids['alice_custom'],
                           'sets': [{'reps': 5, 'weight': 135}]}],
        }, headers=hdrs(bob))
        assert res.status_code == 200, res.get_json()

        after = client.get(f'/api/workouts/{wid}', headers=hdrs(bob))
        assert self.SECRET not in after.get_data(as_text=True)
        assert all(e['exercise_template_id'] is None for e in after.get_json()['exercises'])

    def test_owner_can_log_their_custom_exercise(self, client, alice, ids):
        res = client.post('/api/workouts', json={
            'workoutName': 'Real',
            'exercises': [{'name': self.SECRET, 'exercise_template_id': ids['alice_custom'],
                           'sets': [{'reps': 5, 'weight': 225}]}],
        }, headers=hdrs(alice))
        assert res.status_code in (200, 201), res.get_json()
        detail = client.get(f"/api/workouts/{res.get_json()['id']}", headers=hdrs(alice)).get_json()
        assert detail['exercises'][0]['exercise_template_id'] == ids['alice_custom']

    def test_owner_can_still_use_their_custom_exercise(self, client, alice, ids):
        tid = make_template(client, alice, ex_ids=[ids['alice_custom']])
        tmpl = client.get(f'/api/workout-templates/{tid}', headers=hdrs(alice)).get_json()
        assert self._names(tmpl) == [self.SECRET]


class TestTemplateExerciseOrder:
    """Every path that builds a template must keep the order the user arranged.
    Routine and AI saves used to hand exercises to the relationship, leaving
    WorkoutTemplateExercise.order NULL, so templates came back in arbitrary order."""

    @pytest.fixture
    def ids(self):
        a, b, c = make_global_exercise('A Squat'), make_global_exercise('B Bench'), make_global_exercise('C Row')
        return [c, a, b]

    def _ids(self, template_dict):
        return [e['id'] for e in template_dict['exercises']]

    def test_template_create_and_update(self, client, alice, ids):
        tid = make_template(client, alice, ex_ids=ids)
        assert self._ids(client.get(f'/api/workout-templates/{tid}', headers=hdrs(alice)).get_json()) == ids
        reordered = [ids[2], ids[0], ids[1]]
        res = client.patch(f'/api/workout-templates/{tid}', json={'exercise_template_ids': reordered}, headers=hdrs(alice))
        assert self._ids(res.get_json()) == reordered

    def test_routine_create_and_update(self, client, alice, ids):
        res = client.post('/api/routines', json={
            'name': 'R', 'days': [{'label': 'A', 'exercise_template_ids': ids}],
        }, headers=hdrs(alice))
        assert self._ids(res.get_json()['days'][0]['workout_template']) == ids

        reordered = [ids[1], ids[2], ids[0]]
        res = client.patch(f"/api/routines/{res.get_json()['id']}", json={
            'days': [{'label': 'A', 'exercise_template_ids': reordered}],
        }, headers=hdrs(alice))
        assert self._ids(res.get_json()['days'][0]['workout_template']) == reordered

    def test_ai_save_template(self, client, alice, ids):
        res = client.post('/api/ai/save', json={'type': 'template', 'name': 'T', 'exercise_ids': ids}, headers=hdrs(alice))
        tmpl = client.get(f"/api/workout-templates/{res.get_json()['id']}", headers=hdrs(alice)).get_json()
        assert self._ids(tmpl) == ids

    def test_ai_save_routine(self, client, alice, ids):
        second = [ids[1], ids[0]]
        res = client.post('/api/ai/save', json={
            'type': 'routine', 'name': 'R',
            'days': [{'label': 'A', 'exercise_ids': ids}, {'label': 'B', 'exercise_ids': second}],
        }, headers=hdrs(alice))
        routine = client.get(f"/api/routines/{res.get_json()['id']}", headers=hdrs(alice)).get_json()
        days = sorted(routine['days'], key=lambda d: d['label'])
        assert self._ids(days[0]['workout_template']) == ids
        assert self._ids(days[1]['workout_template']) == second



class TestListsAndExports:

    def test_private_custom_exercise_not_in_other_users_library(self, client, alice, bob):
        make_custom_exercise(client, alice, 'Alice Secret Curl')
        names = [e['name'] for e in client.get('/api/exercises', headers=hdrs(bob)).get_json()]
        assert 'Alice Secret Curl' not in names
        mine = [e['name'] for e in client.get('/api/exercises', headers=hdrs(alice)).get_json()]
        assert 'Alice Secret Curl' in mine

    def test_export_contains_only_own_workouts(self, client, alice, bob):
        make_workout(client, alice, name='Alice Leg Day')
        make_workout(client, bob, name='Bob Push Day')
        export = client.get('/api/workouts/export', headers=hdrs(bob)).get_data(as_text=True)
        assert 'Bob Push Day' in export
        assert 'Alice Leg Day' not in export
