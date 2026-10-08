import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute } from './testUtils';
import DashboardScreen from '../screens/DashboardTab/DashboardScreen';
import { appCache } from '../utils/appCache';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const route = createMockRoute('DashboardHome');

const day = (id: number, order: number, label: string) => ({
  id, day_order: order, label, workout_template: { id, name: label, exercises: [] },
});
const PPL = { id: 5, name: 'PPL', days: [day(1, 0, 'Legs'), day(2, 1, 'Push'), day(3, 2, 'Pull')] };

type Data = { history?: any[]; recent?: any[]; profile?: any; routine?: any };

// Routes by URL so each test only states the data it cares about
function mockServer({ history = [], recent = [], profile = {}, routine = PPL }: Data) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const u = String(url);
    const body =
      u.includes('/api/me') ? { id: 1, username: 'tester', email: 't@example.com', active_routine_id: routine ? 5 : null }
      : u.includes('/api/routines/5') ? routine
      : u.includes('per_page=50') ? { workouts: history }
      : u.includes('/api/workouts/recent') ? recent
      : u.includes('/api/workouts/dates') ? { dates: [] }
      : u.includes('/api/stats/profile') ? profile
      : u.includes('/api/stats/weekly-summary') ? { workouts: 0 }
      : [];
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
}

const navigatedPrefillName = (nav: any) =>
  nav.navigate.mock.calls.find((c: any[]) => c[0] === 'WorkoutLog')?.[1]?.prefill?.name;

describe('Home review fixes', () => {
  // Thursday 2026-09-17; the week starts Monday 2026-09-14
  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date(2026, 8, 17, 12),
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate',
        'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
  });
  afterAll(() => jest.useRealTimers());
  beforeEach(async () => {
    await AsyncStorage.clear();
    appCache.clear();
  });

  describe('Up Next follows the rotation', () => {
    it('picks up where last week left off instead of restarting on Monday', async () => {
      mockServer({ history: [
        { id: 11, name: 'Push', date: '2026-09-09T00:00:00' },
        { id: 10, name: 'Legs', date: '2026-09-08T00:00:00' },
      ] });
      const nav = createMockNavigation();
      const { findByText, getAllByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);

      await findByText('Up Next');
      await waitFor(() => {
        fireEvent.press(getAllByText('Log')[0]);
        expect(navigatedPrefillName(nav)).toBe('Pull');
      });
    });

    it('starts over at day 1 after two weeks off, and says so', async () => {
      mockServer({ history: [
        { id: 11, name: 'Push', date: '2026-09-02T00:00:00' },
        { id: 10, name: 'Legs', date: '2026-09-01T00:00:00' },
      ] });
      const nav = createMockNavigation();
      const { findByText, getAllByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);

      await findByText('Up Next · Fresh start');
      fireEvent.press(getAllByText('Log')[0]);
      expect(navigatedPrefillName(nav)).toBe('Legs');
    });

    it('congratulates a finished week and drops the Up Next row', async () => {
      mockServer({ history: [
        { id: 12, name: 'Pull', date: '2026-09-16T00:00:00' },
        { id: 11, name: 'Push', date: '2026-09-15T00:00:00' },
        { id: 10, name: 'Legs', date: '2026-09-14T00:00:00' },
      ] });
      const { findByText, queryByText } = render(<DashboardScreen navigation={createMockNavigation() as any} route={route as any} />);

      expect(await findByText('Nice Job, keep going or take some rest.')).toBeTruthy();
      expect(queryByText('Up Next')).toBeNull();
    });
  });

  it('remembers the streak type picked', async () => {
    mockServer({ routine: null, profile: { current_streak: 2, current_daily_streak: 4, longest_daily_streak: 9 } });
    const first = render(<DashboardScreen navigation={createMockNavigation() as any} route={route as any} />);
    await first.findByText('2wk');
    fireEvent.press(first.getByLabelText('Change streak type'));
    expect(first.getByText('Longest: 9 days')).toBeTruthy();
    fireEvent.press(first.getByText('Daily'));
    first.unmount();

    const second = render(<DashboardScreen navigation={createMockNavigation() as any} route={route as any} />);
    expect(await second.findByText('4d')).toBeTruthy();
  });

  it('shows a cardio workout with the time logged, in the distance unit chosen', async () => {
    mockServer({ routine: null, recent: [{
      id: 3, name: 'Morning Run', workout_type: 'cardio', date: '2026-09-16T00:00:00',
      duration: 1, cardio_duration: 45, distance: 5, distance_unit: 'km',
    }] });
    const { findByText, getByText, queryByText } = render(<DashboardScreen navigation={createMockNavigation() as any} route={route as any} />);

    expect(await findByText('45 min')).toBeTruthy();
    // 5 km in the default mi preference
    expect(getByText('3.11 mi')).toBeTruthy();
    expect(queryByText('1 min')).toBeNull();
  });

  it('greets a new user with a first-workout prompt', async () => {
    mockServer({ routine: null, recent: [] });
    const { findByText } = render(<DashboardScreen navigation={createMockNavigation() as any} route={route as any} />);
    expect(await findByText('No workouts yet')).toBeTruthy();
  });
});
