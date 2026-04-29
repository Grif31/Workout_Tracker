"""
Tests for AI generation route:
  POST /api/ai/generate
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


# ---------------------------------------------------------------------------
# Authentication guard
# ---------------------------------------------------------------------------

class TestGenerateAuth:

    def test_requires_auth(self, client):
        res = client.post('/api/ai/generate', json={
            'days_per_week': 3, 'goal': 'general', 'experience': 'beginner',
            'generate_type': 'routine',
        })
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
# Successful routine generation
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

    def test_returns_201(self, client, auth_token):
        res = self._post(client, auth_token)
        assert res.status_code == 201

    def test_response_type_is_routine(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert data['type'] == 'routine'

    def test_response_includes_id_and_name(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert isinstance(data['id'], int)
        assert data['name'] == ROUTINE_JSON['name']

    def test_routine_appears_in_list(self, client, auth_token):
        self._post(client, auth_token)
        routines = client.get('/api/routines', headers=auth_headers(auth_token)).get_json()
        names = [r['name'] for r in routines]
        assert ROUTINE_JSON['name'] in names

    def test_routine_has_correct_day_count(self, client, auth_token):
        routine_id = self._post(client, auth_token).get_json()['id']
        routine = client.get(f'/api/routines/{routine_id}', headers=auth_headers(auth_token)).get_json()
        assert routine['day_count'] == len(ROUTINE_JSON['days'])

    def test_routine_day_labels_match(self, client, auth_token):
        routine_id = self._post(client, auth_token).get_json()['id']
        routine = client.get(f'/api/routines/{routine_id}', headers=auth_headers(auth_token)).get_json()
        expected_labels = {d['label'] for d in ROUTINE_JSON['days']}
        actual_labels = {d['label'] for d in routine['days']}
        assert actual_labels == expected_labels

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

    def test_does_not_create_routine_for_other_user(self, client, auth_token, auth_token2):
        self._post(client, auth_token)
        routines2 = client.get('/api/routines', headers=auth_headers(auth_token2)).get_json()
        assert routines2 == []


# ---------------------------------------------------------------------------
# Successful template generation
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

    def test_returns_201(self, client, auth_token):
        res = self._post(client, auth_token)
        assert res.status_code == 201

    def test_response_type_is_template(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert data['type'] == 'template'

    def test_response_includes_id_and_name(self, client, auth_token):
        data = self._post(client, auth_token).get_json()
        assert isinstance(data['id'], int)
        assert data['name'] == TEMPLATE_JSON['name']

    def test_template_appears_in_list(self, client, auth_token):
        self._post(client, auth_token)
        templates = client.get('/api/workout-templates', headers=auth_headers(auth_token)).get_json()
        names = [t['name'] for t in templates]
        assert TEMPLATE_JSON['name'] in names

    def test_does_not_create_template_for_other_user(self, client, auth_token, auth_token2):
        self._post(client, auth_token)
        templates2 = client.get('/api/workout-templates', headers=auth_headers(auth_token2)).get_json()
        assert templates2 == []


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
        assert res.status_code == 201
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
            assert res.status_code == 201, f'Failed for goal={goal}'

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
            assert res.status_code == 201, f'Failed for experience={exp}'
