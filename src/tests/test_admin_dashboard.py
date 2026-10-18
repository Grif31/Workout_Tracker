"""The admin dashboard at /admin/: its attention rules, each tried on the data
that should trip it and on data just under the line, and the page itself."""
import base64
import os
from datetime import date, datetime, timedelta

import pytest

from models import db, AdminAuditLog, AdminState, AiCallLog, ExerciseTemplate, InsightFeedback, User, Workout
from utils import admin_dashboard, exercisedb, system_status
from utils.admin_charts import sparkline


def _auth():
    return {'Authorization': 'Basic ' + base64.b64encode(b'admin:pw').decode()}


@pytest.fixture
def admin_pw(monkeypatch):
    monkeypatch.setenv('ADMIN_PASSWORD', 'pw')


@pytest.fixture(autouse=True)
def no_known_quota(monkeypatch):
    monkeypatch.setitem(exercisedb.quota, 'remaining', None)


@pytest.fixture(autouse=True)
def configured_server(monkeypatch):
    # As production is: every required env var set, so only the rule under test fires
    for name, _ in system_status.ENV_VARS['required']:
        monkeypatch.setenv(name, os.environ.get(name) or 'set')


class TestAttentionRules:

    def test_ai_quiet_with_no_failures(self):
        assert admin_dashboard.ai_failure_alert(0, 0) is None
        assert admin_dashboard.ai_failure_alert(50, 0) is None

    def test_ai_any_failure_counts_while_volume_is_low(self):
        alert = admin_dashboard.ai_failure_alert(10, 1)
        assert alert['level'] == 'warn'
        assert alert['text'] == '1 of 10 AI calls failed in the last 24 hours'

    def test_ai_at_volume_only_above_five_percent(self):
        assert admin_dashboard.ai_failure_alert(100, 5) is None
        assert admin_dashboard.ai_failure_alert(100, 6)['level'] == 'warn'
        assert admin_dashboard.ai_failure_alert(100, 20)['level'] == 'bad'

    def test_looks_wrong(self):
        assert admin_dashboard.looks_wrong_alert(0) is None
        assert '1 new "Looks wrong" vote since' in admin_dashboard.looks_wrong_alert(1)['text']
        assert '3 new "Looks wrong" votes since' in admin_dashboard.looks_wrong_alert(3)['text']

    def test_quota(self):
        assert admin_dashboard.quota_alert(None) is None
        assert admin_dashboard.quota_alert(100) is None
        assert admin_dashboard.quota_alert(99)['level'] == 'warn'
        assert admin_dashboard.quota_alert(19)['level'] == 'bad'


class TestFigures:

    def test_daily_counts_oldest_first_and_window_bound(self):
        today = date(2026, 10, 18)
        counts = admin_dashboard.daily_counts(
            [date(2026, 10, 18), date(2026, 10, 18), date(2026, 10, 12), date(2026, 9, 1)], today, days=7)
        assert counts == [1, 0, 0, 0, 0, 0, 2]

    def test_daily_distinct(self):
        today = date(2026, 10, 18)
        assert admin_dashboard.daily_distinct([(today, 1), (today, 1), (today, 2)], today, days=1) == [2]

    def test_change(self):
        assert admin_dashboard.change(5, 3) == {'diff': 2, 'direction': 'up'}
        assert admin_dashboard.change(3, 5)['direction'] == 'down'
        assert admin_dashboard.change(4, 4)['direction'] == 'flat'
        assert admin_dashboard.change(4, None) is None

    def test_sparkline_ends_on_the_last_value(self):
        s = sparkline([0, 2, 4])
        assert s['d'].startswith('M') and s['d'].count('L') == 2
        assert s['last']['y'] == pytest.approx(3)  # the top value touches the top padding
        assert sparkline([0, 0])['last']['y'] == pytest.approx(29)  # all-zero sits on the baseline
        assert sparkline([]) is None


class TestDashboardPage:

    def test_fresh_database_is_all_clear(self, client, admin_pw):
        res = client.get('/admin/', headers=_auth())
        assert res.status_code == 200
        html = res.get_data(as_text=True)
        assert 'All clear' in html and 'Needs attention' not in html
        assert 'Same as last week' in html  # 0 workouts against 0

    def test_counts_this_week_against_last(self, client, admin_pw, registered_user):
        uid = registered_user['user']['id']
        now = datetime.now()
        for days_ago in (0, 1, 2, 9):
            db.session.add(Workout(user_id=uid, name='W', date=now - timedelta(days=days_ago)))
        db.session.commit()
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert '▲ 2 vs last week' in html  # 3 this week against 1

    def test_a_new_looks_wrong_vote_needs_attention_until_the_coach_page_is_opened(
            self, client, admin_pw, registered_user):
        db.session.add(InsightFeedback(user_id=registered_user['user']['id'], insight_type='volume',
                                       title='Squat stalled', body='B', helpful=False, reason='wrong'))
        db.session.commit()
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert '1 new &#34;Looks wrong&#34; vote since' in html  # autoescaped quotes
        assert client.get('/admin/coach', headers=_auth()).status_code == 200
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert 'All clear' in html
        assert 'Squat stalled' in html  # still shown as the newest one

    def test_opening_the_coach_page_records_the_visit(self, client, admin_pw):
        client.get('/admin/coach', headers=_auth())
        assert db.session.get(AdminState, 'coach_last_opened') is not None

    def test_ai_failures_and_low_quota_show(self, client, admin_pw, monkeypatch):
        monkeypatch.setitem(exercisedb.quota, 'remaining', 42)
        for ok in (True, False, False):
            db.session.add(AiCallLog(endpoint='insights', model='m', latency_ms=10, ok=ok))
        db.session.commit()
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert '2 of 3 AI calls failed in the last 24 hours' in html
        assert '42 RapidAPI calls left this month' in html
        assert 'status bad' in html

    def test_counts_only_library_exercises_without_an_image(self, client, admin_pw, registered_user):
        db.session.add_all([
            ExerciseTemplate(name='A', equipment='Barbell'),
            ExerciseTemplate(name='B', equipment='Barbell', image_url='/static/x.gif'),
            ExerciseTemplate(name='C', equipment='Barbell', image_url=''),
            ExerciseTemplate(name='Mine', equipment='Barbell', user_id=registered_user['user']['id']),
        ])
        db.session.commit()
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert '2<span class="unit">without an image</span>' in html

    def test_recent_activity_lists_audit_rows(self, client, admin_pw):
        db.session.add(AdminAuditLog(action='exercise.image.set', target_type='exercise', target_id=7))
        db.session.commit()
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert 'exercise.image.set' in html and '#7' in html

    def test_premium_count(self, client, admin_pw, registered_user):
        db.session.get(User, registered_user['user']['id']).is_premium = True
        db.session.commit()
        html = client.get('/admin/', headers=_auth()).get_data(as_text=True)
        assert 'of 1 accounts' in html
