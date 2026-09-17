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
    compute_greek_score, apply_greek_rank_gates, GREEK_WEIGHTS,
    _compute_streak_weeks, compute_consistency_score, compute_dedication_score,
)
from datetime import date, datetime, timedelta
from types import SimpleNamespace


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


class TestComputeGreekScore:

    def test_weights_are_40_30_30(self):
        assert GREEK_WEIGHTS == {'consistency': 0.40, 'dedication': 0.30, 'volume': 0.30}
        assert compute_greek_score(100, 0, 0) == pytest.approx(40)
        assert compute_greek_score(0, 100, 0) == pytest.approx(30)
        assert compute_greek_score(0, 0, 100) == pytest.approx(30)

    def test_maxed_effort_is_100(self):
        assert compute_greek_score(100, 100, 100) == pytest.approx(100)


class TestApplyGreekRankGates:

    def test_ranks_below_titan_are_never_gated(self):
        # 70 is Olympian by score; no performance needed
        rank, gate = apply_greek_rank_gates(70, None)
        assert rank == 'Olympian'
        assert gate == {'rank': 'Titan', 'required_percentile': 50.0, 'met': False}

    def test_titan_score_without_any_performance_holds_at_olympian(self):
        rank, gate = apply_greek_rank_gates(85, None)
        assert rank == 'Olympian'
        assert gate['rank'] == 'Titan' and gate['met'] is False

    def test_titan_gate_boundary(self):
        assert apply_greek_rank_gates(85, 49.9)[0] == 'Olympian'
        rank, gate = apply_greek_rank_gates(85, 50.0)
        assert rank == 'Titan'
        assert gate == {'rank': 'Aretē', 'required_percentile': 80.0, 'met': False}

    def test_arete_score_steps_down_only_as_far_as_needed(self):
        # Clears Titan's gate but not Aretē's, so lands on Titan, not Olympian
        rank, gate = apply_greek_rank_gates(95, 60)
        assert rank == 'Titan'
        assert gate['rank'] == 'Aretē' and gate['met'] is False

    def test_arete_with_elite_performance(self):
        rank, gate = apply_greek_rank_gates(95, 80)
        assert rank == 'Aretē'
        assert gate is None

    def test_met_flag_reports_an_unlocked_gate_the_score_has_not_reached(self):
        # Performance already clears Titan; effort is what's missing
        rank, gate = apply_greek_rank_gates(50, 75)
        assert rank == 'Demigod'
        assert gate == {'rank': 'Titan', 'required_percentile': 50.0, 'met': True}


# Monday 2026-09-14 starts ISO week 38. Workouts only need a `.date`.
MONDAY = date(2026, 9, 14)


def _workout(d, hour=18):
    return SimpleNamespace(date=datetime(d.year, d.month, d.day, hour))


def _weekly(weeks_back, day_offset=2):
    """One workout in each of the given weeks before MONDAY's week (1 = last week)."""
    return [_workout(MONDAY - timedelta(weeks=w) + timedelta(days=day_offset)) for w in weeks_back]


class TestStreakWeeks:

    def test_no_workouts(self):
        assert _compute_streak_weeks([], today=MONDAY) == 0

    def test_empty_current_week_does_not_break_the_streak(self):
        # Trained each of the last 11 weeks, nothing yet this week.
        workouts = _weekly(range(1, 12))
        for today in (MONDAY, MONDAY + timedelta(days=3), MONDAY + timedelta(days=6)):
            assert _compute_streak_weeks(workouts, today=today) == 11

    def test_training_this_week_extends_the_streak(self):
        workouts = _weekly(range(1, 12)) + [_workout(MONDAY + timedelta(days=1))]
        assert _compute_streak_weeks(workouts, today=MONDAY + timedelta(days=2)) == 12

    def test_missing_last_week_breaks_the_streak(self):
        workouts = _weekly(range(2, 12))
        assert _compute_streak_weeks(workouts, today=MONDAY) == 0

    def test_missing_last_week_but_trained_this_week_counts_only_this_week(self):
        workouts = _weekly(range(2, 12)) + [_workout(MONDAY)]
        assert _compute_streak_weeks(workouts, today=MONDAY + timedelta(days=1)) == 1

    def test_gap_stops_the_count(self):
        workouts = _weekly([1, 2, 3, 5, 6])
        assert _compute_streak_weeks(workouts, today=MONDAY) == 3

    def test_multiple_workouts_in_a_week_count_once(self):
        workouts = _weekly([1, 1, 1], day_offset=0) + _weekly([1], day_offset=5) + _weekly([2])
        assert _compute_streak_weeks(workouts, today=MONDAY) == 2

    def test_sunday_and_monday_are_different_weeks(self):
        sunday = MONDAY - timedelta(days=1)
        workouts = [_workout(sunday, hour=23), _workout(MONDAY, hour=0)]
        assert _compute_streak_weeks(workouts, today=MONDAY) == 2

    def test_crosses_the_iso_year_boundary(self):
        # ISO 2026-W01 starts Mon 2025-12-29; 2025 has 52 ISO weeks.
        jan_monday = date(2026, 1, 5)  # ISO 2026-W02
        workouts = [_workout(date(2025, 12, 22)), _workout(date(2025, 12, 30)), _workout(jan_monday)]
        assert _compute_streak_weeks(workouts, today=jan_monday) == 3

    def test_defaults_to_today(self):
        this_week = date.today()
        assert _compute_streak_weeks([_workout(this_week)]) == 1


class TestConsistencyScore:

    def test_no_workouts_is_zero(self):
        assert compute_consistency_score([], today=MONDAY) == 0.0

    def test_every_week_with_a_full_streak_is_100(self):
        workouts = _weekly(range(1, 13))
        assert compute_consistency_score(workouts, today=MONDAY) == pytest.approx(100)

    def test_active_weeks_are_80_percent_and_streak_is_20(self):
        # 6 active weeks, the most recent 3 in a row: 6/12*80 + 3/12*20
        workouts = _weekly([1, 2, 3, 6, 8, 10])
        assert compute_consistency_score(workouts, today=MONDAY) == pytest.approx(40 + 5)

    def test_empty_current_week_keeps_the_full_streak_bonus(self):
        history = _weekly(range(1, 12))
        before = compute_consistency_score(history, today=MONDAY)
        # Training this week adds an active week and a streak week, so it can only go up.
        after = compute_consistency_score(history + [_workout(MONDAY)], today=MONDAY)
        assert before == pytest.approx(11 / 12 * 80 + 11 / 12 * 20)
        assert after >= before

    def test_capped_at_100_when_the_window_spans_13_iso_weeks(self):
        # A 12-week lookback can touch 13 ISO weeks (partial first week).
        workouts = _weekly(range(0, 13), day_offset=0)
        assert compute_consistency_score(workouts, today=MONDAY) == 100.0


class TestDedicationScore:

    @pytest.mark.parametrize('count, points', [
        (0, 0), (4, 15), (8, 30), (13, 45), (20, 60), (26, 75), (39, 88), (52, 100),
    ])
    def test_milestones(self, count, points):
        assert compute_dedication_score(count) == pytest.approx(points)

    def test_interpolates_between_milestones(self):
        assert compute_dedication_score(2) == pytest.approx(7.5)
        assert compute_dedication_score(30) == pytest.approx(75 + 4 / 13 * 13)

    def test_capped_at_100(self):
        assert compute_dedication_score(53) == 100.0
        assert compute_dedication_score(500) == 100.0

    def test_monotonically_non_decreasing(self):
        scores = [compute_dedication_score(n) for n in range(0, 80)]
        assert all(b >= a for a, b in zip(scores, scores[1:]))

