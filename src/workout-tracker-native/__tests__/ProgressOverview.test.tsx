/**
 * Progress › Overview. It fans out across seven endpoints, so the fake server
 * below answers by path and each test overrides only what it cares about.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, mockUser } from './testUtils';
import ProgressOverview from '../screens/ProgressTab/ProgressOverview';
import { appCache } from '../utils/appCache';
import { WEEKLY_DISTANCE_GOAL_KEY } from '../constants/storageKeys';
import { toLocalDateStr } from '../utils/date';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

// Records what the chart was asked to draw; the real chart can't render here.
const mockBarChart = jest.fn();
jest.mock('react-native-gifted-charts', () => ({
  BarChart: (props: any) => { mockBarChart(props); return null; },
}));

let routes: Record<string, any>;

function installServer(overrides: Record<string, any> = {}) {
  routes = {
    '/api/stats/progress': { buckets: [] },
    '/api/stats/strength-score': { overall: 62, overall_rank: { label: 'Advanced', display: 'Advanced' } },
    '/api/stats/endurance-score': { overall: 55, overall_rank: { label: 'Intermediate', display: 'Intermediate' } },
    '/api/stats/muscle-volume': { muscle_sets: { Chest: 12 }, last_trained: {}, total_sets: 12, last_week_total: 10, week_start: '2026-09-21' },
    '/api/stats/weekly-summary': null,
    ...overrides,
  };
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = Object.entries(routes).find(([p]) => path.startsWith(p))?.[1];
    return Promise.resolve({
      ok: body !== undefined && body !== null,
      status: body == null ? 404 : 200,
      json: () => Promise.resolve(body ?? {}),
    });
  });
}

const urlsCalled = () => (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));

async function renderScreen() {
  const nav = createMockNavigation();
  const utils = render(<ProgressOverview navigation={nav as any} />);
  await act(async () => {});
  return { ...utils, nav };
}

describe('ProgressOverview', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
    installServer();
  });

  describe('scores', () => {
    it('shows both scores side by side with their ranks', async () => {
      const { getByLabelText } = await renderScreen();
      await waitFor(() => expect(getByLabelText(/^Strength Score 62, Advanced/)).toBeTruthy());
      expect(getByLabelText(/^Endurance Score 55, Intermediate/)).toBeTruthy();
    });

    it('opens each score screen from its half of the card', async () => {
      const { getByLabelText, nav } = await renderScreen();
      await waitFor(() => expect(getByLabelText(/^Strength Score 62/)).toBeTruthy());
      fireEvent.press(getByLabelText(/^Strength Score 62/));
      expect(nav.navigate).toHaveBeenCalledWith('StrengthScore');
      fireEvent.press(getByLabelText(/^Endurance Score 55/));
      expect(nav.navigate).toHaveBeenCalledWith('EnduranceScore');
    });

    it("shows how far a score moved against last month's snapshot", async () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 86400000).toISOString();
      installServer({
        '/api/stats/strength-score': {
          overall: 62, overall_rank: { label: 'Advanced' },
          history: [{ date: fortyDaysAgo, score: 58 }],
        },
      });
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('▲ 4 this month')).toBeTruthy());
    });

    it('has no trend until a month of history exists', async () => {
      installServer({
        '/api/stats/strength-score': {
          overall: 62, overall_rank: { label: 'Advanced' },
          history: [{ date: new Date().toISOString(), score: 62 }],
        },
      });
      const { getByLabelText, queryByText } = await renderScreen();
      await waitFor(() => expect(getByLabelText(/^Strength Score 62/)).toBeTruthy());
      expect(queryByText(/this month/)).toBeNull();
    });

    it('keeps the Endurance half, with a prompt, before any run', async () => {
      installServer({ '/api/stats/endurance-score': { overall: null, overall_rank: null } });
      const { getByLabelText, getByText } = await renderScreen();
      await waitFor(() => expect(getByText('Log a run to unlock')).toBeTruthy());
      expect(getByLabelText('Endurance Score. Log a run to unlock')).toBeTruthy();
    });
  });

  describe('progress chart', () => {
    const KM_PER_MI = 1.60934;
    const ALL = { volume: true, sets: true, workouts: true, distance: true };
    // Four empty weeks and this week: 2 workouts, 5 mi.
    const bucket = (label: string, over: object = {}) =>
      ({ label, volume: 0, sets: 0, count: 0, distance_km: 0, ...over });
    const progress = (metrics_logged: object | undefined, thisWeek: object = {}) => ({
      buckets: [bucket('8/25'), bucket('9/1'), bucket('9/8'), bucket('9/15'),
        bucket('9/22', { volume: 5000, sets: 12, count: 2, distance_km: 5 * KM_PER_MI, ...thisWeek })],
      ...(metrics_logged ? { metrics_logged } : {}),
    });
    const lastChart = () => mockBarChart.mock.calls[mockBarChart.mock.calls.length - 1][0];

    it("asks for the 30-day progress once, and fills this week's goal from that answer", async () => {
      installServer({ '/api/stats/progress': progress(ALL) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText(/^2 of \d+ workouts$/)).toBeTruthy());
      expect(urlsCalled().filter(u => u.includes('/api/stats/progress'))).toHaveLength(1);
    });

    it('shows a new user an empty chart with no tabs or range to pick', async () => {
      installServer({ '/api/stats/progress': progress({ volume: false, sets: false, workouts: false, distance: false }) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Start logging to track your progress')).toBeTruthy());
      for (const tab of ['Volume', 'Sets', 'Workouts', 'Distance']) expect(r.queryByText(tab)).toBeNull();
      for (const range of ['30D', '3M', '6M', '1Y']) expect(r.queryByText(range)).toBeNull();
    });

    it('gives a cardio-only user Workouts and Distance, and no lifting tabs', async () => {
      installServer({ '/api/stats/progress': progress({ volume: false, sets: false, workouts: true, distance: true }) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Distance')).toBeTruthy());
      expect(r.queryByText('Volume')).toBeNull();
      expect(r.queryByText('Sets')).toBeNull();
      // Their default Volume pick falls back to the first tab they have
      expect(r.getByText('workouts')).toBeTruthy();
      expect(r.queryByText('lbs')).toBeNull();
    });

    it('charts distance in the user unit on the Distance tab', async () => {
      installServer({ '/api/stats/progress': progress(ALL) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Distance')).toBeTruthy());
      fireEvent.press(r.getByText('Distance'));
      await waitFor(() => expect(r.getByText('mi')).toBeTruthy());
      const values = lastChart().data.map((d: any) => d.value);
      expect(values).toEqual([0, 0, 0, 0, 5]);
    });

    it('gives density its own card instead of a chart tab', async () => {
      installServer({ '/api/stats/progress': progress({ ...ALL, density: true }, { density: 41.6 }) });
      const r = await renderScreen();
      expect(await r.findByText('Workout density')).toBeTruthy();
      expect(r.getByText(/lbs lifted per minute, timed workouts only. Latest 42, average 42./)).toBeTruthy();
      expect(r.queryByText('Density')).toBeNull();
    });

    it('has no density card until a workout was both timed and had volume', async () => {
      installServer({ '/api/stats/progress': progress({ ...ALL, density: false }) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Distance')).toBeTruthy());
      expect(r.queryByText('Workout density')).toBeNull();
    });

    it('keeps the original three tabs against a backend without metrics_logged', async () => {
      installServer({ '/api/stats/progress': progress(undefined) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Volume')).toBeTruthy());
      expect(r.getByText('Sets')).toBeTruthy();
      expect(r.queryByText('Distance')).toBeNull();
      expect(r.queryByText('Start logging to track your progress')).toBeNull();
    });

    it('asks for 3 months when the 3M range is picked', async () => {
      installServer({ '/api/stats/progress': progress(ALL) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('3M')).toBeTruthy());
      fireEvent.press(r.getByText('3M'));
      await waitFor(() => expect(urlsCalled().some(u => u.includes('/api/stats/progress?range=3m'))).toBe(true));
    });

    it('shows a spinner, not "Nothing logged", while a new range loads', async () => {
      installServer({ '/api/stats/progress': progress(ALL) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('3M')).toBeTruthy());
      fireEvent.press(r.getByText('3M'));
      expect(r.queryByText('Nothing logged in this range yet.')).toBeNull();
      expect(r.getByLabelText('Loading chart')).toBeTruthy();
      await waitFor(() => expect(r.queryByLabelText('Loading chart')).toBeNull());
      expect(r.queryByText('Nothing logged in this range yet.')).toBeNull();
    });

    it('ignores a slow answer for a range the user has already left', async () => {
      installServer({ '/api/stats/progress': progress(ALL) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('3M')).toBeTruthy());
      // 3M answers late, with a bucket 6M never has
      let release3m!: () => void;
      const base = (global.fetch as jest.Mock).getMockImplementation()!;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes('range=3m')) {
          return new Promise(res => { release3m = () => res({ ok: true, status: 200, json: () => Promise.resolve(progress(ALL, { volume: 99999 })) }); });
        }
        return base(url);
      });
      fireEvent.press(r.getByText('3M'));
      fireEvent.press(r.getByText('6M'));
      await waitFor(() => expect(r.getByText('5,000')).toBeTruthy());
      await act(async () => { release3m(); });
      expect(r.queryByText('99,999')).toBeNull();
      expect(r.getByText('5,000')).toBeTruthy();
    });

    it('does not refetch when the range already showing is tapped', async () => {
      installServer({ '/api/stats/progress': progress(ALL) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('30D')).toBeTruthy());
      fireEvent.press(r.getByText('30D'));
      await act(async () => {});
      expect(urlsCalled().filter(u => u.includes('/api/stats/progress'))).toHaveLength(1);
    });

    describe('headline', () => {
      const volumes = [8000, 10000, 12000, 10000, 5000];
      const fiveWeeks = () => ({
        buckets: ['8/25', '9/1', '9/8', '9/15', '9/22'].map((label, i) => bucket(label, { volume: volumes[i], sets: 10, count: 2 })),
        metrics_logged: ALL,
      });

      it('leads with this week so far and the earlier average, not a percentage', async () => {
        installServer({ '/api/stats/progress': fiveWeeks() });
        const r = await renderScreen();
        await waitFor(() => expect(r.getByText('5,000')).toBeTruthy());
        expect(r.getByText('lbs')).toBeTruthy();
        expect(r.getByText('this week so far')).toBeTruthy();
        expect(r.getByText('4-week average 10,000')).toBeTruthy();
      });

      it('reads a tapped bar, with its change against the weeks before', async () => {
        installServer({ '/api/stats/progress': fiveWeeks() });
        const r = await renderScreen();
        await waitFor(() => expect(r.getByText('5,000')).toBeTruthy());
        act(() => { lastChart().data[2].onPress(); });
        await waitFor(() => expect(r.getByText('12,000')).toBeTruthy());
        expect(r.getByText('week of 9/8')).toBeTruthy();
        expect(r.getByText('▲ 33% vs the 2 weeks before')).toBeTruthy();
        // Tapping it again goes back to this week
        act(() => { lastChart().data[2].onPress(); });
        await waitFor(() => expect(r.getByText('5,000')).toBeTruthy());
      });

      it('highlights the bar the headline reads and draws no label above it', async () => {
        installServer({ '/api/stats/progress': fiveWeeks() });
        const r = await renderScreen();
        await waitFor(() => expect(r.getByText('5,000')).toBeTruthy());
        const bars = lastChart().data;
        expect(bars.map((b: any) => b.frontColor === bars[4].frontColor)).toEqual([false, false, false, false, true]);
        expect(bars.every((b: any) => b.topLabelComponent === undefined)).toBe(true);
      });
    });
  });

  describe('this week card', () => {
    const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    it("fills today's dot from the workout dates, and not last week's", async () => {
      const today = new Date();
      const lastWeek = new Date(today);
      lastWeek.setDate(today.getDate() - 7);
      installServer({ '/api/workouts/dates': { dates: [toLocalDateStr(lastWeek), toLocalDateStr(today)] } });
      const r = await renderScreen();
      const todayName = DAY_NAMES[(today.getDay() + 6) % 7];
      await waitFor(() => expect(r.getByLabelText(`Trained ${todayName} this week`)).toBeTruthy());
    });

    it('says so when nothing is logged yet this week', async () => {
      installServer({ '/api/workouts/dates': { dates: [] } });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByLabelText('No workouts yet this week')).toBeTruthy());
    });

    it('opens the Weekly Summary from the last week line', async () => {
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Last week')).toBeTruthy());
      fireEvent.press(r.getByText('Last week'));
      expect(r.nav.navigate).toHaveBeenCalledWith('WeeklySummary');
    });
  });

  describe('weekly distance goal', () => {
    const KM_PER_MI = 1.60934;
    const goalKey = `${WEEKLY_DISTANCE_GOAL_KEY}_${mockUser.id}`;
    const withFiveMilesThisWeek = () => installServer({
      '/api/stats/progress': {
        buckets: [{ label: '9/22', volume: 0, sets: 0, count: 1, distance_km: 5 * KM_PER_MI }],
        metrics_logged: { volume: false, sets: false, workouts: true, distance: true },
      },
    });
    const storedMiles = async () => Number(await AsyncStorage.getItem(goalKey)) / KM_PER_MI;

    it('has no distance line until the user turns a goal on', async () => {
      withFiveMilesThisWeek();
      const r = await renderScreen();
      await waitFor(() => expect(r.getByLabelText('Edit weekly goal')).toBeTruthy());
      expect(r.queryByTestId('distance-goal-fill')).toBeNull();
    });

    it('fills the line toward a saved goal', async () => {
      withFiveMilesThisWeek();
      await AsyncStorage.setItem(goalKey, String(10 * KM_PER_MI));
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('5 / 10 mi')).toBeTruthy());
      expect(r.getByTestId('distance-goal-fill').props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: '50%' })]),
      );
    });

    it('saves the goal in km from the switch, the +5 button and typed input', async () => {
      withFiveMilesThisWeek();
      const r = await renderScreen();
      await waitFor(() => expect(r.getByLabelText('Edit weekly goal')).toBeTruthy());
      fireEvent.press(r.getByLabelText('Edit weekly goal'));

      fireEvent(r.getByTestId('distance-goal-switch'), 'valueChange', true);
      await waitFor(async () => expect(await storedMiles()).toBeCloseTo(10, 5));

      fireEvent.press(r.getByLabelText('Increase distance goal by 5'));
      await waitFor(async () => expect(await storedMiles()).toBeCloseTo(15, 5));

      fireEvent.changeText(r.getByTestId('distance-goal-input'), '12.5');
      fireEvent(r.getByTestId('distance-goal-input'), 'endEditing');
      await waitFor(async () => expect(await storedMiles()).toBeCloseTo(12.5, 5));

      fireEvent(r.getByTestId('distance-goal-switch'), 'valueChange', false);
      await waitFor(async () => expect(await AsyncStorage.getItem(goalKey)).toBeNull());
    });
  });

  describe('muscle volume zones (Monday to Sunday)', () => {
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return toLocalDateStr(d);
    };
    const withChest = (sets: number, weekStart: string) => installServer({
      '/api/stats/muscle-volume': { muscle_sets: { Chest: sets }, last_trained: {}, total_sets: sets, last_week_total: 0, week_start: weekStart },
    });

    it('counts down to MEV while the week is still going', async () => {
      withChest(6, daysAgo(0)); // the week started today, so it has six days left
      const r = await renderScreen();
      expect(await r.findByText('2 to go')).toBeTruthy();
      expect(r.queryByText('Below target')).toBeNull();
    });

    it('gives the verdict on Sunday', async () => {
      withChest(6, daysAgo(6)); // today is the week's seventh day
      const r = await renderScreen();
      expect(await r.findByText('Below target')).toBeTruthy();
    });

    describe('premium views of the muscle chart', () => {
      const trends = () => installServer({
        '/api/stats/muscle-volume': {
          muscle_sets: { Chest: 12, Back: 10 }, last_trained: {}, total_sets: 22, last_week_total: 0, week_start: daysAgo(0),
          session_count: { Chest: 2, Back: 1 },
          weekly_history: { Chest: [6, 8, 12, 14], Back: [10, 10, 10, 10] },
        },
      });

      it('opens on Zones, with no explanatory sentence over the chart', async () => {
        trends();
        const r = await renderScreen();
        expect(await r.findByText('Zones')).toBeTruthy();
        expect(r.getByText('Frequency')).toBeTruthy();
        expect(r.getByText('Trend')).toBeTruthy();
        expect(r.queryByText(/Twice a week gains the most/)).toBeNull();
        expect(r.queryByText(/MEV/)).toBeNull();
      });

      it('shows how often each muscle was trained on Frequency', async () => {
        trends();
        const r = await renderScreen();
        fireEvent.press(await r.findByText('Frequency'));
        expect(await r.findByText('2×')).toBeTruthy();
        expect(r.getByText('1×')).toBeTruthy();
        expect(r.getByText('On target')).toBeTruthy();
        expect(r.getByText('Add a day')).toBeTruthy();
        expect(r.getByLabelText('Chest trained 2 days this week')).toBeTruthy();
        expect(r.getByLabelText('Back trained 1 day this week')).toBeTruthy();
      });

      it('shows where each muscle is heading on Trend', async () => {
        trends();
        const r = await renderScreen();
        fireEvent.press(await r.findByText('Trend'));
        expect(await r.findByText('Up')).toBeTruthy();
        expect(r.getByText('Steady')).toBeTruthy();
        expect(r.getByLabelText('Chest trend Up')).toBeTruthy();
        expect(r.getByLabelText('Back trend Steady')).toBeTruthy();
      });
    });

    it('calls reaching MRV the limit, and only past it over', async () => {
      withChest(20, daysAgo(0));
      const r = await renderScreen();
      expect(await r.findByText('At limit')).toBeTruthy();
      expect(r.queryByText('Over limit')).toBeNull();
    });
  });
});
