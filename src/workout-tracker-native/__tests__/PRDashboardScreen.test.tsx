import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import PRDashboardScreen from '../screens/ProfileTab/PRDashboardScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const nav = createMockNavigation();
const route = createMockRoute('PRDashboard');

const dashboardPayload = {
  recent_events: [
    {
      id: 1, exercise_template_id: 7, workout_id: 42,
      pr_type: 'max_weight', value: 245, weight_context: null,
      previous_value: 225, improved_by: 20,
      achieved_at: '2026-08-10T00:00:00',
      exercise_name: 'Bench Press', pr_label: 'Max Weight',
      workout_name: 'Push Day', workout_date: '2026-08-10T00:00:00',
    },
  ],
  page: 1,
  per_page: 20,
  total: 1,
  has_more: false,
  workout_bests: {
    best_volume: { workout_id: 42, workout_name: 'Push Day', date: '2026-08-10T00:00:00', value: 12400 },
    best_total_reps: { workout_id: 43, workout_name: 'Volume Day', date: '2026-07-01T00:00:00', value: 210 },
  },
  stats: {
    prs_this_month: 3,
    pr_streak_weeks: 2,
    total_prs: 15,
    days_since_last_pr: [
      { exercise_template_id: 9, exercise_name: 'Squat', workout_count: 12, days_since_last_pr: 32, last_pr_at: '2026-07-09T00:00:00' },
    ],
  },
};

describe('PRDashboardScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockFetch(dashboardPayload);
  });

  it('renders without crashing', () => {
    render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
  });

  it('shows hero stats', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('this month')).toBeTruthy());
    expect(getByText('3')).toBeTruthy();
    expect(getByText('week PR streak')).toBeTruthy();
    expect(getByText('total PRs')).toBeTruthy();
    expect(getByText('15')).toBeTruthy();
  });

  it('shows a feed event with value and delta', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    expect(getByText('245 lbs')).toBeTruthy();
    expect(getByText('+20 lbs')).toBeTruthy();
  });

  it('shows workout records', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Most Volume')).toBeTruthy());
    expect(getByText('12,400 lbs')).toBeTruthy();
    expect(getByText('Most Reps')).toBeTruthy();
  });

  it('navigates to WorkoutDetails when a feed card is tapped', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByText('Bench Press'));
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutDetails', { workoutId: 42 });
  });

  it('navigates to PRProgression from a stalled lift row', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Squat')).toBeTruthy());
    fireEvent.press(getByText('Squat'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 9, exerciseName: 'Squat' });
  });

  it('refetches with a type param when a filter chip is tapped', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Weight')).toBeTruthy());
    fireEvent.press(getByText('Weight'));
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('type=weight'))).toBe(true);
    });
  });

  it('keeps the header mounted while switching filters instead of a full-page reload', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Weight')).toBeTruthy());
    expect(getByText('Most Volume')).toBeTruthy();
    fireEvent.press(getByText('Weight'));
    // Header content (hero/records/etc.) stays mounted immediately after the
    // tap — if a filter switch ever re-triggers the full-screen loading
    // state, this throws because the whole list (and its header) unmounts.
    expect(getByText('Most Volume')).toBeTruthy();
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('type=weight'))).toBe(true);
    });
  });

  it('hides a section when its eye toggle is tapped in customize mode', async () => {
    const { getByText, getByLabelText, queryByText } = render(
      <PRDashboardScreen navigation={nav as any} route={route as any} />,
    );
    await waitFor(() => expect(getByText('Most Volume')).toBeTruthy());

    fireEvent.press(getByLabelText('Customize dashboard'));
    await waitFor(() => expect(getByText('Customize Dashboard')).toBeTruthy());
    fireEvent.press(getByLabelText('Hide Workout Records'));
    fireEvent.press(getByText('Done'));

    await waitFor(() => expect(queryByText('Most Volume')).toBeNull());
    const saved = await AsyncStorage.getItem('pr_dashboard_layout_1');
    expect(JSON.parse(saved!).find((s: any) => s.key === 'records').visible).toBe(false);
  });

  it('restores a saved layout with hidden sections', async () => {
    await AsyncStorage.setItem('pr_dashboard_layout_1', JSON.stringify([
      { key: 'hero', visible: false },
      { key: 'records', visible: true },
      { key: 'stalled', visible: true },
      { key: 'progression', visible: true },
    ]));
    const { getByText, queryByText } = render(
      <PRDashboardScreen navigation={nav as any} route={route as any} />,
    );
    await waitFor(() => expect(getByText('Most Volume')).toBeTruthy());
    expect(queryByText('this month')).toBeNull();
  });

  it('shows pinned exercises and navigates to their progression', async () => {
    await AsyncStorage.setItem('pr_dashboard_pins_1', JSON.stringify([{ id: 12, name: 'Deadlift' }]));
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Deadlift')).toBeTruthy());
    fireEvent.press(getByText('Deadlift'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 12, exerciseName: 'Deadlift' });
  });

  it('shows a pin hint when nothing is pinned', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/Pin lifts from their progression view/)).toBeTruthy());
  });

  it('shows a progression chart card for a pinned exercise with history', async () => {
    await AsyncStorage.setItem('pr_dashboard_pins_1', JSON.stringify([{ id: 12, name: 'Deadlift' }]));
    (global.fetch as jest.Mock) = jest.fn((url: any) => {
      if (String(url).includes('/api/personal-records/history')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([
            { id: 101, exercise_template_id: 12, workout_id: 1, pr_type: 'max_weight', value: 385, weight_context: null, previous_value: 365, improved_by: 20, achieved_at: '2026-08-01T00:00:00' },
            { id: 102, exercise_template_id: 12, workout_id: 2, pr_type: 'max_weight', value: 405, weight_context: null, previous_value: 385, improved_by: 15, achieved_at: '2026-08-08T00:00:00' },
          ]),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dashboardPayload) });
    });
    const { getByText, queryByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Deadlift')).toBeTruthy());
    // Current value + delta from the picked default series (max_weight, latest context)
    await waitFor(() => expect(getByText('405 lbs')).toBeTruthy());
    expect(getByText('+15 lbs')).toBeTruthy();
    expect(queryByText('No PR history yet')).toBeNull();
  });

  it('shows the empty state when there are no events', async () => {
    mockFetch({
      ...dashboardPayload,
      recent_events: [],
      workout_bests: { best_volume: null, best_total_reps: null },
      stats: { prs_this_month: 0, pr_streak_weeks: 0, total_prs: 0, days_since_last_pr: [] },
    });
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/No PRs yet/)).toBeTruthy());
  });
});
