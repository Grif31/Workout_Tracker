"""Stats totals come back in the user's weight unit.

Workout.volume is stored in lbs. Every endpoint that labels a volume with
weight_unit converts it; kg users used to get the lbs figure labelled kg.
"""
from datetime import date, timedelta

import pytest


def _headers(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def kg_user_with_500kg(client, auth_token):
    """A kg user who has logged 100 kg x 5 = 500 kg of volume today."""
    h = _headers(auth_token)
    client.patch('/api/me', json={'weight_unit': 'kg'}, headers=h)
    ex_id = client.post('/api/exercises', json={
        'name': 'Bench K', 'equipment': 'Barbell', 'muscle_group': 'Chest',
    }, headers=h).get_json()['id']
    res = client.post('/api/workouts', json={
        'workoutName': 'W', 'date': date.today().isoformat(),
        'exercises': [{'name': 'Bench K', 'exercise_template_id': ex_id, 'sets': [{'reps': 5, 'weight': 100}]}],
    }, headers=h)
    assert res.status_code == 201
    return h, ex_id


def test_progress_buckets_are_in_kg(client, kg_user_with_500kg):
    h, _ = kg_user_with_500kg
    buckets = client.get('/api/stats/progress?range=30d', headers=h).get_json()['buckets']
    assert sum(b['volume'] for b in buckets) == 500


def test_weekly_summary_totals_are_in_kg(client, kg_user_with_500kg):
    h, _ = kg_user_with_500kg
    this_week = client.get(f'/api/stats/weekly-summary?week={date.today().isoformat()}', headers=h).get_json()
    assert this_week['weight_unit'] == 'kg'
    assert this_week['total_volume'] == 500

    # Viewed from next week, this week is the previous one
    next_week = (date.today() + timedelta(weeks=1)).isoformat()
    following = client.get(f'/api/stats/weekly-summary?week={next_week}', headers=h).get_json()
    assert following['prev_week_volume'] == 500


def test_weekly_summary_history_is_in_kg(client, kg_user_with_500kg):
    # History lists completed weeks, so log the same 500 kg last week
    h, ex_id = kg_user_with_500kg
    client.post('/api/workouts', json={
        'workoutName': 'W', 'date': (date.today() - timedelta(weeks=1)).isoformat(),
        'exercises': [{'name': 'Bench K', 'exercise_template_id': ex_id, 'sets': [{'reps': 5, 'weight': 100}]}],
    }, headers=h)
    history = client.get('/api/stats/weekly-summary/history', headers=h).get_json()
    assert 500 in [w['total_volume'] for w in history]


def test_profile_lifetime_volume_is_in_kg(client, kg_user_with_500kg):
    h, _ = kg_user_with_500kg
    assert client.get('/api/stats/profile', headers=h).get_json()['total_volume'] == 500


def test_lbs_users_are_unchanged(client, auth_token):
    h = _headers(auth_token)
    ex_id = client.post('/api/exercises', json={
        'name': 'Bench L', 'equipment': 'Barbell', 'muscle_group': 'Chest',
    }, headers=h).get_json()['id']
    client.post('/api/workouts', json={
        'workoutName': 'W', 'date': date.today().isoformat(),
        'exercises': [{'name': 'Bench L', 'exercise_template_id': ex_id, 'sets': [{'reps': 5, 'weight': 225}]}],
    }, headers=h)
    assert client.get('/api/stats/profile', headers=h).get_json()['total_volume'] == 1125
