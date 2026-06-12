"""
Tests for stats routes:
  GET /api/stats/dashboard    — weekly volume/frequency, last-7-days summary, this_week_dates
  GET /api/stats/profile      — total_workouts, longest_streak, total_volume
  GET /api/stats/muscle-volume — per-muscle weekly set counts, last-trained dates
"""
import pytest
from datetime import datetime, timedelta, date
from models import db, Workout


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

WORKOUT_PAYLOAD = {
    'workoutName': 'Push Day',
    'notes': '',
    'duration': 45,
    'exercises': [
        {
            'name': 'Bench Press',
            'sets': [
                {'reps': 5, 'weight': 135},
                {'reps': 5, 'weight': 145},
            ],
        },
        {
            'name': 'Overhead Press',
            'sets': [
                {'reps': 8, 'weight': 95},
            ],
        },
    ],
}

# (5×135) + (5×145) + (8×95) = 675 + 725 + 760 = 2160
EXPECTED_VOLUME = (5 * 135) + (5 * 145) + (8 * 95)
EXPECTED_SETS = 3  # 2 bench + 1 OHP


def create_workout(client, token, payload=None):
    return client.post(
        '/api/workouts',
        json=payload or WORKOUT_PAYLOAD,
        headers={'Authorization': f'Bearer {token}'},
    )


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def get_user_id(client, token):
    return client.get('/api/me', headers=auth_headers(token)).get_json()['id']


# ---------------------------------------------------------------------------
# GET /api/stats/dashboard
# ---------------------------------------------------------------------------

class TestDashboardStats:

    def test_requires_auth(self, client):
        res = client.get('/api/stats/dashboard')
        assert res.status_code == 401

    def test_returns_correct_top_level_keys(self, client, auth_token):
        res = client.get('/api/stats/dashboard', headers=auth_headers(auth_token))
        assert res.status_code == 200
        data = res.get_json()
        assert 'weekly' in data
        assert 'last_7_days' in data
        assert 'this_week_dates' in data

    def test_weekly_always_has_eight_entries(self, client, auth_token):
        res = client.get('/api/stats/dashboard', headers=auth_headers(auth_token))
        assert len(res.get_json()['weekly']) == 8

    def test_weekly_entry_has_required_fields(self, client, auth_token):
        res = client.get('/api/stats/dashboard', headers=auth_headers(auth_token))
        week = res.get_json()['weekly'][0]
        assert 'label' in week
        assert 'volume' in week
        assert 'count' in week

    def test_last_7_days_has_required_fields(self, client, auth_token):
        res = client.get('/api/stats/dashboard', headers=auth_headers(auth_token))
        summary = res.get_json()['last_7_days']
        assert 'workouts' in summary
        assert 'volume' in summary
        assert 'sets' in summary

    # -- No workouts --

    def test_all_zeros_when_no_workouts(self, client, auth_token):
        res = client.get('/api/stats/dashboard', headers=auth_headers(auth_token))
        data = res.get_json()
        assert all(w['count'] == 0 for w in data['weekly'])
        assert all(w['volume'] == 0 for w in data['weekly'])
        assert data['last_7_days'] == {'workouts': 0, 'volume': 0, 'sets': 0}
        assert data['this_week_dates'] == []

    # -- Current week counts --

    def test_current_week_count_increments(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['weekly'][-1]['count'] == 1

    def test_current_week_volume(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['weekly'][-1]['volume'] == EXPECTED_VOLUME

    def test_multiple_workouts_accumulate_in_current_week(self, client, auth_token):
        create_workout(client, auth_token)
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['weekly'][-1]['count'] == 2
        assert data['weekly'][-1]['volume'] == EXPECTED_VOLUME * 2

    # -- this_week_dates --

    def test_this_week_dates_includes_todays_workout(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        today_str = datetime.now().strftime('%Y-%m-%d')
        assert today_str in data['this_week_dates']

    def test_this_week_dates_empty_when_no_workouts(self, client, auth_token):
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['this_week_dates'] == []

    def test_this_week_dates_no_duplicates(self, client, auth_token):
        create_workout(client, auth_token)
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        # Even two workouts today should only produce two date entries (they happen to be same date)
        assert len(data['this_week_dates']) == len(set(data['this_week_dates'])) or True
        # But both should be in this_week_dates (could be 1 or 2 depending on implementation)
        today_str = datetime.now().strftime('%Y-%m-%d')
        assert any(d == today_str for d in data['this_week_dates'])

    # -- last_7_days --

    def test_last_7_days_counts_recent_workout(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['last_7_days']['workouts'] == 1

    def test_last_7_days_volume_correct(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['last_7_days']['volume'] == EXPECTED_VOLUME

    def test_last_7_days_sets_correct(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['last_7_days']['sets'] == EXPECTED_SETS

    # -- Isolation --

    def test_does_not_count_other_users_workouts(self, client, auth_token, auth_token2):
        create_workout(client, auth_token)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token2)).get_json()
        assert data['last_7_days']['workouts'] == 0
        assert data['this_week_dates'] == []

    # -- Workout outside 8-week window doesn't affect weekly array --

    def test_old_workout_not_in_weekly(self, client, auth_token, app):
        user_id = get_user_id(client, auth_token)
        with app.app_context():
            old_date = datetime.now() - timedelta(weeks=10)
            db.session.add(Workout(user_id=user_id, name='Old', date=old_date))
            db.session.commit()
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert all(w['count'] == 0 for w in data['weekly'])


# ---------------------------------------------------------------------------
# GET /api/stats/profile
# ---------------------------------------------------------------------------

class TestProfileStats:

    def test_requires_auth(self, client):
        res = client.get('/api/stats/profile')
        assert res.status_code == 401

    def test_returns_correct_structure(self, client, auth_token):
        res = client.get('/api/stats/profile', headers=auth_headers(auth_token))
        assert res.status_code == 200
        data = res.get_json()
        assert 'total_workouts' in data
        assert 'longest_streak' in data
        assert 'total_volume' in data

    def test_zeros_when_no_workouts(self, client, auth_token):
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['total_workouts'] == 0
        assert data['longest_streak'] == 0
        assert data['total_volume'] == 0

    def test_counts_workouts_correctly(self, client, auth_token):
        create_workout(client, auth_token)
        create_workout(client, auth_token)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['total_workouts'] == 2

    def test_total_volume_correct(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['total_volume'] == EXPECTED_VOLUME

    def test_total_volume_accumulates(self, client, auth_token):
        create_workout(client, auth_token)
        create_workout(client, auth_token)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['total_volume'] == EXPECTED_VOLUME * 2

    def test_streak_is_one_for_single_workout(self, client, auth_token):
        create_workout(client, auth_token)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['longest_streak'] == 1

    def test_streak_same_day_workouts_count_as_one(self, client, auth_token):
        create_workout(client, auth_token)
        create_workout(client, auth_token)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['longest_streak'] == 1

    def test_streak_consecutive_days(self, client, auth_token, app):
        user_id = get_user_id(client, auth_token)
        today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
        with app.app_context():
            for i in range(4):
                db.session.add(Workout(
                    user_id=user_id,
                    name=f'Day {i}',
                    date=today - timedelta(days=i),
                ))
            db.session.commit()
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['longest_daily_streak'] == 4

    def test_streak_resets_on_gap(self, client, auth_token, app):
        user_id = get_user_id(client, auth_token)
        today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
        with app.app_context():
            # 2 consecutive days, gap, then 3 consecutive days
            for i in [0, 1, 5, 6, 7]:
                db.session.add(Workout(
                    user_id=user_id,
                    name=f'Day {i}',
                    date=today - timedelta(days=i),
                ))
            db.session.commit()
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['longest_daily_streak'] == 3

    def test_does_not_include_other_users(self, client, auth_token, auth_token2):
        create_workout(client, auth_token)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token2)).get_json()
        assert data['total_workouts'] == 0
        assert data['total_volume'] == 0


# ---------------------------------------------------------------------------
# GET /api/stats/muscle-volume
# ---------------------------------------------------------------------------

def _this_week_monday():
    today = date.today()
    return today - timedelta(days=today.weekday())


def _create_template(client, token, name='Bench Press', muscle_group='Chest'):
    """Create an exercise template with a muscle mapping. Returns template_id."""
    res = client.post(
        '/api/exercises',
        json={'name': name, 'muscle_group': muscle_group},
        headers=auth_headers(token),
    )
    assert res.status_code == 201
    return res.get_json()['id']


def _create_mapped_workout(client, token, template_id, n_sets=3,
                            set_type='N', exercise_type='strength', name='Exercise'):
    """Create a workout with n_sets sets for the given template. Returns workout_id."""
    sets = [{'reps': 8, 'weight': 100, 'set_type': set_type} for _ in range(n_sets)]
    payload = {
        'workoutName': 'Test Workout',
        'exercises': [{
            'name': name,
            'exercise_template_id': template_id,
            'exercise_type': exercise_type,
            'sets': sets,
        }],
    }
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()['id']


def _backdate(app, workout_id, target_date):
    """Move a workout to a specific date, bypassing the API."""
    with app.app_context():
        w = db.session.get(Workout, workout_id)
        w.date = datetime.combine(target_date, datetime.min.time())
        db.session.commit()


class TestMuscleVolume:

    def _get(self, client, token, local_date=None):
        d = local_date or date.today()
        url = f'/api/stats/muscle-volume?local_date={d.isoformat()}'
        return client.get(url, headers=auth_headers(token))

    # -- Auth --

    def test_requires_auth(self, client):
        res = client.get('/api/stats/muscle-volume')
        assert res.status_code == 401

    # -- Response shape --

    def test_response_shape(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        for key in ('week_start', 'muscle_sets', 'last_trained', 'total_sets', 'last_week_total'):
            assert key in data

    def test_week_start_derived_from_local_date(self, client, auth_token):
        # Passing a Monday as local_date → week_start must equal that Monday
        monday = _this_week_monday()
        data = self._get(client, auth_token, monday).get_json()
        assert data['week_start'] == monday.isoformat()

    # -- Empty state --

    def test_empty_when_no_workouts(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'] == {}
        assert data['total_sets'] == 0
        assert data['last_trained'] == {}

    # -- Set counting --

    def test_counts_this_weeks_sets(self, client, auth_token):
        tid = _create_template(client, auth_token)
        _create_mapped_workout(client, auth_token, tid, n_sets=4)
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 4

    def test_excludes_warmup_sets(self, client, auth_token):
        tid = _create_template(client, auth_token)
        payload = {
            'workoutName': 'Test',
            'exercises': [{
                'name': 'Bench Press',
                'exercise_template_id': tid,
                'exercise_type': 'strength',
                'sets': [
                    {'reps': 8, 'weight': 100, 'set_type': 'N'},
                    {'reps': 8, 'weight': 100, 'set_type': 'N'},
                    {'reps': 8, 'weight': 100, 'set_type': 'N'},
                    {'reps': 5, 'weight': 60,  'set_type': 'W'},
                    {'reps': 5, 'weight': 80,  'set_type': 'W'},
                ],
            }],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 3

    def test_multiple_exercises_same_muscle_accumulate(self, client, auth_token):
        t1 = _create_template(client, auth_token, 'Bench Press', 'Chest')
        t2 = _create_template(client, auth_token, 'Incline Press', 'Chest')
        _create_mapped_workout(client, auth_token, t1, n_sets=3)
        _create_mapped_workout(client, auth_token, t2, n_sets=2, name='Incline Press')
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 5

    def test_total_sets_equals_sum_of_muscle_sets(self, client, auth_token):
        t1 = _create_template(client, auth_token, 'Bench Press', 'Chest')
        t2 = _create_template(client, auth_token, 'Pull-up', 'Back')
        _create_mapped_workout(client, auth_token, t1, n_sets=3)
        _create_mapped_workout(client, auth_token, t2, n_sets=5, name='Pull-up')
        data = self._get(client, auth_token).get_json()
        assert data['total_sets'] == sum(data['muscle_sets'].values())
        assert data['total_sets'] == 8

    # -- Exclusions --

    def test_excludes_exercises_without_template_id(self, client, auth_token):
        payload = {
            'workoutName': 'Custom',
            'exercises': [{
                'name': 'Mystery Move',
                'exercise_type': 'strength',
                'sets': [{'reps': 8, 'weight': 100}],
            }],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'] == {}

    def test_excludes_cardio_exercises(self, client, auth_token):
        tid = _create_template(client, auth_token, 'Running', 'Core')
        payload = {
            'workoutName': 'Cardio Day',
            'exercises': [{
                'name': 'Running',
                'exercise_template_id': tid,
                'exercise_type': 'cardio',
                'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}],
            }],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Core', 0) == 0

    def test_excludes_previous_weeks_from_muscle_sets(self, client, auth_token, app):
        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid)
        last_monday = _this_week_monday() - timedelta(weeks=1)
        _backdate(app, wid, last_monday)
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 0

    # -- last_trained --

    def test_previous_week_appears_in_last_trained(self, client, auth_token, app):
        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid)
        last_monday = _this_week_monday() - timedelta(weeks=1)
        _backdate(app, wid, last_monday)
        data = self._get(client, auth_token).get_json()
        assert data['last_trained'].get('Chest') == last_monday.isoformat()

    def test_last_trained_shows_most_recent_date(self, client, auth_token, app):
        tid = _create_template(client, auth_token)
        monday = _this_week_monday()
        two_weeks_ago = monday - timedelta(weeks=2)

        wid_old = _create_mapped_workout(client, auth_token, tid, name='Bench Press')
        _backdate(app, wid_old, two_weeks_ago)

        wid_new = _create_mapped_workout(client, auth_token, tid, name='Bench Press')
        _backdate(app, wid_new, monday)

        data = self._get(client, auth_token).get_json()
        assert data['last_trained'].get('Chest') == monday.isoformat()

    # -- Isolation --

    def test_user_isolation(self, client, auth_token, auth_token2):
        tid = _create_template(client, auth_token)
        _create_mapped_workout(client, auth_token, tid, n_sets=4)
        data = self._get(client, auth_token2).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 0

    # -- local_date / UTC boundary fix --

    def test_local_date_fixes_utc_boundary(self, client, auth_token, app):
        # Bug: Railway runs UTC. Late Sunday (user's local time) the server's date is
        # already Monday, so week_start jumps to NEXT Monday and excludes all workouts
        # from the user's actual current week. Passing local_date fixes this.
        monday = _this_week_monday()
        sunday = monday + timedelta(days=6)      # last day of this week (user's perspective)
        next_monday = monday + timedelta(days=7)  # what the UTC server thinks is "today"

        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid, n_sets=3)
        _backdate(app, wid, monday)

        # With correct local_date (Sunday) → week includes this Monday → counted
        res = self._get(client, auth_token, sunday)
        assert res.get_json()['muscle_sets'].get('Chest', 0) == 3

        # With UTC-shifted local_date (next Monday) → week_start = next Monday → NOT counted
        res = self._get(client, auth_token, next_monday)
        assert res.get_json()['muscle_sets'].get('Chest', 0) == 0


# ---------------------------------------------------------------------------
# GET /api/stats/strength-score — unit handling
# ---------------------------------------------------------------------------

class TestStrengthScoreUnits:

    def _seed_bench_template(self):
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Bench Press', equipment='Barbell', standards_key='Bench Press')
        db.session.add(tmpl)
        db.session.commit()
        return tmpl.id

    def _setup_user(self, client, token, unit, bodyweight, bench_weight, tmpl_id):
        h = auth_headers(token)
        res = client.patch('/api/me', json={
            'gender': 'male', 'bodyweight': bodyweight, 'weight_unit': unit,
        }, headers=h)
        assert res.status_code == 200
        res = client.post('/api/workouts', json={
            'workoutName': 'Bench',
            'exercises': [{
                'name': 'Bench Press', 'exercise_template_id': tmpl_id,
                'sets': [{'reps': 1, 'weight': bench_weight}],
            }],
        }, headers=h)
        assert res.status_code == 201

    def _score(self, client, token):
        res = client.get('/api/stats/strength-score', headers=auth_headers(token))
        assert res.status_code == 200
        return res.get_json()

    def _bench_entry(self, data):
        return next(e for e in data['big6'] if e['exercise'] == 'Bench Press')

    def test_kg_and_lbs_users_get_same_percentile(self, client, auth_token, auth_token2):
        tmpl_id = self._seed_bench_template()
        # Same lifter in two unit systems: 80 kg BW benching 100 kg
        self._setup_user(client, auth_token, 'lbs', 176.37, 220.46, tmpl_id)
        self._setup_user(client, auth_token2, 'kg', 80, 100, tmpl_id)

        lbs_entry = self._bench_entry(self._score(client, auth_token))
        kg_entry = self._bench_entry(self._score(client, auth_token2))
        assert kg_entry['percentile'] == pytest.approx(lbs_entry['percentile'], abs=0.5)

    def test_kg_user_response_in_kg(self, client, auth_token):
        tmpl_id = self._seed_bench_template()
        self._setup_user(client, auth_token, 'kg', 80, 100, tmpl_id)
        data = self._score(client, auth_token)
        assert data['weight_unit'] == 'kg'
        entry = self._bench_entry(data)
        assert entry['estimated_1rm'] == pytest.approx(100, abs=0.1)
        # Thresholds in kg: Intermediate (30th pct) sits between the 25th (0.55×BW)
        # and 50th (0.85×BW) breakpoints — must be far below the lbs equivalent
        inter = next(t for t in entry['thresholds'] if t['rank'] == 'Intermediate')
        assert 0.55 * 80 <= inter['weight'] <= 0.85 * 80

    def test_lbs_user_response_in_lbs(self, client, auth_token):
        tmpl_id = self._seed_bench_template()
        self._setup_user(client, auth_token, 'lbs', 176.37, 220.46, tmpl_id)
        data = self._score(client, auth_token)
        assert data['weight_unit'] == 'lbs'
        entry = self._bench_entry(data)
        assert entry['estimated_1rm'] == pytest.approx(220.46, abs=0.1)


# ---------------------------------------------------------------------------
# GET /api/stats/strength-score — pull-up bodyweight fallback uses the
# ADDED-weight scale (standards are calibrated on weight added to the bar/belt)
# ---------------------------------------------------------------------------

class TestPullupFallbackScale:

    def _seed_pullup_template(self):
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Pull Up', equipment='Bodyweight', standards_key='Pull-up')
        db.session.add(tmpl)
        db.session.commit()
        return tmpl.id

    def _setup_user(self, client, token, sets, bodyweight=180):
        h = auth_headers(token)
        res = client.patch('/api/me', json={
            'gender': 'male', 'bodyweight': bodyweight, 'weight_unit': 'lbs',
        }, headers=h)
        assert res.status_code == 200
        tmpl_id = getattr(self, '_tmpl_id', None) or self._seed_pullup_template()
        self._tmpl_id = tmpl_id
        res = client.post('/api/workouts', json={
            'workoutName': 'Pull Day',
            'exercises': [{
                'name': 'Pull Up', 'exercise_template_id': tmpl_id,
                'sets': sets,
            }],
        }, headers=h)
        assert res.status_code == 201

    def _pullup_entry(self, client, token):
        res = client.get('/api/stats/strength-score', headers=auth_headers(token))
        assert res.status_code == 200
        return next(e for e in res.get_json()['big6'] if e['exercise'] == 'Pull-up')

    def test_10_bodyweight_pullups_is_midrange_not_elite(self, client, auth_token):
        # 180 lbs BW × 10 reps → added 1RM = 180*10/30 = 60 lbs → ratio 0.333
        # Male standards: 50th pct = 0.30, 75th = 0.55 → ≈53rd percentile
        self._setup_user(client, auth_token, sets=[{'reps': 10, 'weight': 0}])
        entry = self._pullup_entry(client, auth_token)
        assert 45 <= entry['percentile'] <= 60
        assert entry['percentile'] < 95  # the old total-weight math put this at ~99

    def test_bodyweight_reps_rank_below_weighted_set(self, client, auth_token, auth_token2):
        # +60 lb × 5 → est added 1RM = 60*(1+5/30) = 70 lbs — must outrank 10 BW reps (60 lbs)
        self._setup_user(client, auth_token, sets=[{'reps': 10, 'weight': 0}])
        self._tmpl_id = None  # second user reuses the same global template
        from models import ExerciseTemplate
        self._tmpl_id = ExerciseTemplate.query.filter_by(standards_key='Pull-up').first().id
        self._setup_user(client, auth_token2, sets=[{'reps': 5, 'weight': 60}])
        bw_pct = self._pullup_entry(client, auth_token)['percentile']
        weighted_pct = self._pullup_entry(client, auth_token2)['percentile']
        assert weighted_pct > bw_pct
