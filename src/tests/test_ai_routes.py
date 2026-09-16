"""
Tests for AI generation routes:
  POST /api/ai/generate  — returns a 200 preview, persists nothing
  POST /api/ai/save      — persists a previewed routine/template, returns 201
  POST /api/ai/insights  — returns AI coaching insights, persists nothing
"""
import sys
import json
import os
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

def _make_anthropic_mock(response_json: dict) -> MagicMock:
    """Build a fake `anthropic` module whose Anthropic client returns a fixed JSON string."""
    mock_content = MagicMock()
    mock_content.text = json.dumps(response_json)

    mock_message = MagicMock()
    mock_message.content = [mock_content]

    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_message

    mock_anthropic = MagicMock()
    mock_anthropic.Anthropic.return_value = mock_client
    return mock_anthropic


ROUTINE_JSON = {
    'name': 'AI Push Pull Legs',
    'description': 'A classic 3-day split.',
    'days': [
        {'label': 'Push', 'exercises': ['Bench Press', 'Overhead Press', 'Tricep Dips']},
        {'label': 'Pull', 'exercises': ['Pull-Up', 'Barbell Row', 'Bicep Curl']},
        {'label': 'Legs', 'exercises': ['Squat', 'Leg Press', 'Calf Raise']},
    ],
}

TEMPLATE_JSON = {
    'name': 'AI Upper Body',
    'exercises': ['Bench Press', 'Overhead Press', 'Pull-Up', 'Barbell Row', 'Bicep Curl'],
}

INSIGHTS_JSON = {
    'insights': [
        {'title': 'Add pulling volume', 'body': 'Your back sets are below MEV this week.'},
        {'title': 'Deload soon', 'body': 'Average RPE has been 9+ for two weeks.'},
    ],
}


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def seed_exercise_template(name='Bench Press'):
    """Insert a global library exercise so _match_exercises has something to hit."""
    from models import db, ExerciseTemplate
    tmpl = ExerciseTemplate(name=name, equipment='Barbell')
    db.session.add(tmpl)
    db.session.commit()
    return tmpl.id


# ---------------------------------------------------------------------------
# Authentication guard
# ---------------------------------------------------------------------------

class TestGenerateAuth:

    def test_generate_requires_auth(self, client):
        res = client.post('/api/ai/generate', json={
            'days_per_week': 3, 'goal': 'general', 'experience': 'beginner',
            'generate_type': 'routine',
        })
        assert res.status_code == 401

    def test_save_requires_auth(self, client):
        res = client.post('/api/ai/save', json={'type': 'template', 'name': 'X'})
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# Missing API key
# ---------------------------------------------------------------------------

class TestGenerateMissingApiKey:

    def test_returns_503_when_no_api_key(self, client, auth_token):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('ANTHROPIC_API_KEY', None)
            res = client.post(
                '/api/ai/generate',
                json={'days_per_week': 3, 'goal': 'general', 'experience': 'beginner', 'generate_type': 'routine'},
                headers=auth_headers(auth_token),
            )
        assert res.status_code == 503
        assert 'not configured' in res.get_json()['message'].lower()


# ---------------------------------------------------------------------------
# Routine generation — 200 preview, nothing persisted
# ---------------------------------------------------------------------------

class TestGenerateRoutine:

    def _post(self, client, token, **kwargs):
        payload = {
            'days_per_week': 3, 'goal': 'general',
            'experience': 'beginner', 'generate_type': 'routine',
            **kwargs,
        }
        mock_ant = _make_anthropic_mock(ROUTINE_JSON)
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                return client.post('/api/ai/generate', json=payload, headers=auth_headers(token))

    def test_returns_200_preview(self, client, auth_token):
        res = self._post(client, auth_token)
        assert res.status_code == 200

    def test_response_type_is_routine(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert data['type'] == 'routine'

    def test_preview_has_name_and_day_labels(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert data['name'] == ROUTINE_JSON['name']
        assert [d['label'] for d in data['days']] == ['Push', 'Pull', 'Legs']

    def test_preview_matches_known_exercises(self, client, auth_token):
        tmpl_id = seed_exercise_template('Bench Press')
        data = self._post(client, auth_token).get_json()
        push_exercises = data['days'][0]['exercises']
        matched = next(e for e in push_exercises if e['name'] == 'Bench Press')
        assert matched['id'] == tmpl_id
        assert 'muscle_group' in matched

    def test_generate_persists_nothing(self, client, auth_token):
        self._post(client, auth_token)
        routines = client.get('/api/routines', headers=auth_headers(auth_token)).get_json()
        assert routines == []

    def test_anthropic_called_with_correct_model(self, client, auth_token):
        mock_ant = _make_anthropic_mock(ROUTINE_JSON)
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                client.post(
                    '/api/ai/generate',
                    json={'days_per_week': 3, 'goal': 'strength', 'experience': 'intermediate', 'generate_type': 'routine'},
                    headers=auth_headers(auth_token),
                )
        call_kwargs = mock_ant.Anthropic.return_value.messages.create.call_args[1]
        assert 'haiku' in call_kwargs['model']


# ---------------------------------------------------------------------------
# Template generation — 200 preview, nothing persisted
# ---------------------------------------------------------------------------

class TestGenerateTemplate:

    def _post(self, client, token, **kwargs):
        payload = {
            'days_per_week': 3, 'goal': 'hypertrophy',
            'experience': 'intermediate', 'generate_type': 'template',
            **kwargs,
        }
        mock_ant = _make_anthropic_mock(TEMPLATE_JSON)
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                return client.post('/api/ai/generate', json=payload, headers=auth_headers(token))

    def test_returns_200_preview(self, client, auth_token):
        res = self._post(client, auth_token)
        assert res.status_code == 200

    def test_response_type_is_template(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert data['type'] == 'template'

    def test_preview_has_name(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert data['name'] == TEMPLATE_JSON['name']

    def test_preview_matches_known_exercises(self, client, auth_token):
        tmpl_id = seed_exercise_template('Barbell Row')
        data = self._post(client, auth_token).get_json()
        matched = next(e for e in data['exercises'] if e['name'] == 'Barbell Row')
        assert matched['id'] == tmpl_id

    def test_generate_persists_nothing(self, client, auth_token):
        self._post(client, auth_token)
        templates = client.get('/api/workout-templates', headers=auth_headers(auth_token)).get_json()
        assert templates == []


# ---------------------------------------------------------------------------
# POST /api/ai/save — persistence
# ---------------------------------------------------------------------------

class TestSaveRoutine:

    def _save(self, client, token, exercise_ids=None):
        return client.post('/api/ai/save', json={
            'type': 'routine',
            'name': ROUTINE_JSON['name'],
            'description': ROUTINE_JSON['description'],
            'days': [
                {'label': d['label'], 'exercise_ids': exercise_ids or []}
                for d in ROUTINE_JSON['days']
            ],
        }, headers=auth_headers(token))

    def test_returns_201_with_id_and_name(self, client, auth_token):
        res = self._save(client, auth_token)
        assert res.status_code == 201
        data = res.get_json()
        assert isinstance(data['id'], int)
        assert data['name'] == ROUTINE_JSON['name']

    def test_routine_appears_in_list(self, client, auth_token):
        self._save(client, auth_token)
        routines = client.get('/api/routines', headers=auth_headers(auth_token)).get_json()
        assert ROUTINE_JSON['name'] in [r['name'] for r in routines]

    def test_routine_has_correct_day_count_and_labels(self, client, auth_token):
        routine_id = self._save(client, auth_token).get_json()['id']
        routine = client.get(f'/api/routines/{routine_id}', headers=auth_headers(auth_token)).get_json()
        assert routine['day_count'] == len(ROUTINE_JSON['days'])
        assert {d['label'] for d in routine['days']} == {d['label'] for d in ROUTINE_JSON['days']}

    def test_saved_day_contains_selected_exercises(self, client, auth_token):
        tmpl_id = seed_exercise_template('Squat')
        routine_id = self._save(client, auth_token, exercise_ids=[tmpl_id]).get_json()['id']
        routine = client.get(f'/api/routines/{routine_id}', headers=auth_headers(auth_token)).get_json()
        day_exercises = routine['days'][0]['workout_template']['exercises']
        assert tmpl_id in [e['id'] for e in day_exercises]

    def test_does_not_create_routine_for_other_user(self, client, auth_token, auth_token2):
        self._save(client, auth_token)
        routines2 = client.get('/api/routines', headers=auth_headers(auth_token2)).get_json()
        assert routines2 == []


class TestSaveTemplate:

    def _save(self, client, token):
        return client.post('/api/ai/save', json={
            'type': 'template',
            'name': TEMPLATE_JSON['name'],
            'exercise_ids': [],
        }, headers=auth_headers(token))

    def test_returns_201_with_id_and_name(self, client, auth_token):
        res = self._save(client, auth_token)
        assert res.status_code == 201
        data = res.get_json()
        assert isinstance(data['id'], int)
        assert data['name'] == TEMPLATE_JSON['name']

    def test_template_appears_in_list(self, client, auth_token):
        self._save(client, auth_token)
        templates = client.get('/api/workout-templates', headers=auth_headers(auth_token)).get_json()
        assert TEMPLATE_JSON['name'] in [t['name'] for t in templates]

    def test_does_not_create_template_for_other_user(self, client, auth_token, auth_token2):
        self._save(client, auth_token)
        templates2 = client.get('/api/workout-templates', headers=auth_headers(auth_token2)).get_json()
        assert templates2 == []

    def test_unknown_type_rejected(self, client, auth_token):
        res = client.post('/api/ai/save', json={'type': 'mixtape', 'name': 'X'},
                          headers=auth_headers(auth_token))
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

class TestGenerateErrors:

    def test_malformed_json_from_ai_returns_500(self, client, auth_token):
        mock_ant = MagicMock()
        mock_content = MagicMock()
        mock_content.text = 'this is not json at all'
        mock_ant.Anthropic.return_value.messages.create.return_value.content = [mock_content]

        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post(
                    '/api/ai/generate',
                    json={'days_per_week': 3, 'goal': 'general', 'experience': 'beginner', 'generate_type': 'routine'},
                    headers=auth_headers(auth_token),
                )
        assert res.status_code == 500
        assert 'json' in res.get_json()['message'].lower()

    def test_anthropic_exception_returns_500(self, client, auth_token):
        mock_ant = MagicMock()
        mock_ant.Anthropic.return_value.messages.create.side_effect = Exception('API timeout')

        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post(
                    '/api/ai/generate',
                    json={'days_per_week': 3, 'goal': 'general', 'experience': 'beginner', 'generate_type': 'routine'},
                    headers=auth_headers(auth_token),
                )
        assert res.status_code == 500

    def test_anthropic_not_installed_returns_503(self, client, auth_token):
        # Simulate ImportError by having the mock raise it when Anthropic is called
        mock_ant = MagicMock()
        mock_ant.Anthropic.side_effect = ImportError('No module named anthropic')

        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post(
                    '/api/ai/generate',
                    json={'days_per_week': 3, 'goal': 'general', 'experience': 'beginner', 'generate_type': 'routine'},
                    headers=auth_headers(auth_token),
                )
        assert res.status_code == 503

    def test_json_with_markdown_fences_still_parsed(self, client, auth_token):
        wrapped = f'```json\n{json.dumps(TEMPLATE_JSON)}\n```'
        mock_ant = MagicMock()
        mock_content = MagicMock()
        mock_content.text = wrapped
        mock_ant.Anthropic.return_value.messages.create.return_value.content = [mock_content]

        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post(
                    '/api/ai/generate',
                    json={'days_per_week': 3, 'goal': 'general', 'experience': 'beginner', 'generate_type': 'template'},
                    headers=auth_headers(auth_token),
                )
        assert res.status_code == 200
        assert res.get_json()['name'] == TEMPLATE_JSON['name']

    def test_goal_options_accepted(self, client, auth_token):
        for goal in ('hypertrophy', 'strength', 'endurance', 'general'):
            mock_ant = _make_anthropic_mock(TEMPLATE_JSON)
            with patch.dict(sys.modules, {'anthropic': mock_ant}):
                with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                    res = client.post(
                        '/api/ai/generate',
                        json={'days_per_week': 3, 'goal': goal, 'experience': 'beginner', 'generate_type': 'template'},
                        headers=auth_headers(auth_token),
                    )
            assert res.status_code == 200, f'Failed for goal={goal}'

    def test_experience_options_accepted(self, client, auth_token):
        for exp in ('beginner', 'intermediate', 'advanced'):
            mock_ant = _make_anthropic_mock(TEMPLATE_JSON)
            with patch.dict(sys.modules, {'anthropic': mock_ant}):
                with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                    res = client.post(
                        '/api/ai/generate',
                        json={'days_per_week': 4, 'goal': 'general', 'experience': exp, 'generate_type': 'template'},
                        headers=auth_headers(auth_token),
                    )
            assert res.status_code == 200, f'Failed for experience={exp}'


# ---------------------------------------------------------------------------
# POST /api/ai/insights
# ---------------------------------------------------------------------------

class TestAiInsights:

    def _post(self, client, token, body=None, response_json=None):
        mock_ant = _make_anthropic_mock(response_json or INSIGHTS_JSON)
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post('/api/ai/insights', json=body or {}, headers=auth_headers(token))
        return res, mock_ant

    def test_requires_auth(self, client):
        res = client.post('/api/ai/insights', json={})
        assert res.status_code == 401

    def test_returns_503_when_no_api_key(self, client, auth_token):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('ANTHROPIC_API_KEY', None)
            res = client.post('/api/ai/insights', json={}, headers=auth_headers(auth_token))
        assert res.status_code == 503
        assert 'not configured' in res.get_json()['message'].lower()

    def test_returns_insights_list_and_timestamp(self, client, auth_token):
        res, _ = self._post(client, auth_token)
        assert res.status_code == 200
        data = res.get_json()
        assert data['insights'] == INSIGHTS_JSON['insights']
        assert 'generated_at' in data

    def test_body_fields_are_optional(self, client, auth_token):
        """CoachProfile is client-side only; the endpoint must work with an empty body."""
        res, _ = self._post(client, auth_token, body={})
        assert res.status_code == 200

    def test_accepts_experience_goal_avoid(self, client, auth_token):
        res, _ = self._post(client, auth_token, body={
            'experience': 'advanced', 'goal': 'hypertrophy', 'avoid': 'barbell squat',
        })
        assert res.status_code == 200

    def test_uses_haiku_model(self, client, auth_token):
        _, mock_ant = self._post(client, auth_token)
        call_kwargs = mock_ant.Anthropic.return_value.messages.create.call_args[1]
        assert 'haiku' in call_kwargs['model']

    def test_works_with_no_workout_history(self, client, auth_token):
        """A brand-new user with zero workouts should still get a 200, not a 500
        from the context builder."""
        res, _ = self._post(client, auth_token)
        assert res.status_code == 200

    def test_persists_nothing(self, client, auth_token):
        self._post(client, auth_token)
        workouts = client.get('/api/workouts', headers=auth_headers(auth_token)).get_json()
        routines = client.get('/api/routines', headers=auth_headers(auth_token)).get_json()
        assert workouts == [] and routines == []

    def test_malformed_json_from_ai_returns_500(self, client, auth_token):
        mock_ant = MagicMock()
        mock_content = MagicMock()
        mock_content.text = 'not json'
        mock_ant.Anthropic.return_value.messages.create.return_value.content = [mock_content]
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post('/api/ai/insights', json={}, headers=auth_headers(auth_token))
        assert res.status_code == 500
        assert 'json' in res.get_json()['message'].lower()

    def test_anthropic_exception_returns_500(self, client, auth_token):
        mock_ant = MagicMock()
        mock_ant.Anthropic.return_value.messages.create.side_effect = Exception('API down')
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post('/api/ai/insights', json={}, headers=auth_headers(auth_token))
        assert res.status_code == 500

    def test_missing_insights_key_yields_empty_list(self, client, auth_token):
        res, _ = self._post(client, auth_token, response_json={'something_else': True})
        assert res.status_code == 200
        assert res.get_json()['insights'] == []


# ---------------------------------------------------------------------------
# Coach voice — brand system prompt and copy cleanup
# ---------------------------------------------------------------------------

class TestCoachVoice:

    def _post(self, client, token, path, payload, response_json):
        mock_ant = _make_anthropic_mock(response_json)
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                res = client.post(path, json=payload, headers=auth_headers(token))
        return res, mock_ant

    def test_generate_and_insights_send_coach_voice_system_prompt(self, client, auth_token):
        from routes.ai_routes import COACH_VOICE
        _, gen_mock = self._post(
            client, auth_token, '/api/ai/generate',
            {'days_per_week': 3, 'goal': 'strength', 'experience': 'intermediate', 'generate_type': 'template'},
            TEMPLATE_JSON,
        )
        _, insights_mock = self._post(client, auth_token, '/api/ai/insights', {}, INSIGHTS_JSON)
        for mock_ant in (gen_mock, insights_mock):
            call_kwargs = mock_ant.Anthropic.return_value.messages.create.call_args[1]
            assert call_kwargs['system'] == COACH_VOICE

    def test_routine_text_has_no_em_dashes_or_exclamation_marks(self, client, auth_token):
        routine = {
            'name': 'Push Pull Legs!',
            'description': 'A 3-day split — built for strength!',
            'days': [{'label': 'Push Day!', 'exercises': ['Bench Press']}],
        }
        res, _ = self._post(
            client, auth_token, '/api/ai/generate',
            {'days_per_week': 3, 'goal': 'strength', 'experience': 'intermediate', 'generate_type': 'routine'},
            routine,
        )
        data = res.get_json()
        assert data['name'] == 'Push Pull Legs'
        assert data['description'] == 'A 3-day split, built for strength.'
        assert data['days'][0]['label'] == 'Push Day'

    def test_insight_text_has_no_em_dashes_or_exclamation_marks(self, client, auth_token):
        insights = {'insights': [{
            'title': 'Bench Press Up 10 lbs!',
            'body': 'Legs are behind — add a lower-body workout!',
            'priority': 'high',
        }]}
        res, _ = self._post(client, auth_token, '/api/ai/insights', {}, insights)
        insight = res.get_json()['insights'][0]
        assert insight['title'] == 'Bench Press Up 10 lbs'
        assert insight['body'] == 'Legs are behind, add a lower-body workout.'
        assert insight['priority'] == 'high'

    def test_insights_prompt_names_the_metric_for_most_improved_lift(self):
        from routes.ai_routes import _build_insights_prompt
        prompt = _build_insights_prompt({
            'weight_unit': 'lbs',
            'most_improved_lift': {'exercise_name': 'Bench Press', 'prev_best': 200.0, 'this_best': 210.0, 'gain': 10.0},
        })
        line = next(l for l in prompt.splitlines() if l.startswith('Most improved lift'))
        assert 'estimated 1RM' in line
        assert 'Bench Press 200.0 → 210.0 lbs (+10.0 lbs)' in line


# ---------------------------------------------------------------------------
# Insight facts — recent PR summaries, stalled lifts, examples
# ---------------------------------------------------------------------------

class TestInsightFacts:

    def test_recent_prs_collapse_into_one_before_after_fact_each(self):
        from datetime import datetime, timedelta
        from types import SimpleNamespace
        from routes.ai_routes import _summarize_recent_prs
        now = datetime(2026, 9, 15, 12, 0)

        def ev(pr_type, value, previous, context, days_ago):
            return SimpleNamespace(pr_type=pr_type, value=value, previous_value=previous,
                                   weight_context=context, achieved_at=now - timedelta(days=days_ago))

        rows = [
            (ev('max_weight', 230, 225, -1.0, 5), 'Bench Press'),
            (ev('max_weight', 315, None, -1.0, 2), 'Deadlift'),
            (ev('max_weight', 235, 230, -1.0, 3), 'Bench Press'),
            (ev('max_reps', 10, 8, 185.0, 1), 'Squat'),
            (ev('best_time', 25.8, 26.4, 5.0, 0), 'Run'),
        ]
        rows.sort(key=lambda r: r[0].achieved_at)

        facts = _summarize_recent_prs(rows, 'lbs', now)
        assert [f['text'] for f in facts] == [
            'Run, 5K Best Time: 26.4 min → 25.8 min (today)',
            'Squat, Max Reps at 185 lbs: 8 reps → 10 reps (1 day ago)',
            'Deadlift, Max Weight: 315 lbs (first recorded, 2 days ago)',
            'Bench Press, Max Weight: 225 lbs → 235 lbs (3 days ago)',
        ]
        bench = next(f for f in facts if f['exercise'] == 'Bench Press')
        assert (bench['pr_type'], bench['before'], bench['after']) == ('max_weight', 225, 235)

    def test_insights_request_uses_the_insight_schema(self, client, auth_token):
        from routes.ai_routes import INSIGHT_SCHEMA
        mock_ant = _make_anthropic_mock(INSIGHTS_JSON)
        with patch.dict(sys.modules, {'anthropic': mock_ant}):
            with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
                client.post('/api/ai/insights', json={}, headers=auth_headers(auth_token))
        call_kwargs = mock_ant.Anthropic.return_value.messages.create.call_args[1]
        assert call_kwargs['output_config'] == {'format': {'type': 'json_schema', 'schema': INSIGHT_SCHEMA}}

    def test_verify_insights_drops_unknown_exercises_and_wrong_numbers(self):
        from routes.ai_routes import _verify_insights
        ctx = {
            'recent_pr_facts': [{
                'exercise': 'Bench Press', 'metric': 'Max Weight', 'pr_type': 'max_weight',
                'before': 225, 'after': 235, 'days_ago': 3, 'text': '',
            }],
            'stalled_lifts': [{'exercise_name': 'Overhead Press', 'days_since_last_pr': 45, 'stalest_category': 'weight'}],
        }

        def insight(title, insight_type, exercise=None, before=None, after=None):
            return {
                'type': insight_type, 'title': title, 'body': 'body', 'priority': 'medium',
                'evidence': {'exercise': exercise, 'metric': 'Max Weight', 'before': before,
                             'after': after, 'window_days': 28},
            }

        kept = _verify_insights([
            insight('real pr', 'achievement', 'Bench Press', 225, 235),
            insight('invented lift', 'suggestion', 'Zercher Squat', 100, 150),
            insight('wrong numbers', 'rest', 'Bench Press', 315, 405),
            insight('stalled lift', 'routine', 'Overhead Press'),
        ], ctx)
        assert [i['title'] for i in kept] == ['real pr', 'stalled lift']

    def test_verify_insights_keeps_muscle_group_subjects(self):
        """Volume insights name a muscle group, not an exercise — the live model
        returns evidence.exercise = "Back" for those."""
        from routes.ai_routes import _verify_insights
        ctx = {'muscle_sets_week': {'Back': 6}, 'muscle_sets_last_week': {'Back': 12}}

        def insight(title, subject):
            return {
                'type': 'frequency', 'title': title, 'body': 'body', 'priority': 'medium',
                'evidence': {'exercise': subject, 'metric': 'Working Sets', 'before': 12,
                             'after': 6, 'window_days': 7},
            }

        assert [i['title'] for i in _verify_insights([insight('back volume', 'Back')], ctx)] == ['back volume']
        assert _verify_insights([insight('invented muscle', 'Gastrocnemius')], ctx) == []

    def test_verify_insights_dedupes_types_sorts_by_priority_and_caps_at_five(self):
        from routes.ai_routes import _verify_insights

        def insight(title, insight_type, priority='medium'):
            return {'type': insight_type, 'title': title, 'body': 'body', 'priority': priority, 'evidence': {}}

        kept = _verify_insights([
            insight('low one', 'rest', 'low'),
            insight('first frequency', 'frequency'),
            insight('second frequency', 'frequency'),
            insight('high one', 'deload', 'high'),
        ], {})
        assert [i['title'] for i in kept] == ['high one', 'first frequency', 'low one']

        six = [insight(f'n{i}', t) for i, t in enumerate(
            ['deload', 'rest', 'frequency', 'routine', 'achievement', 'suggestion'])]
        assert len(_verify_insights(six, {})) == 5

    def test_insights_prompt_includes_pr_facts_stalled_lifts_and_examples(self):
        from routes.ai_routes import _build_insights_prompt
        prompt = _build_insights_prompt({
            'weight_unit': 'lbs',
            'recent_pr_facts': [{'text': 'Bench Press, Max Weight: 225 lbs → 235 lbs (3 days ago)'}],
            'stalled_lifts': [{'exercise_name': 'Overhead Press', 'days_since_last_pr': 45, 'stalest_category': 'weight'}],
        })
        assert '  Bench Press, Max Weight: 225 lbs → 235 lbs (3 days ago)' in prompt
        assert '  Overhead Press: no max weight PR in 45 days' in prompt
        assert 'Good: {' in prompt and 'Bad: {' in prompt
