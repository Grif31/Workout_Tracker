import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueWorkout, flushQueue, initPendingCount } from '../utils/offlineQueue';
import { registerToastCallback } from '../utils/toast';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import DashboardScreen from '../screens/DashboardTab/DashboardScreen';

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
  const saveLayout = (order: string[], hidden: string[] = []) =>
    AsyncStorage.setItem('dashboard_layout_1', JSON.stringify({ order, hidden }));

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

  it('keeps every card when nothing is hidden', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Recent Workouts')).toBeTruthy());
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
    // Tapping a day filters the list; with the calendar gone there'd be no way
    // to clear it, so the list goes back to recent workouts
    const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(r.getByText('Recent Workouts')).toBeTruthy());
    const today = new Date();
    fireEvent.press(r.getByText(String(today.getDate())));
    await waitFor(() => expect(r.queryByText('Recent Workouts')).toBeNull());

    // Hide the calendar and reopen the screen: the filter must not survive
    await saveLayout(['activeRoutine', 'weekCalendar', 'workouts'], ['weekCalendar']);
    cleanup();
    mockFetchSequence([{ data: mockUser }, { data: mockWorkouts }, { data: mockStats }]);
    const after = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(after.getByText('Recent Workouts')).toBeTruthy());
    expect(after.getByText('Push Day')).toBeTruthy();
  });

  describe('arrange mode', () => {
    const enterArrangeMode = async () => {
      const r = render(<DashboardScreen navigation={nav as any} route={route as any} />);
      await waitFor(() => expect(r.getByLabelText('Arrange Home')).toBeTruthy());
      fireEvent.press(r.getByLabelText('Arrange Home'));
      await waitFor(() => expect(r.getByText('Arrange your Home')).toBeTruthy());
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
      fireEvent.press(r.getByLabelText('Done arranging Home'));

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
          order: ['activeRoutine', 'weekCalendar', 'workouts'],
          hidden: [],
        }));
    });
  });

  it('renders without crashing', () => {
    render(<DashboardScreen navigation={nav as any} route={route as any} />);
  });

  it('shows a greeting with username', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/testuser/i)).toBeTruthy());
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
});
