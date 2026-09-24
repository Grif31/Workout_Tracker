/**
 * Coach tab home. It fans out across nine endpoints, so the fake server below
 * answers by path and each test overrides only what it cares about.
 *
 * The behaviours that matter here: which tab opens first, that the Greek rank
 * comes from its own endpoint (strength-score 422s without gender), that
 * logging a template goes through buildTemplatePrefill with initial: false,
 * and that cached AI insights render without a network call.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute, mockUser } from './testUtils';
import CoachScreen from '../screens/TrainingTab/CoachScreen';
import { appCache } from '../utils/appCache';
import Collapsible from '../components/Collapsible';
import { COACH_INSIGHTS_KEY, WEEKLY_DISTANCE_GOAL_KEY } from '../constants/storageKeys';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

// Records what the chart was asked to draw; the real chart can't render here.
const mockBarChart = jest.fn();
jest.mock('react-native-gifted-charts', () => ({
  BarChart: (props: any) => { mockBarChart(props); return null; },
}));

const route = createMockRoute('CoachHome');

const TEMPLATE = {
  id: 7,
  name: 'Push Day',
  programming_json: JSON.stringify([{ exercise_template_id: 3, sets: 4, reps: '8', rpe: 8 }]),
  exercises: [{ id: 3, name: 'Bench Press', muscle_group: 'Chest', equipment: 'Barbell', image_url: 'http://x/bench.gif' }],
};

let routes: Record<string, any>;

function installServer(overrides: Record<string, any> = {}) {
  routes = {
    '/api/stats/progress': { buckets: [] },
    '/api/workout-templates': [TEMPLATE],
    '/api/routines': [],
    '/api/stats/strength-score': { overall: 62, overall_rank: { label: 'Advanced', display: 'Advanced' } },
    '/api/stats/endurance-score': { overall: 55, overall_rank: { label: 'Intermediate', display: 'Intermediate' } },
    '/api/stats/greek-rank': { greek_rank: 'Hero', greek_score: 40 },
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
  const utils = render(<CoachScreen navigation={nav as any} route={route as any} />);
  await act(async () => {});
  return { ...utils, nav };
}

describe('CoachScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
    installServer();
  });

  it('opens on Progress, with all three tabs available', async () => {
    const { getByText } = await renderScreen();
    await waitFor(() => expect(getByText('Progress')).toBeTruthy());
    expect(getByText('Training')).toBeTruthy();
    expect(getByText('Coach')).toBeTruthy();
  });

  describe('scores and rank', () => {
    it('reads the Greek rank from its own endpoint, which needs no gender', async () => {
      await renderScreen();
      await waitFor(() => expect(urlsCalled().some(u => u.includes('/api/stats/greek-rank'))).toBe(true));
    });

    it('still shows the rank when the strength score is gated on a missing profile', async () => {
      // strength-score 422s without gender; the rank must survive that
      installServer({ '/api/stats/strength-score': null });
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('Coach')).toBeTruthy());
      fireEvent.press(getByText('Coach'));
      await waitFor(() => expect(getByText('Hero')).toBeTruthy());
    });

    it('shows both score percentiles', async () => {
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('62')).toBeTruthy());
      expect(getByText('55')).toBeTruthy();
    });

    it('opens the Strength Score screen from the score card', async () => {
      const { getByText, nav } = await renderScreen();
      await waitFor(() => expect(getByText('62')).toBeTruthy());
      fireEvent.press(getByText('62'));
      expect(nav.navigate).toHaveBeenCalledWith('StrengthScore');
    });
  });

  describe('training tab', () => {
    const openTraining = async (r: any) => {
      fireEvent.press(r.getByText('Training'));
      await waitFor(() => expect(r.getByText('Push Day')).toBeTruthy());
    };

    it('lists the user templates', async () => {
      const r = await renderScreen();
      await openTraining(r);
    });

    it('logs a template through buildTemplatePrefill, carrying GIFs and programming', async () => {
      const r = await renderScreen();
      await openTraining(r);
      fireEvent.press(r.getByText('Log'));

      expect(r.nav.navigate).toHaveBeenCalledWith('DashboardTab', expect.objectContaining({
        screen: 'WorkoutLog',
        // Without initial: false the back button strands the user on Dashboard
        initial: false,
      }));
      const [, params] = r.nav.navigate.mock.calls.find((c: any[]) => c[0] === 'DashboardTab');
      const prefill = params.params.prefill;
      expect(prefill.name).toBe('Push Day');
      const [exercise] = prefill.exercises;
      expect(exercise.name).toBe('Bench Press');
      expect(exercise.image_url).toBe('http://x/bench.gif');   // demo GIF survives the hand-off
      expect(exercise.sets).toHaveLength(4);                   // programmed sets, not a bare row
      expect(exercise.sets[0]).toMatchObject({ reps: '8', rpe: '8' });
    });

    it('keeps templates past the first five in a collapsible block that Show All opens', async () => {
      const many = Array.from({ length: 7 }, (_, i) => ({ ...TEMPLATE, id: 100 + i, name: `Template ${i + 1}` }));
      installServer({ '/api/workout-templates': many });
      const r = await renderScreen();
      fireEvent.press(r.getByText('Training'));
      await waitFor(() => expect(r.getByText('Show All (7)')).toBeTruthy());

      const block = r.UNSAFE_getByType(Collapsible);
      const inside = (name: string) => block.findAll(n => n.props.children === name).length > 0;
      // Five always shown, outside it; the other two live inside it, closed.
      for (let i = 1; i <= 5; i++) expect(inside(`Template ${i}`)).toBe(false);
      expect(inside('Template 6')).toBe(true);
      expect(inside('Template 7')).toBe(true);
      expect(block.props.expanded).toBe(false);

      fireEvent.press(r.getByText('Show All (7)'));
      expect(r.UNSAFE_getByType(Collapsible).props.expanded).toBe(true);
      fireEvent.press(r.getByText('Show Less'));
      expect(r.UNSAFE_getByType(Collapsible).props.expanded).toBe(false);
    });

    it('has no collapsible block or toggle with five templates or fewer', async () => {
      const r = await renderScreen();
      await openTraining(r);
      expect(r.UNSAFE_queryAllByType(Collapsible)).toHaveLength(0);
      expect(r.queryByText(/Show All/)).toBeNull();
    });

    it('opens a template detail', async () => {
      const r = await renderScreen();
      await openTraining(r);
      fireEvent.press(r.getByText('Push Day'));
      expect(r.nav.navigate).toHaveBeenCalledWith('TemplateDetail', { templateId: 7 });
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

    it('shows a new user an empty chart with no tabs or range to pick', async () => {
      installServer({ '/api/stats/progress': progress({ volume: false, sets: false, workouts: false, distance: false }) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Start logging to track your progress')).toBeTruthy());
      for (const tab of ['Volume', 'Sets', 'Workouts', 'Distance']) expect(r.queryByText(tab)).toBeNull();
      expect(r.queryByLabelText(/Chart range/)).toBeNull();
    });

    it('gives a cardio-only user Workouts and Distance, and no lifting tabs', async () => {
      installServer({ '/api/stats/progress': progress({ volume: false, sets: false, workouts: true, distance: true }) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Distance')).toBeTruthy());
      expect(r.queryByText('Volume')).toBeNull();
      expect(r.queryByText('Sets')).toBeNull();
      // Their default Volume pick falls back to the first tab they have, so
      // "Workouts" is both a tab and the chart title.
      expect(r.getAllByText('Workouts')).toHaveLength(2);
      expect(r.queryByText(/^Volume \(/)).toBeNull();
    });

    it('charts distance in the user unit on the Distance tab', async () => {
      installServer({ '/api/stats/progress': progress(ALL) });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Distance')).toBeTruthy());
      fireEvent.press(r.getByText('Distance'));
      await waitFor(() => expect(r.getByText('Distance (mi)')).toBeTruthy());
      const values = lastChart().data.map((d: any) => d.value);
      expect(values).toEqual([0, 0, 0, 0, 5]);
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
      await waitFor(() => expect(r.getByLabelText('Chart range, 30D')).toBeTruthy());
      fireEvent.press(r.getByLabelText('Chart range, 30D'));
      fireEvent.press(r.getByText('Last 3 Months'));
      await waitFor(() => expect(urlsCalled().some(u => u.includes('/api/stats/progress?range=3m'))).toBe(true));
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
      await waitFor(() => expect(r.getByText('Weekly Goal')).toBeTruthy());
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
      await waitFor(() => expect(r.getByText('Weekly Goal')).toBeTruthy());
      fireEvent.press(r.getByText('Weekly Goal'));

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

  describe('AI insights', () => {
    const cached = {
      insights: [{ type: 'achievement', title: 'Bench is climbing', body: 'Up 15 lbs in 3 weeks.' }],
      fetchedAt: Date.now(),
    };

    it('shows cached insights without asking the AI again', async () => {
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify(cached));
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      await waitFor(() => expect(r.getByText('Bench is climbing')).toBeTruthy());
      expect(urlsCalled().some(u => u.includes('/api/ai/insights'))).toBe(false);
    });
  });
});
