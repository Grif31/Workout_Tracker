"""
The server runs on UTC, so "this week" and "today" must come from the app's
local date (X-Local-Date), not the server clock, or they roll over on Sunday
afternoon/evening in the Americas.

The server clock is pinned to Monday 2026-09-21 01:00 UTC, which is still
Sunday 2026-09-20 in every US timezone.
"""
from datetime import date, datetime, timezone

import pytest

import utils.local_date as local_date_module
from utils.local_date import user_today

UTC_NOW = datetime(2026, 9, 21, 1, 0, tzinfo=timezone.utc)
SUNDAY = date(2026, 9, 20)
MONDAY = date(2026, 9, 21)


class _FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return UTC_NOW if tz else UTC_NOW.replace(tzinfo=None)


class _FixedDate(date):
    @classmethod
    def today(cls):
        return MONDAY


@pytest.fixture(autouse=True)
def server_clock_is_monday_utc(monkeypatch):
    monkeypatch.setattr(local_date_module, 'datetime', _FixedDateTime)
    monkeypatch.setattr(local_date_module, 'date', _FixedDate)


def hdrs(token, local=None):
    h = {'Authorization': f'Bearer {token}'}
    if local:
        h['X-Local-Date'] = local.isoformat()
    return h


class TestUserToday:

    def _today(self, app, path='/', headers=None):
        with app.test_request_context(path, headers=headers or {}):
            return user_today()

    def test_uses_the_local_date_header(self, app):
        assert self._today(app, headers={'X-Local-Date': '2026-09-20'}) == SUNDAY

    def test_accepts_a_day_ahead_of_utc(self, app):
        # UTC+13/+14 (e.g. Samoa, Kiribati) are already on Tuesday.
        assert self._today(app, headers={'X-Local-Date': '2026-09-22'}) == date(2026, 9, 22)

    @pytest.mark.parametrize('claimed', ['2026-09-19', '2026-09-23', '2026-06-01'])
    def test_rejects_dates_no_timezone_could_produce(self, app, claimed):
        # An old date would otherwise let a client revive a lapsed streak.
        assert self._today(app, headers={'X-Local-Date': claimed}) == MONDAY

    @pytest.mark.parametrize('claimed', ['', 'not-a-date', '2026-13-01', '20/09/2026'])
    def test_falls_back_to_server_date_on_bad_input(self, app, claimed):
        assert self._today(app, headers={'X-Local-Date': claimed}) == MONDAY

    def test_still_accepts_the_older_query_parameter(self, app):
        assert self._today(app, path='/?local_date=2026-09-20') == SUNDAY

    def test_header_wins_over_query_parameter(self, app):
        assert self._today(app, path='/?local_date=2026-09-22', headers={'X-Local-Date': '2026-09-20'}) == SUNDAY

    def test_server_date_without_a_request(self):
        assert user_today() == MONDAY


def log_workout(client, token, day):
    res = client.post('/api/workouts', json={
        'workoutName': 'Session',
        'date': day.isoformat(),
        'exercises': [{'name': 'Squat', 'sets': [{'reps': 5, 'weight': 225}]}],
    }, headers=hdrs(token))
    assert res.status_code == 201, res.get_json()


class TestWeekBoundaryEndpoints:
    """A US user who trained Sunday evening checks the app minutes later."""

    def test_dashboard_this_week_uses_local_date(self, client, auth_token):
        log_workout(client, auth_token, SUNDAY)

        local = client.get('/api/stats/dashboard', headers=hdrs(auth_token, SUNDAY)).get_json()
        assert local['this_week_dates'] == ['2026-09-20']
        assert local['weekly'][-1]['count'] == 1

        # Old app builds without the header keep the server-date behaviour.
        server = client.get('/api/stats/dashboard', headers=hdrs(auth_token)).get_json()
        assert server['this_week_dates'] == []

    def test_profile_weekly_count_uses_local_date(self, client, auth_token):
        log_workout(client, auth_token, SUNDAY)

        res = client.get('/api/stats/profile?weekly_goal=1', headers=hdrs(auth_token, SUNDAY)).get_json()
        assert res['this_week_count'] == 1
        assert res['current_streak'] == 1

    def test_weekly_summary_does_not_close_the_week_early(self, client, auth_token):
        # The summary covers the last completed week. Sunday evening local,
        # that is still Sep 7-13; the week containing today isn't over yet.
        log_workout(client, auth_token, SUNDAY)

        local = client.get('/api/stats/weekly-summary', headers=hdrs(auth_token, SUNDAY)).get_json()
        assert local['week_start'] == '2026-09-07'
        assert local['workouts'] == 0

        # By UTC it's Monday, which summarized the unfinished week.
        server = client.get('/api/stats/weekly-summary', headers=hdrs(auth_token)).get_json()
        assert server['week_start'] == '2026-09-14'



class TestAgeUsesLocalDate:
    """Age feeds the strength/endurance percentile scaling. On the UTC server,
    an evening in the Americas is already tomorrow; age must follow the
    user's own date, or a birthday counts a day early."""

    def test_age_rolls_over_on_the_users_birthday_not_the_servers(self, app, monkeypatch):
        from datetime import date, datetime, timezone
        from types import SimpleNamespace
        import utils.local_date as ld
        from routes.strength_score_routes import _user_age

        # 03:00 UTC on the 22nd is still the evening of the 21st in the US
        class _Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 9, 22, 3, 0, tzinfo=timezone.utc)

        class _ServerDate(date):
            @classmethod
            def today(cls):
                return date(2026, 9, 22)

        monkeypatch.setattr(ld, 'datetime', _Clock)
        monkeypatch.setattr(ld, 'date', _ServerDate)
        user = SimpleNamespace(birth_date=date(2000, 9, 22))

        with app.test_request_context(headers={'X-Local-Date': '2026-09-21'}):
            assert _user_age(user) == 25
        with app.test_request_context(headers={'X-Local-Date': '2026-09-22'}):
            assert _user_age(user) == 26
