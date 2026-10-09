"""Strength gain rate: the pure fit (utils/pr_velocity.py) and GET /api/stats/pr-velocity."""
from datetime import date, timedelta

import pytest

from utils.pr_velocity import compute_velocity

TODAY = date(2026, 10, 7)


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def pts(*weeks_ago_and_value):
    return [(TODAY - timedelta(weeks=w), v) for w, v in weeks_ago_and_value]


class TestComputeVelocity:

    def test_a_steady_climb_is_gaining(self):
        out = compute_velocity(pts((8, 200), (6, 205), (4, 210), (2, 215), (0, 220)), TODAY)
        assert out['status'] == 'gaining'
        assert out['rate_per_month'] == pytest.approx(10.9, abs=0.3)  # 20 lbs over 8 weeks
        assert out['rate_pct_per_month'] > 4
        assert out['current_e1rm'] == 220

    def test_flat_over_eight_weeks_is_a_plateau(self):
        out = compute_velocity(pts((10, 200), (8, 200), (6, 201), (4, 200), (2, 200.5), (0, 200)), TODAY)
        assert out['status'] == 'plateau'
        assert abs(out['rate_pct_per_month']) < 1

    def test_only_the_last_eight_weeks_decide_a_plateau(self):
        # A big climb early, then nothing for two months
        out = compute_velocity(pts((11, 150), (10, 170), (8, 200), (6, 200), (4, 200), (2, 200), (0, 200)), TODAY)
        assert out['status'] == 'plateau'

    def test_falling_is_declining(self):
        out = compute_velocity(pts((8, 220), (6, 215), (4, 210), (2, 205), (0, 200)), TODAY)
        assert out['status'] == 'declining'
        assert out['rate_per_month'] < 0

    def test_flat_data_that_does_not_span_eight_weeks_is_not_called_a_plateau(self):
        out = compute_velocity(pts((4, 200), (3, 200), (2, 200), (0, 200)), TODAY)
        assert out['status'] == 'insufficient'

    def test_too_few_sessions_or_too_short_a_span(self):
        assert compute_velocity(pts((6, 200), (3, 205), (0, 210)), TODAY)['status'] == 'insufficient'
        assert compute_velocity([(TODAY - timedelta(days=d), 200 + d) for d in (0, 1, 2, 3, 4)], TODAY)['status'] == 'insufficient'

    def test_insufficient_still_reports_the_current_best(self):
        out = compute_velocity(pts((1, 190), (0, 200)), TODAY)
        assert out == {'sessions': 2, 'current_e1rm': 200, 'status': 'insufficient',
                       'rate_per_month': None, 'rate_pct_per_month': None}

    def test_points_may_arrive_in_any_order(self):
        shuffled = pts((0, 220), (8, 200), (4, 210), (2, 215), (6, 205))
        assert compute_velocity(shuffled, TODAY)['status'] == 'gaining'

    def test_no_points(self):
        assert compute_velocity([], TODAY)['status'] == 'insufficient'


class TestPrVelocityRoute:

    def _template(self, client, token, name='Bench Press'):
        res = client.post('/api/exercises', json={'name': name, 'muscle_group': 'Chest'}, headers=auth_headers(token))
        assert res.status_code == 201
        return res.get_json()['id']

    def _log(self, client, token, tid, days_ago, weight, reps=5, set_type='N'):
        res = client.post('/api/workouts', json={
            'workoutName': 'W', 'date': (date.today() - timedelta(days=days_ago)).isoformat(),
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid, 'exercise_type': 'strength',
                           'sets': [{'reps': reps, 'weight': weight, 'set_type': set_type}]}],
        }, headers=auth_headers(token))
        assert res.status_code == 201, res.get_json()

    def _get(self, client, token, query=''):
        res = client.get(f'/api/stats/pr-velocity{query}', headers=auth_headers(token))
        assert res.status_code == 200
        return res.get_json()

    def test_requires_auth(self, client):
        assert client.get('/api/stats/pr-velocity').status_code == 401

    def test_new_user_has_nothing(self, client, auth_token):
        assert self._get(client, auth_token) == {'weight_unit': 'lbs', 'exercises': []}

    def test_reports_a_climbing_lift(self, client, auth_token):
        tid = self._template(client, auth_token)
        for days_ago, weight in ((56, 135), (42, 140), (28, 145), (14, 150), (0, 155)):
            self._log(client, auth_token, tid, days_ago, weight)
        (lift,) = self._get(client, auth_token)['exercises']
        assert lift['exercise_template_id'] == tid
        assert lift['exercise_name'] == 'Bench Press'
        assert lift['sessions'] == 5
        assert lift['status'] == 'gaining'
        assert lift['rate_per_month'] > 5

    def test_reports_a_stalled_lift(self, client, auth_token):
        tid = self._template(client, auth_token)
        for days_ago in (70, 56, 42, 28, 14, 0):
            self._log(client, auth_token, tid, days_ago, 185)
        assert self._get(client, auth_token)['exercises'][0]['status'] == 'plateau'

    def test_the_days_best_set_is_the_point_and_warmups_do_not_count(self, client, auth_token):
        tid = self._template(client, auth_token)
        self._log(client, auth_token, tid, 3, 300, set_type='W')
        self._log(client, auth_token, tid, 3, 100)
        (lift,) = self._get(client, auth_token)['exercises']
        assert lift['current_e1rm'] == pytest.approx(100 * (1 + 5 / 30), abs=0.1)

    def test_filters_to_one_exercise(self, client, auth_token):
        a = self._template(client, auth_token, 'Bench Press')
        b = self._template(client, auth_token, 'Squat')
        self._log(client, auth_token, a, 1, 135)
        self._log(client, auth_token, b, 1, 185)
        only = self._get(client, auth_token, f'?exercise_template_id={b}')['exercises']
        assert [e['exercise_template_id'] for e in only] == [b]

    def test_ignores_other_users_and_old_history(self, client, auth_token, auth_token2):
        tid = self._template(client, auth_token)
        self._log(client, auth_token, tid, 120, 135)  # beyond 12 weeks
        other = self._template(client, auth_token2)
        self._log(client, auth_token2, other, 1, 135)
        assert self._get(client, auth_token)['exercises'] == []
