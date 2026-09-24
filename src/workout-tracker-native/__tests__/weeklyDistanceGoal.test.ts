import {
  DISTANCE_GOAL_MAX, DISTANCE_GOAL_MIN, displayToGoalKm, distanceGoalProgress,
  formatDistanceValue, goalKmToDisplay, parseDistanceGoalInput, stepDistanceGoal,
} from '../utils/weeklyDistanceGoal';
import { hasLoggedNothing, visibleChartMetrics } from '../utils/progressMetrics';

const KM_PER_MI = 1.60934;

describe('weekly distance goal', () => {
  describe('unit round trip', () => {
    it('stores km and shows the value the user set, in either unit', () => {
      expect(goalKmToDisplay(displayToGoalKm(15, 'mi'), 'mi')).toBe(15);
      expect(goalKmToDisplay(displayToGoalKm(12.5, 'mi'), 'mi')).toBe(12.5);
      expect(goalKmToDisplay(displayToGoalKm(20, 'km'), 'km')).toBe(20);
    });

    it('keeps the same distance when the user switches units', () => {
      const km = displayToGoalKm(10, 'mi');
      expect(goalKmToDisplay(km, 'km')).toBe(16.1);
    });
  });

  describe('stepping', () => {
    it('adds and subtracts 1 and 5 from the shown value', () => {
      expect(stepDistanceGoal(10, 1)).toBe(11);
      expect(stepDistanceGoal(10, 5)).toBe(15);
      expect(stepDistanceGoal(12.5, 5)).toBe(17.5);
      expect(stepDistanceGoal(10, -5)).toBe(5);
    });

    it('stops at the bounds instead of going past them', () => {
      expect(stepDistanceGoal(3, -5)).toBe(DISTANCE_GOAL_MIN);
      expect(stepDistanceGoal(198, 5)).toBe(DISTANCE_GOAL_MAX);
    });

    it('does not accumulate float noise', () => {
      expect(stepDistanceGoal(0.1 + 0.2, 1)).toBe(1.3);
    });
  });

  describe('typed input', () => {
    it('accepts whole and decimal numbers, comma or dot', () => {
      expect(parseDistanceGoalInput('15')).toBe(15);
      expect(parseDistanceGoalInput('12.5')).toBe(12.5);
      expect(parseDistanceGoalInput('12,5')).toBe(12.5);
      expect(parseDistanceGoalInput(' 8 ')).toBe(8);
      expect(parseDistanceGoalInput('.5')).toBe(DISTANCE_GOAL_MIN);
      expect(parseDistanceGoalInput('20.')).toBe(20);
    });

    it('rounds to a tenth and clamps out-of-range values', () => {
      expect(parseDistanceGoalInput('12.46')).toBe(12.5);
      expect(parseDistanceGoalInput('500')).toBe(DISTANCE_GOAL_MAX);
    });

    it('rejects anything that is not a positive number', () => {
      for (const bad of ['', ' ', 'abc', '1.2.3', '-4', '0', '1e3', '5mi']) {
        expect(parseDistanceGoalInput(bad)).toBeNull();
      }
    });
  });

  describe('progress on the card', () => {
    it('fills in proportion and reports display values', () => {
      const p = distanceGoalProgress(5 * KM_PER_MI, 10 * KM_PER_MI, 'mi');
      expect(p).toEqual({ done: 5, goal: 10, fill: 0.5, complete: false });
    });

    it('counts exactly hitting the goal as complete despite backend rounding', () => {
      // The backend rounds bucket km to 3 decimals: 15 mi arrives as 24.140.
      const doneFromBackend = Math.round(15 * KM_PER_MI * 1000) / 1000;
      const p = distanceGoalProgress(doneFromBackend, displayToGoalKm(15, 'mi'), 'mi');
      expect(p.complete).toBe(true);
      expect(p.fill).toBe(1);
    });

    it('caps the fill at full when the user goes past the goal', () => {
      const p = distanceGoalProgress(30, 10, 'km');
      expect(p.fill).toBe(1);
      expect(p.done).toBe(30);
    });

    it('is empty with nothing logged this week', () => {
      expect(distanceGoalProgress(0, 10, 'km')).toEqual({ done: 0, goal: 10, fill: 0, complete: false });
    });
  });

  it('formats whole values without a trailing .0', () => {
    expect(formatDistanceValue(15)).toBe('15');
    expect(formatDistanceValue(8.2)).toBe('8.2');
  });
});

describe('chart metric tabs', () => {
  const none = { volume: false, sets: false, workouts: false, distance: false };

  it('shows only what the user has logged, in chart order', () => {
    expect(visibleChartMetrics({ ...none, workouts: true, distance: true })).toEqual(['workouts', 'distance']);
    expect(visibleChartMetrics({ volume: true, sets: true, workouts: true, distance: true }))
      .toEqual(['volume', 'sets', 'workouts', 'distance']);
  });

  it('falls back to the original three tabs when the backend predates metrics_logged', () => {
    expect(visibleChartMetrics(null)).toEqual(['volume', 'sets', 'workouts']);
    expect(hasLoggedNothing(null)).toBe(false);
  });

  it('only calls it "nothing logged" once the backend confirms no workouts', () => {
    expect(hasLoggedNothing(none)).toBe(true);
    expect(hasLoggedNothing({ ...none, workouts: true })).toBe(false);
  });
});
