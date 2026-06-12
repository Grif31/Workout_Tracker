"""
Tests for the re-engagement push job (app._send_reengagement_pushes)
and Expo push chunking (utils.push_service.send_push).
"""
from datetime import datetime, timedelta

import pytest

from app import _send_reengagement_pushes
from models import db, User, Workout, DeviceToken


def _make_user(username, last_workout_days_ago=None, token=None,
               last_reengagement_days_ago=None):
    user = User(email=f'{username}@example.com', username=username, password='x')
    db.session.add(user)
    db.session.flush()
    if last_workout_days_ago is not None:
        db.session.add(Workout(
            user_id=user.id, name='W',
            date=datetime.now() - timedelta(days=last_workout_days_ago),
        ))
    if token:
        device = DeviceToken(user_id=user.id, token=token, platform='ios')
        if last_reengagement_days_ago is not None:
            device.last_reengagement_at = datetime.now() - timedelta(days=last_reengagement_days_ago)
        db.session.add(device)
    db.session.commit()
    return user


@pytest.fixture
def sent(monkeypatch):
    """Capture tokens passed to send_push instead of hitting Expo."""
    calls = []
    monkeypatch.setattr(
        'utils.push_service.send_push',
        lambda tokens, title, body, data=None: calls.append(list(tokens)),
    )
    return calls


class TestReengagementTargeting:

    def test_lapsed_user_gets_push(self, app, sent):
        _make_user('lapsed', last_workout_days_ago=15, token='tok-lapsed')
        _send_reengagement_pushes(app)
        assert sent == [['tok-lapsed']]

    def test_active_user_not_pushed(self, app, sent):
        _make_user('active', last_workout_days_ago=1, token='tok-active')
        _send_reengagement_pushes(app)
        assert sent == []

    def test_user_with_no_workouts_not_pushed(self, app, sent):
        _make_user('newbie', last_workout_days_ago=None, token='tok-newbie')
        _send_reengagement_pushes(app)
        assert sent == []

    def test_mixed_users_only_lapsed_pushed(self, app, sent):
        _make_user('lapsed2', last_workout_days_ago=30, token='tok-lapsed2')
        _make_user('active2', last_workout_days_ago=2, token='tok-active2')
        _make_user('newbie2', token='tok-newbie2')
        _send_reengagement_pushes(app)
        assert sent == [['tok-lapsed2']]

    def test_uses_most_recent_workout(self, app, sent):
        # Old workout 30 days ago but a recent one yesterday — not lapsed
        user = _make_user('comeback', last_workout_days_ago=30, token='tok-comeback')
        db.session.add(Workout(user_id=user.id, name='W2',
                               date=datetime.now() - timedelta(days=1)))
        db.session.commit()
        _send_reengagement_pushes(app)
        assert sent == []


class TestReengagementThrottle:

    def test_second_run_same_day_does_not_push_again(self, app, sent):
        _make_user('lapsed3', last_workout_days_ago=15, token='tok-lapsed3')
        _send_reengagement_pushes(app)
        _send_reengagement_pushes(app)
        assert sent == [['tok-lapsed3']]

    def test_push_recorded_on_device(self, app, sent):
        user = _make_user('lapsed4', last_workout_days_ago=15, token='tok-lapsed4')
        _send_reengagement_pushes(app)
        device = DeviceToken.query.filter_by(user_id=user.id).first()
        assert device.last_reengagement_at is not None

    def test_pushed_again_after_throttle_window(self, app, sent):
        _make_user('lapsed5', last_workout_days_ago=20, token='tok-lapsed5',
                   last_reengagement_days_ago=8)
        _send_reengagement_pushes(app)
        assert sent == [['tok-lapsed5']]

    def test_not_pushed_within_throttle_window(self, app, sent):
        _make_user('lapsed6', last_workout_days_ago=20, token='tok-lapsed6',
                   last_reengagement_days_ago=3)
        _send_reengagement_pushes(app)
        assert sent == []


class TestPushChunking:

    def test_messages_split_into_batches_of_100(self, monkeypatch):
        from utils import push_service
        batches = []
        monkeypatch.setattr(
            push_service.requests, 'post',
            lambda url, json, timeout: batches.append(len(json)),
        )
        push_service.send_push([f'tok-{i}' for i in range(250)], 'T', 'B')
        assert batches == [100, 100, 50]

    def test_no_request_for_empty_token_list(self, monkeypatch):
        from utils import push_service
        batches = []
        monkeypatch.setattr(
            push_service.requests, 'post',
            lambda url, json, timeout: batches.append(len(json)),
        )
        push_service.send_push([], 'T', 'B')
        assert batches == []
