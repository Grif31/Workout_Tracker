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
import { COACH_INSIGHTS_KEY } from '../constants/storageKeys';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

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

    it('opens a template detail', async () => {
      const r = await renderScreen();
      await openTraining(r);
      fireEvent.press(r.getByText('Push Day'));
      expect(r.nav.navigate).toHaveBeenCalledWith('TemplateDetail', { templateId: 7 });
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
