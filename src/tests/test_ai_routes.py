"""
Tests for AI generation routes:
  POST /api/ai/generate — returns a 200 preview, persists nothing
  POST /api/ai/save     — persists a previewed routine/template, returns 201
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
