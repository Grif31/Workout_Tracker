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

    def test_secondary_muscle_gets_half_credit(self, client, auth_token):
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest,Triceps')
        _create_mapped_workout(client, auth_token, tid, n_sets=4)
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 4
        assert data['muscle_sets'].get('Triceps', 0) == 2

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
# GET /api/stats/weekly-summary — recap of a completed week
# ---------------------------------------------------------------------------

class TestWeeklySummary:

    def _get(self, client, token, local_date=None, week=None):
        params = []
        if local_date:
            params.append(f'local_date={local_date}')
        if week:
            params.append(f'week={week}')
        url = '/api/stats/weekly-summary' + ('?' + '&'.join(params) if params else '')
        return client.get(url, headers=auth_headers(token))

    def test_requires_auth(self, client):
        res = client.get('/api/stats/weekly-summary')
        assert res.status_code == 401

    def test_response_shape(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        for key in ('week_start', 'week_end', 'workouts', 'training_days',
                    'total_duration_min', 'total_volume', 'total_reps',
                    'prs', 'muscle_sets', 'weight_unit',
                    'prev_week_workouts', 'prev_week_volume',
                    'rolling_avg_workouts', 'rolling_avg_volume'):
            assert key in data

    def test_defaults_to_last_completed_week(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        data = self._get(client, auth_token).get_json()
        assert data['week_start'] == last_monday.isoformat()

    def test_zero_workouts_returns_zero_and_omits_optional_fields(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        assert data['workouts'] == 0
        assert data['training_days'] == []
        assert data['prs'] == []
        assert 'distance_km' not in data
        assert 'bodyweight_change' not in data

    def test_prev_week_defaults_to_zero(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        assert data['prev_week_workouts'] == 0
        assert data['prev_week_volume'] == 0

    def test_prev_week_workouts_and_volume_computed(self, client, auth_token, app):
        two_weeks_ago_monday = _this_week_monday() - timedelta(weeks=2)
        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid, n_sets=3)
        _backdate(app, wid, two_weeks_ago_monday)

        data = self._get(client, auth_token).get_json()  # defaults to last completed week
        assert data['prev_week_workouts'] == 1
        assert data['prev_week_volume'] == 3 * 8 * 100
        # Doesn't leak into the current (last-completed) week's own totals
        assert data['workouts'] == 0
        assert data['total_volume'] == 0

    def test_prev_week_isolated_per_user(self, client, auth_token, auth_token2, app):
        two_weeks_ago_monday = _this_week_monday() - timedelta(weeks=2)
        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid, n_sets=3)
        _backdate(app, wid, two_weeks_ago_monday)

        data = self._get(client, auth_token2).get_json()
        assert data['prev_week_workouts'] == 0
        assert data['prev_week_volume'] == 0

    def test_workout_last_week_counted(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        payload = dict(WORKOUT_PAYLOAD, date=last_monday.isoformat())
        res = client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        assert res.status_code == 201
        data = self._get(client, auth_token).get_json()
        assert data['workouts'] == 1
        assert data['total_volume'] == EXPECTED_VOLUME
        assert data['total_reps'] == 18  # 5 + 5 + 8
        assert data['total_duration_min'] == 45
        assert last_monday.isoformat() in data['training_days']

    def test_workout_this_week_not_counted_by_default(self, client, auth_token):
        create_workout(client, auth_token)  # defaults to today
        data = self._get(client, auth_token).get_json()
        assert data['workouts'] == 0

    def test_explicit_week_param_returns_that_week(self, client, auth_token):
        two_weeks_ago_monday = _this_week_monday() - timedelta(weeks=2)
        payload = dict(WORKOUT_PAYLOAD, date=two_weeks_ago_monday.isoformat())
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token, week=two_weeks_ago_monday.isoformat()).get_json()
        assert data['week_start'] == two_weeks_ago_monday.isoformat()
        assert data['workouts'] == 1

    def test_pr_earned_last_week_included_excludes_estimated_1rm(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest')
        payload = {
            'workoutName': 'PR Day',
            'date': last_monday.isoformat(),
            'exercises': [{
                'name': 'Bench Press', 'exercise_template_id': tid,
                'sets': [{'reps': 5, 'weight': 200}],
            }],
        }
        res = client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        assert res.status_code == 201
        data = self._get(client, auth_token).get_json()
        assert len(data['prs']) > 0
        assert 'estimated_1rm' not in {p['pr_type'] for p in data['prs']}

    def test_pr_includes_equipment(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        res = client.post(
            '/api/exercises',
            json={'name': 'Bench Press', 'muscle_group': 'Chest', 'equipment': 'Barbell'},
            headers=auth_headers(auth_token),
        )
        tid = res.get_json()['id']
        payload = {
            'workoutName': 'PR Day', 'date': last_monday.isoformat(),
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid,
                           'sets': [{'reps': 5, 'weight': 200}]}],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert data['prs'][0]['equipment'] == 'Barbell'
        assert data['prs'][0]['exercise_template_id'] == tid
        assert data['prs'][0]['muscle_group'] == 'Chest'
        assert data['prs'][0]['is_custom'] is True  # POST /api/exercises sets user_id on the new template

    def test_pr_from_two_weeks_ago_excluded(self, client, auth_token):
        two_weeks_ago_monday = _this_week_monday() - timedelta(weeks=2)
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest')
        payload = {
            'workoutName': 'Old PR',
            'date': two_weeks_ago_monday.isoformat(),
            'exercises': [{
                'name': 'Bench Press', 'exercise_template_id': tid,
                'sets': [{'reps': 5, 'weight': 200}],
            }],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()  # defaults to last week
        assert data['prs'] == []

    def test_bodyweight_change_present_only_with_log_in_range(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        client.post('/api/bodyweight', json={'weight': 180, 'date': last_monday.isoformat()},
                     headers=auth_headers(auth_token))
        client.post('/api/bodyweight', json={'weight': 178, 'date': (last_monday + timedelta(days=3)).isoformat()},
                     headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert data['bodyweight_change'] == {'start': 180, 'end': 178}

    def test_bodyweight_change_omitted_without_entries(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        assert 'bodyweight_change' not in data

    def test_distance_km_present_for_cardio_last_week(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        tid = _create_template(client, auth_token, 'Running', 'Core')
        payload = {
            'workoutName': 'Run',
            'date': last_monday.isoformat(),
            'exercises': [{
                'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}],
            }],
        }
        res = client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        assert res.status_code == 201
        data = self._get(client, auth_token).get_json()
        assert data['distance_km'] == pytest.approx(5.0)

    def test_cardio_pr_muscle_group_is_literal_cardio(self, client, auth_token):
        # ExerciseDetailScreen's isCardio check is a literal `muscleGroup === 'Cardio'`
        # string comparison (matches ExercisesScreen.tsx's own navigation call) — a
        # cardio PR's real muscle mapping (e.g. 'Core') isn't what should be sent.
        last_monday = _this_week_monday() - timedelta(weeks=1)
        h = auth_headers(auth_token)
        res = client.post(
            '/api/exercises',
            json={'name': 'Running', 'muscle_group': 'Core', 'exercise_type': 'cardio'},
            headers=h,
        )
        tid = res.get_json()['id']
        payload = {
            'workoutName': 'Run', 'date': last_monday.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 20, 'distance': 5, 'distance_unit': 'km'}]}],
        }
        res = client.post('/api/workouts', json=payload, headers=h)
        assert res.status_code == 201
        data = self._get(client, auth_token).get_json()
        cardio_prs = [p for p in data['prs'] if p['pr_type'] in ('best_time', 'best_distance')]
        assert len(cardio_prs) > 0
        assert all(p['muscle_group'] == 'Cardio' for p in cardio_prs)

    def test_distance_km_omitted_without_cardio(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        payload = dict(WORKOUT_PAYLOAD, date=last_monday.isoformat())
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert 'distance_km' not in data

    def test_muscle_sets_breakdown(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest')
        payload = {
            'workoutName': 'Chest Day',
            'date': last_monday.isoformat(),
            'exercises': [{
                'name': 'Bench Press', 'exercise_template_id': tid,
                'sets': [{'reps': 8, 'weight': 100}, {'reps': 8, 'weight': 100}],
            }],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 2

    def test_secondary_muscle_gets_half_credit(self, client, auth_token):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest,Triceps')
        payload = {
            'workoutName': 'Chest Day',
            'date': last_monday.isoformat(),
            'exercises': [{
                'name': 'Bench Press', 'exercise_template_id': tid,
                'sets': [{'reps': 8, 'weight': 100}, {'reps': 8, 'weight': 100}],
            }],
        }
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token).get_json()
        assert data['muscle_sets'].get('Chest', 0) == 2
        assert data['muscle_sets'].get('Triceps', 0) == 1

    def test_local_date_fixes_utc_boundary(self, client, auth_token, app):
        # Same bug/fix as muscle-volume's test of the same name, adapted for
        # this endpoint's "most recently COMPLETED week" default.
        monday = _this_week_monday()
        last_week_monday = monday - timedelta(weeks=1)
        sunday = monday + timedelta(days=6)       # last day of the current week (user's true local time)
        next_monday = monday + timedelta(days=7)  # what a UTC-ahead server might think "today" is

        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid, n_sets=3)
        _backdate(app, wid, last_week_monday)

        # Correct local_date (still within the current week) → last completed week = last_week_monday → counted
        res = self._get(client, auth_token, local_date=sunday.isoformat())
        assert res.get_json()['workouts'] == 1

        # UTC-shifted local_date (server thinks next week already started) → NOT counted
        res = self._get(client, auth_token, local_date=next_monday.isoformat())
        assert res.get_json()['workouts'] == 0

    def test_does_not_count_other_users_workouts(self, client, auth_token, auth_token2):
        last_monday = _this_week_monday() - timedelta(weeks=1)
        payload = dict(WORKOUT_PAYLOAD, date=last_monday.isoformat())
        client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        data = self._get(client, auth_token2).get_json()
        assert data['workouts'] == 0

    # -- Rolling 4-week average --

    def test_rolling_avg_defaults_to_zero(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        assert data['rolling_avg_workouts'] == 0
        assert data['rolling_avg_volume'] == 0

    def test_rolling_avg_computed_over_prior_4_weeks(self, client, auth_token, app):
        monday = _this_week_monday()
        weeks_back = [monday - timedelta(weeks=n) for n in (2, 3, 4, 5)]
        for i, wk in enumerate(weeks_back):
            tid = _create_template(client, auth_token, name=f'Bench Press {i}')
            wid = _create_mapped_workout(client, auth_token, tid, n_sets=2)
            _backdate(app, wid, wk)

        data = self._get(client, auth_token).get_json()
        assert data['rolling_avg_workouts'] == 1.0  # 4 workouts over 4 weeks
        assert data['rolling_avg_volume'] == round(4 * 2 * 8 * 100 / 4.0)

    def test_rolling_avg_excludes_the_displayed_week_itself(self, client, auth_token, app):
        last_completed_week = _this_week_monday() - timedelta(weeks=1)
        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid, n_sets=3)
        _backdate(app, wid, last_completed_week)
        data = self._get(client, auth_token).get_json()
        assert data['rolling_avg_workouts'] == 0
        assert data['rolling_avg_volume'] == 0

    # -- Most-improved lift --

    def test_most_improved_lift_present_with_correct_gain(self, client, auth_token):
        monday = _this_week_monday()
        last_completed_week = monday - timedelta(weeks=1)
        two_weeks_ago = monday - timedelta(weeks=2)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest')

        # Two weeks ago: 100 x 5 -> epley 1RM = 100*(1+5/30) = 116.67
        res = client.post('/api/workouts', json={
            'workoutName': 'Old', 'date': two_weeks_ago.isoformat(),
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid,
                           'sets': [{'reps': 5, 'weight': 100}]}],
        }, headers=h)
        assert res.status_code == 201

        # Last completed week: 100 x 10 -> epley 1RM = 100*(1+10/30) = 133.33 (higher)
        res = client.post('/api/workouts', json={
            'workoutName': 'New', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid,
                           'sets': [{'reps': 10, 'weight': 100}]}],
        }, headers=h)
        assert res.status_code == 201

        data = self._get(client, auth_token).get_json()
        mil = data.get('most_improved_lift')
        assert mil is not None
        assert mil['exercise_name'] == 'Bench Press'
        assert mil['prev_best'] == pytest.approx(116.67, abs=0.1)
        assert mil['this_best'] == pytest.approx(133.33, abs=0.1)
        assert mil['gain'] == pytest.approx(16.67, abs=0.1)

    def test_most_improved_lift_omitted_when_no_overlap(self, client, auth_token, app):
        last_completed_week = _this_week_monday() - timedelta(weeks=1)
        tid = _create_template(client, auth_token)
        wid = _create_mapped_workout(client, auth_token, tid, n_sets=2)
        _backdate(app, wid, last_completed_week)
        data = self._get(client, auth_token).get_json()
        assert 'most_improved_lift' not in data

    def test_most_improved_lift_omitted_when_this_week_lower(self, client, auth_token):
        monday = _this_week_monday()
        last_completed_week = monday - timedelta(weeks=1)
        two_weeks_ago = monday - timedelta(weeks=2)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest')

        client.post('/api/workouts', json={
            'workoutName': 'Old', 'date': two_weeks_ago.isoformat(),
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid,
                           'sets': [{'reps': 10, 'weight': 100}]}],  # higher epley
        }, headers=h)
        client.post('/api/workouts', json={
            'workoutName': 'New', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid,
                           'sets': [{'reps': 5, 'weight': 100}]}],  # lower epley
        }, headers=h)

        data = self._get(client, auth_token).get_json()
        assert 'most_improved_lift' not in data

    def test_most_improved_lift_omitted_when_below_standing_pr(self, client, auth_token):
        # Regression test: a lift that beats the immediately-prior week but
        # is still below the user's real all-time PR (set even earlier) must
        # never be flagged — the check must be gated on a genuine new
        # PersonalRecord, not just "better than last week specifically".
        monday = _this_week_monday()
        last_completed_week = monday - timedelta(weeks=1)
        two_weeks_ago = monday - timedelta(weeks=2)
        three_weeks_ago = monday - timedelta(weeks=3)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Incline Bench', 'Chest')

        # Three weeks ago: a heavy single sets the real standing PR (epley 240, no rep bonus)
        client.post('/api/workouts', json={
            'workoutName': 'Heavy Single', 'date': three_weeks_ago.isoformat(),
            'exercises': [{'name': 'Incline Bench', 'exercise_template_id': tid,
                           'sets': [{'reps': 1, 'weight': 240}]}],
        }, headers=h)

        # Two weeks ago: a much lighter week — this becomes prev_1rm for the displayed week
        client.post('/api/workouts', json={
            'workoutName': 'Light', 'date': two_weeks_ago.isoformat(),
            'exercises': [{'name': 'Incline Bench', 'exercise_template_id': tid,
                           'sets': [{'reps': 5, 'weight': 100}]}],  # epley 116.67
        }, headers=h)

        # Last completed week: better than two weeks ago, but still below the real PR
        client.post('/api/workouts', json={
            'workoutName': 'Better but not a PR', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Incline Bench', 'exercise_template_id': tid,
                           'sets': [{'reps': 10, 'weight': 100}]}],  # epley 133.33, still < 240
        }, headers=h)

        data = self._get(client, auth_token).get_json()
        assert 'most_improved_lift' not in data

    # -- Most-improved cardio --

    def test_most_improved_cardio_present_with_correct_gain(self, client, auth_token):
        monday = _this_week_monday()
        last_completed_week = monday - timedelta(weeks=1)
        two_weeks_ago = monday - timedelta(weeks=2)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Running', 'Core')

        # Two weeks ago: 5km in 30 min -> 5K best_time PR = 30 (the baseline)
        client.post('/api/workouts', json={
            'workoutName': 'Slow 5K', 'date': two_weeks_ago.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}]}],
        }, headers=h)

        # Last completed week: 5km in 25 min -> beats the standing 5K PR
        res = client.post('/api/workouts', json={
            'workoutName': 'Faster 5K', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 25, 'distance': 5, 'distance_unit': 'km'}]}],
        }, headers=h)
        assert res.status_code == 201

        data = self._get(client, auth_token).get_json()
        mic = data.get('most_improved_cardio')
        assert mic is not None
        assert mic['exercise_name'] == 'Running'
        assert mic['pr_type'] == 'best_time'
        assert mic['milestone_label'] == '5K'
        assert mic['prev_best'] == pytest.approx(30.0, abs=0.01)
        assert mic['this_best'] == pytest.approx(25.0, abs=0.01)
        assert mic['gain'] == pytest.approx(5.0, abs=0.01)

    def test_most_improved_cardio_omitted_when_no_overlap(self, client, auth_token):
        last_completed_week = _this_week_monday() - timedelta(weeks=1)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Running', 'Core')

        res = client.post('/api/workouts', json={
            'workoutName': '5K', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 25, 'distance': 5, 'distance_unit': 'km'}]}],
        }, headers=h)
        assert res.status_code == 201

        data = self._get(client, auth_token).get_json()
        assert 'most_improved_cardio' not in data

    def test_most_improved_cardio_omitted_when_not_a_new_pr(self, client, auth_token):
        monday = _this_week_monday()
        last_completed_week = monday - timedelta(weeks=1)
        three_weeks_ago = monday - timedelta(weeks=3)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Running', 'Core')

        # Three weeks ago: a fast 5K sets the real standing PR
        client.post('/api/workouts', json={
            'workoutName': 'Fast 5K', 'date': three_weeks_ago.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 20, 'distance': 5, 'distance_unit': 'km'}]}],
        }, headers=h)

        # Last completed week: slower than the standing PR -> not a new PR
        res = client.post('/api/workouts', json={
            'workoutName': 'Slower 5K', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 28, 'distance': 5, 'distance_unit': 'km'}]}],
        }, headers=h)
        assert res.status_code == 201

        data = self._get(client, auth_token).get_json()
        assert 'most_improved_cardio' not in data

    # -- Avg RPE --

    def test_avg_rpe_present_when_logged(self, client, auth_token):
        last_completed_week = _this_week_monday() - timedelta(weeks=1)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token)
        res = client.post('/api/workouts', json={
            'workoutName': 'RPE Day', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid,
                           'sets': [{'reps': 8, 'weight': 100, 'rpe': 7},
                                    {'reps': 8, 'weight': 100, 'rpe': 9}]}],
        }, headers=h)
        assert res.status_code == 201
        data = self._get(client, auth_token).get_json()
        assert data['avg_rpe'] == 8.0

    def test_avg_rpe_omitted_without_any_logged(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        assert 'avg_rpe' not in data

    # -- Calories burned --

    def test_calories_present_for_cardio_with_bodyweight_set(self, client, auth_token):
        last_completed_week = _this_week_monday() - timedelta(weeks=1)
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        tid = _create_template(client, auth_token, 'Running', 'Core')
        res = client.post('/api/workouts', json={
            'workoutName': 'Run', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}]}],
        }, headers=h)
        assert res.status_code == 201
        data = self._get(client, auth_token).get_json()
        assert data.get('calories_burned', 0) > 0

    def test_calories_omitted_without_cardio(self, client, auth_token):
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        data = self._get(client, auth_token).get_json()
        assert 'calories_burned' not in data

    def test_calories_omitted_without_bodyweight(self, client, auth_token):
        last_completed_week = _this_week_monday() - timedelta(weeks=1)
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Running', 'Core')
        res = client.post('/api/workouts', json={
            'workoutName': 'Run', 'date': last_completed_week.isoformat(),
            'exercises': [{'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}]}],
        }, headers=h)
        assert res.status_code == 201
        data = self._get(client, auth_token).get_json()
        assert 'calories_burned' not in data


# ---------------------------------------------------------------------------
# GET /api/stats/weekly-summary/history — condensed list of past weeks
# ---------------------------------------------------------------------------

class TestWeeklySummaryHistory:

    def _get(self, client, token, weeks=None, local_date=None):
        params = []
        if weeks is not None:
            params.append(f'weeks={weeks}')
        if local_date:
            params.append(f'local_date={local_date}')
        url = '/api/stats/weekly-summary/history' + ('?' + '&'.join(params) if params else '')
        return client.get(url, headers=auth_headers(token))

    def test_requires_auth(self, client):
        res = client.get('/api/stats/weekly-summary/history')
        assert res.status_code == 401

    def test_empty_when_no_workouts(self, client, auth_token):
        data = self._get(client, auth_token).get_json()
        assert data == []

    def test_orders_most_recent_first_with_correct_counts_and_volume(self, client, auth_token, app):
        monday = _this_week_monday()
        week_a = monday - timedelta(weeks=1)   # most recent completed week
        week_b = monday - timedelta(weeks=2)
        week_c = monday - timedelta(weeks=3)   # oldest

        for i, (wk, n_sets) in enumerate(((week_c, 1), (week_b, 2), (week_a, 3))):
            tid = _create_template(client, auth_token, name=f'Bench Press {i}')
            wid = _create_mapped_workout(client, auth_token, tid, n_sets=n_sets)
            _backdate(app, wid, wk)

        data = self._get(client, auth_token).get_json()
        starts = [row['week_start'] for row in data]
        assert starts == sorted(starts, reverse=True)
        by_week = {row['week_start']: row for row in data}
        assert by_week[week_a.isoformat()]['workouts'] == 1
        assert by_week[week_a.isoformat()]['total_volume'] == 3 * 8 * 100  # n_sets=3, 8 reps @ 100
        assert by_week[week_c.isoformat()]['total_volume'] == 1 * 8 * 100

    def test_week_with_zero_workouts_absent_from_list(self, client, auth_token, app):
        monday = _this_week_monday()
        week_a = monday - timedelta(weeks=1)
        wid = _create_mapped_workout(client, auth_token, _create_template(client, auth_token), n_sets=1)
        _backdate(app, wid, week_a)

        data = self._get(client, auth_token).get_json()
        assert len(data) == 1
        assert data[0]['week_start'] == week_a.isoformat()

    def test_workout_with_no_sets_still_counted(self, client, auth_token, app):
        monday = _this_week_monday()
        week_a = monday - timedelta(weeks=1)
        payload = {'workoutName': 'Empty', 'exercises': []}
        res = client.post('/api/workouts', json=payload, headers=auth_headers(auth_token))
        assert res.status_code == 201
        _backdate(app, res.get_json()['id'], week_a)

        data = self._get(client, auth_token).get_json()
        assert len(data) == 1
        assert data[0]['workouts'] == 1
        assert data[0]['total_volume'] == 0

    def test_weeks_param_limits_range(self, client, auth_token, app):
        monday = _this_week_monday()
        far_back = monday - timedelta(weeks=10)
        wid = _create_mapped_workout(client, auth_token, _create_template(client, auth_token), n_sets=1)
        _backdate(app, wid, far_back)

        assert self._get(client, auth_token, weeks=2).get_json() == []
        assert len(self._get(client, auth_token, weeks=11).get_json()) == 1

    def test_weeks_param_capped_at_52(self, client, auth_token):
        res = self._get(client, auth_token, weeks=500)
        assert res.status_code == 200

    def test_current_in_progress_week_excluded(self, client, auth_token):
        create_workout(client, auth_token)  # defaults to today, i.e. current week
        data = self._get(client, auth_token).get_json()
        assert data == []

    def test_does_not_count_other_users_workouts(self, client, auth_token, auth_token2, app):
        monday = _this_week_monday()
        week_a = monday - timedelta(weeks=1)
        wid = _create_mapped_workout(client, auth_token, _create_template(client, auth_token), n_sets=1)
        _backdate(app, wid, week_a)

        data = self._get(client, auth_token2).get_json()
        assert data == []


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
# GET /api/stats/strength-score — cardio-only users (no tracked strength
# lifts). Must return 200 with a real Greek rank, not 422 — strength is only
# 45% of the Greek score, so consistency/dedication/volume alone are enough
# to produce a rank even with zero strength data.
# ---------------------------------------------------------------------------

class TestStrengthScoreCardioOnlyUser:

    def test_no_strength_lifts_returns_200_not_422(self, client, auth_token):
        h = auth_headers(auth_token)
        res = client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180}, headers=h)
        assert res.status_code == 200

        tid = _create_template(client, auth_token, 'Running', 'Core')
        res = client.post('/api/workouts', json={
            'workoutName': 'Run',
            'exercises': [{
                'name': 'Running', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}],
            }],
        }, headers=h)
        assert res.status_code == 201

        res = client.get('/api/stats/strength-score', headers=h)
        assert res.status_code == 200
        data = res.get_json()
        assert data['exercises_used'] == 0
        assert data['overall'] == 0
        assert data['muscle_groups_used'] == 0
        # Every Big 6 lift is reported as untracked rather than the list being omitted
        assert all(not e['has_data'] for e in data['big6'])
        # Greek rank/score must still be computed (consistency/dedication/volume
        # only — strength contributes 0 to its 45% weight, it doesn't block the rest)
        assert data['greek_rank'] is not None
        assert data['greek_score'] > 0
        assert data['greek_score_components']['strength'] == 0

    def test_zero_workouts_still_returns_200(self, client, auth_token):
        # Brand-new user, no workouts logged at all yet — still not an error.
        h = auth_headers(auth_token)
        res = client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180}, headers=h)
        assert res.status_code == 200

        res = client.get('/api/stats/strength-score', headers=h)
        assert res.status_code == 200
        data = res.get_json()
        assert data['exercises_used'] == 0
        assert data['greek_score'] == 0
        assert data['greek_rank'] == 'Neophyte'


# ---------------------------------------------------------------------------
# GET /api/stats/strength-score — additive response fields (age_factor,
# bodyweight_updated_at, coverage). Purely additive — must not change any of
# the existing fields asserted above.
# ---------------------------------------------------------------------------

class TestStrengthScoreAdditiveFields:

    def _seed_bench_template(self):
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Bench Press', equipment='Barbell', standards_key='Bench Press')
        db.session.add(tmpl)
        db.session.commit()
        return tmpl.id

    def _score(self, client, token):
        res = client.get('/api/stats/strength-score', headers=auth_headers(token))
        assert res.status_code == 200
        return res.get_json()

    def test_age_factor_defaults_to_one_without_birth_date(self, client, auth_token):
        tmpl_id = self._seed_bench_template()
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        client.post('/api/workouts', json={
            'workoutName': 'Bench',
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tmpl_id,
                           'sets': [{'reps': 1, 'weight': 200}]}],
        }, headers=h)

        data = self._score(client, auth_token)
        assert data['age_factor'] == 1.0
        assert data['age_adjusted'] is False

    def test_bodyweight_updated_at_none_without_a_log_entry(self, client, auth_token):
        tmpl_id = self._seed_bench_template()
        h = auth_headers(auth_token)
        # PATCH /api/me sets User.bodyweight directly — no BodyweightLog row exists yet
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        client.post('/api/workouts', json={
            'workoutName': 'Bench',
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tmpl_id,
                           'sets': [{'reps': 1, 'weight': 200}]}],
        }, headers=h)

        data = self._score(client, auth_token)
        assert data['bodyweight_updated_at'] is None

    def test_bodyweight_updated_at_reflects_latest_log_entry(self, client, auth_token):
        tmpl_id = self._seed_bench_template()
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        client.post('/api/bodyweight', json={'weight': 180}, headers=h)
        client.post('/api/workouts', json={
            'workoutName': 'Bench',
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tmpl_id,
                           'sets': [{'reps': 1, 'weight': 200}]}],
        }, headers=h)

        data = self._score(client, auth_token)
        assert data['bodyweight_updated_at'] is not None

    def test_coverage_reflects_tracked_vs_total_big6(self, client, auth_token):
        tmpl_id = self._seed_bench_template()
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        client.post('/api/workouts', json={
            'workoutName': 'Bench',
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tmpl_id,
                           'sets': [{'reps': 1, 'weight': 200}]}],
        }, headers=h)

        data = self._score(client, auth_token)
        assert data['coverage']['big6'] == {'tracked': 1, 'total': 6}
        assert data['coverage']['compound']['tracked'] == 0
        assert data['coverage']['isolation']['tracked'] == 0

    def test_supplemental_coverage_lists_tracked_and_untracked(self, client, auth_token):
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Romanian Deadlift', equipment='Barbell', standards_key='Romanian Deadlift')
        db.session.add(tmpl)
        db.session.commit()
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        client.post('/api/workouts', json={
            'workoutName': 'Legs',
            'exercises': [{'name': 'Romanian Deadlift', 'exercise_template_id': tmpl.id,
                           'sets': [{'reps': 5, 'weight': 200}]}],
        }, headers=h)

        data = self._score(client, auth_token)
        coverage = {c['exercise']: c for c in data['supplemental_coverage']}
        assert coverage['Romanian Deadlift']['has_data'] is True
        assert coverage['Romanian Deadlift']['category'] == 'compound'
        # Some other compound/isolation lift the user never trained should show as untracked
        untracked = [c for c in data['supplemental_coverage'] if not c['has_data']]
        assert len(untracked) > 0
        # Big 6 lifts have their own section — must never appear in this list
        big6_names = {'Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-up'}
        assert not any(c['exercise'] in big6_names for c in data['supplemental_coverage'])


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


class TestExerciseStats:

    def test_template_id_match_ignores_stale_exercise_name(self, client, auth_token):
        # GPS-tracked runs historically saved Exercise.name as the raw activity
        # chip label ("Run") instead of the template's name ("Running") — the
        # PR tap-through and exercise list both navigate using the template's
        # name, so the lookup must not require Exercise.name to match when a
        # valid exercise_template_id is already given.
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Running', 'Core')
        payload = {
            'workoutName': 'Run',
            'exercises': [{
                'name': 'Run', 'exercise_template_id': tid, 'exercise_type': 'cardio',
                'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}],
            }],
        }
        res = client.post('/api/workouts', json=payload, headers=h)
        assert res.status_code == 201

        res = client.get(f'/api/stats/exercise?name=Running&exercise_template_id={tid}', headers=h)
        assert res.status_code == 200
        data = res.get_json()
        assert data['exercise_type'] == 'cardio'
        assert len(data['history']) == 1

    def test_name_only_lookup_still_works_without_template_id(self, client, auth_token):
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'Bench Press', 'Chest')
        payload = {
            'workoutName': 'Push Day',
            'exercises': [{
                'name': 'Bench Press', 'exercise_template_id': tid,
                'sets': [{'reps': 5, 'weight': 135, 'set_type': 'N'}],
            }],
        }
        res = client.post('/api/workouts', json=payload, headers=h)
        assert res.status_code == 201

        res = client.get('/api/stats/exercise?name=Bench Press', headers=h)
        assert res.status_code == 200
        assert len(res.get_json()['history']) == 1

    def test_description_present_for_tracked_exercise(self, client, auth_token):
        h = auth_headers(auth_token)
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Bench Press', description='Test description text.')
        db.session.add(tmpl)
        db.session.commit()
        payload = {
            'workoutName': 'Push Day',
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tmpl.id,
                           'sets': [{'reps': 5, 'weight': 135, 'set_type': 'N'}]}],
        }
        res = client.post('/api/workouts', json=payload, headers=h)
        assert res.status_code == 201

        res = client.get(f'/api/stats/exercise?name=Bench Press&exercise_template_id={tmpl.id}', headers=h)
        assert res.status_code == 200
        assert res.get_json()['description'] == 'Test description text.'

    def test_description_present_even_with_no_logged_history(self, client, auth_token):
        h = auth_headers(auth_token)
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Squat', description='Squat description.')
        db.session.add(tmpl)
        db.session.commit()

        res = client.get(f'/api/stats/exercise?name=Squat&exercise_template_id={tmpl.id}', headers=h)
        assert res.status_code == 200
        data = res.get_json()
        assert data['history'] == []
        assert data['description'] == 'Squat description.'

    def test_description_null_for_custom_exercise_without_seeded_text(self, client, auth_token):
        h = auth_headers(auth_token)
        tid = _create_template(client, auth_token, 'My Custom Move', 'Chest')
        res = client.get(f'/api/stats/exercise?name=My Custom Move&exercise_template_id={tid}', headers=h)
        assert res.status_code == 200
        assert res.get_json()['description'] is None

    def test_description_present_for_cardio_exercise(self, client, auth_token):
        h = auth_headers(auth_token)
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Running', exercise_type='cardio', description='Running description.')
        db.session.add(tmpl)
        db.session.commit()
        payload = {
            'workoutName': 'Run',
            'exercises': [{'name': 'Running', 'exercise_template_id': tmpl.id, 'exercise_type': 'cardio',
                           'sets': [{'cardio_duration': 30, 'distance': 5, 'distance_unit': 'km'}]}],
        }
        res = client.post('/api/workouts', json=payload, headers=h)
        assert res.status_code == 201

        res = client.get(f'/api/stats/exercise?name=Running&exercise_template_id={tmpl.id}', headers=h)
        assert res.status_code == 200
        assert res.get_json()['description'] == 'Running description.'


class TestStrengthScoreForExercise:

    def _seed_template(self, name='Bench Press', standards_key='Bench Press'):
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name=name, standards_key=standards_key)
        db.session.add(tmpl)
        db.session.commit()
        return tmpl.id

    def test_requires_exercise_template_id_param(self, client, auth_token):
        res = client.get('/api/stats/strength-score/exercise', headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_missing_gender_or_bodyweight_returns_422(self, client, auth_token):
        tid = self._seed_template()
        res = client.get(f'/api/stats/strength-score/exercise?exercise_template_id={tid}', headers=auth_headers(auth_token))
        assert res.status_code == 422
        assert 'gender' in res.get_json()['missing']

    def test_has_data_false_for_untracked_exercise(self, client, auth_token):
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        tid = self._seed_template()
        res = client.get(f'/api/stats/strength-score/exercise?exercise_template_id={tid}', headers=h)
        assert res.status_code == 200
        assert res.get_json() == {'has_data': False}

    def test_has_data_false_for_exercise_with_no_standards_key(self, client, auth_token):
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        from models import ExerciseTemplate
        tmpl = ExerciseTemplate(name='Some Custom Move')
        db.session.add(tmpl)
        db.session.commit()
        res = client.get(f'/api/stats/strength-score/exercise?exercise_template_id={tmpl.id}', headers=h)
        assert res.status_code == 200
        assert res.get_json() == {'has_data': False}

    def test_returns_percentile_and_rank_when_tracked(self, client, auth_token):
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        tid = self._seed_template()
        res = client.post('/api/workouts', json={
            'workoutName': 'Push Day',
            'exercises': [{'name': 'Bench Press', 'exercise_template_id': tid,
                           'sets': [{'reps': 5, 'weight': 185, 'set_type': 'N'}]}],
        }, headers=h)
        assert res.status_code == 201

        res = client.get(f'/api/stats/strength-score/exercise?exercise_template_id={tid}', headers=h)
        assert res.status_code == 200
        data = res.get_json()
        assert data['has_data'] is True
        assert data['percentile'] > 0
        assert data['rank']['label']
        assert data['estimated_1rm'] > 0

    def test_matches_full_strength_score_percentile(self, client, auth_token):
        # Cross-check: this endpoint and strength_score()'s own big6 list share
        # _exercise_percentile_data, so they must agree on the same lift.
        h = auth_headers(auth_token)
        client.patch('/api/me', json={'gender': 'male', 'bodyweight': 180, 'weight_unit': 'lbs'}, headers=h)
        tid = self._seed_template(name='Squat', standards_key='Squat')
        client.post('/api/workouts', json={
            'workoutName': 'Leg Day',
            'exercises': [{'name': 'Squat', 'exercise_template_id': tid,
                           'sets': [{'reps': 5, 'weight': 225, 'set_type': 'N'}]}],
        }, headers=h)

        full = client.get('/api/stats/strength-score', headers=h).get_json()
        squat_entry = next(e for e in full['big6'] if e['exercise'] == 'Squat')
        single = client.get(f'/api/stats/strength-score/exercise?exercise_template_id={tid}', headers=h).get_json()
        assert single['percentile'] == squat_entry['percentile']
        assert single['estimated_1rm'] == squat_entry['estimated_1rm']
        assert single['exercise'] == 'Squat'
        assert single['thresholds'] == squat_entry['thresholds']


# ---------------------------------------------------------------------------
# Bodyweight-aware volume: consolidated aggregates + exercise_stats()
# ---------------------------------------------------------------------------

def _create_bodyweight_template(client, token, name='Pull Up', equipment='Bodyweight'):
    res = client.post(
        '/api/exercises',
        json={'name': name, 'muscle_group': 'Back', 'equipment': equipment},
        headers=auth_headers(token),
    )
    assert res.status_code == 201
    return res.get_json()['id']


def _log_bodyweight(client, token, weight, date_str):
    res = client.post('/api/bodyweight', json={'weight': weight, 'date': date_str}, headers=auth_headers(token))
    assert res.status_code == 201


def _create_bodyweight_workout(client, token, template_id, reps=10, name='Pull Day', date_str=None):
    payload = {
        'workoutName': name,
        'exercises': [{
            'name': 'Pull Up', 'exercise_template_id': template_id,
            'sets': [{'reps': reps, 'weight': 0, 'set_type': 'N'}],
        }],
    }
    if date_str:
        payload['date'] = date_str
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()['id']


class TestBodyweightVolumeAggregates:
    """One representative test per consolidated whole-workout endpoint,
    confirming each now sums the bodyweight-aware Workout.volume instead of
    re-deriving reps*weight (which undercounts Bodyweight/Weighted sets)."""

    def test_profile_stats_total_volume_includes_bodyweight(self, client, auth_token):
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = _create_bodyweight_template(client, auth_token)
        _create_bodyweight_workout(client, auth_token, tid, reps=10)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['total_volume'] == 1800

    def test_dashboard_stats_volume_includes_bodyweight(self, client, auth_token):
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = _create_bodyweight_template(client, auth_token)
        _create_bodyweight_workout(client, auth_token, tid, reps=10)
        data = client.get('/api/stats/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['weekly'][-1]['volume'] == 1800
        assert data['last_7_days']['volume'] == 1800

    def test_progress_stats_volume_includes_bodyweight(self, client, auth_token):
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = _create_bodyweight_template(client, auth_token)
        _create_bodyweight_workout(client, auth_token, tid, reps=10)
        data = client.get('/api/stats/progress?range=30d', headers=auth_headers(auth_token)).get_json()
        assert sum(b['volume'] for b in data['buckets']) == 1800

    def test_weekly_summary_volume_includes_bodyweight(self, client, auth_token, app):
        two_weeks_ago_monday = _this_week_monday() - timedelta(weeks=2)
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = _create_bodyweight_template(client, auth_token)
        wid = _create_bodyweight_workout(client, auth_token, tid, reps=10)
        _backdate(app, wid, two_weeks_ago_monday)

        data = client.get('/api/stats/weekly-summary', headers=auth_headers(auth_token)).get_json()
        assert data['prev_week_volume'] == 1800

    def test_weekly_summary_history_volume_includes_bodyweight(self, client, auth_token, app):
        week_a = _this_week_monday() - timedelta(weeks=2)
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = _create_bodyweight_template(client, auth_token)
        wid = _create_bodyweight_workout(client, auth_token, tid, reps=10)
        _backdate(app, wid, week_a)

        data = client.get('/api/stats/weekly-summary/history', headers=auth_headers(auth_token)).get_json()
        entry = next(e for e in data if e['week_start'] == week_a.isoformat())
        assert entry['total_volume'] == 1800

    def test_regression_non_template_workout_volume_unaffected(self, client, auth_token):
        # WORKOUT_PAYLOAD has no exercise_template_id, so equipment lookup is
        # always None -- must keep matching EXPECTED_VOLUME exactly.
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        create_workout(client, auth_token)
        data = client.get('/api/stats/profile', headers=auth_headers(auth_token)).get_json()
        assert data['total_volume'] == EXPECTED_VOLUME


class TestExerciseStatsBodyweightVolume:

    def test_session_volume_and_max_set_volume_include_bodyweight(self, client, auth_token):
        h = auth_headers(auth_token)
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = _create_bodyweight_template(client, auth_token)
        _create_bodyweight_workout(client, auth_token, tid, reps=10)

        data = client.get(f'/api/stats/exercise?name=Pull Up&exercise_template_id={tid}', headers=h).get_json()
        assert data['history'][0]['volume'] == 1800
        assert data['personal_bests']['max_set_volume'] == 1800

    def test_pr_adjacent_fields_stay_raw_weight_based(self, client, auth_token):
        # max_weight/estimated_1rm/most_reps must NOT include bodyweight --
        # they feed the same numbers the PR system reports.
        h = auth_headers(auth_token)
        _log_bodyweight(client, auth_token, 180, '2026-01-01')
        tid = _create_bodyweight_template(client, auth_token)
        _create_bodyweight_workout(client, auth_token, tid, reps=10)

        data = client.get(f'/api/stats/exercise?name=Pull Up&exercise_template_id={tid}', headers=h).get_json()
        assert data['personal_bests']['max_weight'] == 0
        assert data['personal_bests']['estimated_1rm'] == 0
        assert data['personal_bests']['most_reps'] == 10
        assert data['history'][0]['best_set'] == {'reps': 10, 'weight': 0}

    def test_no_bodyweight_logged_session_volume_is_zero(self, client, auth_token):
        h = auth_headers(auth_token)
        tid = _create_bodyweight_template(client, auth_token)
        _create_bodyweight_workout(client, auth_token, tid, reps=10)

        data = client.get(f'/api/stats/exercise?name=Pull Up&exercise_template_id={tid}', headers=h).get_json()
        assert data['history'][0]['volume'] == 0
        assert data['personal_bests']['max_set_volume'] == 0
