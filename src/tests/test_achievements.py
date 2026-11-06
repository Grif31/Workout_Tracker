"""Achievements (TODO §27 Phase 1): badges awarded on save, kept once earned,
unit-native ladders, hidden badges never leaked, and the backfill's dates."""
from datetime import datetime

from models import db, ExerciseTemplate, UserAchievement, Workout


def hdrs(token):
    return {'Authorization': f'Bearer {token}'}


def _template(app, name, standards_key=None, exercise_type='strength', equipment='Barbell'):
    with app.app_context():
        t = ExerciseTemplate(name=name, equipment=equipment, standards_key=standards_key,
                             exercise_type=exercise_type)
        db.session.add(t)
        db.session.commit()
        return t.id


def _lift(client, token, tid, weight, reps=5, date=None, name='Bench Press', set_type='N'):
    payload = {
        'workoutName': 'Push Day',
        'duration': 60,
        'exercises': [{'name': name, 'exercise_template_id': tid,
                       'sets': [{'reps': reps, 'weight': weight, 'set_type': set_type}]}],
    }
    if date:
        payload['date'] = date
    res = client.post('/api/workouts', json=payload, headers=hdrs(token))
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _cardio(client, token, name, distance, unit='km', minutes=30, date=None, elevation=None, tid=None):
    payload = {
        'workoutName': name,
        'exercises': [{'name': name, 'exercise_type': 'cardio', 'exercise_template_id': tid,
                       'sets': [{'cardio_duration': minutes, 'distance': distance,
                                 'distance_unit': unit, 'elevation_gain': elevation}]}],
    }
    if date:
        payload['date'] = date
    res = client.post('/api/workouts', json=payload, headers=hdrs(token))
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _keys(new_achievements):
    return {a['key'] for a in new_achievements}


def _get(client, token):
    res = client.get('/api/achievements', headers=hdrs(token))
    assert res.status_code == 200
    return res.get_json()


def _track(data, track):
    return next(t for t in data['tracks'] if t['track'] == track)


def _feat(data, key):
    return next(f for f in data['feats'] if f['key'] == key)


class TestAwardOnSave:

    def test_first_workout_earns_ephebe(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        body = _lift(client, auth_token, tid, 100)
        ephebe = next(a for a in body['new_achievements'] if a['key'] == 'workouts_1')
        assert ephebe['title'] == 'Ephebe'
        assert ephebe['next'] == {'title': 'Palaestra', 'threshold': 10}
        assert ephebe['workout_id'] == body['id']

        # Announced once: the next save doesn't repeat it
        assert 'workouts_1' not in _keys(_lift(client, auth_token, tid, 100)['new_achievements'])

    def test_workout_with_no_completed_set_counts_for_nothing(self, client, auth_token):
        res = client.post('/api/workouts', json={
            'workoutName': 'Empty', 'exercises': [{'name': 'Bench Press', 'sets': [{'reps': 0, 'weight': 0}]}],
        }, headers=hdrs(auth_token))
        assert res.status_code == 201
        assert res.get_json()['new_achievements'] == []
        assert _track(_get(client, auth_token), 'workouts')['value'] == 0

    def test_edit_can_earn_a_badge(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        wid = _lift(client, auth_token, tid, 100)['id']
        res = client.put(f'/api/workouts/{wid}', json={'exercises': [{
            'name': 'Bench Press', 'exercise_template_id': tid,
            'sets': [{'reps': 1, 'weight': 135, 'set_type': 'N'}],
        }]}, headers=hdrs(auth_token))
        assert res.status_code == 200
        assert 'plates_bench_1' in _keys(res.get_json()['new_achievements'])

    def test_warm_up_never_earns_plates(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        body = _lift(client, auth_token, tid, 135, set_type='W')
        assert 'plates_bench_1' not in _keys(body['new_achievements'])

    def test_kept_once_earned_after_delete(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        wid = _lift(client, auth_token, tid, 225)['id']
        assert client.delete(f'/api/workouts/{wid}', headers=hdrs(auth_token)).status_code == 200

        data = _get(client, auth_token)
        bench = _track(data, 'plates_bench')
        assert [b['earned'] for b in bench['badges']] == [True, True, False, False]
        # The workout is gone, the badge isn't
        assert bench['badges'][1]['workout_id'] is None
        assert _track(data, 'workouts')['badges'][0]['earned'] is True


class TestUnits:

    def test_kg_user_gets_kg_thresholds(self, app, client, auth_token):
        client.patch('/api/me', json={'weight_unit': 'kg'}, headers=hdrs(auth_token))
        tid = _template(app, 'Bench Press', 'Bench Press')
        body = _lift(client, auth_token, tid, 100, reps=1)
        plates = {a['key']: a for a in body['new_achievements'] if a.get('track') == 'plates_bench'}
        assert set(plates) == {'plates_bench_1', 'plates_bench_2'}
        assert plates['plates_bench_2']['threshold'] == 100
        assert plates['plates_bench_2']['unit'] == 'kg'

        data = _get(client, auth_token)
        assert _track(data, 'volume')['badges'][0]['threshold'] == 5_000
        # Nothing a kg user sees is in pounds
        assert all(t['unit'] != 'lbs' for t in data['tracks'])
        assert _feat(data, 'feat_1000_club')['title'] == '450 kg Club'

    def test_unit_switch_never_awards_again(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        _lift(client, auth_token, tid, 225)                  # 1 and 2 plates in lbs
        client.patch('/api/me', json={'weight_unit': 'kg'}, headers=hdrs(auth_token))

        # 102 kg after the switch, past the kg rung-2 line: same rungs, nothing new
        body = _lift(client, auth_token, tid, 102)
        assert not any(k.startswith('plates_bench') for k in _keys(body['new_achievements']))
        with app.app_context():
            assert UserAchievement.query.filter(UserAchievement.key.like('plates_bench%')).count() == 2

        bench = _track(_get(client, auth_token), 'plates_bench')
        assert bench['unit'] == 'kg'
        assert bench['next']['threshold'] == 140

    def test_distance_ladder_follows_the_unit_runs_are_logged_in(self, client, auth_token):
        _cardio(client, auth_token, 'Running', 6.3, unit='mi')
        data = _get(client, auth_token)
        assert data['distance_unit'] == 'mi'
        running = _track(data, 'running')
        assert running['badges'][0]['threshold'] == 10
        assert running['value'] == 6.3


class TestHours:

    def _workout(self, client, token, duration, cardio_minutes=None):
        sets = ([{'cardio_duration': cardio_minutes, 'distance': 1, 'distance_unit': 'km'}]
                if cardio_minutes else [{'reps': 5, 'weight': 100}])
        res = client.post('/api/workouts', json={
            'workoutName': 'W', 'duration': duration,
            'exercises': [{'name': 'Running' if cardio_minutes else 'Curl',
                           'exercise_type': 'cardio' if cardio_minutes else 'strength', 'sets': sets}],
        }, headers=hdrs(token))
        assert res.status_code == 201

    def test_duration_is_minutes(self, client, auth_token):
        self._workout(client, auth_token, 90)
        assert _track(_get(client, auth_token), 'hours')['value'] == 1.5

    def test_forgotten_timer_is_capped(self, client, auth_token):
        self._workout(client, auth_token, 14 * 60)
        assert _track(_get(client, auth_token), 'hours')['value'] == 4

    def test_cardio_logged_after_the_fact_counts_its_minutes(self, client, auth_token):
        self._workout(client, auth_token, 0, cardio_minutes=360)
        assert _track(_get(client, auth_token), 'hours')['value'] == 6


class TestVisibility:

    def test_lifter_never_sees_running_or_ride(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        _lift(client, auth_token, tid, 100)
        data = _get(client, auth_token)
        visible = {t['track'] for t in data['tracks'] if t['visible']}
        assert {'workouts', 'hours', 'streak', 'prs', 'explorer', 'volume', 'plates_bench'} <= visible
        assert not visible & {'running', 'ride', 'elevation', 'plates_squat', 'plates_deadlift'}
        assert not _feat(data, 'feat_first_5k')['visible']
        # Totals count only what's shown
        shown = sum(t['total'] for t in data['tracks'] if t['visible']) + sum(f['visible'] for f in data['feats'])
        assert data['total_count'] == shown

    def test_first_run_reveals_running(self, client, auth_token):
        _cardio(client, auth_token, 'Running', 3)
        data = _get(client, auth_token)
        assert _track(data, 'running')['visible']
        assert not _track(data, 'ride')['visible']
        assert not _track(data, 'volume')['visible']

    def test_ride_counts_toward_ride_not_running(self, client, auth_token):
        body = _cardio(client, auth_token, 'Cycling', 160.934, minutes=300)
        keys = _keys(body['new_achievements'])
        assert 'feat_century' in keys
        assert not any(k.startswith('running_') or k == 'feat_marathon' for k in keys)


class TestFeats:

    def test_first_5k_allows_a_logged_3_1_miles(self, client, auth_token):
        assert 'feat_first_5k' in _keys(_cardio(client, auth_token, 'Running', 3.1, unit='mi')['new_achievements'])

    def test_bodyweight_bench(self, app, client, auth_token):
        client.post('/api/bodyweight', json={'weight': 180, 'date': '2026-01-01'}, headers=hdrs(auth_token))
        tid = _template(app, 'Bench Press', 'Bench Press')
        assert 'feat_bw_bench' not in _keys(_lift(client, auth_token, tid, 175, date='2026-02-01')['new_achievements'])
        assert 'feat_bw_bench' in _keys(_lift(client, auth_token, tid, 185, date='2026-02-02')['new_achievements'])

    def test_comeback_after_two_weeks(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        _lift(client, auth_token, tid, 100, date='2026-03-02')
        assert 'feat_nostos' not in _keys(_lift(client, auth_token, tid, 100, date='2026-03-15')['new_achievements'])
        assert 'feat_nostos' in _keys(_lift(client, auth_token, tid, 100, date='2026-03-29')['new_achievements'])

    def test_weekly_streak(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        _lift(client, auth_token, tid, 100, date='2026-03-02')   # Monday
        _lift(client, auth_token, tid, 100, date='2026-03-08')   # Sunday, same week
        assert 'streak_1' not in _keys(_lift(client, auth_token, tid, 100, date='2026-03-04')['new_achievements'])
        assert 'streak_1' in _keys(_lift(client, auth_token, tid, 100, date='2026-03-09')['new_achievements'])
        assert _track(_get(client, auth_token), 'streak')['value'] == 2


class TestHidden:

    def test_unearned_hidden_badges_are_never_sent(self, client, auth_token):
        res = client.get('/api/achievements', headers=hdrs(auth_token))
        data = res.get_json()
        assert data['hidden'] == []
        assert data['hidden_remaining'] == 6
        from utils.achievements import HIDDEN
        for key, title in HIDDEN.items():
            assert key.encode() not in res.data and title.encode() not in res.data

    def test_triad_needs_all_three_lifts_in_one_week(self, app, client, auth_token):
        bench = _template(app, 'Bench Press', 'Bench Press')
        squat = _template(app, 'Squat', 'Squat')
        dead = _template(app, 'Deadlift', 'Deadlift')
        _lift(client, auth_token, bench, 100, date='2026-03-02', name='Bench Press')
        _lift(client, auth_token, squat, 100, date='2026-03-03', name='Squat')
        assert 'hidden_triad' in _keys(
            _lift(client, auth_token, dead, 100, date='2026-03-05', name='Deadlift')['new_achievements'])

    def test_new_year_workout_finds_neomenia(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        body = _lift(client, auth_token, tid, 100, date='2027-01-01')
        assert 'hidden_neomenia' in _keys(body['new_achievements'])
        data = _get(client, auth_token)
        assert [h['title'] for h in data['hidden']] == ['Neomenia']
        assert data['hidden_remaining'] == 5


class TestSeen:

    def test_seen_clears_unseen(self, app, client, auth_token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        _lift(client, auth_token, tid, 100)
        assert 'workouts_1' in _get(client, auth_token)['unseen']

        res = client.post('/api/achievements/seen', json={'keys': ['workouts_1']}, headers=hdrs(auth_token))
        assert res.status_code == 200
        unseen = _get(client, auth_token)['unseen']
        assert 'workouts_1' not in unseen and unseen

        client.post('/api/achievements/seen', json={}, headers=hdrs(auth_token))
        assert _get(client, auth_token)['unseen'] == []

    def test_seen_is_per_user(self, app, client, auth_token, auth_token2):
        tid = _template(app, 'Bench Press', 'Bench Press')
        _lift(client, auth_token, tid, 100)
        client.post('/api/achievements/seen', json={}, headers=hdrs(auth_token2))
        assert 'workouts_1' in _get(client, auth_token)['unseen']

    def test_rejects_malformed_keys(self, client, auth_token):
        res = client.post('/api/achievements/seen', json={'keys': 'workouts_1'}, headers=hdrs(auth_token))
        assert res.status_code == 400


class TestBackfill:

    def _history(self, app, client, token):
        tid = _template(app, 'Bench Press', 'Bench Press')
        _lift(client, token, tid, 100, date='2025-06-01')
        _lift(client, token, tid, 135, date='2025-07-15')
        with app.app_context():
            UserAchievement.query.delete()
            db.session.commit()

    def test_dry_run_writes_nothing(self, app, client, auth_token):
        self._history(app, client, auth_token)
        result = app.test_cli_runner().invoke(args=['backfill-achievements'])
        assert result.exit_code == 0, result.output
        assert 'DRY RUN' in result.output
        with app.app_context():
            assert UserAchievement.query.count() == 0

    def test_apply_dates_badges_by_the_workout_that_earned_them(self, app, client, auth_token):
        self._history(app, client, auth_token)
        result = app.test_cli_runner().invoke(args=['backfill-achievements', '--apply'])
        assert result.exit_code == 0, result.output
        with app.app_context():
            rows = {r.key: r for r in UserAchievement.query.all()}
            assert rows['workouts_1'].earned_at == datetime(2025, 6, 1)
            assert rows['plates_bench_1'].earned_at == datetime(2025, 7, 15)
            assert rows['plates_bench_1'].workout_id == (
                Workout.query.filter(Workout.date == datetime(2025, 7, 15)).one().id)
            assert all(r.seen for r in rows.values())

        # Re-running finds nothing new
        again = app.test_cli_runner().invoke(args=['backfill-achievements', '--apply'])
        assert '0 badge(s)' in again.output


def test_account_deletion_removes_badges(app, client, auth_token):
    tid = _template(app, 'Bench Press', 'Bench Press')
    _lift(client, auth_token, tid, 100)
    res = client.delete('/api/me', headers=hdrs(auth_token), json={'password': 'password123'})
    assert res.status_code in (200, 204), res.get_json()
    with app.app_context():
        assert UserAchievement.query.count() == 0


def test_reported_distance_unit_beats_the_last_logged_set(client, auth_token):
    _cardio(client, auth_token, 'Running', 5, unit='km')
    res = client.patch('/api/me', json={'distance_unit': 'mi'}, headers=hdrs(auth_token))
    assert res.status_code == 200 and res.get_json()['distance_unit'] == 'mi'
    data = _get(client, auth_token)
    assert data['distance_unit'] == 'mi'
    assert _track(data, 'running')['value'] == 3.1
    assert client.patch('/api/me', json={'distance_unit': 'miles'}, headers=hdrs(auth_token)).status_code == 400
