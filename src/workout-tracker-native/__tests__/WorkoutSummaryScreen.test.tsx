import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation } from './testUtils';
import WorkoutSummaryScreen from '../screens/DashboardTab/WorkoutSummaryScreen';

let mockWeightUnit = 'lbs';
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 't', weight_unit: mockWeightUnit } }),
}));
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('../utils/shareCapture', () => ({ captureAndShare: jest.fn() }));
jest.mock('../components/MuscleDiagram', () => () => null);
jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22 } } }), { virtual: true });

type Server = { workout?: any; workoutStatus?: number; rank?: any };
function mockServer({ workout = {}, workoutStatus = 200, rank = null }: Server) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const u = String(url);
    if (u.includes('/api/stats/greek-rank')) {
      return Promise.resolve({ ok: !!rank, status: rank ? 200 : 404, json: () => Promise.resolve(rank ?? {}) });
    }
    if (/\/api\/workouts\/\d+$/.test(u)) {
      return Promise.resolve({ ok: workoutStatus < 300, status: workoutStatus, json: () => Promise.resolve(workout) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
}

const params = (over: Record<string, any> = {}) => ({
  workoutId: 42, workoutName: 'Push Day', prs: [], totalVolume: 1000, totalReps: 20, totalSets: 4,
  muscles: [], isFirstWorkout: false, isBestVolume: false, isBestReps: false, ...over,
});
const renderSummary = (p: Record<string, any> = {}) =>
  render(<WorkoutSummaryScreen navigation={createMockNavigation() as any} route={{ key: 'k', name: 'WorkoutSummary', params: params(p) } as any} />);

const strengthWorkout = {
  date: '2026-03-05T00:00:00', duration: 52, workout_type: 'strength',
  exercises: [
    { id: 1, name: 'Bench Press', exercise_type: 'strength', sets: [
      { id: 1, reps: 10, weight: 95, set_type: 'W' },
      { id: 2, reps: 8, weight: 185, set_type: 'N' },
    ] },
    { id: 2, name: 'Plank', exercise_type: 'duration', sets: [{ id: 3, cardio_duration: 1.5, set_type: 'N' }] },
  ],
};

describe('WorkoutSummaryScreen', () => {
  beforeEach(async () => {
    mockWeightUnit = 'lbs';
    await AsyncStorage.clear();
  });

  it("converts the API's lbs volume for a kg user, on screen and on the share card", async () => {
    mockWeightUnit = 'kg';
    mockServer({ workout: strengthWorkout });
    const { findByText, getByText } = renderSummary({ totalVolume: 1000 });

    expect(await findByText('Volume (kg)')).toBeTruthy();
    // 1000 lbs = 454 kg; the share card shows the converted figure, not 1,000
    expect(getByText('454')).toBeTruthy();
    expect(getByText('Total Volume (kg)')).toBeTruthy();
  });

  it('counts PRs one by one and lists every value, grouped by lift and type', async () => {
    mockServer({ workout: strengthWorkout });
    const { findByText, getByText } = renderSummary({ prs: [
      { exercise_name: 'Bench Press', pr_type: 'max_reps', value: 8, weight_context: 185 },
      { exercise_name: 'Bench Press', pr_type: 'max_reps', value: 6, weight_context: 205 },
      { exercise_name: 'Bench Press', pr_type: 'max_weight', value: 225 },
      { exercise_name: 'Bench Press', pr_type: 'estimated_1rm', value: 250 },
    ] });

    // Two rep records at two weights are two PRs; the estimate is never a PR
    expect(await findByText('3 Personal Records')).toBeTruthy();
    expect(getByText('Bench Press · Max Weight')).toBeTruthy();
    expect(getByText('225 lbs')).toBeTruthy();
    expect(getByText('Bench Press · Rep Records')).toBeTruthy();
    expect(getByText('8 reps at 185 lbs, 6 reps at 205 lbs')).toBeTruthy();
  });

  it('formats holds as time, marks warm-ups, and adds the duration', async () => {
    mockServer({ workout: strengthWorkout });
    const { findByText, getByText, getAllByText } = renderSummary();

    expect(await findByText('1:30')).toBeTruthy();
    // On screen and as the share card's best set
    expect(getAllByText('8 × 185 lbs')).toHaveLength(2);
    expect(getByText(/W\s+10 × 95 lbs/)).toBeTruthy();
    expect(getByText('"Push Day" · 52 min')).toBeTruthy();
  });

  it('dates the share card with the workout, not today', async () => {
    mockServer({ workout: strengthWorkout });
    const { findByText } = renderSummary();
    expect(await findByText('March 5, 2026')).toBeTruthy();
  });

  it('shows time, distance and pace for a cardio-only workout', async () => {
    mockServer({ workout: {
      date: '2026-03-05T00:00:00', workout_type: 'cardio', cardio_duration: 30, distance: 5, distance_unit: 'km',
      exercises: [{ id: 1, name: 'Run', exercise_type: 'cardio', sets: [{ id: 1, cardio_duration: 30, distance: 5, distance_unit: 'km', set_type: 'N' }] }],
    } });
    const { findByText, getByText, queryByText } = renderSummary({ totalVolume: 0, totalReps: 0, totalSets: 1 });

    expect(await findByText('Pace (/mi)')).toBeTruthy();
    expect(getByText('Distance (mi)')).toBeTruthy();
    expect(getByText('Time')).toBeTruthy();
    expect(queryByText('Volume (lbs)')).toBeNull();
    // The bout itself, converted to the default mi
    expect(getByText('30 min · 3.11 mi')).toBeTruthy();
  });

  it('says so and offers a retry when the sets fail to load', async () => {
    mockServer({ workoutStatus: 500 });
    const { findByText, getByText } = renderSummary();

    expect(await findByText(/Couldn't load this workout's sets/)).toBeTruthy();
    mockServer({ workout: strengthWorkout });
    fireEvent.press(getByText('Try Again'));
    expect(await findByText('1:30')).toBeTruthy();
  });

  describe('rank-up', () => {
    const rank = (name: string) => ({ greek_rank: name, greek_score: 13, held_by_gate: false });

    it('celebrates a rank reached by this workout and updates the cache', async () => {
      await AsyncStorage.setItem('greek_rank_cached', 'Neophyte');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText } = renderSummary();

      expect(await findByText('Ranked up')).toBeTruthy();
      await waitFor(async () => expect(await AsyncStorage.getItem('greek_rank_cached')).toBe('Athlete'));
    });

    it('stays quiet when the rank is unchanged', async () => {
      await AsyncStorage.setItem('greek_rank_cached', 'Athlete');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText, queryByText } = renderSummary();

      expect(await findByText('Keep training to reach Hero')).toBeTruthy();
      expect(queryByText('Ranked up')).toBeNull();
    });

    it('stays quiet with nothing cached to compare against', async () => {
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText, queryByText } = renderSummary();

      expect(await findByText('Keep training to reach Hero')).toBeTruthy();
      expect(queryByText('Ranked up')).toBeNull();
    });
  });
});
