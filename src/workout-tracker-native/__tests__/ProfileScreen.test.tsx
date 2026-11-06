import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import ProfileScreen from '../screens/ProfileTab/ProfileScreen';
import { fetchAchievements } from '../utils/achievements';

// Fetched beside the screen's own calls, so it would take a slot in the ordered mocks
jest.mock('../utils/achievements', () => ({
  ...jest.requireActual('../utils/achievements'),
  fetchAchievements: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: { fontSize: 30 }, body: {}, button: {} } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const nav = createMockNavigation();
const route = createMockRoute('ProfileHome');

const workoutsResponse = { data: { workouts: [{ id: 1, name: 'Push Day', date: '2026-05-01T10:00:00', duration: 60, volume: 2000, num_exercises: 3, muscles: [] }], total: 1, has_more: false } };
const statsResponse = { data: { total_workouts: 10, longest_streak: 3, total_volume: 5000 } };
const strengthScoreResponse = { data: {} };

const onePrResponse = {
  data: [{
    id: 1, exercise_template_id: 7, exercise_name: 'Bench Press',
    pr_type: 'max_weight', value: 245, weight_context: null,
    pr_label: 'Max Weight', achieved_at: '2026-08-01T00:00:00',
  }],
};

describe('ProfileScreen', () => {
  beforeEach(async () => {
    // nav is a module-level singleton shared across every test in this file —
    // without this, nav.navigate's call history from an earlier test leaks
    // into later toHaveBeenCalledWith assertions.
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockFetchSequence([
      workoutsResponse,
      statsResponse,
      { data: [] },                   // personal-records
      strengthScoreResponse,
    ]);
  });

  // 80.4672 km is exactly 50 miles
  const cardioStats = {
    data: { ...statsResponse.data, cardio_activities: 12, cardio_distance_km: 80.4672, cardio_minutes: 430 },
  };
  const withCardio = () => mockFetchSequence([workoutsResponse, cardioStats, { data: [] }, strengthScoreResponse]);

  it('lists a cardio workout with the time logged, in the user unit', async () => {
    mockFetchSequence([
      { data: { workouts: [{
        id: 2, name: 'Morning Run', date: '2026-05-02T00:00:00', workout_type: 'cardio',
        duration: 1, cardio_duration: 45, distance: 5, distance_unit: 'km',
      }], total: 1, has_more: false } },
      statsResponse, { data: [] }, strengthScoreResponse,
    ]);
    const { findByText, queryByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    // The logging timer said 1 min; 5 km in the default mi
    expect(await findByText('45 min  ·  3.11 mi')).toBeTruthy();
    expect(queryByText(/^1 min/)).toBeNull();
  });

  it('shows the pinned badges under the name and opens the Trophy Hall', async () => {
    const earned = (key: string, title: string) => ({
      key, title, visible: true, earned: true, earned_at: '2026-06-01T00:00:00', workout_id: 1,
      workout_name: 'Push Day', workout_cardio: false, seen: true,
    });
    (fetchAchievements as jest.Mock).mockResolvedValueOnce({
      weight_unit: 'lbs', distance_unit: 'mi', earned_count: 2, total_count: 10, tracks: [],
      feats: [earned('feat_bw_bench', 'Bodyweight Bench'), earned('feat_nostos', 'Nostos')],
      hidden: [], hidden_remaining: 8, unseen: [], pinned: ['feat_nostos'], pins_saved: true,
    });
    const { findByLabelText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(await findByLabelText('Pinned badges: Nostos. Opens the Trophy Hall'));
    expect(nav.navigate).toHaveBeenCalledWith('Achievements');
  });

  it('hides the cardio totals for a user with no cardio', async () => {
    const { getByText, queryByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Total Volume')).toBeTruthy());
    expect(queryByText('Total Distance')).toBeNull();
    expect(queryByText('Activities')).toBeNull();
  });

  it('shows activities and total distance in miles', async () => {
    withCardio();
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Total Distance')).toBeTruthy());
    expect(getByText('12')).toBeTruthy();
    expect(getByText('50 mi')).toBeTruthy();
  });

  it('keeps the cardio totals in the same card as the lifting stats', async () => {
    withCardio();
    const { getByText, getByTestId } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Total Distance')).toBeTruthy());
    const card = getByTestId('profile-stats-card');
    const inCard = (label: string) => card.findAll(n => n.props.children === label).length > 0;
    for (const label of ['Workouts', 'Longest Streak', 'Total Volume', 'Activities', 'Total Distance']) {
      expect(inCard(label)).toBe(true);
    }
  });

  it('shows total distance in km when that is the preference', async () => {
    await AsyncStorage.setItem('gps_distance_unit_1', 'km');
    withCardio();
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('80.5 km')).toBeTruthy());
  });

  it('shows total time instead of distance for time-only cardio', async () => {
    // Machine cardio is often logged as minutes with no distance
    mockFetchSequence([
      workoutsResponse,
      { data: { ...statsResponse.data, cardio_activities: 4, cardio_distance_km: 0, cardio_minutes: 125 } },
      { data: [] },
      strengthScoreResponse,
    ]);
    const { getByText, queryByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Total Time')).toBeTruthy());
    expect(getByText('2h 5m')).toBeTruthy();
    expect(queryByText('Total Distance')).toBeNull();
  });

  describe('workout history view', () => {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    // The calendar fetches alongside the screen, so answer by URL rather than in order
    const routeFetch = () => {
      (global.fetch as jest.Mock) = jest.fn((url: string) => {
        const u = String(url);
        const data = u.includes('/api/workouts/dates') ? { dates: [todayIso] }
          : u.includes('/api/workouts?page=') ? workoutsResponse.data
          : u.includes('/api/stats/profile') ? statsResponse.data
          : u.includes('/api/personal-records') ? []
          : {};
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
      });
    };

    it('swaps the list for the calendar and remembers the choice', async () => {
      routeFetch();
      const { findByText, getByRole, findByTestId, queryByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
      expect(await findByText('Push Day')).toBeTruthy();

      fireEvent.press(getByRole('button', { name: 'Month' }));

      expect(await findByTestId(`calendar-day-${todayIso}`)).toBeTruthy();
      expect(queryByText('Push Day')).toBeNull();
      await waitFor(async () => expect(await AsyncStorage.getItem('profile_history_view_1')).toBe('month'));
    });

    it('opens on the view picked last time', async () => {
      await AsyncStorage.setItem('profile_history_view_1', 'multiyear');
      routeFetch();
      const { findByText, getByRole, queryByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
      expect(await findByText(String(today.getFullYear()))).toBeTruthy();
      expect(getByRole('button', { name: 'All Years' }).props.accessibilityState).toEqual({ selected: true });
      expect(queryByText('Push Day')).toBeNull();
    });

    it('drills from All Years into a year without changing the saved view', async () => {
      await AsyncStorage.setItem('profile_history_view_1', 'multiyear');
      routeFetch();
      const { findByTestId, getByRole } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(await findByTestId(`calendar-year-${today.getFullYear()}`));

      await waitFor(() => expect(getByRole('button', { name: 'Year' }).props.accessibilityState).toEqual({ selected: true }));
      expect(await findByTestId(`calendar-month-${today.getFullYear()}-1`)).toBeTruthy();
      expect(await AsyncStorage.getItem('profile_history_view_1')).toBe('multiyear');
    });

    it('ignores a stored view it does not know', async () => {
      await AsyncStorage.setItem('profile_history_view_1', 'week');
      routeFetch();
      const { findByText, getByRole } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
      expect(await findByText('Push Day')).toBeTruthy();
      expect(getByRole('button', { name: 'List' }).props.accessibilityState).toEqual({ selected: true });
    });
  });

  it('renders without crashing', () => {
    render(<ProfileScreen navigation={nav as any} route={route as any} />);
  });

  it('displays the user display name', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Test User')).toBeTruthy());
  });

  it('shows the Profile section title', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Profile')).toBeTruthy());
  });

  it('shows workout history after fetch', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Push Day')).toBeTruthy());
  });

  it('shows total workouts stat', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('10')).toBeTruthy());
  });

  it('hides the Personal Records box when there are no PRs', async () => {
    const { queryByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(queryByText('10')).toBeTruthy());
    expect(queryByText('Personal Records')).toBeNull();
  });

  it('navigates to the PR Dashboard when the Personal Records box is tapped', async () => {
    mockFetchSequence([workoutsResponse, statsResponse, onePrResponse, strengthScoreResponse]);
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Personal Records')).toBeTruthy());
    fireEvent.press(getByText('Personal Records'));
    expect(nav.navigate).toHaveBeenCalledWith('PRDashboard');
  });

  it('opens the PR editor instead of the PR Dashboard when the pencil is tapped', async () => {
    mockFetchSequence([workoutsResponse, statsResponse, onePrResponse, strengthScoreResponse]);
    const { getByText, getByLabelText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Personal Records')).toBeTruthy());
    fireEvent.press(getByLabelText('Edit displayed PRs'));
    await waitFor(() => expect(getByText('Displayed PRs')).toBeTruthy());
    expect(nav.navigate).not.toHaveBeenCalledWith('PRDashboard');
  });

  describe('displayed PRs', () => {
    const pr = (id: number, name: string, value: number, over: Record<string, unknown> = {}) => ({
      id, exercise_template_id: id, exercise_name: name, pr_type: 'max_weight', value,
      weight_context: null, pr_label: 'Max Weight', achieved_at: '2026-01-01T00:00:00', previous_value: null, ...over,
    });
    const threePrs = [pr(1, 'Bench Press', 245), pr(2, 'Squat', 315), pr(3, 'Deadlift', 405)];
    const fourPrs = [...threePrs, pr(4, 'Overhead Press', 135)];
    const stored = async () => JSON.parse((await AsyncStorage.getItem('@pr_pins_1'))!);
    const serverPin = (id: number) => ({ exercise_template_id: id, pr_type: 'max_weight', weight_context: null });

    // Answers by URL and records each PUT of the pins. pins: null fails that GET, as when offline
    let puts: any[];
    const routeFetch = (
      prs: unknown[],
      pins: { saved: boolean; pins: unknown[] } | null = { saved: false, pins: [] },
      putOk = true,
    ) => {
      puts = [];
      (global.fetch as jest.Mock) = jest.fn((url: string, init?: { method?: string; body?: string }) => {
        const u = String(url);
        const reply = (data: unknown, ok = true) =>
          Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) });
        if (u.includes('/api/personal-records/pins')) {
          if (init?.method === 'PUT') {
            puts.push(JSON.parse(init.body!).pins);
            return reply({}, putOk);
          }
          return pins ? reply(pins) : reply({}, false);
        }
        return reply(u.includes('/api/personal-records') ? prs
          : u.includes('/api/workouts?page=') ? workoutsResponse.data
          : u.includes('/api/stats/profile') ? statsResponse.data
          : {});
      });
    };
    const renderScreen = () => render(<ProfileScreen navigation={nav as any} route={route as any} />);

    it('shows the top three max weights by default without saving them', async () => {
      routeFetch(fourPrs);
      const { findByTestId, getByText, queryByText } = renderScreen();
      expect(await findByTestId('pr-cards-sm')).toBeTruthy();
      expect(getByText('405 lbs')).toBeTruthy();
      expect(queryByText('Overhead Press')).toBeNull();
      expect(await AsyncStorage.getItem('@pr_pins_1')).toBeNull();
      expect(puts).toEqual([]);
    });

    it('fills in for a new account once its first PRs exist', async () => {
      routeFetch([]);
      const first = renderScreen();
      await waitFor(() => expect(first.getByText('10')).toBeTruthy());
      first.unmount();

      routeFetch([pr(1, 'Bench Press', 135)]);
      const { findByTestId, getByText } = renderScreen();
      expect(await findByTestId('pr-cards-lg')).toBeTruthy();
      expect(getByText('135 lbs')).toBeTruthy();
    });

    it('shows the choice the server holds over the phone cache', async () => {
      await AsyncStorage.setItem('@pr_pins_1', JSON.stringify([{ exerciseId: 1, prType: 'max_weight', context: null }]));
      routeFetch(threePrs, { saved: true, pins: [serverPin(3)] });
      const { findByText, queryByText } = renderScreen();
      expect(await findByText('405 lbs')).toBeTruthy();
      expect(queryByText('Bench Press')).toBeNull();
      expect(await stored()).toEqual([{ exerciseId: 3, prType: 'max_weight', context: null }]);
    });

    it('hands a choice made before the server kept one up to it', async () => {
      await AsyncStorage.setItem('@pr_pins_1', JSON.stringify([null, 2, null]));
      routeFetch(threePrs);
      const { findByTestId, getByText, queryByText } = renderScreen();
      expect(await findByTestId('pr-cards-lg')).toBeTruthy();
      expect(getByText('315 lbs')).toBeTruthy();
      expect(queryByText('Bench Press')).toBeNull();
      await waitFor(() => expect(puts).toEqual([[serverPin(2)]]));
    });

    it('grows the cards as PRs are removed, and saves the choice', async () => {
      routeFetch(threePrs);
      const { findByTestId, getByLabelText } = renderScreen();
      await findByTestId('pr-cards-sm');
      fireEvent.press(getByLabelText('Edit displayed PRs'));

      fireEvent.press(getByLabelText('Remove Squat'));
      expect(await findByTestId('pr-cards-md')).toBeTruthy();
      fireEvent.press(getByLabelText('Remove Bench Press'));
      expect(await findByTestId('pr-cards-lg')).toBeTruthy();

      await waitFor(() => expect(puts[puts.length - 1]).toEqual([serverPin(3)]));
      expect(await stored()).toEqual([{ exerciseId: 3, prType: 'max_weight', context: null }]);
    });

    it('reorders', async () => {
      routeFetch(threePrs, { saved: true, pins: [serverPin(1), serverPin(2), serverPin(3)] });
      const { findByTestId, getByLabelText } = renderScreen();
      await findByTestId('pr-cards-sm');
      fireEvent.press(getByLabelText('Edit displayed PRs'));
      expect(getByLabelText('Move Bench Press up').props.accessibilityState).toEqual({ disabled: true });

      fireEvent.press(getByLabelText('Move Deadlift up'));
      await waitFor(() => expect(puts).toEqual([[serverPin(1), serverPin(3), serverPin(2)]]));
    });

    it('adds a PR through the exercise and type pickers, up to three', async () => {
      routeFetch(fourPrs, { saved: true, pins: [serverPin(1)] });
      const { findByTestId, getByLabelText, getByText, getAllByText, queryByText } = renderScreen();
      await findByTestId('pr-cards-lg');
      fireEvent.press(getByLabelText('Edit displayed PRs'));

      const add = (name: string) => {
        fireEvent.press(getByText('Add a PR'));
        fireEvent.press(getByText(name));
        fireEvent.press(getAllByText('Max Weight').slice(-1)[0]);
      };
      add('Squat');
      expect(await findByTestId('pr-cards-md')).toBeTruthy();
      add('Deadlift');
      expect(await findByTestId('pr-cards-sm')).toBeTruthy();

      expect(getByText('3 of 3 chosen.', { exact: false })).toBeTruthy();
      expect(queryByText('Add a PR')).toBeNull();
      await waitFor(() => expect(puts[puts.length - 1]).toEqual([serverPin(1), serverPin(2), serverPin(3)]));
    });

    it('puts the choice back when the server refuses it', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      routeFetch(threePrs, { saved: true, pins: [serverPin(1), serverPin(2)] }, false);
      const { findByTestId, getByLabelText } = renderScreen();
      await findByTestId('pr-cards-md');
      fireEvent.press(getByLabelText('Edit displayed PRs'));
      fireEvent.press(getByLabelText('Remove Squat'));

      await waitFor(() => expect(alert).toHaveBeenCalled());
      expect(await findByTestId('pr-cards-md')).toBeTruthy();
      expect(await stored()).toEqual([
        { exerciseId: 1, prType: 'max_weight', context: null },
        { exerciseId: 2, prType: 'max_weight', context: null },
      ]);
      alert.mockRestore();
    });

    it('drops a pin whose PR is gone, so it frees its slot', async () => {
      await AsyncStorage.setItem('@pr_pins_1', JSON.stringify([
        { exerciseId: 99, prType: 'max_weight', context: null },
        { exerciseId: 1, prType: 'max_weight', context: null },
      ]));
      routeFetch(threePrs, null);
      const { findByTestId, getByLabelText, getByText } = renderScreen();
      expect(await findByTestId('pr-cards-lg')).toBeTruthy();
      fireEvent.press(getByLabelText('Edit displayed PRs'));
      expect(getByText('1 of 3 chosen.', { exact: false })).toBeTruthy();
    });

    it('opens the tapped PR in its progression', async () => {
      routeFetch([pr(1, 'Bench Press', 8, { pr_type: 'max_reps', weight_context: 185, pr_label: 'Max Reps' })],
        { saved: true, pins: [{ exercise_template_id: 1, pr_type: 'max_reps', weight_context: 185 }] });
      const { findByText } = renderScreen();
      fireEvent.press(await findByText('8 reps'));
      expect(nav.navigate).toHaveBeenCalledWith('PRProgression', {
        exerciseTemplateId: 1, exerciseName: 'Bench Press', prType: 'max_reps', weightContext: 185,
      });
      expect(nav.navigate).not.toHaveBeenCalledWith('PRDashboard');
    });

    it('opens the dashboard from See all', async () => {
      routeFetch(threePrs);
      const { findByText } = renderScreen();
      fireEvent.press(await findByText('See all PRs'));
      expect(nav.navigate).toHaveBeenCalledWith('PRDashboard');
    });

    it('shows what a recent PR beat, and calls a recent first PR new', async () => {
      const d = new Date(Date.now() - 2 * 86_400_000);
      const recent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00`;
      routeFetch([
        pr(1, 'Bench Press', 235, { previous_value: 225, achieved_at: recent }),
        pr(2, 'Squat', 315, { achieved_at: recent }),
        // Old: nothing under it
        pr(3, 'Deadlift', 405, { previous_value: 395 }),
      ]);
      const { findByText, getAllByText, queryByText } = renderScreen();
      expect(await findByText('+10 lbs')).toBeTruthy();
      expect(getAllByText('New PR')).toHaveLength(1);
      expect(queryByText(/^\+/)).toBeTruthy();
      expect(getAllByText(/^\+/)).toHaveLength(1);
    });

    it('offers to choose PRs when none are displayed', async () => {
      routeFetch(threePrs, { saved: true, pins: [] });
      const { findByText } = renderScreen();
      fireEvent.press(await findByText('Choose up to 3 PRs to show here'));
      expect(await findByText('Displayed PRs')).toBeTruthy();
    });
  });
});
