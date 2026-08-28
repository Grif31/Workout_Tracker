"""
Tests for:
  - utils.strength_standards.compute_overall_score / compute_muscle_group_scores
    (shared Big6/compound/isolation weighting)
  - flask backfill-strength-score-snapshots CLI command
"""
from datetime import date, datetime, timedelta

import pytest
from models import db, ExerciseTemplate, StrengthScoreSnapshot
from utils.strength_standards import compute_overall_score, compute_muscle_group_scores


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def set_gender_and_bodyweight(client, token, gender='male', bodyweight=185):
    res = client.patch('/api/me', json={'gender': gender, 'bodyweight': bodyweight}, headers=auth_headers(token))
    assert res.status_code == 200


def create_standards_exercise(client, token, name, standards_key, muscle_group='Chest'):
    res = client.post('/api/exercises', json={'name': name, 'muscle_group': muscle_group}, headers=auth_headers(token))
    assert res.status_code == 201
    tid = res.get_json()['id']
    tmpl = db.session.get(ExerciseTemplate, tid)
    tmpl.standards_key = standards_key
    db.session.commit()
    return tid


def post_strength_workout(client, token, template_id, exercise_name, sets, date_str=None):
    payload = {
        'workoutName': 'Test Workout',
        'exercises': [{
            'name': exercise_name,
            'exercise_template_id': template_id,
            'sets': sets,
        }],
    }
    if date_str:
        payload['date'] = date_str
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()


def iso(d):
    return d.strftime('%Y-%m-%d')


# ---------------------------------------------------------------------------
# compute_overall_score / compute_muscle_group_scores
# ---------------------------------------------------------------------------

class TestComputeOverallScore:

    def test_big6_only(self):
        assert compute_overall_score({'Squat': 60}) == pytest.approx(60)

    def test_weights_big6_more_than_isolation(self):
        # A flat average of 60 (Big 6) and 0 (isolation) would be 30 — the
        # 70/10 weighting should keep it much closer to the Big 6 score.
        mixed = compute_overall_score({'Squat': 60, 'Barbell Curl': 0})
        assert mixed > 40

    def test_empty_returns_none(self):
        assert compute_overall_score({}) is None


class TestComputeMuscleGroupScores:

    def test_weights_within_group_like_overall_score(self):
        # Chest = Bench Press (Big 6) + Push-up (compound secondary) — a flat
        # average would be 50; the tiered weighting should sit well above it.
        results = compute_muscle_group_scores({'Bench Press': 80, 'Push-up': 20})
        chest = next(r for r in results if r['name'] == 'Chest')
        assert chest['score'] > 60

    def test_muscle_group_missing_when_no_tracked_exercise(self):
        results = compute_muscle_group_scores({'Barbell Curl': 50})
        assert all(r['name'] != 'Chest' for r in results)


# ---------------------------------------------------------------------------
# flask backfill-strength-score-snapshots
# ---------------------------------------------------------------------------

class TestBackfillStrengthScoreSnapshots:

    def test_creates_snapshots_from_pr_history(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        set_gender_and_bodyweight(client, auth_token)
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')

        old_date = date.today() - timedelta(days=30)
        new_date = date.today() - timedelta(days=1)
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 185}], date_str=iso(old_date))
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 225}], date_str=iso(new_date))

        assert StrengthScoreSnapshot.query.filter_by(user_id=user_id).count() == 0

        result = app.test_cli_runner().invoke(args=['backfill-strength-score-snapshots', '--apply'])
        assert result.exit_code == 0

        snaps = (
            StrengthScoreSnapshot.query
            .filter_by(user_id=user_id)
            .order_by(StrengthScoreSnapshot.created_at)
            .all()
        )
        assert len(snaps) == 2
        assert snaps[0].created_at.date() == old_date
        assert snaps[1].created_at.date() == new_date
        assert snaps[1].score > snaps[0].score

    def test_dry_run_writes_nothing(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        set_gender_and_bodyweight(client, auth_token)
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 185}])

        result = app.test_cli_runner().invoke(args=['backfill-strength-score-snapshots'])
        assert result.exit_code == 0
        assert 'DRY RUN' in result.output
        assert StrengthScoreSnapshot.query.filter_by(user_id=user_id).count() == 0

    def test_skips_users_missing_gender_or_bodyweight(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        result = app.test_cli_runner().invoke(args=['backfill-strength-score-snapshots', '--apply'])
        assert result.exit_code == 0
        assert 'skipped' in result.output
        assert StrengthScoreSnapshot.query.filter_by(user_id=user_id).count() == 0

    def test_does_not_duplicate_existing_snapshot_dates(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        set_gender_and_bodyweight(client, auth_token)
        tid = create_standards_exercise(client, auth_token, 'Bench Press', 'Bench Press')
        d = date.today() - timedelta(days=5)
        post_strength_workout(client, auth_token, tid, 'Bench Press', [{'reps': 1, 'weight': 185}], date_str=iso(d))

        # Simulate a real reactive snapshot already existing for that date —
        # the backfill must never touch or duplicate it.
        db.session.add(StrengthScoreSnapshot(user_id=user_id, score=42.0, created_at=datetime.combine(d, datetime.min.time())))
        db.session.commit()

        result = app.test_cli_runner().invoke(args=['backfill-strength-score-snapshots', '--apply'])
        assert result.exit_code == 0

        snaps = StrengthScoreSnapshot.query.filter_by(user_id=user_id).all()
        assert len(snaps) == 1
        assert snaps[0].score == 42.0
