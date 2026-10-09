"""GET /api/exercises/<id>/alternatives and the injury rules behind it."""
import pytest

from utils.exercise_alternatives import is_excluded


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


class TestIsExcluded:

    @pytest.mark.parametrize('name,area', [
        ('Conventional Deadlift', 'lower_back'), ('Sumo Deadlift', 'lower_back'), ('Good Morning', 'lower_back'),
        ('Bent Over Row', 'lower_back'), ('Barbell Squat', 'knees'), ('Leg Press', 'knees'),
        ('Walking Lunge', 'knees'), ('Overhead Press', 'shoulders'), ('Seated Shoulder Press', 'shoulders'),
        ('Upright Row', 'shoulders'),
    ])
    def test_flags_what_loads_the_area(self, name, area):
        assert is_excluded(name, [area]) is True

    @pytest.mark.parametrize('name,area', [
        ('Romanian Deadlift', 'lower_back'), ('Trap Bar Deadlift', 'lower_back'), ('Seated Cable Row', 'lower_back'),
        ('Hip Thrust', 'knees'), ('Leg Curl', 'knees'), ('Step-Up', 'knees'),
        ('Incline Bench Press', 'shoulders'), ('Lateral Raise', 'shoulders'),
    ])
    def test_keeps_what_the_coach_calls_safe(self, name, area):
        assert is_excluded(name, [area]) is False

    def test_only_the_flagged_areas_apply(self):
        assert is_excluded('Barbell Squat', ['shoulders']) is False
        assert is_excluded('Barbell Squat', ['shoulders', 'knees']) is True

    def test_nothing_flagged_excludes_nothing(self):
        assert is_excluded('Conventional Deadlift', []) is False
        assert is_excluded('Conventional Deadlift', ['unknown_area']) is False


class TestAlternativesRoute:

    def _make(self, client, token, name, muscle, equipment, exercise_type='strength'):
        res = client.post('/api/exercises', json={
            'name': name, 'muscle_group': muscle, 'equipment': equipment, 'exercise_type': exercise_type,
        }, headers=auth_headers(token))
        assert res.status_code == 201, res.get_json()
        return res.get_json()['id']

    def _get(self, client, token, tid, query=''):
        return client.get(f'/api/exercises/{tid}/alternatives{query}', headers=auth_headers(token))

    def _names(self, res):
        return [a['name'] for a in res.get_json()['alternatives']]

    def test_requires_auth(self, client):
        assert client.get('/api/exercises/1/alternatives').status_code == 401

    def test_unknown_exercise_is_a_404(self, client, auth_token):
        assert self._get(client, auth_token, 999999).status_code == 404

    def test_same_primary_muscle_on_other_equipment(self, client, auth_token):
        src = self._make(client, auth_token, 'Bench Press', 'Chest', 'Barbell')
        self._make(client, auth_token, 'Dumbbell Fly', 'Chest', 'Dumbbell')
        self._make(client, auth_token, 'Cable Crossover', 'Chest', 'Cable')
        self._make(client, auth_token, 'Barbell Pullover', 'Chest', 'Barbell')   # same equipment
        self._make(client, auth_token, 'Barbell Row', 'Back', 'Cable')           # other muscle
        assert sorted(self._names(self._get(client, auth_token, src))) == ['Cable Crossover', 'Dumbbell Fly']

    def test_matches_on_the_primary_muscle_not_a_secondary(self, client, auth_token):
        src = self._make(client, auth_token, 'Bench Press', 'Chest,Triceps', 'Barbell')
        self._make(client, auth_token, 'Triceps Pushdown', 'Triceps,Chest', 'Cable')
        self._make(client, auth_token, 'Cable Fly', 'Chest', 'Cable')
        assert self._names(self._get(client, auth_token, src)) == ['Cable Fly']

    def test_the_same_movement_on_other_equipment_comes_first(self, client, auth_token):
        src = self._make(client, auth_token, 'Bench Press', 'Chest', 'Barbell')
        self._make(client, auth_token, 'Aardvark Fly', 'Chest', 'Cable')
        self._make(client, auth_token, 'Bench Press', 'Chest', 'Dumbbell')
        alts = self._get(client, auth_token, src).get_json()['alternatives']
        assert [a['name'] for a in alts] == ['Bench Press', 'Aardvark Fly']
        assert [a['same_movement'] for a in alts] == [True, False]

    def test_skips_what_loads_a_flagged_injury(self, client, auth_token):
        src = self._make(client, auth_token, 'Barbell Squat', 'Quads', 'Barbell')
        self._make(client, auth_token, 'Leg Press', 'Quads', 'Machine')
        self._make(client, auth_token, 'Step-Up', 'Quads', 'Dumbbell')
        assert sorted(self._names(self._get(client, auth_token, src))) == ['Leg Press', 'Step-Up']
        assert self._names(self._get(client, auth_token, src, '?avoid=knees')) == ['Step-Up']
        assert self._names(self._get(client, auth_token, src, '?avoid=knees,lower_back')) == ['Step-Up']

    def test_cardio_has_no_alternatives(self, client, auth_token):
        src = self._make(client, auth_token, 'Rowing', 'Cardio', 'Machine', 'cardio')
        self._make(client, auth_token, 'Cycling', 'Cardio', 'Bike', 'cardio')
        assert self._get(client, auth_token, src).get_json() == {'alternatives': []}

    def test_does_not_offer_another_users_custom_exercises(self, client, auth_token, auth_token2):
        src = self._make(client, auth_token, 'Bench Press', 'Chest', 'Barbell')
        self._make(client, auth_token2, 'Secret Fly', 'Chest', 'Cable')
        assert self._names(self._get(client, auth_token, src)) == []

    def test_cannot_ask_about_another_users_custom_exercise(self, client, auth_token, auth_token2):
        theirs = self._make(client, auth_token2, 'Secret Fly', 'Chest', 'Cable')
        assert self._get(client, auth_token, theirs).status_code == 404

    def test_garbage_avoid_values_are_ignored(self, client, auth_token):
        src = self._make(client, auth_token, 'Bench Press', 'Chest', 'Barbell')
        self._make(client, auth_token, 'Cable Fly', 'Chest', 'Cable')
        assert self._names(self._get(client, auth_token, src, '?avoid=,,nonsense,')) == ['Cable Fly']
