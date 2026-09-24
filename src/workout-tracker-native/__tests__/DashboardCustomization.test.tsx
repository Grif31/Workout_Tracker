import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueWorkout, flushQueue, initPendingCount } from '../utils/offlineQueue';
import { registerToastCallback } from '../utils/toast';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import DashboardScreen from '../screens/DashboardTab/DashboardScreen';

// Home customization ships dark (HOME_CUSTOMIZATION_ENABLED is false) until
// arrange mode is rebuilt as press-and-hold drag. These tests keep the finished
// pieces honest in the meantime, so flipping the flag back on turns on working
// code rather than code that rotted while nobody could reach it.
jest.mock('../constants/dashboardCards', () => ({
  ...jest.requireActual('../constants/dashboardCards'),
  HOME_CUSTOMIZATION_ENABLED: true,
}));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const nav = createMockNavigation();
const route = createMockRoute('DashboardHome');

const mockUser = { id: 1, username: 'testuser', email: 'test@example.com', active_routine_id: null };
const mockStats = {
  weekly: [{ label: 'W1', volume: 5000, count: 3 }],
  last_7_days: { workouts: 3, volume: 5000, sets: 30 },
  this_week_dates: ['2026-04-28', '2026-04-29'],
};
const mockWorkouts = [
  { id: 1, name: 'Push Day', date: '2026-05-01T10:00:00', notes: '', duration: 60, volume: 2000, num_exercises: 3, muscles: [] },
];

describe('DashboardScreen customization', () => {
  beforeEach(async () => {
    // Per-user keys (the saved Home layout) would otherwise leak between tests
    await AsyncStorage.clear();
    mockFetchSequence([
      { data: mockUser },     // fetchUser
      { data: mockWorkouts }, // fetchRecentWorkouts
      { data: mockStats },    // fetchDashStats
    ]);
  });

  // Customize Home: the Dashboard renders cards in the saved order, minus hidden
  const saveLayout = (order: string[], hidden: string[] = [], sizes: Record<string, string> = {}) =>
    AsyncStorage.setItem('dashboard_layout_1', JSON.stringify({ order, hidden, sizes }));

  // Text in render order. toJSON can't be JSON.stringify'd (refreshControl
  // holds a circular fiber reference), so walk it instead.
  const textsInOrder = (node: any, out: string[] = []): string[] => {
    if (node == null) return out;
    if (typeof node === 'string') { out.push(node); return out; }
    if (Array.isArray(node)) { node.forEach(n => textsInOrder(n, out)); return out; }
    if (node.children) node.children.forEach((c: any) => textsInOrder(c, out));
    return out;
  };

  it('hides a card the user turned off', async () => {
    await saveLayout(['activeRoutine', 'weekCalendar', 'workouts'], ['workouts']);
    const { getByText, queryByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    // The layout loads from storage after mount, so wait for it to apply
    await waitFor(() => expect(queryByText('Recent Workouts')).toBeNull());
    expect(getByText(/log workout/i)).toBeTruthy();
    expect(queryByText('Push Day')).toBeNull();
  });

  it('renders cards in the saved order', async () => {
    await saveLayout(['workouts', 'weekCalendar', 'activeRoutine']);
    const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());

    // 'This Week' belongs to the calendar, which this order puts last
    await waitFor(() => {
      const texts = textsInOrder(r.toJSON());
      expect(texts.indexOf('Recent Workouts')).toBeLessThan(texts.indexOf('This Week'));
    });
  });

  it('drops the day filter when the calendar is hidden', async () => {
    // Tapping a day filters the list. Hiding the calendar in arrange mode takes
    // away the only control that clears it, so the list must fall back to
    // recent workouts on the same mounted screen, not stay stuck on the day.
    // Routed by URL: a positional mock served the stats object to the day's
    // request, which crashed the render, and the crash's blank screen
    // satisfied the old "Recent Workouts is gone" assertion on its own.
    (global.fetch as jest.Mock) = jest.fn((url: string) => {
      const u = String(url);
      const data = u.includes('/api/me') ? mockUser
        : u.includes('/api/workouts/dates') ? { dates: [] }
        : u.includes('/api/workouts?date=') ? []
        : u.includes('/api/workouts') ? mockWorkouts
        : mockStats;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
    });

    const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());
    fireEvent.press(r.getByText(String(new Date().getDate())));
    await waitFor(() => expect(r.getByText('No workouts on this day')).toBeTruthy());

    fireEvent.press(r.getByLabelText('Customize your dashboard'));
    await waitFor(() => expect(r.getByText('Customize your dashboard')).toBeTruthy());
    fireEvent.press(r.getByLabelText('Hide Week Calendar on Home'));
    fireEvent.press(r.getByLabelText('Done customizing dashboard'));

    await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());
    expect(r.getByText('Push Day')).toBeTruthy();
    expect(r.queryByText('No workouts on this day')).toBeNull();
  });

  describe('arrange mode', () => {
    const enterArrangeMode = async () => {
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByLabelText('Customize your dashboard')).toBeTruthy());
      fireEvent.press(r.getByLabelText('Customize your dashboard'));
      await waitFor(() => expect(r.getByText('Customize your dashboard')).toBeTruthy());
      return r;
    };

    it('swaps the cards for chips in place, without leaving Home', async () => {
      const r = await enterArrangeMode();
      // Still on Home: the fixed actions stay put
      expect(r.getAllByText(/log workout/i).length).toBeGreaterThan(0);
      expect(nav.navigate).not.toHaveBeenCalled();
      // Cards give way to one chip each
      expect(r.getByTestId('arrange-row-activeRoutine')).toBeTruthy();
      expect(r.getByTestId('arrange-row-weekCalendar')).toBeTruthy();
      expect(r.getByTestId('arrange-row-workouts')).toBeTruthy();
      expect(r.queryByText('Push Day')).toBeNull();
    });

    it('hides a card and brings the rest back on Done', async () => {
      const r = await enterArrangeMode();
      fireEvent.press(r.getByLabelText('Hide Recent Workouts on Home'));
      fireEvent.press(r.getByLabelText('Done customizing dashboard'));

      await waitFor(() => expect(r.getByText(/log workout/i)).toBeTruthy());
      expect(r.queryByText('Recent Workouts')).toBeNull();
      expect(r.queryByText('Push Day')).toBeNull();
      expect(JSON.parse((await AsyncStorage.getItem('dashboard_layout_1'))!).hidden).toEqual(['workouts']);
    });

    it('restores the default layout from Reset', async () => {
      await saveLayout(['workouts', 'weekCalendar', 'activeRoutine'], ['workouts']);
      const r = await enterArrangeMode();
      fireEvent.press(r.getByText('Reset'));

      await waitFor(async () =>
        expect(JSON.parse((await AsyncStorage.getItem('dashboard_layout_1'))!)).toEqual({
          order: ['activeRoutine', 'weeklyGoal', 'greekRank', 'weekCardio', 'weekCalendar', 'workouts'],
          hidden: [],
          sizes: {},
        }));
    });
  });

  describe('card sizes', () => {
    const profile = {
      current_streak: 1, this_week_count: 2,
      cardio_activities: 9, week_cardio_activities: 3,
      week_cardio_distance_km: 16.0934, week_cardio_minutes: 95,
    };

    const mockFetchByUrl = () => {
      (global.fetch as jest.Mock) = jest.fn((url: string) => {
        const u = String(url);
        const data = u.includes('/api/stats/profile') ? profile
          : u.includes('/api/stats/greek-rank') ? { greek_rank: 'Hero', greek_score: 38, held_by_gate: false }
          : u.includes('/api/me') ? mockUser
          : u.includes('/api/workouts/dates') ? { dates: [] }
          : u.includes('/api/workouts') ? mockWorkouts
          : mockStats;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
      });
    };

    beforeEach(mockFetchByUrl);

    const openArrange = async () => {
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByLabelText('Customize your dashboard')).toBeTruthy());
      fireEvent.press(r.getByLabelText('Customize your dashboard'));
      await waitFor(() => expect(r.getByText('Customize your dashboard')).toBeTruthy());
      return r;
    };

    it('offers a width only for cards that have a compact variant', async () => {
      const r = await openArrange();
      expect(r.getByTestId('arrange-size-weekCardio-half')).toBeTruthy();
      expect(r.getByTestId('arrange-size-activeRoutine-half')).toBeTruthy();
      // Seven day columns and a list of workouts have no half-width rendering
      expect(r.queryByTestId('arrange-size-weekCalendar-half')).toBeNull();
      expect(r.queryByTestId('arrange-size-workouts-half')).toBeNull();
    });

    it('saves the width the user picks', async () => {
      const r = await openArrange();
      fireEvent.press(r.getByTestId('arrange-size-weekCardio-half'));
      await waitFor(async () =>
        expect(JSON.parse((await AsyncStorage.getItem('dashboard_layout_1'))!).sizes)
          .toEqual({ weekCardio: 'half' }));
    });

    it('renders the cardio card compactly at half width', async () => {
      await saveLayout(['weekCardio', 'weekCalendar', 'workouts'], [], { weekCardio: 'half' });
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Cardio This Week')).toBeTruthy());
      // The number stays; the three-column breakdown gives way to one subline
      expect(r.getByText('10')).toBeTruthy();
      expect(r.getByText('3 activities · 1h 35m')).toBeTruthy();
      expect(r.queryByText('time')).toBeNull();
    });

    it('keeps the three-column breakdown at full width', async () => {
      await saveLayout(['weekCardio', 'workouts'], [], { weekCardio: 'full' });
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Cardio This Week')).toBeTruthy());
      expect(r.getByText('time')).toBeTruthy();
      expect(r.getByText('activities')).toBeTruthy();
      expect(r.queryByText('3 activities · 1h 35m')).toBeNull();
    });

    it('still renders the rest of Home when a card is half width', async () => {
      await saveLayout(['activeRoutine', 'weekCardio', 'workouts'], [], { weekCardio: 'half' });
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());
      expect(r.getByText('Push Day')).toBeTruthy();
      expect(r.getByText('Cardio This Week')).toBeTruthy();
    });
  });

  describe('weekly goal and greek rank widgets', () => {
    const profileWith = (over: Record<string, unknown> = {}) => ({
      current_streak: 1, this_week_count: 2, cardio_activities: 0,
      week_cardio_activities: 0, week_cardio_distance_km: 0, week_cardio_minutes: 0,
      ...over,
    });

    const mockFetchByUrl = (profile: Record<string, unknown>, greek: Record<string, unknown> | null) => {
      (global.fetch as jest.Mock) = jest.fn((url: string) => {
        const u = String(url);
        if (u.includes('/api/stats/greek-rank') && greek === null) {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        }
        const data = u.includes('/api/stats/profile') ? profile
          : u.includes('/api/stats/greek-rank') ? greek
          : u.includes('/api/me') ? mockUser
          : u.includes('/api/workouts/dates') ? { dates: [] }
          : u.includes('/api/workouts') ? mockWorkouts
          : mockStats;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
      });
    };

    it('counts this week against the saved goal', async () => {
      await AsyncStorage.setItem('workout_weekly_goal_1', '4');
      mockFetchByUrl(profileWith({ this_week_count: 2 }), { greek_rank: 'Hero', greek_score: 38 });
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Weekly Goal')).toBeTruthy());
      expect(r.getByText('2')).toBeTruthy();
      expect(r.getByText('/4')).toBeTruthy();
      expect(r.getByText('2 to go')).toBeTruthy();
    });

    it('says the goal is met once it is reached', async () => {
      await AsyncStorage.setItem('workout_weekly_goal_1', '3');
      mockFetchByUrl(profileWith({ this_week_count: 3 }), { greek_rank: 'Hero', greek_score: 38 });
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Goal met')).toBeTruthy());
    });

    it('shows the rank and how far it is to the next', async () => {
      mockFetchByUrl(profileWith(), { greek_rank: 'Hero', greek_score: 38, held_by_gate: false });
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      // Hero spans 28-48, so 38 leaves 10 points to Demigod
      await waitFor(() => expect(r.getByText('Hero')).toBeTruthy());
      expect(r.getByText('10 to Demigod')).toBeTruthy();
    });

    it('says a gated rank needs a score, not more points', async () => {
      mockFetchByUrl(profileWith(), { greek_rank: 'Olympian', greek_score: 84, held_by_gate: true });
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Olympian')).toBeTruthy());
      expect(r.getByText('Titan needs a score')).toBeTruthy();
    });

    it('falls back to the cached rank when the request fails', async () => {
      await AsyncStorage.setItem('greek_rank_cached', 'Demigod');
      mockFetchByUrl(profileWith(), null);
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Demigod')).toBeTruthy());
    });
  });
});
