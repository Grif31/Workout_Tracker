"""
Tests for utils/volume.py:
  compute_effective_weight — adds bodyweight for Bodyweight/Weighted equipment
  get_bodyweight_at — historical BodyweightLog lookup at/before a given date
  derive_bodyweight_load_factor — name-based bodyweight-fraction heuristic
"""
from datetime import datetime, timedelta
from models import db, BodyweightLog
from utils.volume import (
    compute_effective_weight,
    get_bodyweight_at,
    derive_bodyweight_load_factor,
)


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

    def test_load_factor_scales_added_bodyweight(self):
        # push-up: 10 reps at 60% of a 180 lb bodyweight
        assert compute_effective_weight(0, 'Bodyweight', 180.0, 0.6) == 108.0

    def test_load_factor_applies_on_top_of_added_weight(self):
        assert compute_effective_weight(25, 'Weighted', 180.0, 0.5) == 115.0

    def test_none_load_factor_falls_back_to_full_bodyweight(self):
        assert compute_effective_weight(0, 'Bodyweight', 180.0, None) == 180.0

    def test_load_factor_ignored_for_non_bodyweight_equipment(self):
        assert compute_effective_weight(135, 'Barbell', 180.0, 0.6) == 135


class TestDeriveBodyweightLoadFactor:

    def test_none_for_non_bodyweight_equipment(self):
        assert derive_bodyweight_load_factor('Bench Press', 'Barbell') is None

    def test_full_bodyweight_movements(self):
        assert derive_bodyweight_load_factor('Pull Up', 'Bodyweight') == 1.0
        assert derive_bodyweight_load_factor('Weighted Dips', 'Weighted') == 1.0
        assert derive_bodyweight_load_factor('Standing Calf Raise', 'Bodyweight') == 1.0

    def test_standing_lower_body_movements(self):
        assert derive_bodyweight_load_factor('Bodyweight Squat', 'Bodyweight') == 0.85
        assert derive_bodyweight_load_factor('Walking Lunge', 'Bodyweight') == 0.85

    def test_partial_support_movements(self):
        assert derive_bodyweight_load_factor('Push Up', 'Bodyweight') == 0.6
        assert derive_bodyweight_load_factor('Inverted Row', 'Bodyweight') == 0.6

    def test_light_segment_movements(self):
        assert derive_bodyweight_load_factor('Sit Up', 'Bodyweight') == 0.35
        assert derive_bodyweight_load_factor('Hanging Leg Raise', 'Bodyweight') == 0.35

    def test_negligible_load_movements(self):
        assert derive_bodyweight_load_factor('Clamshell', 'Bodyweight') == 0.0
        assert derive_bodyweight_load_factor('Fire Hydrant', 'Bodyweight') == 0.0

    def test_unrecognized_bodyweight_movement_defaults_to_middle(self):
        assert derive_bodyweight_load_factor('Some Novel Calisthenic', 'Bodyweight') == 0.6


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
