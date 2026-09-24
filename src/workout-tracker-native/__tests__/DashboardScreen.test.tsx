import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueWorkout, flushQueue, initPendingCount } from '../utils/offlineQueue';
import { registerToastCallback } from '../utils/toast';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import DashboardScreen from '../screens/DashboardTab/DashboardScreen';
import { appCache } from '../utils/appCache';

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

describe('DashboardScreen', () => {
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

  it('keeps every card when nothing is hidden', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Recent Workouts')).toBeTruthy());
  });

  it('shows the streak as plain text with no chip or flame', async () => {
    const { getByText, queryByText, getByLabelText, getByTestId } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Streak')).toBeTruthy());
    expect(getByText(/^\d+wk$/)).toBeTruthy();
    expect(queryByText('🔥')).toBeNull();
    // A drawn flame, not the emoji
    expect(getByTestId('streak-flame')).toBeTruthy();
    // Tapping it still opens the day/week/month picker
    fireEvent.press(getByLabelText('Change streak type'));
    await waitFor(() => expect(getByText('Weekly')).toBeTruthy());
  });

  it('renders without crashing', () => {
    render(<DashboardScreen navigation={nav as any} route={route as any} />);
  });

  it('shows a greeting with username', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/testuser/i)).toBeTruthy());
  });

  describe('greeting name right after login', () => {
    // Every request hangs, so anything on screen came from what was already in
    // hand at mount, not from the Dashboard's own /api/me.
    beforeEach(() => {
      (global.fetch as jest.Mock) = jest.fn(() => new Promise(() => {}));
    });
    afterEach(() => appCache.clear());

    it('shows the name from the preloaded profile without waiting on its own request', () => {
      appCache.set('me', { id: 1, username: 'preloaded', email: 'p@example.com', name: 'Preloaded Person' });
      const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      // Name spaces render as non-breaking, so match any single character.
      expect(getByText(/Preloaded.Person/)).toBeTruthy();
    });

    it('falls back to the logged-in user when its profile request fails', async () => {
      // Nothing preloaded, and /api/me errors: login already returned the name.
      (global.fetch as jest.Mock) = jest.fn((url: string) => Promise.resolve(
        String(url).includes('/api/me')
          ? { ok: false, status: 500, json: () => Promise.resolve({}) }
          : { ok: true, status: 200, json: () => Promise.resolve([]) },
      ));
      const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(getByText(/Test.User/)).toBeTruthy());
    });
  });

  it('shows the Log Workout button', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/log workout/i)).toBeTruthy());
  });

  it('shows recent workout name after fetch', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Push Day')).toBeTruthy());
  });

  it('shows the Track Activity button', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Track Activity')).toBeTruthy());
  });

  describe('workouts waiting to upload', () => {
    afterEach(async () => {
      await AsyncStorage.clear();
      await initPendingCount();
    });

    it('shows nothing when the offline queue is empty', async () => {
      const { getByText, queryByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(getByText('Push Day')).toBeTruthy());
      expect(queryByText(/waiting to upload/)).toBeNull();
    });

    it('explains queued workouts and clears once they sync', async () => {
      await AsyncStorage.setItem('user', JSON.stringify({ id: 1 }));
      await enqueueWorkout({ workoutName: 'Offline Legs' });

      const { getByText, queryByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(getByText('1 workout waiting to upload')).toBeTruthy());
      expect(getByText(/upload automatically when you're back online, then show up in your history/)).toBeTruthy();

      await act(async () => { await enqueueWorkout({ workoutName: 'Offline Arms' }); });
      expect(getByText('2 workouts waiting to upload')).toBeTruthy();

      (global.fetch as jest.Mock) = jest.fn(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) }));
      await act(async () => { await flushQueue(); });
      expect(queryByText(/waiting to upload/)).toBeNull();
    });

    describe('Try Now', () => {
      const toasts: string[] = [];
      beforeEach(async () => {
        toasts.length = 0;
        registerToastCallback(msg => toasts.push(msg));
        await AsyncStorage.setItem('user', JSON.stringify({ id: 1 }));
        await enqueueWorkout({ workoutName: 'Offline Legs' });
      });
      afterEach(() => registerToastCallback(() => {}));

      const queueResponse = (resp: any) => {
        (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) =>
          String(url).endsWith('/api/workouts') && init.method === 'POST'
            ? resp()
            : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }));
      };

      it('uploads queued workouts and removes the card', async () => {
        const { getByText, queryByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
        await waitFor(() => expect(getByText('Try Now')).toBeTruthy());

        queueResponse(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 5 }) }));
        await act(async () => { fireEvent.press(getByText('Try Now')); });

        await waitFor(() => expect(queryByText(/waiting to upload/)).toBeNull());
        expect(toasts).toEqual(['1 workout synced']);
      });

      it('keeps the card and says so when the upload fails', async () => {
        const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
        await waitFor(() => expect(getByText('Try Now')).toBeTruthy());

        queueResponse(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));
        await act(async () => { fireEvent.press(getByText('Try Now')); });

        await waitFor(() => expect(toasts).toContain("Couldn't upload right now. It's still saved on this phone and will keep trying."));
        expect(getByText('1 workout waiting to upload')).toBeTruthy();
        expect(getByText('Try Now')).toBeTruthy();
      });

      it('shows a spinner and ignores taps while uploading', async () => {
        const { getByText, queryByText, getByLabelText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
        await waitFor(() => expect(getByText('Try Now')).toBeTruthy());

        let finish: () => void = () => {};
        queueResponse(() => new Promise(r => { finish = () => r({ ok: true, status: 201, json: () => Promise.resolve({}) }); }));
        await act(async () => { fireEvent.press(getByText('Try Now')); });
        expect(queryByText('Try Now')).toBeNull();
        expect(getByLabelText('Try uploading now')).toBeDisabled();

        await act(async () => { finish(); });
        await waitFor(() => expect(queryByText(/waiting to upload/)).toBeNull());
        const posts = (global.fetch as jest.Mock).mock.calls.filter(([u, i]) => String(u).endsWith('/api/workouts') && i?.method === 'POST');
        expect(posts).toHaveLength(1);
      });
    });
  });
  describe('cardio this week', () => {
    // Positional mocks can't place the profile response reliably here: the
    // streak fetch reads AsyncStorage before it calls the API, so it lands
    // after the others. Route by URL instead.
    const mockFetchByUrl = (profile: Record<string, unknown>) => {
      (global.fetch as jest.Mock) = jest.fn((url: string) => {
        const u = String(url);
        const data = u.includes('/api/stats/profile') ? profile
          : u.includes('/api/me') ? mockUser
          : u.includes('/api/workouts/dates') ? { dates: [] }
          : u.includes('/api/workouts') ? mockWorkouts
          : mockStats;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
      });
    };

    const withCardio = (over: Record<string, unknown> = {}) => ({
      current_streak: 1, cardio_activities: 12,
      week_cardio_activities: 3, week_cardio_distance_km: 16.0934, week_cardio_minutes: 95,
      ...over,
    });

    it('shows the week distance in the saved unit', async () => {
      mockFetchByUrl(withCardio());
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Cardio This Week')).toBeTruthy());
      expect(r.getByText('10')).toBeTruthy();   // 16.0934 km -> 10 mi, the default
      expect(r.getByText('miles')).toBeTruthy();
      expect(r.getByText('1h 35m')).toBeTruthy();
      expect(r.getByText('3')).toBeTruthy();
      expect(r.getByText('activities')).toBeTruthy();
    });

    it('shows km when that is the saved preference', async () => {
      await AsyncStorage.setItem('gps_distance_unit_1', 'km');
      mockFetchByUrl(withCardio());
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('km')).toBeTruthy());
      expect(r.getByText('16.1')).toBeTruthy();
    });

    it('stays off Home for someone who has never logged cardio', async () => {
      mockFetchByUrl(withCardio({ cardio_activities: 0, week_cardio_activities: 0, week_cardio_distance_km: 0, week_cardio_minutes: 0 }));
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());
      expect(r.queryByText('Cardio This Week')).toBeNull();
    });

    it('says nothing is logged yet for a cardio user with a quiet week', async () => {
      mockFetchByUrl(withCardio({ week_cardio_activities: 0, week_cardio_distance_km: 0, week_cardio_minutes: 0 }));
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Nothing logged since Monday')).toBeTruthy());
    });

    it('drops the distance column when the week was all machine time', async () => {
      mockFetchByUrl(withCardio({ week_cardio_distance_km: 0, week_cardio_activities: 2, week_cardio_minutes: 45 }));
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Cardio This Week')).toBeTruthy());
      expect(r.queryByText('miles')).toBeNull();
      expect(r.getByText('45m 0s')).toBeTruthy();
    });
  });

  describe('while Home customization is held back', () => {
    const profile = {
      current_streak: 1, this_week_count: 2,
      cardio_activities: 9, week_cardio_activities: 3,
      week_cardio_distance_km: 16.0934, week_cardio_minutes: 95,
    };

    const mockFetchByUrl = () => {
      (global.fetch as jest.Mock) = jest.fn((url: string) => {
        const u = String(url);
        const data = u.includes('/api/stats/profile') ? profile
          : u.includes('/api/stats/greek-rank') ? { greek_rank: 'Hero', greek_score: 38 }
          : u.includes('/api/me') ? mockUser
          : u.includes('/api/workouts/dates') ? { dates: [] }
          : u.includes('/api/workouts') ? mockWorkouts
          : mockStats;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
      });
    };

    beforeEach(mockFetchByUrl);

    it('offers no way into arrange mode', async () => {
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());
      expect(r.queryByLabelText('Customize your dashboard')).toBeNull();
    });

    it('shows the fixed cards in the fixed order', async () => {
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Cardio This Week')).toBeTruthy());
      const texts = textsInOrder(r.toJSON());
      // 'This Week' is the calendar's header
      expect(texts.indexOf('Cardio This Week')).toBeLessThan(texts.indexOf('This Week'));
      expect(texts.indexOf('This Week')).toBeLessThan(texts.indexOf('Recent Workouts'));
    });

    it('leaves out the held-back widgets and never fetches the rank for them', async () => {
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Cardio This Week')).toBeTruthy());
      expect(r.queryByText('Weekly Goal')).toBeNull();
      expect(r.queryByText('Greek Rank')).toBeNull();
      const rankCalls = (global.fetch as jest.Mock).mock.calls
        .filter(([u]) => String(u).includes('/api/stats/greek-rank'));
      expect(rankCalls).toHaveLength(0);
    });

    it('ignores a saved layout, so a card hidden earlier cannot get stuck hidden', async () => {
      // Arrange mode existed before this build: someone may have hidden a card
      // or narrowed one. With no button left to undo that, it must not apply.
      const saved = { order: ['workouts', 'weekCalendar', 'weekCardio'], hidden: ['workouts', 'weekCalendar'], sizes: { weekCardio: 'half' } };
      await AsyncStorage.setItem('dashboard_layout_1', JSON.stringify(saved));

      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());
      expect(r.getByText('This Week')).toBeTruthy();
      // Full width: the three-column breakdown, not the compact subline
      expect(r.getByText('time')).toBeTruthy();
      expect(r.queryByText('3 activities · 1h 35m')).toBeNull();
      // Left in storage, so it comes back when customization does
      expect(JSON.parse((await AsyncStorage.getItem('dashboard_layout_1'))!)).toEqual(saved);
    });
  });
});
