"""
Tests for PR history events (PREvent):
  - event rows written by the PR upsert paths in workout_routes.py
  - rebuild-on-edit/delete via _recompute_prs_for_templates replay
  - GET /api/personal-records/dashboard
  - GET /api/personal-records/history
  - flask backfill-pr-events CLI command
"""
from datetime import date, timedelta

from models import db, PersonalRecord, PREvent


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def create_template(client, token, name='Bench Press', muscle_group='Chest'):
    res = client.post(
        '/api/exercises',
        json={'name': name, 'muscle_group': muscle_group},
        headers=auth_headers(token),
    )
    return res.get_json()['id']


def post_strength_workout(client, token, template_id, sets, name='Bench Day', date_str=None):
    payload = {
        'workoutName': name,
        'exercises': [{
            'name': 'Bench Press',
            'exercise_template_id': template_id,
            'sets': sets,
        }],
    }
    if date_str:
        payload['date'] = date_str
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()


def post_cardio_workout(client, token, template_id, duration_min, distance_km, date_str=None):
    payload = {
        'workoutName': 'Morning Run',
        'exercises': [{
            'name': 'Running',
            'exercise_template_id': template_id,
            'exercise_type': 'cardio',
            'sets': [{'cardio_duration': duration_min, 'distance': distance_km, 'distance_unit': 'km'}],
        }],
    }
    if date_str:
        payload['date'] = date_str
    res = client.post('/api/workouts', json=payload, headers=auth_headers(token))
    assert res.status_code == 201
    return res.get_json()


def events_for(user_id, pr_type=None):
    q = PREvent.query.filter_by(user_id=user_id)
    if pr_type:
        q = q.filter_by(pr_type=pr_type)
    return q.order_by(PREvent.achieved_at, PREvent.id).all()


def iso(d):
    return d.strftime('%Y-%m-%d')


# ---------------------------------------------------------------------------
# Event writes on workout save
# ---------------------------------------------------------------------------

class TestEventWrites:

    def test_first_pr_has_no_previous_value(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        result = post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])

        evs = events_for(user_id, 'max_weight')
        assert len(evs) == 1
        assert evs[0].value == 225
        assert evs[0].previous_value is None
        assert evs[0].improved_by() is None
        assert evs[0].workout_id == result['id']

    def test_beating_pr_records_previous_value(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}])

        evs = events_for(user_id, 'max_weight')
        assert len(evs) == 2
        assert evs[1].value == 245
        assert evs[1].previous_value == 225
        assert evs[1].improved_by() == 20

    def test_non_beating_workout_adds_no_events(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        before = len(events_for(user_id))
        # Same weight, fewer reps: beats nothing (a lighter weight would still
        # earn a max_reps PR at its own weight context)
        post_strength_workout(client, auth_token, tid, [{'reps': 3, 'weight': 225}])
        assert len(events_for(user_id)) == before

    def test_estimated_1rm_events_are_written(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        assert len(events_for(user_id, 'estimated_1rm')) == 1

    def test_max_reps_events_per_weight_context(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 8, 'weight': 185}])
        post_strength_workout(client, auth_token, tid, [{'reps': 10, 'weight': 185}])

        evs = events_for(user_id, 'max_reps')
        assert [e.value for e in evs] == [8, 10]
        assert evs[1].previous_value == 8
        assert all(e.weight_context == 185 for e in evs)


class TestCardioDirection:

    def test_faster_time_improves_positively(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token, name='Running', muscle_group='Core')
        post_cardio_workout(client, auth_token, tid, duration_min=30, distance_km=5)
        post_cardio_workout(client, auth_token, tid, duration_min=27.5, distance_km=5)

        evs = [e for e in events_for(user_id, 'best_time') if e.weight_context == 5.0]
        assert len(evs) == 2
        assert evs[1].value == 27.5
        assert evs[1].previous_value == 30
        # best_time improves downward — improved_by is sign-normalized positive
        assert evs[1].improved_by() == 2.5

    def test_slower_time_adds_no_event(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token, name='Running', muscle_group='Core')
        post_cardio_workout(client, auth_token, tid, duration_min=30, distance_km=5)
        before = len(events_for(user_id, 'best_time'))
        post_cardio_workout(client, auth_token, tid, duration_min=40, distance_km=5)
        assert len(events_for(user_id, 'best_time')) == before


# ---------------------------------------------------------------------------
# Rebuild on edit / delete
# ---------------------------------------------------------------------------

class TestRebuildOnEditDelete:

    def test_deleting_pr_workout_rebuilds_event_chain(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        best = post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}])

        res = client.delete(f"/api/workouts/{best['id']}", headers=auth_headers(auth_token))
        assert res.status_code == 200

        evs = events_for(user_id, 'max_weight')
        assert len(evs) == 1
        assert evs[0].value == 225
        assert evs[0].previous_value is None

    def test_editing_workout_rebuilds_previous_value_links(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        first = post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                                      date_str=iso(date.today() - timedelta(days=7)))
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}])

        # Lower the first workout's weight; replay should relink the chain
        details = client.get(f"/api/workouts/{first['id']}", headers=auth_headers(auth_token)).get_json()
        ex = details['exercises'][0]
        res = client.patch(f"/api/workouts/{first['id']}", json={
            'exercises': [{
                'id': ex['id'], 'name': ex['name'], 'exercise_template_id': tid,
                'sets': [{'id': ex['sets'][0]['id'], 'reps': 5, 'weight': 205}],
            }],
        }, headers=auth_headers(auth_token))
        assert res.status_code == 200

        evs = events_for(user_id, 'max_weight')
        assert [e.value for e in evs] == [205, 245]
        assert evs[0].previous_value is None
        assert evs[1].previous_value == 205


# ---------------------------------------------------------------------------
# GET /api/personal-records/dashboard
# ---------------------------------------------------------------------------

class TestDashboardEndpoint:

    def test_requires_auth(self, client):
        assert client.get('/api/personal-records/dashboard').status_code == 401

    def test_empty_dashboard(self, client, auth_token):
        res = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token))
        assert res.status_code == 200
        data = res.get_json()
        assert data['recent_events'] == []
        assert data['workout_bests']['best_volume'] is None
        assert data['workout_bests']['best_total_reps'] is None
        assert data['stats']['prs_this_month'] == 0
        assert data['stats']['pr_streak_weeks'] == 0

    def test_feed_excludes_estimated_1rm(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        types = {e['pr_type'] for e in data['recent_events']}
        assert 'estimated_1rm' not in types
        assert 'max_weight' in types

    def test_feed_events_carry_workout_and_delta(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}], name='PR Day')
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()

        newest_max_weight = next(e for e in data['recent_events'] if e['pr_type'] == 'max_weight')
        assert newest_max_weight['value'] == 245
        assert newest_max_weight['previous_value'] == 225
        assert newest_max_weight['improved_by'] == 20
        assert newest_max_weight['workout_name'] == 'PR Day'
        assert newest_max_weight['exercise_name'] == 'Bench Press'
        assert newest_max_weight['pr_label'] == 'Max Weight'

    def test_type_filter(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 8, 'weight': 185}])
        data = client.get('/api/personal-records/dashboard?type=reps',
                          headers=auth_headers(auth_token)).get_json()
        assert data['recent_events']
        assert all(e['pr_type'] == 'max_reps' for e in data['recent_events'])

    def test_invalid_type_filter_400(self, client, auth_token):
        res = client.get('/api/personal-records/dashboard?type=bogus', headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_workout_bests(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 10, 'weight': 100}], name='Light Day')
        big = post_strength_workout(
            client, auth_token, tid,
            [{'reps': 10, 'weight': 200}, {'reps': 10, 'weight': 200}],
            name='Big Day',
        )
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['workout_bests']['best_volume']['workout_id'] == big['id']
        assert data['workout_bests']['best_volume']['value'] == 4000
        assert data['workout_bests']['best_total_reps']['workout_id'] == big['id']
        assert data['workout_bests']['best_total_reps']['value'] == 20

    def test_pr_streak_consecutive_weeks(self, client, auth_token):
        tid = create_template(client, auth_token)
        monday = date.today() - timedelta(days=date.today().weekday())
        # PRs in each of the last 3 weeks (posted chronologically so each beats the last)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 205}], date_str=iso(monday - timedelta(weeks=2)))
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}], date_str=iso(monday - timedelta(weeks=1)))
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}], date_str=iso(monday))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['stats']['pr_streak_weeks'] == 3

    def test_pr_streak_broken_by_gap_week(self, client, auth_token):
        tid = create_template(client, auth_token)
        monday = date.today() - timedelta(days=date.today().weekday())
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 205}], date_str=iso(monday - timedelta(weeks=3)))
        # nothing in weeks -2 and -1
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}], date_str=iso(monday))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['stats']['pr_streak_weeks'] == 1

    def test_prless_current_week_does_not_break_streak(self, client, auth_token):
        tid = create_template(client, auth_token)
        monday = date.today() - timedelta(days=date.today().weekday())
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}], date_str=iso(monday - timedelta(weeks=1)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['stats']['pr_streak_weeks'] == 1

    def test_days_since_last_pr(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=10)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        rows = data['stats']['days_since_last_pr']
        assert len(rows) == 1
        assert rows[0]['exercise_name'] == 'Bench Press'
        assert rows[0]['days_since_last_pr'] == 10
        assert rows[0]['stalest_category'] == 'weight'

    def test_days_since_last_pr_by_type_breakdown(self, client, auth_token):
        # max_weight 10 days ago, max_reps (different weight) 3 days ago —
        # the aggregate should track the STALEST type (weight, the one that's
        # gone the longest without a PR), not whichever was hit most
        # recently; each type's own entry in by_type still tracks its own
        # date independently.
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=10)))
        post_strength_workout(client, auth_token, tid, [{'reps': 8, 'weight': 185}],
                              date_str=iso(date.today() - timedelta(days=3)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        row = data['stats']['days_since_last_pr'][0]

        assert row['days_since_last_pr'] == 10  # aggregate = the stalest type (weight)
        assert row['stalest_category'] == 'weight'
        assert row['by_type']['weight']['days_since_last_pr'] == 10
        assert row['by_type']['reps']['days_since_last_pr'] == 3
        assert row['by_type']['time'] is None       # never PR'd — no entry, not a stale zero
        assert row['by_type']['distance'] is None

    def test_days_since_last_pr_by_type_includes_weight_context_for_reps(self, client, auth_token):
        # Two different weights get max_reps PRs — the reps category should
        # report the weight of the MOST RECENT one, not just any of them.
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 8, 'weight': 185}],
                              date_str=iso(date.today() - timedelta(days=10)))
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=2)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        row = data['stats']['days_since_last_pr'][0]
        assert row['by_type']['reps']['weight_context'] == 225
        assert row['by_type']['reps']['days_since_last_pr'] == 2
        # max_weight has no meaningful weight_context (stored as the -1
        # sentinel) — normalized to None like elsewhere in the API.
        assert row['by_type']['weight']['weight_context'] is None

    def test_days_since_last_pr_by_type_time_spans_best_time_and_max_duration(self, client, auth_token):
        # The "time" category covers two pr_types (best_time, max_duration) —
        # the breakdown should max across both, matching the feed's own
        # FEED_TYPE_FILTERS grouping.
        tid = create_template(client, auth_token, name='Running', muscle_group='Core')
        post_cardio_workout(client, auth_token, tid, duration_min=30, distance_km=5,
                            date_str=iso(date.today() - timedelta(days=5)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        row = next(r for r in data['stats']['days_since_last_pr'] if r['exercise_name'] == 'Running')
        assert row['by_type']['time']['days_since_last_pr'] == 5

    def test_other_users_events_not_visible(self, client, auth_token, auth_token2):
        tid = create_template(client, auth_token, name='Squat', muscle_group='Quads')
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 315}])
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token2)).get_json()
        assert data['recent_events'] == []
        assert data['stats']['prs_this_month'] == 0

    def test_feed_includes_events_within_the_past_week(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=6)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert len(data['recent_events']) > 0
        assert data['recent_events_scope'] == 'week'

    def test_feed_excludes_older_events_when_the_week_has_a_pr(self, client, auth_token):
        # A within-week PR fills the window, so an older PR on a different
        # exercise must not leak into the feed alongside it.
        old_tid = create_template(client, auth_token, name='Squat', muscle_group='Quads')
        post_strength_workout(client, auth_token, old_tid, [{'reps': 5, 'weight': 315}],
                              date_str=iso(date.today() - timedelta(days=8)), name='Old Squat Day')
        new_tid = create_template(client, auth_token, name='Bench Press')
        post_strength_workout(client, auth_token, new_tid, [{'reps': 5, 'weight': 225}], name='New Bench Day')

        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['recent_events_scope'] == 'week'
        assert all(e['exercise_name'] != 'Squat' for e in data['recent_events'])
        assert any(e['exercise_name'] == 'Bench Press' for e in data['recent_events'])

    def test_feed_falls_back_to_recent_history_when_the_week_is_empty(self, client, auth_token):
        # A quiet week shouldn't leave the dashboard looking dead — fall back
        # to the most recent PR(s) regardless of age.
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=8)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert len(data['recent_events']) > 0
        assert data['recent_events_scope'] == 'all_time'

    def test_feed_fallback_is_scoped_to_the_active_type_filter(self, client, auth_token):
        # Reps PR this week, but no weight PR this week — filtering to
        # "weight" should fall back to the old weight PR, not the reps one.
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=8)))
        post_strength_workout(client, auth_token, tid, [{'reps': 10, 'weight': 100}])  # today, different weight -> reps PR

        data = client.get('/api/personal-records/dashboard?type=weight', headers=auth_headers(auth_token)).get_json()
        assert data['recent_events_scope'] == 'all_time'
        assert all(e['pr_type'] == 'max_weight' for e in data['recent_events'])

    def test_feed_window_does_not_affect_momentum_stats(self, client, auth_token):
        # Momentum stats (streak/total) always read the full history,
        # independent of whichever scope the feed itself is showing.
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=10)))
        data = client.get('/api/personal-records/dashboard', headers=auth_headers(auth_token)).get_json()
        assert data['stats']['total_prs'] > 0


# ---------------------------------------------------------------------------
# GET /api/personal-records/history
# ---------------------------------------------------------------------------

class TestHistoryEndpoint:

    def test_requires_template_id(self, client, auth_token):
        res = client.get('/api/personal-records/history', headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_progression_ascending_with_deltas(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=14)))
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}])
        res = client.get(
            f'/api/personal-records/history?exercise_template_id={tid}&pr_type=max_weight',
            headers=auth_headers(auth_token),
        )
        rows = res.get_json()
        assert [r['value'] for r in rows] == [225, 245]
        assert rows[0]['improved_by'] is None
        assert rows[1]['improved_by'] == 20
        assert all(r['workout_name'] for r in rows)

    def test_estimated_1rm_available_in_history(self, client, auth_token):
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        rows = client.get(
            f'/api/personal-records/history?exercise_template_id={tid}&pr_type=estimated_1rm',
            headers=auth_headers(auth_token),
        ).get_json()
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# Unit switch converts PR history alongside current PRs
# ---------------------------------------------------------------------------

class TestUnitSwitchConvertsEvents:

    def _switch_unit(self, client, token, unit):
        res = client.patch('/api/me', json={'weight_unit': unit}, headers=auth_headers(token))
        assert res.status_code == 200

    def test_weight_events_convert_with_personal_records(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=7)))
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}])

        self._switch_unit(client, auth_token, 'kg')

        # Events must land on exactly the same converted value as the current-PR table
        current_pr = PersonalRecord.query.filter_by(
            user_id=user_id, exercise_template_id=tid, pr_type='max_weight',
        ).first()
        evs = events_for(user_id, 'max_weight')
        assert evs[1].value == current_pr.value  # 245 lbs -> kg, identical rounding
        assert evs[0].value == 102.0             # 225 lbs -> 102 kg
        # The previous_value chain stays linked after conversion
        assert evs[1].previous_value == evs[0].value
        assert evs[0].previous_value is None

    def test_max_reps_context_converts_but_value_does_not(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 8, 'weight': 225}])

        self._switch_unit(client, auth_token, 'kg')

        evs = events_for(user_id, 'max_reps')
        assert evs[0].weight_context == 102.0  # the weight converts
        assert evs[0].value == 8               # the rep count doesn't

    def test_cardio_events_unaffected_by_unit_switch(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token, name='Running', muscle_group='Core')
        post_cardio_workout(client, auth_token, tid, duration_min=30, distance_km=5)

        self._switch_unit(client, auth_token, 'kg')

        evs = [e for e in events_for(user_id, 'best_time') if e.weight_context == 5.0]
        assert len(evs) == 1        # km milestone context untouched
        assert evs[0].value == 30   # minutes untouched


# ---------------------------------------------------------------------------
# flask backfill-pr-events
# ---------------------------------------------------------------------------

class TestBackfillPrEvents:

    def _wipe_events(self, user_id):
        PREvent.query.filter_by(user_id=user_id).delete()
        db.session.commit()

    def test_backfill_restores_event_chain(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}],
                              date_str=iso(date.today() - timedelta(days=7)))
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}])
        self._wipe_events(user_id)

        result = app.test_cli_runner().invoke(args=['backfill-pr-events', '--apply'])
        assert result.exit_code == 0

        evs = events_for(user_id, 'max_weight')
        assert [e.value for e in evs] == [225, 245]
        assert evs[0].previous_value is None
        assert evs[1].previous_value == 225

    def test_dry_run_writes_nothing(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        self._wipe_events(user_id)

        result = app.test_cli_runner().invoke(args=['backfill-pr-events'])
        assert result.exit_code == 0
        assert 'DRY RUN' in result.output
        assert events_for(user_id) == []

    def test_skips_users_with_existing_events(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        ids_before = {e.id for e in events_for(user_id)}
        assert ids_before  # live save path already wrote events

        result = app.test_cli_runner().invoke(args=['backfill-pr-events', '--apply'])
        assert result.exit_code == 0
        assert 'skipped' in result.output
        assert {e.id for e in events_for(user_id)} == ids_before

    def test_force_rebuilds_existing_events(self, app, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        tid = create_template(client, auth_token)
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 225}])
        post_strength_workout(client, auth_token, tid, [{'reps': 5, 'weight': 245}])

        result = app.test_cli_runner().invoke(args=['backfill-pr-events', '--apply', '--force'])
        assert result.exit_code == 0

        evs = events_for(user_id, 'max_weight')
        assert [e.value for e in evs] == [225, 245]
        assert evs[1].previous_value == 225
