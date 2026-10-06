/**
 * Places a free account is shown that a rank exists without being shown the
 * rank: the workout summary after a PR on a ranked lift, and Exercise Detail.
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import WorkoutSummaryScreen from '../screens/DashboardTab/WorkoutSummaryScreen';
import ExerciseDetailScreen from '../screens/ExercisesTab/ExerciseDetailScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('react-native-confetti-cannon', () => 'ConfettiCannon');
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null, BarChart: () => null }));

let mockIsPremium = false;
jest.mock('../context/PurchaseContext', () => ({ usePurchase: () => ({ isPremium: mockIsPremium }) }));

const TO_STRENGTH_SCORE = ['TrainingTab', { screen: 'StrengthScore', initial: false }];

function serve(routes: Record<string, any>) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const hit = Object.entries(routes).find(([p]) => String(url).includes(p));
    return Promise.resolve({ ok: !!hit, status: hit ? 200 : 404, json: () => Promise.resolve(hit ? hit[1] : {}) });
  });
}

describe('workout summary after a PR', () => {
  const summary = (prs: any[]) => ({
    workoutId: 1, workoutName: 'Push', prs, totalVolume: 5000, totalReps: 40, totalSets: 8,
    muscles: ['Chest'], isFirstWorkout: false, isBestVolume: false, isBestReps: false,
  });

  async function renderSummary(prs: any[]) {
    serve({});
    const nav = createMockNavigation();
    const utils = render(
      <WorkoutSummaryScreen navigation={nav as any} route={createMockRoute('WorkoutSummary', summary(prs)) as any} />,
    );
    await act(async () => {});
    return { ...utils, nav };
  }

  beforeEach(() => { jest.clearAllMocks(); mockIsPremium = false; });

  it('points at where the lift ranks when the PR is on a ranked lift', async () => {
    const r = await renderSummary([{ exercise_name: 'Bench Press', pr_type: 'max_weight', value: 225, scored: true }]);
    fireEvent.press(r.getByText('See where your Bench Press ranks'));
    expect(r.nav.navigate).toHaveBeenCalledWith(...TO_STRENGTH_SCORE);
  });

  it('says nothing about ranks for a lift that has none', async () => {
    const r = await renderSummary([{ exercise_name: 'Cable Curl', pr_type: 'max_weight', value: 60, scored: false }]);
    expect(r.queryByText(/See where your/)).toBeNull();
  });
});

describe('Exercise Detail rank card', () => {
  const SCORE = { exercise: 'Bench Press', percentile: 72, rank: { label: 'Advanced', tier: 3, display: 'Advanced' }, has_data: true };

  async function renderDetail() {
    serve({
      '/api/stats/strength-score/exercise': SCORE,
      '/api/stats/exercise': { history: [], total_sets: 0 },
      '/api/exercises/': { id: 3, name: 'Bench Press', muscle_group: 'Chest', equipment: 'Barbell', exercise_type: 'strength' },
    });
    const nav = createMockNavigation();
    const route = createMockRoute('ExerciseDetail', { exerciseId: 3, exerciseName: 'Bench Press' });
    const utils = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await act(async () => {});
    return { ...utils, nav };
  }

  beforeEach(() => jest.clearAllMocks());

  it('tells a free account the lift has a rank, without the rank', async () => {
    mockIsPremium = false;
    const r = await renderDetail();
    await waitFor(() => expect(r.getByText('See how this lift ranks')).toBeTruthy());
    expect(r.queryByText('72')).toBeNull();
    expect(r.queryByText('Advanced')).toBeNull();
    fireEvent.press(r.getByText('See how this lift ranks'));
    expect(r.nav.navigate).toHaveBeenCalledWith(...TO_STRENGTH_SCORE);
  });

  it('shows a subscriber the percentile and rank', async () => {
    mockIsPremium = true;
    const r = await renderDetail();
    await waitFor(() => expect(r.getByText('72')).toBeTruthy());
    expect(r.getByText('Advanced')).toBeTruthy();
    expect(r.queryByText('See how this lift ranks')).toBeNull();
  });
});
