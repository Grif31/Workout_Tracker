import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import ExerciseDetailScreen from '../screens/ExercisesTab/ExerciseDetailScreen';
import { computeChartYAxisRange } from '../utils/prFormat';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));

// Records what each chart was asked to draw; the real charts can't render here
const mockLine = jest.fn();
const mockBar = jest.fn();
jest.mock('react-native-gifted-charts', () => ({
  LineChart: (props: any) => { mockLine(props); return null; },
  BarChart: (props: any) => { mockBar(props); return null; },
}));

function mockServer(stats: any) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const body = String(url).includes('/api/stats/exercise?') ? stats : {};
    const ok = String(url).includes('/api/stats/exercise?');
    return Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(body) });
  });
}

const renderScreen = (params: Record<string, any>) => render(
  <ExerciseDetailScreen navigation={createMockNavigation() as any} route={createMockRoute('ExerciseDetail', { exerciseId: 1, ...params }) as any} />,
);

beforeEach(() => jest.clearAllMocks());

describe('timed holds', () => {
  const PLANK = {
    exercise_type: 'duration',
    personal_bests: { longest_hold: 1.5 },
    totals: { total_workouts: 1, total_sets: 2, total_duration: 2.5 },
    history: [{ date: '2026-09-20', workout_name: 'Core', best_hold: 1.5, sets: [
      { cardio_duration: 0.5, set_type: 'W' }, { cardio_duration: 1.5, set_type: 'N' }, { cardio_duration: 1, set_type: 'N' },
    ] }],
  };

  it('shows the longest hold and total time instead of strength stats', async () => {
    mockServer(PLANK);
    const { findByText, getByText, queryByText } = renderScreen({ exerciseName: 'Plank', muscleGroup: 'Core' });
    expect(await findByText('Longest Hold')).toBeTruthy();
    expect(getByText('1:30')).toBeTruthy();
    expect(getByText('2:30')).toBeTruthy();
    expect(queryByText('Estimated 1RM')).toBeNull();
  });

  it('lists each hold as a time, with warm-ups marked', async () => {
    mockServer(PLANK);
    const { findByText, getByText, queryByText, getAllByText } = renderScreen({ exerciseName: 'Plank', muscleGroup: 'Core', initialTab: 'history' });
    expect(await findByText('30s')).toBeTruthy();
    expect(getAllByText('1:30').length).toBeGreaterThan(0);
    expect(getByText('W')).toBeTruthy();
    // Working sets number on their own: the warm-up isn't set 1
    expect(getByText('1')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(queryByText('3')).toBeNull();
    expect(queryByText(/reps/)).toBeNull();
  });
});

describe('cardio', () => {
  const RUN = {
    exercise_type: 'cardio',
    totals: { total_distance: 15, total_duration: 1240, session_count: 2 },
    avg_pace: 5,
    history: [
      { date: '2026-09-20', workout_name: 'Run', distance_km: 5, pace: 5, bouts: [{ cardio_duration: 25, distance: 5, distance_unit: 'km', intensity: 5 }] },
      { date: '2026-09-10', workout_name: 'Run', distance_km: 10, pace: 5.5, bouts: [{ cardio_duration: 55, distance: 10, distance_unit: 'km', intensity: 5.5 }] },
    ],
  };

  it('writes big totals in hours', async () => {
    mockServer(RUN);
    const { findByText } = renderScreen({ exerciseName: 'Running', muscleGroup: 'Cardio' });
    expect(await findByText('20h 40m')).toBeTruthy();
  });

  it('shows each bout in the user unit, like the totals', async () => {
    mockServer(RUN);
    const { findByText } = renderScreen({ exerciseName: 'Running', muscleGroup: 'Cardio', initialTab: 'history' });
    // 5 km and 5:00/km in the default mi
    expect(await findByText(/3\.11 mi · @ 8:03 \/mi/)).toBeTruthy();
  });

  it('gets a Charts tab with distance and pace per session', async () => {
    mockServer(RUN);
    const { findByText } = renderScreen({ exerciseName: 'Running', muscleGroup: 'Cardio', chartRange: 'All' });
    fireEvent.press(await findByText('Charts'));
    fireEvent.press(await findByText('All'));
    await findByText('Distance (mi)');
    await findByText('Pace (/mi)');

    const distance = mockBar.mock.calls.at(-1)[0];
    expect(distance.data.map((d: any) => d.value)).toEqual([6.21, 3.11]);
    const pace = mockLine.mock.calls.at(-1)[0];
    // Oldest first, in min/mi; a time axis reads m:ss
    expect(pace.data.map((d: any) => Math.round(d.value * 100) / 100)).toEqual([8.85, 8.05]);
    expect(pace.formatYLabel('8')).toBe('8:00');
  });
});

describe('strength', () => {
  it('snaps the chart axis to whole, even steps', async () => {
    mockServer({
      personal_bests: { estimated_1rm: 281, max_weight: 245, most_reps: 5, max_set_volume: 1225 },
      totals: { total_sets: 4, total_reps: 20, total_workouts: 2 },
      history: [
        { date: '2026-09-20', workout_name: 'Push', sets: [{ reps: 5, weight: 245, set_type: 'N' }], best_1rm: 281.7, best_set: { reps: 5, weight: 245 }, volume: 1225 },
        { date: '2026-09-10', workout_name: 'Push', sets: [{ reps: 5, weight: 240, set_type: 'N' }], best_1rm: 280.1, best_set: { reps: 5, weight: 240 }, volume: 1200 },
      ],
    });
    const { findByText } = renderScreen({ exerciseName: 'Bench Press', muscleGroup: 'Chest' });
    fireEvent.press(await findByText('Charts'));
    await findByText('Estimated 1RM (lbs)');

    const oneRm = mockLine.mock.calls.find(c => c[0].data[0].value === 280.1)[0];
    expect({ maxValue: oneRm.maxValue, yAxisOffset: oneRm.yAxisOffset })
      .toEqual(computeChartYAxisRange([280.1, 281.7], 3));
    expect(oneRm.curved).toBeUndefined();
  });

  it('marks warm-up sets in history and numbers working sets on their own', async () => {
    mockServer({
      personal_bests: {}, totals: { total_sets: 1, total_reps: 5, total_workouts: 1 },
      history: [{ date: '2026-09-20', workout_name: 'Push', best_1rm: 0, best_set: null, volume: 0, sets: [
        { reps: 10, weight: 95, set_type: 'W' }, { reps: 5, weight: 225, set_type: 'N' },
      ] }],
    });
    const { findByText, getByText, queryByText } = renderScreen({ exerciseName: 'Bench Press', muscleGroup: 'Chest', initialTab: 'history' });
    expect(await findByText('W')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(queryByText('2')).toBeNull();
  });

  it("uses a custom exercise's primary muscle for the how-to text", async () => {
    mockServer({ personal_bests: {}, totals: {}, history: [] });
    const { findByText } = renderScreen({ exerciseName: 'My Press', muscleGroup: 'Chest, Triceps' });
    expect(await findByText(/Lie back on a bench/)).toBeTruthy();
  });
});
