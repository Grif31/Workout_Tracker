"""
Tests for utils/volume.py:
  compute_effective_weight — adds bodyweight for Bodyweight/Weighted equipment
  get_bodyweight_at — historical BodyweightLog lookup at/before a given date
"""
from datetime import datetime, timedelta
from models import db, BodyweightLog
from utils.volume import compute_effective_weight, get_bodyweight_at


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


class TestComputeEffectiveWeight:

    def test_bodyweight_equipment_adds_bodyweight(self):
        assert compute_effective_weight(0, 'Bodyweight', 180.0) == 180.0

    def test_weighted_equipment_adds_bodyweight_to_added_weight(self):
        assert compute_effective_weight(25, 'Weighted', 180.0) == 205.0

    def test_non_bodyweight_equipment_unchanged(self):
        assert compute_effective_weight(135, 'Barbell', 180.0) == 135

    def test_bodyweight_equipment_with_unknown_bodyweight_is_noop(self):
        assert compute_effective_weight(0, 'Bodyweight', None) == 0.0

    def test_unknown_equipment_is_noop_regardless_of_bodyweight(self):
        assert compute_effective_weight(0, None, 180.0) == 0.0

    def test_none_weight_treated_as_zero(self):
        assert compute_effective_weight(None, 'Barbell', 180.0) == 0.0


class TestGetBodyweightAt:

    def test_returns_most_recent_log_on_or_before_target_date(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        hdrs = auth_headers(auth_token)
        client.post('/api/bodyweight', json={'weight': 170, 'date': '2026-01-01'}, headers=hdrs)
        client.post('/api/bodyweight', json={'weight': 175, 'date': '2026-03-01'}, headers=hdrs)
        client.post('/api/bodyweight', json={'weight': 180, 'date': '2026-06-01'}, headers=hdrs)

        assert get_bodyweight_at(user_id, datetime(2026, 4, 1)) == 175.0
        assert get_bodyweight_at(user_id, datetime(2026, 6, 1)) == 180.0
        assert get_bodyweight_at(user_id, datetime(2026, 12, 1)) == 180.0

    def test_falls_back_to_earliest_log_when_target_predates_all_logs(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        hdrs = auth_headers(auth_token)
        client.post('/api/bodyweight', json={'weight': 170, 'date': '2026-06-01'}, headers=hdrs)

        assert get_bodyweight_at(user_id, datetime(2026, 1, 1)) == 170.0

    def test_returns_none_when_user_has_no_logs(self, client, auth_token, registered_user):
        user_id = registered_user['user']['id']
        assert get_bodyweight_at(user_id, datetime(2026, 6, 1)) is None
