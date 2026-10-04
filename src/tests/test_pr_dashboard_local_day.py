"""The PR Dashboard counts days in the user's own calendar, not the server's."""
from datetime import date, datetime, timedelta, timezone


def _h(token, local_date=None):
    h = {'Authorization': f'Bearer {token}'}
    if local_date:
        h['X-Local-Date'] = local_date.isoformat()
    return h


def _bench(client, token):
    return client.post('/api/exercises', json={
        'name': 'Bench Z', 'equipment': 'Barbell', 'muscle_group': 'Chest',
    }, headers=_h(token)).get_json()['id']


def test_a_pr_from_the_users_today_is_zero_days_old(client, auth_token):
    # A US evening: the server (UTC) has already moved on to the next day.
    # Relative to the UTC date, since user_today() only trusts a claimed date
    # within a day of it; relative to the machine's own date this failed
    # whenever the machine's evening was already tomorrow in UTC.
    users_today = datetime.now(timezone.utc).date() - timedelta(days=1)
    ex_id = _bench(client, auth_token)
    client.post('/api/workouts', json={
        'workoutName': 'W', 'date': users_today.isoformat(),
        'exercises': [{'name': 'Bench Z', 'exercise_template_id': ex_id, 'sets': [{'reps': 5, 'weight': 200}]}],
    }, headers=_h(auth_token, users_today))

    stats = client.get('/api/personal-records/dashboard', headers=_h(auth_token, users_today)).get_json()['stats']
    row = next(r for r in stats['days_since_last_pr'] if r['exercise_template_id'] == ex_id)
    assert row['days_since_last_pr'] == 0


def test_pr_list_carries_the_strength_standard(client, auth_token):
    h = _h(auth_token)
    tmpl = client.post('/api/exercises', json={
        'name': 'Bench Press', 'equipment': 'Barbell', 'muscle_group': 'Chest',
    }, headers=h).get_json()
    client.post('/api/workouts', json={
        'workoutName': 'W', 'date': date.today().isoformat(),
        'exercises': [{'name': 'Bench Press', 'exercise_template_id': tmpl['id'], 'sets': [{'reps': 5, 'weight': 200}]}],
    }, headers=h)
    rows = client.get('/api/personal-records', headers=h).get_json()
    assert rows and all('standards_key' in r for r in rows)
