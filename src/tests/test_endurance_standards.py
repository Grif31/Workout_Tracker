"""
Tests for utils/endurance_standards.py:
  PACE_STANDARDS table integrity, compute_pace_percentile (inverted-axis
  interpolation), endurance_age_factor, and compute_endurance_overall
  (best-within-tier 70/30 aggregation). Pure unit tests, no app context.
"""
import pytest
from utils.endurance_standards import (
    PACE_STANDARDS, CARDIO_DISTANCE_MILESTONES,
    CORE_DISTANCES, SPEED_DISTANCES,
    compute_pace_percentile, compute_endurance_overall,
    endurance_age_factor, _ENDURANCE_AGE_ANCHORS,
)

MILESTONE_KEYS = [d for d, _ in CARDIO_DISTANCE_MILESTONES]
PCT_BREAKPOINTS = [10, 25, 50, 75, 90, 95, 99]


class TestPaceStandardsTable:

    def test_every_milestone_distance_has_standards_for_both_genders(self):
        for gender in ('male', 'female'):
            assert set(PACE_STANDARDS[gender].keys()) == set(MILESTONE_KEYS)

    def test_every_row_has_all_percentile_breakpoints(self):
        for gender in ('male', 'female'):
            for dist, row in PACE_STANDARDS[gender].items():
                assert set(row.keys()) == set(PCT_BREAKPOINTS), (gender, dist)

    def test_pace_strictly_decreases_as_percentile_rises(self):
        # Higher percentile = faster runner = lower pace, within every row
        for gender in ('male', 'female'):
            for dist, row in PACE_STANDARDS[gender].items():
                paces = [row[p] for p in PCT_BREAKPOINTS]
                for prev, curr in zip(paces, paces[1:]):
                    assert curr < prev, (gender, dist)

    def test_pace_rises_with_distance_at_every_percentile(self):
        # Nobody's marathon pace beats their 5K pace at the same percentile —
        # each column must be monotonically slower as distance grows
        for gender in ('male', 'female'):
            for pct in PCT_BREAKPOINTS:
                paces = [PACE_STANDARDS[gender][d][pct] for d in MILESTONE_KEYS]
                for prev, curr in zip(paces, paces[1:]):
                    assert curr > prev, (gender, pct)

    def test_female_breakpoints_slower_than_male_everywhere(self):
        for dist in MILESTONE_KEYS:
            for pct in PCT_BREAKPOINTS:
                assert PACE_STANDARDS['female'][dist][pct] > PACE_STANDARDS['male'][dist][pct]

    def test_tiers_partition_the_milestones(self):
        assert CORE_DISTANCES | SPEED_DISTANCES == set(MILESTONE_KEYS)
        assert not (CORE_DISTANCES & SPEED_DISTANCES)


class TestComputePacePercentile:

    def test_interpolates_between_breakpoints(self):
        # Male 5K: 50th = 5.6, 75th = 4.8; pace 5.0 sits 75% of the way down
        pct = compute_pace_percentile(5.0, 'male', 5.0)
        assert pct == pytest.approx(68.75)

    def test_exact_breakpoint_returns_its_percentile(self):
        # Male 800m 50th breakpoint is exactly 5.0 min/km
        assert compute_pace_percentile(0.8, 'male', 5.0) == pytest.approx(50.0)

    def test_faster_than_99th_clamps(self):
        assert compute_pace_percentile(5.0, 'male', 2.0) == pytest.approx(99.0)

    def test_slower_than_10th_extrapolates_with_floor(self):
        # (8.0 / 30) * 10 = 2.67 — proportional extrapolation below the table
        assert compute_pace_percentile(5.0, 'male', 30.0) == pytest.approx(8.0 / 30 * 10)
        # Absurdly slow still floors at 1.0, never 0
        assert compute_pace_percentile(5.0, 'male', 500.0) == pytest.approx(1.0)

    def test_unknown_gender_or_distance_returns_none(self):
        assert compute_pace_percentile(5.0, 'other', 5.0) is None
        assert compute_pace_percentile(3.0, 'male', 5.0) is None

    def test_nonpositive_pace_returns_none(self):
        assert compute_pace_percentile(5.0, 'male', 0) is None
        assert compute_pace_percentile(5.0, 'male', -1) is None

    def test_same_pace_ranks_higher_at_longer_distance(self):
        # Holding 5:00/km for a half marathon is a stronger performance than
        # holding it for 1K — the standards must reflect that
        assert compute_pace_percentile(21.0975, 'male', 5.0) > compute_pace_percentile(1.0, 'male', 5.0)


class TestEnduranceAgeFactor:

    def test_matches_anchor_values_exactly(self):
        for age, expected in _ENDURANCE_AGE_ANCHORS:
            assert endurance_age_factor(age) == pytest.approx(expected)

    def test_clamped_below_and_above_anchor_range(self):
        assert endurance_age_factor(18) == 1.00
        assert endurance_age_factor(90) == _ENDURANCE_AGE_ANCHORS[-1][1]

    def test_monotonically_non_decreasing(self):
        values = [endurance_age_factor(age) for age in range(15, 100)]
        for prev, curr in zip(values, values[1:]):
            assert curr >= prev

    def test_interpolates_between_anchors(self):
        # Midpoint of (25, 1.00) and (35, 1.02)
        assert endurance_age_factor(30) == pytest.approx(1.01)


class TestComputeEnduranceOverall:

    def test_empty_returns_none(self):
        assert compute_endurance_overall({}) is None

    def test_core_only_renormalizes_to_full_weight(self):
        assert compute_endurance_overall({5.0: 60.0, 10.0: 40.0}) == pytest.approx(60.0)

    def test_speed_only_renormalizes_to_full_weight(self):
        # The sub-5K-only runner case: speed tier is all they have
        assert compute_endurance_overall({0.4: 30.0, 1.0: 55.0}) == pytest.approx(55.0)

    def test_best_within_tier_not_mean(self):
        # 5K=80 and 10K=40 must aggregate as 80, not 60 — every stored
        # per-distance time derives from the same runs, a mean double-counts
        # the extrapolation penalty
        result = compute_endurance_overall({5.0: 80.0, 10.0: 40.0, 0.4: 50.0})
        assert result == pytest.approx(0.7 * 80.0 + 0.3 * 50.0)

    def test_seventy_thirty_blend_with_both_tiers(self):
        result = compute_endurance_overall({42.195: 90.0, 1.60934: 60.0})
        assert result == pytest.approx(0.7 * 90.0 + 0.3 * 60.0)
