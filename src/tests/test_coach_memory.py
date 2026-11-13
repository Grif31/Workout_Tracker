"""
The Coach's memory of a user (TODO §23):
  GET/PUT /api/me/coach-profile, and the AI routes falling back to it
  Stored insights (one batch per refresh) and votes keyed by insight id
  Follow-through: last batch's suggestions shown to the Coach and checked
"""
import json
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from models import db, CoachProfile, Insight, InsightFeedback


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


PROFILE = {
    'goal': 'strength', 'experience': 'advanced', 'equipment': 'home_barbell',
    'days_per_week': 4, 'session_length_min': 75, 'avoid': ['knees', 'lower_back'], 'notes': 'Bad left wrist.',
}


def _mock_anthropic(response_json):
    content = MagicMock(type='text')
    content.text = json.dumps(response_json)
    mock = MagicMock()
    mock.Anthropic.return_value.messages.create.return_value.content = [content]
    mock.Anthropic.return_value.messages.create.return_value.stop_reason = 'end_turn'
    return mock


def _call(client, token, path, body, response_json):
    mock = _mock_anthropic(response_json)
    with patch.dict(sys.modules, {'anthropic': mock}):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
            res = client.post(path, json=body, headers=auth_headers(token))
    prompt = mock.Anthropic.return_value.messages.create.call_args[1]['messages'][0]['content']
    return res, prompt


def _insight(title, insight_type='suggestion', body=None, follows=None):
    return {'type': insight_type, 'title': title, 'body': body or f'{title} body.', 'priority': 'medium',
            'evidence': {'exercise': None, 'metric': None, 'before': None, 'after': None, 'window_days': None},
            'follows': follows}


def _refresh(client, token, insights, body=None):
    return _call(client, token, '/api/ai/insights', body or {}, {'insights': insights})


def _seed_batch(user_id, days_ago, insights, batch_id=None):
    """A stored batch as an earlier refresh would have written it."""
    batch_id = batch_id or f'batch{days_ago}'
    created = datetime.now() - timedelta(days=days_ago)
    rows = [Insight(user_id=user_id, batch_id=batch_id, position=n, insight_type=t, title=title,
                    body=f'{title} body.', priority='medium', created_at=created)
            for n, (title, t) in enumerate(insights)]
    db.session.add_all(rows)
    db.session.commit()
    return [r.id for r in rows]


# ---------------------------------------------------------------------------
# Coach profile on the server
# ---------------------------------------------------------------------------

class TestCoachProfileRoutes:

    def _put(self, client, token, body):
        return client.put('/api/me/coach-profile', json=body, headers=auth_headers(token))

    def _get(self, client, token):
        return client.get('/api/me/coach-profile', headers=auth_headers(token)).get_json()['profile']

    def test_requires_auth(self, client):
        assert client.get('/api/me/coach-profile').status_code == 401
        assert client.put('/api/me/coach-profile', json=PROFILE).status_code == 401

    def test_null_until_one_is_uploaded(self, client, auth_token):
        assert self._get(client, auth_token) is None

    def test_put_stores_it_and_a_second_put_replaces_it(self, client, auth_token):
        assert self._put(client, auth_token, PROFILE).status_code == 200
        stored = self._get(client, auth_token)
        assert {k: stored[k] for k in PROFILE} == PROFILE
        assert stored['updated_at']

        self._put(client, auth_token, {**PROFILE, 'avoid': [], 'notes': ''})
        stored = self._get(client, auth_token)
        assert stored['avoid'] == [] and stored['notes'] == ''
        assert CoachProfile.query.count() == 1

    def test_each_account_has_its_own(self, client, auth_token, auth_token2):
        self._put(client, auth_token, PROFILE)
        assert self._get(client, auth_token2) is None

    @pytest.mark.parametrize('override', [
        {'days_per_week': 0}, {'days_per_week': 8}, {'days_per_week': '4'},
        {'session_length_min': 0}, {'goal': ''}, {'goal': 'x' * 101},
        {'notes': 'x' * 1001}, {'avoid': 'x' * 101}, {'avoid': [1, 2]},
    ])
    def test_rejects_out_of_bounds_fields(self, client, auth_token, override):
        assert self._put(client, auth_token, {**PROFILE, **override}).status_code == 400
        assert self._get(client, auth_token) is None

    def test_rejects_a_missing_field(self, client, auth_token):
        body = {k: v for k, v in PROFILE.items() if k != 'goal'}
        assert self._put(client, auth_token, body).status_code == 400

    def test_none_in_avoid_means_no_injuries(self, client, auth_token):
        self._put(client, auth_token, {**PROFILE, 'avoid': ['none']})
        assert self._get(client, auth_token)['avoid'] == []

    def test_in_the_export_and_gone_with_the_account(self, client, auth_token):
        self._put(client, auth_token, PROFILE)
        export = client.get('/api/me/export', headers=auth_headers(auth_token)).get_json()
        assert export['coach_profile']['goal'] == 'strength'
        res = client.delete('/api/me', json={'password': 'password123'}, headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert CoachProfile.query.count() == 0


class TestAiRoutesReadTheStoredProfile:

    def _store(self, client, token, **override):
        client.put('/api/me/coach-profile', json={**PROFILE, **override}, headers=auth_headers(token))

    def test_insights_use_it_when_the_request_leaves_the_fields_out(self, client, auth_token):
        self._store(client, auth_token)
        _, prompt = _refresh(client, auth_token, [], body={})
        assert 'Client goal: Strength & Power' in prompt
        assert 'Client experience: Advanced' in prompt
        assert 'KNEE ISSUES' in prompt and 'LOWER BACK ISSUES' in prompt

    def test_fields_in_the_request_still_win(self, client, auth_token):
        """Builds from before the upload send the device's copy, which is the newer one."""
        self._store(client, auth_token)
        _, prompt = _refresh(client, auth_token, [], body={'goal': 'hypertrophy', 'avoid': ['shoulders']})
        assert 'Client goal: Muscle Building' in prompt
        assert 'SHOULDER ISSUES' in prompt and 'KNEE ISSUES' not in prompt
        # Not sent, so still the stored one
        assert 'Client experience: Advanced' in prompt

    def test_an_empty_avoid_list_in_the_request_is_an_answer(self, client, auth_token):
        self._store(client, auth_token)
        _, prompt = _refresh(client, auth_token, [], body={'avoid': []})
        assert 'KNEE ISSUES' not in prompt

    def test_no_stored_profile_and_no_fields_is_no_profile(self, client, auth_token):
        _, prompt = _refresh(client, auth_token, [], body={})
        assert 'Client goal' not in prompt and 'Injury constraint' not in prompt

    def test_notes_reach_the_insights_prompt_as_the_clients_words(self, client, auth_token):
        self._store(client, auth_token)
        _, prompt = _refresh(client, auth_token, [], body={})
        assert 'Client notes, in their own words: "Bad left wrist."' in prompt
        assert 'They are not training data' in prompt

    def test_notes_in_the_request_win_and_an_empty_string_means_none(self, client, auth_token):
        self._store(client, auth_token)
        _, prompt = _refresh(client, auth_token, [], body={'notes': 'Marathon in March.'})
        assert '"Marathon in March."' in prompt and 'Bad left wrist' not in prompt
        _, prompt = _refresh(client, auth_token, [], body={'notes': '   '})
        assert 'Client notes' not in prompt

    def test_no_notes_no_notes_line(self, client, auth_token):
        self._store(client, auth_token, notes='')
        _, prompt = _refresh(client, auth_token, [], body={})
        assert 'Client notes' not in prompt

    def test_oversized_notes_rejected(self, client, auth_token):
        res = client.post('/api/ai/insights', json={'notes': 'x' * 1001}, headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_weekly_review_uses_it_too(self, client, auth_token):
        self._store(client, auth_token)
        review = {k: {'title': 'T', 'body': 'B', 'evidence': None} for k in ('went_well', 'lagged', 'next_change')}
        res, prompt = _call(client, auth_token, '/api/ai/weekly-review', {}, review)
        assert res.status_code == 200
        assert 'Client goal: Strength & Power' in prompt and 'KNEE ISSUES' in prompt
        assert '"Bad left wrist."' in prompt

    def test_swap_alternatives_use_the_stored_injuries(self, client, auth_token):
        def make(name, muscle, equipment):
            return client.post('/api/exercises', json={'name': name, 'muscle_group': muscle, 'equipment': equipment},
                               headers=auth_headers(auth_token)).get_json()['id']

        def names(query=''):
            res = client.get(f'/api/exercises/{src}/alternatives{query}', headers=auth_headers(auth_token))
            return sorted(a['name'] for a in res.get_json()['alternatives'])

        src = make('Barbell Squat', 'Quads', 'Barbell')
        make('Leg Press', 'Quads', 'Machine')
        make('Step-Up', 'Quads', 'Dumbbell')
        self._store(client, auth_token, avoid=['knees'])
        assert names() == ['Step-Up']
        # An explicit empty list is the device saying "no injuries"
        assert names('?avoid=') == ['Leg Press', 'Step-Up']


# ---------------------------------------------------------------------------
# Stored insights and votes by id
# ---------------------------------------------------------------------------

class TestStoredInsights:

    def test_a_refresh_stores_what_it_returns_as_one_batch(self, client, auth_token):
        res, _ = _refresh(client, auth_token, [_insight('Add Rows'), _insight('Rest Tomorrow', 'rest')])
        returned = res.get_json()['insights']
        rows = Insight.query.order_by(Insight.position).all()
        assert [r.id for r in rows] == [i['id'] for i in returned]
        assert [r.title for r in rows] == ['Add Rows', 'Rest Tomorrow']
        assert len({r.batch_id for r in rows}) == 1
        assert rows[0].insight_type == 'suggestion' and rows[0].priority == 'medium'

    def test_each_refresh_is_its_own_batch(self, client, auth_token):
        _refresh(client, auth_token, [_insight('One')])
        _refresh(client, auth_token, [_insight('Two')])
        assert len({r.batch_id for r in Insight.query.all()}) == 2

    def test_insights_the_checks_drop_are_not_stored(self, client, auth_token):
        unknown = {**_insight('Made Up Lift'),
                   'evidence': {'exercise': 'Zercher Squat', 'metric': 'Max Weight', 'before': 1, 'after': 2,
                                'window_days': 7}}
        res, _ = _refresh(client, auth_token, [unknown, _insight('Kept')])
        assert [i['title'] for i in res.get_json()['insights']] == ['Kept']
        assert [r.title for r in Insight.query.all()] == ['Kept']

    def test_in_the_export_and_gone_with_the_account(self, client, auth_token):
        _refresh(client, auth_token, [_insight('Add Rows')])
        export = client.get('/api/me/export', headers=auth_headers(auth_token)).get_json()
        assert [i['title'] for i in export['insights']] == ['Add Rows']
        client.delete('/api/me', json={'password': 'password123'}, headers=auth_headers(auth_token))
        assert Insight.query.count() == 0


class TestVotesById:

    def _vote(self, client, token, body):
        return client.post('/api/ai/insights/feedback', json=body, headers=auth_headers(token))

    def _stored(self, client, token, title='Add Rows'):
        return _refresh(client, token, [_insight(title)])[0].get_json()['insights'][0]

    def test_a_vote_by_id_takes_the_text_from_the_stored_insight(self, client, auth_token):
        ins = self._stored(client, auth_token)
        res = self._vote(client, auth_token, {'insight_id': ins['id'], 'type': 'deload', 'title': 'Edited',
                                              'body': 'Edited.', 'helpful': False, 'reason': 'vague'})
        assert res.status_code == 200
        row = InsightFeedback.query.one()
        assert (row.insight_id, row.title, row.body, row.insight_type, row.reason) == (
            ins['id'], 'Add Rows', 'Add Rows body.', 'suggestion', 'vague')

    def test_a_second_vote_by_id_replaces_and_null_takes_it_back(self, client, auth_token):
        ins = self._stored(client, auth_token)
        vote = {'insight_id': ins['id'], 'title': ins['title'], 'body': ins['body']}
        self._vote(client, auth_token, {**vote, 'helpful': True})
        self._vote(client, auth_token, {**vote, 'helpful': False})
        assert InsightFeedback.query.one().helpful is False
        self._vote(client, auth_token, {**vote, 'helpful': None})
        assert InsightFeedback.query.count() == 0

    def test_another_accounts_insight_is_a_404(self, client, auth_token, auth_token2):
        ins = self._stored(client, auth_token)
        res = self._vote(client, auth_token2, {'insight_id': ins['id'], 'title': 'x', 'body': 'y', 'helpful': True})
        assert res.status_code == 404
        assert InsightFeedback.query.count() == 0

    def test_rejects_a_non_integer_id(self, client, auth_token):
        res = self._vote(client, auth_token, {'insight_id': '1', 'title': 'x', 'body': 'y', 'helpful': True})
        assert res.status_code == 400

    def test_a_text_vote_from_an_older_build_still_works(self, client, auth_token):
        res = self._vote(client, auth_token, {'title': 'Add Rows', 'body': 'Add Rows body.', 'helpful': True})
        assert res.status_code == 200
        assert InsightFeedback.query.one().insight_id is None

    def test_a_word_for_word_repeat_keeps_its_vote_and_one_row_per_wording(self, client, auth_token):
        first = self._stored(client, auth_token)
        self._vote(client, auth_token, {'insight_id': first['id'], 'title': 'x', 'body': 'y', 'helpful': False})
        again = self._stored(client, auth_token)
        assert again['id'] != first['id'] and again['helpful'] is False
        self._vote(client, auth_token, {'insight_id': again['id'], 'title': 'x', 'body': 'y', 'helpful': True})
        row = InsightFeedback.query.one()
        assert row.helpful is True and row.insight_id == again['id']


# ---------------------------------------------------------------------------
# Follow-through
# ---------------------------------------------------------------------------

class TestPreviousSuggestions:

    def _previous(self, user_id):
        from routes.ai_routes import _previous_suggestions
        return _previous_suggestions(user_id, datetime.now())

    def test_a_batch_from_last_week_is_shown_in_order(self, registered_user):
        uid = registered_user['user']['id']
        ids = _seed_batch(uid, 7, [('Add Rows', 'frequency'), ('Deload Bench', 'deload')])
        previous = self._previous(uid)
        assert [p['id'] for p in previous] == ids
        assert previous[0]['days_ago'] == 7

    @pytest.mark.parametrize('days_ago', [0, 4, 22])
    def test_too_new_or_too_old_is_not(self, registered_user, days_ago):
        uid = registered_user['user']['id']
        _seed_batch(uid, days_ago, [('Add Rows', 'frequency')])
        assert self._previous(uid) == []

    def test_the_newest_old_enough_batch_wins(self, registered_user):
        uid = registered_user['user']['id']
        _seed_batch(uid, 14, [('Older', 'suggestion')])
        _seed_batch(uid, 6, [('Newer', 'suggestion')])
        _seed_batch(uid, 1, [('Too New', 'suggestion')])
        assert [p['title'] for p in self._previous(uid)] == ['Newer']

    def test_achievements_and_follow_ups_are_left_out(self, registered_user):
        uid = registered_user['user']['id']
        _seed_batch(uid, 7, [('Bench Up', 'achievement'), ('Checked', 'follow_up'), ('Add Rows', 'frequency')])
        assert [p['title'] for p in self._previous(uid)] == ['Add Rows']

    def test_voted_down_and_already_followed_are_left_out(self, client, auth_token, registered_user):
        uid = registered_user['user']['id']
        down, followed, kept = _seed_batch(
            uid, 7, [('Voted Down', 'suggestion'), ('Followed', 'frequency'), ('Kept', 'routine')])
        client.post('/api/ai/insights/feedback', json={'insight_id': down, 'title': 'x', 'body': 'y',
                                                       'helpful': False}, headers=auth_headers(auth_token))
        db.session.add(Insight(user_id=uid, batch_id='later', position=0, insight_type='follow_up', title='F',
                               body='F.', follows_id=followed, created_at=datetime.now() - timedelta(days=2)))
        db.session.commit()
        assert [p['id'] for p in self._previous(uid)] == [kept]

    def test_a_newer_batch_with_nothing_to_offer_doesnt_hide_an_older_one(self, registered_user):
        uid = registered_user['user']['id']
        _seed_batch(uid, 12, [('Add Rows', 'frequency')])
        _seed_batch(uid, 6, [('Bench Up', 'achievement')])
        assert [p['title'] for p in self._previous(uid)] == ['Add Rows']

    def test_a_word_for_word_repeat_of_a_voted_down_suggestion_is_left_out(self, client, auth_token, registered_user):
        uid = registered_user['user']['id']
        (first,) = _seed_batch(uid, 14, [('Add Rows', 'frequency')])
        (repeat,) = _seed_batch(uid, 7, [('Add Rows', 'frequency')])
        client.post('/api/ai/insights/feedback', json={'insight_id': first, 'title': 'x', 'body': 'y',
                                                       'helpful': False}, headers=auth_headers(auth_token))
        assert repeat != first and self._previous(uid) == []

    def test_another_accounts_batch_is_never_shown(self, registered_user, auth_token2):
        from models import User
        uid2 = User.query.filter_by(username='testuser2').one().id
        _seed_batch(uid2, 7, [('Theirs', 'suggestion')])
        assert self._previous(registered_user['user']['id']) == []


class TestFollowUpPrompt:

    def test_the_prompt_numbers_the_suggestions_and_allows_follow_up(self):
        from routes.ai_routes import _build_insights_prompt
        prompt = _build_insights_prompt({'previous_insights': [
            {'id': 10, 'type': 'frequency', 'title': 'Add Rows', 'body': 'Add 2 sets of rows.', 'days_ago': 7},
            {'id': 11, 'type': 'deload', 'title': 'Deload Bench', 'body': 'Drop bench 10%.', 'days_ago': 7},
        ]})
        assert 'Suggestions you made to the client 7 days ago:' in prompt
        assert '  1. [frequency] Add Rows: Add 2 sets of rows.' in prompt
        assert '  2. [deload] Deload Bench: Drop bench 10%.' in prompt
        assert 'achievement, suggestion, follow_up' in prompt
        assert 'Set "follows" to null on every insight that is not a follow_up.' in prompt

    def test_no_previous_batch_no_section_and_no_follow_up_type(self):
        from routes.ai_routes import _build_insights_prompt
        prompt = _build_insights_prompt({})
        assert 'Suggestions you made' not in prompt and 'follow_up' not in prompt

    def test_the_weekly_review_prompt_has_no_follow_up_section(self):
        from routes.ai_routes import _build_insights_prompt
        ctx = {'previous_insights': [{'id': 1, 'type': 'rest', 'title': 'Rest', 'body': 'Rest.', 'days_ago': 7}]}
        assert 'Suggestions you made' not in _build_insights_prompt(ctx, review=True)


class TestVerifyFollowUps:

    PREVIOUS = [{'id': 40, 'type': 'frequency', 'title': 'Add Rows', 'body': '.', 'days_ago': 7},
                {'id': 41, 'type': 'rest', 'title': 'Rest', 'body': '.', 'days_ago': 7}]

    def _verify(self, insights, previous=PREVIOUS):
        from routes.ai_routes import _verify_insights
        return _verify_insights(insights, {'previous_insights': previous})

    def test_a_follow_up_keeps_the_id_of_what_it_follows(self):
        kept = self._verify([_insight('Rows Added', 'follow_up', follows=2)])
        assert kept[0]['follows_id'] == 41 and 'follows' not in kept[0]

    @pytest.mark.parametrize('follows', [None, 0, 3, -1, True, '1', 1.0])
    def test_a_follow_up_pointing_nowhere_is_dropped(self, follows):
        assert self._verify([_insight('Rows Added', 'follow_up', follows=follows)]) == []

    def test_a_follow_up_with_no_suggestions_shown_is_dropped(self):
        assert self._verify([_insight('Rows Added', 'follow_up', follows=1)], previous=[]) == []

    def test_only_one_follow_up_survives(self):
        kept = self._verify([_insight('A', 'follow_up', follows=1), _insight('B', 'follow_up', follows=2)])
        assert [k['title'] for k in kept] == ['A']

    def test_follows_on_another_type_is_ignored(self):
        kept = self._verify([_insight('Add Curls', 'suggestion', follows=1)])
        assert kept[0]['title'] == 'Add Curls' and 'follows_id' not in kept[0] and 'follows' not in kept[0]


class TestFollowThroughEndToEnd:

    def test_last_weeks_suggestion_reaches_the_prompt_and_the_follow_up_is_stored_linked(
            self, client, auth_token, registered_user):
        uid = registered_user['user']['id']
        (rows_id,) = _seed_batch(uid, 7, [('Add Rows', 'frequency')])
        res, prompt = _refresh(client, auth_token, [_insight('Rows Added', 'follow_up', follows=1)])
        assert '  1. [frequency] Add Rows: Add Rows body.' in prompt
        assert res.get_json()['insights'][0]['type'] == 'follow_up'
        stored = Insight.query.filter_by(title='Rows Added').one()
        assert stored.follows_id == rows_id

        # Once followed up, it isn't offered again
        _, prompt = _refresh(client, auth_token, [])
        assert 'Add Rows' not in prompt

    def test_the_insight_schema_allows_and_requires_follows(self):
        from routes.ai_routes import INSIGHT_SCHEMA
        item = INSIGHT_SCHEMA['properties']['insights']['items']
        assert 'follow_up' in item['properties']['type']['enum']
        assert 'follows' in item['required']


# ---------------------------------------------------------------------------
# Checkable targets and the client's follow-through record
# ---------------------------------------------------------------------------

def _log_lift(user_id, name, weight, days_ago, set_type='N'):
    from models import Exercise, Set, Workout
    w = Workout(user_id=user_id, name='Lift', date=datetime.now() - timedelta(days=days_ago))
    db.session.add(w)
    db.session.flush()
    e = Exercise(workout_id=w.id, name=name, exercise_type='strength')
    db.session.add(e)
    db.session.flush()
    db.session.add(Set(exercise_id=e.id, reps=5, weight=weight, set_type=set_type))
    db.session.commit()


def _log_sets(user_id, muscle, sets, days_ago):
    """Working sets on an exercise whose primary muscle is `muscle`."""
    from models import Exercise, ExerciseMuscleMapping, ExerciseTemplate, Set, Workout
    tmpl = ExerciseTemplate.query.filter_by(name=f'{muscle} Move').first()
    if tmpl is None:
        tmpl = ExerciseTemplate(name=f'{muscle} Move', equipment='Cable')
        db.session.add(tmpl)
        db.session.flush()
        db.session.add(ExerciseMuscleMapping(exercise_template_id=tmpl.id, muscle_group=muscle, is_primary=True))
    w = Workout(user_id=user_id, name='Sets', date=datetime.now() - timedelta(days=days_ago))
    db.session.add(w)
    db.session.flush()
    e = Exercise(workout_id=w.id, name=tmpl.name, exercise_template_id=tmpl.id, exercise_type='strength')
    db.session.add(e)
    db.session.flush()
    db.session.add_all(Set(exercise_id=e.id, reps=8, weight=50, set_type='N') for _ in range(sets))
    db.session.commit()


def _targeted(title, metric, subject, to, insight_type='frequency'):
    return {**_insight(title, insight_type), 'target': {'metric': metric, 'subject': subject, 'to': to}}


def _ctx(**extra):
    return {'now': datetime.now(), 'weight_unit': 'lbs', 'muscle_sets_week': {'Back': 6.0}, 'workouts_week': 2, **extra}


class TestAttachTargets:

    def _attach(self, uid, insights, ctx=None):
        from routes.ai_routes import _attach_targets
        return _attach_targets(uid, insights, ctx or _ctx())

    def test_the_server_measures_the_start_of_a_sets_target(self, registered_user):
        (kept,) = self._attach(registered_user['user']['id'], [_targeted('Add Rows', 'muscle_sets', 'back', 8)])
        assert kept['target'] == {'metric': 'muscle_sets', 'subject': 'Back', 'from': 6.0, 'to': 8.0}

    def test_a_muscle_not_trained_starts_at_zero(self, registered_user):
        (kept,) = self._attach(registered_user['user']['id'], [_targeted('Add Calves', 'muscle_sets', 'Calves', 6)])
        assert kept['target']['from'] == 0.0

    def test_a_workouts_target_starts_from_the_last_7_days(self, registered_user):
        (kept,) = self._attach(registered_user['user']['id'], [_targeted('Train 3 Days', 'workouts', None, 3)])
        assert kept['target'] == {'metric': 'workouts', 'subject': None, 'from': 2.0, 'to': 3.0}

    def test_a_lift_target_starts_from_the_heaviest_working_set(self, registered_user):
        uid = registered_user['user']['id']
        _log_lift(uid, 'Squat', 300, days_ago=3)
        _log_lift(uid, 'Squat', 405, days_ago=2, set_type='W')   # warm-ups never count
        _log_lift(uid, 'Squat', 350, days_ago=30)                # outside the baseline window
        (kept,) = self._attach(uid, [_targeted('Add 5 lbs', 'top_weight', 'squat', 305, 'suggestion')])
        assert kept['target'] == {'metric': 'top_weight', 'subject': 'squat', 'from': 300.0, 'to': 305.0, 'unit': 'lbs'}

    @pytest.mark.parametrize('target', [
        {'metric': 'muscle_sets', 'subject': 'Lats', 'to': 8},            # not a muscle the app tracks
        {'metric': 'muscle_sets', 'subject': 'Back', 'to': 80},           # out of reach
        {'metric': 'workouts', 'subject': None, 'to': 20},
        {'metric': 'top_weight', 'subject': 'Deadlift', 'to': 400},       # never logged
        {'metric': 'top_weight', 'subject': 'Squat', 'to': 500},          # a misread, not a plan
        {'metric': 'muscle_sets', 'subject': 'Back', 'to': True},
        {'metric': 'muscle_sets', 'subject': 'Back', 'to': None},
        {'metric': 'none', 'subject': None, 'to': None},
    ])
    def test_a_target_that_cant_be_checked_is_dropped_and_the_insight_kept(self, registered_user, target):
        uid = registered_user['user']['id']
        _log_lift(uid, 'Squat', 300, days_ago=3)
        (kept,) = self._attach(uid, [{**_insight('Keep Me'), 'target': target}])
        assert kept['title'] == 'Keep Me' and 'target' not in kept

    @pytest.mark.parametrize('insight_type', ['achievement', 'follow_up'])
    def test_only_suggestions_carry_targets(self, registered_user, insight_type):
        (kept,) = self._attach(registered_user['user']['id'], [_targeted('T', 'muscle_sets', 'Back', 8, insight_type)])
        assert 'target' not in kept

    def test_a_refresh_stores_the_target_and_the_response_leaves_it_out(self, client, auth_token):
        res, prompt = _refresh(client, auth_token, [_targeted('Add Rows', 'muscle_sets', 'Back', 8)])
        assert Insight.query.one().target == {'metric': 'muscle_sets', 'subject': 'Back', 'from': 0.0, 'to': 8.0}
        assert 'target' not in res.get_json()['insights'][0]
        assert '"target"' in prompt and 'Workouts in the last 7 days: 0' in prompt


class TestTargetOutcome:

    def _outcome(self, target, current, unit='lbs'):
        from routes.ai_routes import _target_outcome
        return _target_outcome(target, current, unit)

    @pytest.mark.parametrize('current, expected', [
        (8, 'met'), (7.5, 'met'), (12, 'met'), (7, 'partial'), (6.5, 'not_met'), (6, 'not_met'), (4, 'not_met'),
    ])
    def test_raising_sets(self, current, expected):
        assert self._outcome({'metric': 'muscle_sets', 'from': 6, 'to': 8}, current) == expected

    @pytest.mark.parametrize('current, expected', [(14, 'met'), (10, 'met'), (20, 'partial'), (28, 'not_met'), (46, 'not_met')])
    def test_cutting_sets(self, current, expected):
        assert self._outcome({'metric': 'muscle_sets', 'from': 28, 'to': 14}, current) == expected

    @pytest.mark.parametrize('current, expected', [(26, 'met'), (25.5, 'met'), (24, 'not_met'), (30, 'not_met')])
    def test_holding_sets(self, current, expected):
        assert self._outcome({'metric': 'muscle_sets', 'from': 26, 'to': 26}, current) == expected

    @pytest.mark.parametrize('current, expected', [(4, 'met'), (5, 'met'), (3, 'met'), (6, 'not_met'), (2, 'not_met')])
    def test_holding_workouts_allows_a_day_either_way(self, current, expected):
        assert self._outcome({'metric': 'workouts', 'from': 4, 'to': 4}, current) == expected

    def test_workouts_have_no_slack(self):
        assert self._outcome({'metric': 'workouts', 'from': 2, 'to': 4}, 4) == 'met'
        assert self._outcome({'metric': 'workouts', 'from': 2, 'to': 4}, 3) == 'partial'

    def test_a_lift_not_logged_since_is_no_data(self):
        assert self._outcome({'metric': 'top_weight', 'from': 300, 'to': 305, 'unit': 'lbs'}, None) == 'no_data'

    def test_a_lift_target_set_in_lbs_is_judged_in_kg_after_a_switch(self):
        target = {'metric': 'top_weight', 'from': 300, 'to': 310, 'unit': 'lbs'}   # 136 -> 140.5 kg
        assert self._outcome(target, 140.5, 'kg') == 'met'
        assert self._outcome(target, 136, 'kg') == 'not_met'


class TestCheckTargets:

    def _seed(self, uid, days_ago, target, title='Add Rows', insight_type='frequency'):
        row = Insight(user_id=uid, batch_id=f'b{days_ago}{title}', position=0, insight_type=insight_type, title=title,
                      body=f'{title} body.', target=target, created_at=datetime.now() - timedelta(days=days_ago))
        db.session.add(row)
        db.session.commit()
        return row.id

    def _check(self, uid, **ctx):
        from routes.ai_routes import _check_targets
        return _check_targets(uid, _ctx(**ctx))

    def test_judges_on_the_week_after_the_suggestion_once_that_week_is_over(self, registered_user):
        uid = registered_user['user']['id']
        sets = {'metric': 'muscle_sets', 'subject': 'Back', 'from': 6.0, 'to': 8.0}
        judged = self._seed(uid, 10, sets)
        week_not_over = self._seed(uid, 6, sets, title='Six Days')
        too_old = self._seed(uid, 30, sets, title='Old')
        untargeted = self._seed(uid, 10, None, title='Plain')
        _log_sets(uid, 'Back', 4, days_ago=12)   # before the suggestion
        _log_sets(uid, 'Back', 5, days_ago=8)    # in its week
        _log_sets(uid, 'Back', 4, days_ago=6)    # in its week
        _log_sets(uid, 'Back', 9, days_ago=1)    # after its week

        measured = self._check(uid)
        assert set(measured) == {judged}
        assert measured[judged]['current'] == 9.0 and measured[judged]['outcome'] == 'met'
        outcomes = {r.id: r.outcome for r in Insight.query.all()}
        assert outcomes == {judged: 'met', week_not_over: None, too_old: None, untargeted: None}
        row = db.session.get(Insight, judged)
        assert row.checked_at is not None and row.target['result'] == 9.0

    def test_a_verdict_is_kept_once_made(self, registered_user):
        from models import Workout
        uid = registered_user['user']['id']
        target_id = self._seed(uid, 10, {'metric': 'workouts', 'subject': None, 'from': 1.0, 'to': 2.0})
        _log_lift(uid, 'Squat', 200, days_ago=9)
        _log_lift(uid, 'Squat', 200, days_ago=7)
        assert self._check(uid)[target_id]['outcome'] == 'met'
        checked_at = db.session.get(Insight, target_id).checked_at

        # Later weeks don't overturn it, and it isn't measured again
        Workout.query.filter_by(user_id=uid).update({'date': datetime.now() - timedelta(days=40)})
        db.session.commit()
        again = self._check(uid)[target_id]
        assert again['outcome'] == 'met' and again['current'] == 2.0
        assert db.session.get(Insight, target_id).checked_at == checked_at

    def test_a_lift_counts_only_the_week_after_the_suggestion(self, registered_user):
        uid = registered_user['user']['id']
        squat = {'metric': 'top_weight', 'subject': 'Squat', 'from': 300.0, 'to': 305.0, 'unit': 'lbs'}
        target_id = self._seed(uid, 10, squat, insight_type='suggestion')
        _log_lift(uid, 'Squat', 315, days_ago=12)    # before the suggestion
        _log_lift(uid, 'Squat', 320, days_ago=1)     # after its week
        assert self._check(uid)[target_id]['outcome'] == 'no_data'

        other_id = self._seed(uid, 9, squat, title='Again', insight_type='suggestion')
        _log_lift(uid, 'Squat', 305, days_ago=5)
        assert self._check(uid)[other_id]['outcome'] == 'met'

    def test_a_lift_judged_after_a_unit_switch_keeps_its_own_unit(self, registered_user):
        uid = registered_user['user']['id']
        target_id = self._seed(uid, 10, {'metric': 'top_weight', 'subject': 'Squat', 'from': 300.0, 'to': 310.0,
                                         'unit': 'lbs'}, insight_type='suggestion')
        _log_lift(uid, 'Squat', 141, days_ago=6)    # logged in kg after the switch
        m = self._check(uid, weight_unit='kg')[target_id]
        assert m['outcome'] == 'met' and m['current'] == 141 and m['to'] == 140.5
        assert db.session.get(Insight, target_id).target['result'] == 311   # stored back in lbs

    def test_another_accounts_targets_are_left_alone(self, registered_user, auth_token2):
        from models import User
        uid2 = User.query.filter_by(username='testuser2').one().id
        self._seed(uid2, 10, {'metric': 'workouts', 'subject': None, 'from': 2.0, 'to': 4.0})
        assert self._check(registered_user['user']['id']) == {}
        assert Insight.query.one().outcome is None


class TestFollowThroughRecord:

    def _seed(self, uid, insight_type, outcome, days_ago=10, title=None, target=None):
        db.session.add(Insight(user_id=uid, batch_id=f'x{days_ago}', position=0, insight_type=insight_type,
                               title=title or f'T{Insight.query.count()}', body='B.', outcome=outcome, target=target,
                               created_at=datetime.now() - timedelta(days=days_ago)))
        db.session.commit()

    def _record(self, uid):
        from routes.ai_routes import _adherence
        return _adherence(uid, datetime.now())

    def test_counts_per_type_over_the_window(self, registered_user):
        uid = registered_user['user']['id']
        for outcome in ('met', 'met', 'partial', 'not_met'):
            self._seed(uid, 'frequency', outcome)
        for _ in range(3):
            self._seed(uid, 'deload', 'not_met')
        self._seed(uid, 'deload', 'met', days_ago=120)        # outside the window
        self._seed(uid, 'deload', 'no_data')                   # never counted
        self._seed(uid, 'rest', 'met')                          # one check means nothing yet
        assert self._record(uid) == [
            {'type': 'frequency', 'met': 2, 'partial': 1, 'not_met': 1, 'total': 4},
            {'type': 'deload', 'met': 0, 'partial': 0, 'not_met': 3, 'total': 3},
        ]

    def test_the_same_ask_repeated_in_one_week_counts_once(self, registered_user):
        uid = registered_user['user']['id']
        cut = {'metric': 'muscle_sets', 'subject': 'Chest', 'from': 28.0, 'to': 14.0}
        now = datetime.now()
        monday = now - timedelta(days=now.weekday() + 14)   # a Monday two weeks back, so +2 days stays in its week
        for hours in (0, 2, 4, 48):
            db.session.add(Insight(user_id=uid, batch_id=f'r{hours}', position=0, insight_type='deload', title='Cut Chest',
                                   body='Cut chest.', outcome='not_met', target=cut,
                                   created_at=monday + timedelta(hours=hours)))
        # The same ask a week later is a second chance the client also passed up
        db.session.add(Insight(user_id=uid, batch_id='next', position=0, insight_type='deload', title='Cut Chest',
                               body='Cut chest.', outcome='not_met', target=cut,
                               created_at=monday + timedelta(days=7)))
        db.session.commit()
        assert self._record(uid) == [{'type': 'deload', 'met': 0, 'partial': 0, 'not_met': 2, 'total': 2}]

    def test_another_accounts_record_is_not_counted(self, registered_user, auth_token2):
        from models import User
        uid2 = User.query.filter_by(username='testuser2').one().id
        for _ in range(3):
            self._seed(uid2, 'deload', 'not_met')
        assert self._record(registered_user['user']['id']) == []

    def test_the_prompt_shows_the_record_and_how_to_use_it(self):
        from routes.ai_routes import _build_insights_prompt
        prompt = _build_insights_prompt({'adherence': [
            {'type': 'deload', 'met': 0, 'partial': 0, 'not_met': 3, 'total': 3}]})
        assert '  deloads: reached 0, partly 0, not reached 3 (of 3)' in prompt
        assert 'suggest a smaller step' in prompt and 'OVER MRV' in prompt

    def test_no_record_no_section(self):
        from routes.ai_routes import _build_insights_prompt
        assert 'followed your measurable suggestions' not in _build_insights_prompt({})


class TestMeasuredFollowUpEndToEnd:

    def test_last_weeks_target_is_measured_shown_and_counted(self, client, auth_token, registered_user):
        uid = registered_user['user']['id']
        for days_ago in (20, 30):
            db.session.add(Insight(user_id=uid, batch_id=f'old{days_ago}', position=0, insight_type='deload',
                                   title=f'Older Cut {days_ago}', body='B.', outcome='not_met',
                                   created_at=datetime.now() - timedelta(days=days_ago)))
        db.session.add(Insight(user_id=uid, batch_id='last', position=0, insight_type='frequency', title='Train 2 Days',
                               body='Train twice.', created_at=datetime.now() - timedelta(days=8),
                               target={'metric': 'workouts', 'subject': None, 'from': 0.0, 'to': 2.0}))
        db.session.commit()
        for days_ago in (6, 3):
            _log_lift(uid, 'Squat', 200, days_ago=days_ago)

        _, prompt = _refresh(client, auth_token, [])
        assert ('     Measured: workouts per 7 days: 0 when suggested, 2 in the 7 days after, target 2: reached.'
                in prompt)
        assert 'deloads: reached 0, partly 0, not reached 2 (of 2)' in prompt
        assert Insight.query.filter_by(title='Train 2 Days').one().outcome == 'met'


class TestBlankText:

    @pytest.mark.parametrize('field, value', [('body', '   '), ('body', '\n'), ('title', ' '), ('body', None)])
    def test_an_insight_with_blank_text_is_dropped(self, field, value):
        from routes.ai_routes import _verify_insights
        assert _verify_insights([{**_insight('Blank'), field: value}], {}) == []
