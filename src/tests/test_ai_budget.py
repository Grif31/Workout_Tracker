"""The daily ceiling on what all users together spend on the AI routes."""
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from models import db, AiCallLog
from tests.test_ai_routes import _make_anthropic_mock, INSIGHTS_JSON, REVIEW_JSON, ROUTINE_JSON
from utils import ai_client

HAIKU = 'claude-haiku-4-5-20251001'
GENERATE = {'days_per_week': 3, 'goal': 'general', 'experience': 'beginner', 'generate_type': 'routine'}
ROUTES = [
    ('/api/ai/generate', GENERATE, ROUTINE_JSON),
    ('/api/ai/insights', {}, INSIGHTS_JSON),
    ('/api/ai/weekly-review', {}, REVIEW_JSON),
]


def log_spend(app, dollars, when=None):
    """One logged call costing `dollars` at Haiku's output price ($5 / M)."""
    with app.app_context():
        db.session.add(AiCallLog(endpoint='insights', model=HAIKU, output_tokens=int(dollars * 200_000),
                                 latency_ms=10, ok=True, created_at=when or datetime.now()))
        db.session.commit()


def post(client, token, path, body, response_json):
    mock_ant = _make_anthropic_mock(response_json)
    with patch.dict(sys.modules, {'anthropic': mock_ant}):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
            res = client.post(path, json=body, headers={'Authorization': f'Bearer {token}'})
    return res, mock_ant.Anthropic.return_value.messages.create


class TestSpentToday:

    def test_adds_up_todays_calls_at_list_price(self, app):
        log_spend(app, 1.5)
        log_spend(app, 2.0)
        with app.app_context():
            assert ai_client.spent_today() == pytest.approx(3.5)

    def test_yesterday_does_not_count(self, app):
        log_spend(app, 50, when=datetime.now() - timedelta(days=1))
        with app.app_context():
            assert ai_client.spent_today() == 0
            assert ai_client.daily_budget_spent() is False

    def test_the_ceiling_comes_from_the_environment(self, app, monkeypatch):
        log_spend(app, 6)
        with app.app_context():
            assert ai_client.daily_budget_spent() is False
            monkeypatch.setenv('AI_DAILY_BUDGET_USD', '5')
            assert ai_client.daily_budget_spent() is True
            monkeypatch.setenv('AI_DAILY_BUDGET_USD', 'lots')
            assert ai_client.daily_budget_usd() == ai_client.DEFAULT_DAILY_BUDGET_USD


class TestRoutesStopAtTheCeiling:

    @pytest.mark.parametrize('path,body,response_json', ROUTES)
    def test_refuses_without_calling_the_model_once_today_is_spent(self, client, auth_token, app, path, body, response_json):
        log_spend(app, ai_client.DEFAULT_DAILY_BUDGET_USD)
        res, create = post(client, auth_token, path, body, response_json)
        assert res.status_code == 503
        assert res.get_json()['budget_spent'] is True
        create.assert_not_called()

    @pytest.mark.parametrize('path,body,response_json', ROUTES)
    def test_answers_normally_under_the_ceiling(self, client, auth_token, app, path, body, response_json):
        log_spend(app, ai_client.DEFAULT_DAILY_BUDGET_USD - 1)
        res, create = post(client, auth_token, path, body, response_json)
        assert res.status_code == 200
        create.assert_called_once()
