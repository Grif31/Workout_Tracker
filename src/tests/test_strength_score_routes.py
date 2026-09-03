"""
Tests for the strength-score routes:
  GET /api/stats/strength-score          — true-1RM-vs-Epley priority
  GET /api/stats/strength-score/history  — snapshot history list
plus the percentile -> rank / greek-rank tier mapping helpers.
"""
import pytest
from models import db, ExerciseTemplate
from utils.strength_standards import percentile_to_strength_rank, greek_rank_from_score


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def create_standards_exercise(client, token, name, standards_key, muscle_group='Chest'):
    res = client.post('/api/exercises', json={'name': name, 'muscle_group': muscle_group}, headers=auth_headers(token))
    assert res.status_code == 201
    tid = res.get_json()['id']
    tmpl = db.session.get(ExerciseTemplate, tid)
    tmpl.standards_key = standards_key
    db.session.commit()
    return tid


def post_strength_workout(client, token, template_id, exercise_name, sets):
    payload = {
        'workoutName': 'Test Workout',
        'exercises': [{
            'name': exercise_name,
            'exercise_template_id': template_id,
            'sets': sets,
        }],
    }
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()


class TestTrueOneRepMaxPriority:

    def test_true_1rm_overrides_higher_epley_estimate(self, client, auth_token, registered_user):
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')

        # 250x6 -> Epley estimate = 250 * (1 + 6/30) = 300 lbs (inflated).
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 6, 'weight': 250}])
        # A real, achieved 285 lb single -- lower than the inflated estimate,
        # but this IS how strong the user actually is.
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 285}])

        res = client.get('/api/stats/strength-score', headers=auth_headers(auth_token))
        assert res.status_code == 200
        body = res.get_json()

        bench = next(e for e in body['big6'] if e['exercise'] == 'Bench Press')
        assert bench['estimated_1rm'] == 285

    def test_falls_back_to_estimate_when_no_true_1rm_logged(self, client, auth_token, registered_user):
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')

        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 6, 'weight': 250}])

        res = client.get('/api/stats/strength-score', headers=auth_headers(auth_token))
        assert res.status_code == 200
        body = res.get_json()

        bench = next(e for e in body['big6'] if e['exercise'] == 'Bench Press')
        assert bench['estimated_1rm'] == 300


class TestStrengthScoreHistory:
    """GET /api/stats/strength-score/history — the standalone snapshot list the
    Strength Score chart reads (distinct from the `history` key on the main
    endpoint's payload)."""

    def _history(self, client, token):
        res = client.get('/api/stats/strength-score/history', headers=auth_headers(token))
        assert res.status_code == 200
        return res.get_json()

    def test_requires_auth(self, client):
        assert client.get('/api/stats/strength-score/history').status_code == 401

    def test_empty_history_when_no_snapshots(self, client, auth_token):
        assert self._history(client, auth_token) == {'history': []}

    def test_records_a_snapshot_after_a_strength_score_fetch(self, client, auth_token, registered_user):
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 225}])

        # The main endpoint writes one snapshot (once per 24h) when strength data exists.
        client.get('/api/stats/strength-score', headers=auth_headers(auth_token))

        body = self._history(client, auth_token)
        assert len(body['history']) == 1
        entry = body['history'][0]
        assert set(entry) == {'date', 'score'}
        assert isinstance(entry['score'], (int, float))

    def test_does_not_double_count_within_24h(self, client, auth_token, registered_user):
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 225}])

        client.get('/api/stats/strength-score', headers=auth_headers(auth_token))
        client.get('/api/stats/strength-score', headers=auth_headers(auth_token))

        assert len(self._history(client, auth_token)['history']) == 1

    def test_history_is_per_user(self, client, auth_token, auth_token2, registered_user):
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 185}, headers=auth_headers(auth_token))
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 225}])
        client.get('/api/stats/strength-score', headers=auth_headers(auth_token))

        assert self._history(client, auth_token2) == {'history': []}


class TestPercentileToStrengthRank:

    @pytest.mark.parametrize('pct,label,tier', [
        (0.0,   'Noobie',       1),
        (9.9,   'Noobie',       3),
        (10.0,  'Beginner',     1),
        (25.0,  'Beginner',     3),
        (30.0,  'Intermediate', 1),
        (45.0,  'Intermediate', 2),
        (59.9,  'Intermediate', 3),
        (60.0,  'Advanced',     1),
        (80.0,  'Elite',        1),
        (94.9,  'Elite',        3),
        (95.0,  'Legend',       1),
        (100.0, 'Legend',       3),
    ])
    def test_boundaries(self, pct, label, tier):
        r = percentile_to_strength_rank(pct)
        assert r['label'] == label
        assert r['tier'] == tier
        assert r['display'] == f'{label} {tier}'


class TestGreekRankFromScore:

    @pytest.mark.parametrize('score,name', [
        (0,    'Neophyte'),
        (11.9, 'Neophyte'),
        (12,   'Athlete'),
        (28,   'Hero'),
        (48,   'Demigod'),
        (65,   'Olympian'),
        (80,   'Titan'),
        (92,   'Aretē'),
        (100,  'Aretē'),
    ])
    def test_thresholds(self, score, name):
        assert greek_rank_from_score(score) == name
