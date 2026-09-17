"""
Tests for utils/strength_standards.py:
  age_scaling_factor — piecewise-linear age adjustment applied to strength-score
  bodyweight ratios (see routes/strength_score_routes.py strength_score()).
"""
import pytest
from utils.strength_standards import (
    age_scaling_factor, _AGE_FACTOR_ANCHORS,
    workout_training_load, compute_training_load_score,
    CARDIO_MINUTES_PER_LOAD, MAX_LOAD_PER_WORKOUT,
)


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


class TestWorkoutTrainingLoad:

    def test_working_sets_count_one_each(self):
        assert workout_training_load(18, 0) == 18

    def test_cardio_converts_at_one_per_three_minutes(self):
        assert CARDIO_MINUTES_PER_LOAD == 3.0
        assert workout_training_load(0, 30) == pytest.approx(10)
        assert workout_training_load(0, 60) == pytest.approx(20)

    def test_mixed_session_adds_both(self):
        # 12 sets of lifting plus a 15-minute finisher
        assert workout_training_load(12, 15) == pytest.approx(17)

    def test_capped_per_workout(self):
        assert MAX_LOAD_PER_WORKOUT == 40.0
        assert workout_training_load(100, 0) == 40
        assert workout_training_load(0, 300) == 40
        assert workout_training_load(30, 60) == 40

    def test_missing_values_count_as_zero(self):
        assert workout_training_load(None, None) == 0


class TestComputeTrainingLoadScore:

    @pytest.mark.parametrize('load, points', [
        (0, 0), (15, 20), (30, 40), (50, 65), (70, 80), (90, 90), (120, 100),
    ])
    def test_hits_each_anchor_exactly(self, load, points):
        assert compute_training_load_score(load) == pytest.approx(points)

    def test_interpolates_between_anchors(self):
        # Halfway from (30, 40) to (50, 65)
        assert compute_training_load_score(40) == pytest.approx(52.5)

    def test_clamps_at_both_ends(self):
        assert compute_training_load_score(-5) == 0
        assert compute_training_load_score(500) == 100

    def test_monotonically_non_decreasing(self):
        values = [compute_training_load_score(x) for x in range(0, 150)]
        for prev, curr in zip(values, values[1:]):
            assert curr >= prev

    def test_three_full_sessions_score_near_the_old_three_workout_mark(self):
        # 3 x 18 working sets = 54/week. The old count-based curve gave three
        # workouts a week 65, so typical users should barely move.
        assert compute_training_load_score(54) == pytest.approx(68, abs=1)
