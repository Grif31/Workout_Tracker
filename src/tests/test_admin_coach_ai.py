"""The admin's Coach and AI usage pages, the ai_call_log they read, and the
create_message helper that writes it."""
import base64
import json
import os
import sys
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from models import db, AiCallLog, InsightFeedback, User
from utils import admin_stats
from utils.ai_client import create_message, estimate_cost


def _basic_auth(password='pw'):
    return {'Authorization': 'Basic ' + base64.b64encode(f'admin:{password}'.encode()).decode()}


def _usage(input_tokens=1200, output_tokens=300, cache_read=0, cache_write=0):
    return SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                           cache_read_input_tokens=cache_read, cache_creation_input_tokens=cache_write)


def _anthropic(text='{}', usage=None, error=None):
    message = MagicMock()
    message.content = [MagicMock(text=text)]
    message.usage = usage if usage is not None else _usage()
    module = MagicMock()
    if error:
        module.Anthropic.return_value.messages.create.side_effect = error
    else:
        module.Anthropic.return_value.messages.create.return_value = message
    return module


# ── create_message ────────────────────────────────────────────

class TestCreateMessage:

    def test_logs_a_successful_call_with_its_tokens(self, app):
        with patch.dict(sys.modules, {'anthropic': _anthropic(usage=_usage(1000, 200, 50, 10))}):
            create_message('insights', None, 'k', model='claude-haiku-4-5-20251001', max_tokens=10, messages=[])
        row = AiCallLog.query.one()
        assert (row.endpoint, row.model, row.ok, row.error) == ('insights', 'claude-haiku-4-5-20251001', True, None)
        assert (row.input_tokens, row.output_tokens, row.cache_read_tokens, row.cache_write_tokens) == (1000, 200, 50, 10)
        assert row.latency_ms >= 0

    def test_logs_a_failed_call_and_still_raises(self, app):
        with patch.dict(sys.modules, {'anthropic': _anthropic(error=RuntimeError('API down'))}):
            with pytest.raises(RuntimeError):
                create_message('generate', None, 'k', model='m', messages=[])
        row = AiCallLog.query.one()
        assert (row.ok, row.error, row.input_tokens) == (False, 'RuntimeError: API down', None)

    def test_a_long_error_is_cut_to_fit(self, app):
        with patch.dict(sys.modules, {'anthropic': _anthropic(error=RuntimeError('x' * 500))}):
            with pytest.raises(RuntimeError):
                create_message('generate', None, 'k', model='m', messages=[])
        assert len(AiCallLog.query.one().error) == 200

    def test_usage_that_isnt_a_number_is_stored_as_unknown(self, app):
        # A bare MagicMock usage, as older tests' mocks return
        with patch.dict(sys.modules, {'anthropic': _anthropic(usage=MagicMock())}):
            create_message('insights', None, 'k', model='m', messages=[])
        row = AiCallLog.query.one()
        assert (row.input_tokens, row.output_tokens) == (None, None)

    def test_a_failed_log_write_never_fails_the_call(self, app):
        message_module = _anthropic(text='hello')
        with patch.dict(sys.modules, {'anthropic': message_module}), \
                patch('utils.ai_client.AiCallLog', side_effect=Exception('table missing')):
            msg = create_message('insights', None, 'k', model='m', messages=[])
        assert msg.content[0].text == 'hello'


class TestCostEstimate:

    def test_haiku_list_price(self):
        assert estimate_cost('claude-haiku-4-5-20251001', 1_000_000, 0) == pytest.approx(1.0)
        assert estimate_cost('claude-haiku-4-5-20251001', 0, 1_000_000) == pytest.approx(5.0)

    def test_cache_reads_and_writes(self):
        assert estimate_cost('claude-haiku-4-5', 0, 0, cache_read_tokens=1_000_000) == pytest.approx(0.1)
        assert estimate_cost('claude-haiku-4-5', 0, 0, cache_write_tokens=1_000_000) == pytest.approx(1.25)

    def test_unknown_model_or_missing_tokens_cost_nothing(self):
        assert estimate_cost('some-other-model', 1000, 1000) == 0.0
        assert estimate_cost('claude-haiku-4-5', None, None) == 0.0


class TestEndpointsLogTheirCalls:

    @pytest.mark.parametrize('path, body, endpoint', [
        ('/api/ai/insights', {}, 'insights'),
        ('/api/ai/weekly-review', {}, 'weekly-review'),
        ('/api/ai/generate', {'generate_type': 'template', 'goal': 'general', 'days_per_week': 3, 'experience': 'beginner'}, 'generate'),
    ])
    def test_each_endpoint_writes_a_row_for_its_user(self, app, client, auth_token, registered_user,
                                                     path, body, endpoint):
        text = json.dumps({'insights': [], 'name': 'X', 'exercises': []})
        with patch.dict(sys.modules, {'anthropic': _anthropic(text=text)}), \
                patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
            res = client.post(path, json=body, headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 200, res.get_json()
        row = AiCallLog.query.one()
        assert (row.endpoint, row.user_id, row.ok) == (endpoint, registered_user['user']['id'], True)
        assert row.input_tokens == 1200

    def test_a_failed_insights_call_is_logged_as_failed(self, app, client, auth_token):
        with patch.dict(sys.modules, {'anthropic': _anthropic(error=Exception('timeout'))}), \
                patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'fake-key'}):
            res = client.post('/api/ai/insights', json={}, headers={'Authorization': f'Bearer {auth_token}'})
        assert res.status_code == 500
        assert AiCallLog.query.one().ok is False


# ── Stats ─────────────────────────────────────────────────────

def _vote(helpful, insight_type='volume', reason=None, title='T', when=None):
    return SimpleNamespace(helpful=helpful, insight_type=insight_type, reason=reason, title=title,
                           created_at=when or datetime(2026, 10, 14, 12))


def _call(endpoint='insights', ok=True, latency=1000, when=None, user_id=1, tokens=(1000, 100)):
    return SimpleNamespace(endpoint=endpoint, ok=ok, latency_ms=latency, user_id=user_id,
                           created_at=when or datetime(2026, 10, 17, 9), model='claude-haiku-4-5-20251001',
                           input_tokens=tokens[0], output_tokens=tokens[1],
                           cache_read_tokens=None, cache_write_tokens=None)


class TestVoteStats:

    def test_by_type_rates_and_reasons(self):
        rows = [_vote(True), _vote(False, reason='wrong'), _vote(False, reason='known'), _vote(False),
                _vote(True, insight_type='deload')]
        by_type = admin_stats.votes_by_type(rows)
        assert [g['type'] for g in by_type] == ['volume', 'deload']
        volume = by_type[0]
        assert (volume['votes'], volume['helpful'], volume['rate']) == (4, 1, 25)
        assert volume['reasons'] == {'known': 1, 'irrelevant': 0, 'wrong': 1, 'vague': 0}
        assert volume['no_reason'] == 1

    def test_a_vote_with_no_type_is_grouped_as_untyped(self):
        assert admin_stats.votes_by_type([_vote(True, insight_type=None)])[0]['type'] == 'untyped'

    def test_weekly_has_every_week_oldest_first_and_marks_prompt_changes(self):
        today = date(2026, 10, 18)  # a Sunday
        rows = [_vote(True, when=datetime(2026, 10, 13, 8)), _vote(False, when=datetime(2026, 10, 18, 20)),
                _vote(True, when=datetime(2026, 7, 1))]  # older than 12 weeks
        weekly = admin_stats.weekly_helpful_rate(rows, today)
        assert len(weekly) == 12
        assert weekly[-1]['week'] == date(2026, 10, 12)
        assert (weekly[-1]['votes'], weekly[-1]['rate']) == (2, 50)
        assert sum(w['votes'] for w in weekly) == 2
        assert len(weekly[-1]['changes']) == 2
        assert weekly[-2]['changes'] == [] and weekly[-2]['rate'] is None

    def test_most_voted_down_needs_two_not_helpful(self):
        rows = [_vote(False, title='A'), _vote(False, title='A'), _vote(True, title='A'),
                _vote(False, title='B'), _vote(False, title='C'), _vote(False, title='C'), _vote(False, title='C')]
        out = admin_stats.most_voted_down(rows)
        assert [(g['title'], g['not_helpful'], g['helpful']) for g in out] == [('C', 3, 0), ('A', 2, 1)]


class TestAiStats:

    def test_by_endpoint_failure_rate_and_latency_percentiles(self):
        rows = [_call(latency=ms) for ms in (100, 200, 300, 400, 5000)] + [_call(ok=False, latency=9000)]
        e = admin_stats.ai_by_endpoint(rows)[0]
        assert (e['calls'], e['failures'], e['failure_rate']) == (6, 1, 17)
        # Failed calls don't count toward latency
        assert (e['p50'], e['p95']) == (300, 5000)
        assert e['cost'] == pytest.approx(6 * estimate_cost('claude-haiku-4-5', 1000, 100))

    def test_by_day_fills_empty_days_newest_first(self):
        today = date(2026, 10, 18)
        rows = [_call(when=datetime(2026, 10, 18, 1)), _call(when=datetime(2026, 10, 16, 1), endpoint='generate'),
                _call(when=datetime(2026, 9, 1))]
        days = admin_stats.ai_by_day(rows, today, days=3)
        assert [d['day'] for d in days] == [date(2026, 10, 18), date(2026, 10, 17), date(2026, 10, 16)]
        assert [d['calls'] for d in days] == [1, 0, 1]
        assert days[2]['by_endpoint'] == {'generate': 1}

    def test_top_users_skip_deleted_accounts(self):
        rows = [_call(user_id=1), _call(user_id=2), _call(user_id=2), _call(user_id=None)]
        top = admin_stats.ai_top_users(rows, {1: 'a', 2: 'b'})
        assert [(u['user_id'], u['username'], u['calls']) for u in top] == [(2, 'b', 2), (1, 'a', 1)]


# ── Pages ─────────────────────────────────────────────────────

@pytest.fixture
def admin_pw(monkeypatch):
    monkeypatch.setenv('ADMIN_PASSWORD', 'pw')


def _add_vote(user_id, helpful, title, body='Body.', reason=None, insight_type='volume', when=None):
    db.session.add(InsightFeedback(user_id=user_id, insight_type=insight_type, title=title, body=body,
                                   helpful=helpful, reason=reason, created_at=when or datetime.now()))
    db.session.commit()


class TestCoachPage:

    def test_empty(self, client, admin_pw):
        res = client.get('/admin/coach', headers=_basic_auth())
        assert res.status_code == 200
        html = res.get_data(as_text=True)
        assert 'No votes in this range' in html and 'No "Looks wrong" votes yet' in html

    def test_shows_types_and_the_looks_wrong_list(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        _add_vote(uid, True, 'Bench is climbing')
        _add_vote(uid, False, 'Squat stalled', body='Your squat has not moved in 6 weeks.', reason='wrong')
        html = client.get('/admin/coach', headers=_basic_auth()).get_data(as_text=True)
        assert 'volume' in html and '50%' in html
        assert 'Your squat has not moved in 6 weeks.' in html
        assert 'testuser' in html

    def test_range_filters_old_votes_but_the_looks_wrong_list_is_all_time(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        _add_vote(uid, False, 'Old wrong one', reason='wrong', when=datetime.now() - timedelta(days=60))
        html = client.get('/admin/coach?range=30', headers=_basic_auth()).get_data(as_text=True)
        assert 'No votes in this range' in html
        assert 'Old wrong one' in html
        html = client.get('/admin/coach?range=90', headers=_basic_auth()).get_data(as_text=True)
        assert 'No votes in this range' not in html

    def test_an_unknown_range_falls_back_to_90_days(self, client, admin_pw):
        res = client.get('/admin/coach?range=forever', headers=_basic_auth())
        assert res.status_code == 200
        assert 'href="?range=90" class="active"' in res.get_data(as_text=True)

    def test_insight_text_is_escaped(self, client, admin_pw, registered_user):
        _add_vote(registered_user['user']['id'], False, '<img src=x onerror=alert(1)>', reason='wrong')
        html = client.get('/admin/coach', headers=_basic_auth()).get_data(as_text=True)
        assert '<img src=x onerror=alert(1)>' not in html


    def test_a_quote_in_stored_text_cannot_break_out_of_a_tooltip(self, client, admin_pw, registered_user):
        # Tooltip JSON sits in a single-quoted attribute; tojson must escape ' and <
        _add_vote(registered_user['user']['id'], True, 'T', insight_type="x' onmouseover='alert(1)")
        _add_vote(registered_user['user']['id'], False, 'T', insight_type='<b>y</b>', reason='vague')
        html = client.get('/admin/coach', headers=_basic_auth()).get_data(as_text=True)
        assert "' onmouseover='" not in html
        assert '<b>y</b>' not in html

    def test_charts_render_with_votes(self, client, admin_pw, registered_user):
        _add_vote(registered_user['user']['id'], True, 'T')
        html = client.get('/admin/coach', headers=_basic_auth()).get_data(as_text=True)
        assert 'aria-label="Helpful rate by week"' in html


class TestAiPage:

    def test_empty(self, client, admin_pw):
        res = client.get('/admin/ai', headers=_basic_auth())
        assert res.status_code == 200
        assert 'Nothing logged yet' in res.get_data(as_text=True)

    def test_shows_totals_endpoints_users_and_failures(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        for ok in (True, True, False):
            db.session.add(AiCallLog(endpoint='insights', user_id=uid, model='claude-haiku-4-5-20251001',
                                     input_tokens=2000, output_tokens=500, latency_ms=1500, ok=ok,
                                     error=None if ok else 'APITimeoutError: timed out'))
        db.session.commit()
        html = client.get('/admin/ai', headers=_basic_auth()).get_data(as_text=True)
        assert 'APITimeoutError: timed out' in html
        assert 'testuser' in html
        assert '1 (33%)' in html
        assert '6,000' in html  # input tokens across the three calls

    def test_a_deleted_users_calls_still_count(self, client, admin_pw):
        db.session.add(AiCallLog(endpoint='generate', user_id=None, model='m', latency_ms=10, ok=True))
        db.session.commit()
        html = client.get('/admin/ai', headers=_basic_auth()).get_data(as_text=True)
        assert 'generate' in html


class TestUserDeletion:

    def test_a_deleted_users_calls_are_kept(self):
        # The suite's SQLite runs without foreign keys, so check the declaration Postgres enforces
        fk = next(iter(AiCallLog.__table__.c.user_id.foreign_keys))
        assert (fk.column.table.name, fk.ondelete) == ('user', 'SET NULL')
