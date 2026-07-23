"""
Tests for utils/strength_standards.py:
  age_scaling_factor — piecewise-linear age adjustment applied to strength-score
  bodyweight ratios (see routes/stats_routes.py strength_score()).
"""
import pytest
from utils.strength_standards import age_scaling_factor, _AGE_FACTOR_ANCHORS


class TestAgeScalingFactor:

    def test_monotonically_non_decreasing_across_age_range(self):
        values = [age_scaling_factor(age) for age in range(15, 100)]
        for prev, curr in zip(values, values[1:]):
            assert curr >= prev

    def test_matches_old_band_values_at_each_anchor_age(self):
        # Anchors sit at each former decade band's midpoint, so the value at
        # exactly that age must be unchanged from the old step function —
        # only the transition BETWEEN anchors should be new.
        for age, expected in _AGE_FACTOR_ANCHORS:
            assert age_scaling_factor(age) == pytest.approx(expected)

    def test_no_discontinuity_at_former_hard_boundaries(self):
        # The old function jumped the FULL band delta instantly at each
        # boundary. The new curve should only cover a small fraction of that
        # delta within a narrow +/-1 year window around it.
        old_full_jumps = {30: 0.03, 40: 0.05, 50: 0.08, 60: 0.10, 70: 0.12}
        for boundary, full_jump in old_full_jumps.items():
            before = age_scaling_factor(boundary - 1)
            after = age_scaling_factor(boundary + 1)
            assert 0 <= (after - before) < full_jump * 0.5

    def test_clamped_below_and_above_the_anchor_range(self):
        assert age_scaling_factor(18) == 1.00
        assert age_scaling_factor(24) == 1.00
        assert age_scaling_factor(75) == 1.38
        assert age_scaling_factor(90) == 1.38

    def test_interpolates_between_anchors(self):
        # Midpoint between the 25→1.00 and 35→1.03 anchors
        assert age_scaling_factor(30) == pytest.approx(1.015, abs=0.001)
