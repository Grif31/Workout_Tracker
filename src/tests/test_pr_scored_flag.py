"""The workout POST marks which new PRs are on lifts the Strength Score ranks,
so the summary screen only offers "see where this ranks" where there is a rank."""
from models import db, ExerciseTemplate


def _h(token):
    return {'Authorization': f'Bearer {token}'}


def _new_prs(client, h, template_id, name):
    res = client.post('/api/workouts', headers=h, json={
        'workoutName': 'Test', 'date': '2026-10-01',
        'exercises': [{
            'name': name, 'exercise_template_id': template_id,
            'sets': [{'reps': 5, 'weight': 200, 'order': 0}],
        }],
    })
    assert res.status_code == 201, res.get_json()
    return [p for p in res.get_json()['new_prs'] if p['pr_type'] == 'max_weight']


def _exercise(client, h, name):
    return client.post('/api/exercises', json={'name': name, 'muscle_group': 'Chest', 'equipment': 'Barbell'},
                       headers=h).get_json()['id']


def test_pr_on_a_ranked_lift_is_flagged(client, auth_token, app):
    h = _h(auth_token)
    tid = _exercise(client, h, 'Scored Bench')
    with app.app_context():
        db.session.get(ExerciseTemplate, tid).standards_key = 'bench_press'
        db.session.commit()
    prs = _new_prs(client, h, tid, 'Scored Bench')
    assert prs and prs[0]['scored'] is True


def test_pr_on_an_unranked_lift_is_not(client, auth_token):
    h = _h(auth_token)
    tid = _exercise(client, h, 'Odd Cable Thing')
    prs = _new_prs(client, h, tid, 'Odd Cable Thing')
    assert prs and prs[0]['scored'] is False
