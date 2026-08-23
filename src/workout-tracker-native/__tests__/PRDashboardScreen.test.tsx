import React from 'react';
import { Dimensions } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import PRDashboardScreen from '../screens/ProfileTab/PRDashboardScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

// Overrides jest.setup.ts's plain `() => null` mock with a spy, so tests can
// verify the pinned progression chart doesn't re-render (and replay its
// entrance animation) on unrelated dashboard state changes.
const mockLineChartRender = jest.fn(() => null);
jest.mock('react-native-gifted-charts', () => ({
  BarChart: () => null,
  LineChart: (props: any) => mockLineChartRender(props),
}));

const nav = createMockNavigation();
const route = createMockRoute('PRDashboard');

const dashboardPayload = {
  recent_events_scope: 'week' as const,
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
    // Deliberately distinct from the feed event's own +20 lbs delta below,
    // so assertions on one can't accidentally pass against the other.
    weekly_weight_increased: 35,
    weekly_reps_added: 8,
    days_since_last_pr: [
      {
        exercise_template_id: 9, exercise_name: 'Squat', workout_count: 12,
        days_since_last_pr: 32, last_pr_at: '2026-07-09T00:00:00',
        // Weight is the stalest category (32d, vs. Reps' 5d) — that's what
        // the row's own days_since_last_pr/last_pr_at above reflect.
        stalest_category: 'weight' as const,
        by_type: {
          weight: { days_since_last_pr: 32, last_pr_at: '2026-07-09T00:00:00', weight_context: null },
          reps: { days_since_last_pr: 5, last_pr_at: '2026-08-06T00:00:00', weight_context: 185 },
          time: null,
          distance: null,
        },
      },
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

  it('navigates to PersonalRecords when View All is tapped', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('View All')).toBeTruthy());
    fireEvent.press(getByText('View All'));
    expect(nav.navigate).toHaveBeenCalledWith('PersonalRecords');
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

  it('shows the weekly weight-increased and reps-added totals next to the feed title', async () => {
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('+35 lbs · +8 reps')).toBeTruthy());
  });

  it('shows only the weight total when there are no reps this week', async () => {
    mockFetch({ ...dashboardPayload, stats: { ...dashboardPayload.stats, weekly_weight_increased: 35, weekly_reps_added: 0 } });
    const { getByText, queryByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    // Exact match — "+35 lbs" alone, not combined with a reps clause
    await waitFor(() => expect(getByText('+35 lbs')).toBeTruthy());
    expect(queryByText(/^\+\d+ reps?$/)).toBeNull();
    expect(queryByText(/^\+35 lbs ·/)).toBeNull();
  });

  it('shows only the reps total when there is no weight increase this week', async () => {
    mockFetch({ ...dashboardPayload, stats: { ...dashboardPayload.stats, weekly_weight_increased: 0, weekly_reps_added: 1 } });
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    // Singular "rep", not "reps", for exactly 1
    await waitFor(() => expect(getByText('+1 rep')).toBeTruthy());
  });

  it('hides the weekly totals when both are zero (or the field is missing, e.g. an older API response)', async () => {
    mockFetch({ ...dashboardPayload, stats: { ...dashboardPayload.stats, weekly_weight_increased: 0, weekly_reps_added: 0 } });
    const { getByText, queryByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    expect(queryByText(/lbs ·/)).toBeNull();
    expect(queryByText(/^\+\d+ reps?$/)).toBeNull();
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

  it('opens a 3-dot menu with View Chart and Share PR actions', async () => {
    const { getByText, getByLabelText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByLabelText('PR actions'), { nativeEvent: { pageX: 100, pageY: 200 } });
    await waitFor(() => expect(getByText('View Chart')).toBeTruthy());
    expect(getByText('Share PR')).toBeTruthy();
  });

  it('navigates to the progression chart from the 3-dot menu', async () => {
    const { getByText, getByLabelText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByLabelText('PR actions'), { nativeEvent: { pageX: 100, pageY: 200 } });
    await waitFor(() => expect(getByText('View Chart')).toBeTruthy());
    fireEvent.press(getByText('View Chart'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 7, exerciseName: 'Bench Press', prType: 'max_weight', weightContext: null });
  });

  it('captures and shares from the 3-dot menu', async () => {
    const { getByText, getByLabelText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByLabelText('PR actions'), { nativeEvent: { pageX: 100, pageY: 200 } });
    await waitFor(() => expect(getByText('Share PR')).toBeTruthy());
    fireEvent.press(getByText('Share PR'));
    await waitFor(() => expect(captureRef).toHaveBeenCalled());
  });

  it('navigates to PRProgression from a stalled lift row, pre-selecting the stalest category (not the most recent one)', async () => {
    // In "All" mode the row's 32d-ago aggregate is the STALEST category
    // (Weight) — even though Reps (5d ago) is more recent — since the point
    // of this section is to surface what's been neglected the longest.
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Squat')).toBeTruthy());
    fireEvent.press(getByText('Squat'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 9, exerciseName: 'Squat', prType: 'max_weight', weightContext: null });
  });

  it('shows which category a stalled row\'s date refers to in "All" mode (the stalest one, not the most recent)', async () => {
    const { getByText, getAllByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Squat')).toBeTruthy());
    // "Weight" appears 3 times once the subtitle renders: the stalled
    // picker's own option, this row's subtitle, and the feed picker's option.
    expect(getAllByText('Weight').length).toBe(3);
  });

  it('shows only the reps weight context (no repeated category label) once the Reps segment is active', async () => {
    const { getByText, getAllByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Squat')).toBeTruthy());
    fireEvent.press(getAllByText('Reps')[0]); // the stalled section's own picker
    await waitFor(() => expect(getByText('5d ago')).toBeTruthy());
    expect(getByText('@ 185 lbs')).toBeTruthy();
  });

  it('switches the stalled section to a per-type day count without refetching', async () => {
    const { getByText, getAllByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('32d ago')).toBeTruthy());
    const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length;

    // Index 0 is the stalled section's own "Reps" segment (index 1 is the feed's)
    fireEvent.press(getAllByText('Reps')[0]);

    await waitFor(() => expect(getByText('5d ago')).toBeTruthy());
    expect(getByText('Squat')).toBeTruthy();
    // Purely client-side — reuses by_type from the already-fetched payload
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(fetchCallsBefore);
  });

  it('does not crash switching type when the API response predates by_type', async () => {
    // Guards against a frontend/backend version mismatch (e.g. mid-deploy,
    // or dev pointed at a not-yet-deployed API) — an older response shape
    // without by_type must degrade to "no match" instead of throwing.
    const { exercise_template_id, exercise_name, workout_count, days_since_last_pr, last_pr_at } =
      dashboardPayload.stats.days_since_last_pr[0];
    mockFetch({
      ...dashboardPayload,
      stats: {
        ...dashboardPayload.stats,
        days_since_last_pr: [{ exercise_template_id, exercise_name, workout_count, days_since_last_pr, last_pr_at }],
      },
    });
    const { getByText, getAllByText, queryByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Squat')).toBeTruthy());

    fireEvent.press(getAllByText('Reps')[0]);

    await waitFor(() => expect(getByText('No PRs of this type yet for your most-trained exercises.')).toBeTruthy());
    expect(queryByText('Squat')).toBeNull();
  });

  it('drops exercises with no PR of the selected type and shows an empty message', async () => {
    const { getByText, getAllByText, queryByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Squat')).toBeTruthy());

    fireEvent.press(getAllByText('Time')[0]);

    await waitFor(() => expect(getByText('No PRs of this type yet for your most-trained exercises.')).toBeTruthy());
    expect(queryByText('Squat')).toBeNull();
  });

  it('refetches with a type param when a filter segment is tapped', async () => {
    // "Weight" now appears three times — the stalled section's own picker
    // (index 0), the Squat row's stalest-category subtitle (index 1, plain
    // text, not tappable), and the feed's own picker (index 2, under test).
    const { getByText, getAllByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getAllByText('Weight').length).toBe(3));
    fireEvent.press(getAllByText('Weight')[2]);
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('type=weight'))).toBe(true);
    });
  });

  it('keeps the header mounted while switching filters instead of a full-page reload', async () => {
    const { getByText, getAllByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getAllByText('Weight').length).toBe(3));
    expect(getByText('Most Volume')).toBeTruthy();
    fireEvent.press(getAllByText('Weight')[2]); // the feed's own picker
    // Header content (hero/records/etc.) stays mounted immediately after the
    // tap — if a filter switch ever re-triggers the full-screen loading
    // state, this throws because the whole list (and its header) unmounts.
    expect(getByText('Most Volume')).toBeTruthy();
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('type=weight'))).toBe(true);
    });
  });

  it('always shows all four sections in a fixed order, Pinned Progression above Time Since Last PR (no customize feature)', async () => {
    const { getByText, getAllByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('this month')).toBeTruthy());
    expect(getByText('Most Volume')).toBeTruthy();
    expect(getByText('Squat')).toBeTruthy(); // stalled lift
    expect(getByText('Pinned Progression')).toBeTruthy();

    // getAllByText returns matches in document order, so a regex spanning
    // both unique section labels doubles as an order check.
    const [first, second] = getAllByText(/^Pinned Progression$|^Time Since Last PR$/);
    expect(first.children[0]).toBe('Pinned Progression');
    expect(second.children[0]).toBe('Time Since Last PR');
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
    // Tapping the card pre-selects the metric/context of its most recent event
    fireEvent.press(getByText('Deadlift'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 12, exerciseName: 'Deadlift', prType: 'max_weight', weightContext: null });
  });

  it('shows two pinned PR types on the same exercise as independent cards with metric subtitles', async () => {
    await AsyncStorage.setItem('pr_dashboard_pins_1', JSON.stringify([
      { id: 12, name: 'Deadlift', prType: 'max_weight', weightContext: null },
      { id: 12, name: 'Deadlift', prType: 'max_reps', weightContext: 315 },
    ]));
    (global.fetch as jest.Mock) = jest.fn((url: any) => {
      if (String(url).includes('/api/personal-records/history')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([
            { id: 101, exercise_template_id: 12, workout_id: 1, pr_type: 'max_weight', value: 405, weight_context: null, previous_value: 385, improved_by: 20, achieved_at: '2026-08-01T00:00:00' },
            { id: 102, exercise_template_id: 12, workout_id: 2, pr_type: 'max_reps', value: 6, weight_context: 315, previous_value: null, improved_by: null, achieved_at: '2026-08-05T00:00:00' },
          ]),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dashboardPayload) });
    });
    const { getAllByText, getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    // Two cards, both named "Deadlift" — one for each pinned type
    await waitFor(() => expect(getAllByText('Deadlift').length).toBe(2));
    expect(getByText('Max Weight')).toBeTruthy();
    expect(getByText('Max Reps @ 315 lbs')).toBeTruthy();
  });

  it('only animates the pinned progression chart on first paint, not on a later filter switch', async () => {
    await AsyncStorage.setItem('pr_dashboard_pins_1', JSON.stringify([{ id: 12, name: 'Deadlift', prType: 'max_weight', weightContext: null }]));
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
    const { getByText, getAllByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('405 lbs')).toBeTruthy());
    // The chart's first paint (with real data) is animated.
    const callsAfterMount = [...mockLineChartRender.mock.calls];
    expect(callsAfterMount.some(([props]) => props.isAnimated === true)).toBe(true);

    fireEvent.press(getAllByText('Weight')[2]); // the feed's own filter segment
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('type=weight'))).toBe(true);
    });

    // Whatever renders happen afterward (the filter switch touches unrelated
    // state), none of them re-animate the chart.
    const callsAfterFilterSwitch = mockLineChartRender.mock.calls.slice(callsAfterMount.length);
    expect(callsAfterFilterSwitch.length).toBeGreaterThan(0);
    expect(callsAfterFilterSwitch.every(([props]) => props.isAnimated === false)).toBe(true);
  });

  it('sizes the pinned chart to fit within the card, including the y-axis label column', async () => {
    await AsyncStorage.setItem('pr_dashboard_pins_1', JSON.stringify([{ id: 12, name: 'Deadlift', prType: 'max_weight', weightContext: null }]));
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
    render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(mockLineChartRender.mock.calls.length).toBeGreaterThan(0));
    const [props] = mockLineChartRender.mock.calls[0];
    // gifted-charts renders yAxisLabelWidth *in addition to* `width` — their
    // sum is the chart's real footprint, which must not exceed the card's
    // available interior (list padding + card padding + one unit of
    // intentional breathing room, mirroring PIN_CHART_W in the component).
    const screenWidth = Dimensions.get('window').width;
    const cardAvailableWidth = screenWidth - 16 * 5; // spacing.md is mocked to 16 above
    expect(props.width + props.yAxisLabelWidth).toBe(cardAvailableWidth);
  });

  it('shows the weekly title and no fallback note under the normal week scope', async () => {
    const { getByText, queryByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText("This Week's PRs")).toBeTruthy());
    expect(queryByText(/No new PRs this week/)).toBeNull();
  });

  it('retitles the feed and shows a note when the week is empty but older PRs are shown', async () => {
    mockFetch({ ...dashboardPayload, recent_events_scope: 'all_time' });
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Recent PRs')).toBeTruthy());
    expect(getByText(/No new PRs this week/)).toBeTruthy();
    // The fallback item itself still renders normally
    expect(getByText('Bench Press')).toBeTruthy();
  });

  it('shows a first-time empty state when the user has no PRs at all', async () => {
    // The backend already exhausts all-time history via its own fallback
    // before returning an empty list, so an empty feed here always means
    // zero PRs of this (filtered) type have ever been recorded.
    mockFetch({
      ...dashboardPayload,
      recent_events: [],
      recent_events_scope: 'all_time',
      workout_bests: { best_volume: null, best_total_reps: null },
      stats: { prs_this_month: 0, pr_streak_weeks: 0, total_prs: 0, days_since_last_pr: [] },
    });
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('No PRs yet')).toBeTruthy());
    expect(getByText('Log some workouts to start your history.')).toBeTruthy();
  });

  it('shows an encouraging empty state for a type filter the user has never PRd', async () => {
    mockFetch({
      ...dashboardPayload,
      recent_events: [],
      recent_events_scope: 'all_time',
      workout_bests: { best_volume: null, best_total_reps: null },
      stats: { prs_this_month: 0, pr_streak_weeks: 0, total_prs: 15, days_since_last_pr: [] },
    });
    const { getByText } = render(<PRDashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Distance')).toBeTruthy());
    fireEvent.press(getByText('Distance'));
    await waitFor(() => expect(getByText('No PRs of this type yet')).toBeTruthy());
    expect(getByText(/keep training/i)).toBeTruthy();
  });
});
