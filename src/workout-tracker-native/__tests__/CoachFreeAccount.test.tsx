/**
 * A free account on the Coach and Progress tabs: insights locked (its one free
 * insight a week is in the Weekly Summary's review), the rank opening the
 * Strength Score (which locks its own breakdown) rather than the paywall, one
 * lock over Progress's advanced stats, and the template and routine caps
 * skipping what onboarding generated.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute, mockUser } from './testUtils';
import CoachScreen from '../screens/TrainingTab/CoachScreen';
import ProgressOverview from '../screens/ProgressTab/ProgressOverview';
import { appCache } from '../utils/appCache';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('react-native-gifted-charts', () => ({ BarChart: () => null }));
jest.mock('../context/PurchaseContext', () => ({ usePurchase: () => ({ isPremium: false }) }));

const tmpl = (id: number, starter = false) => ({ id, name: `T${id}`, exercises: [], starter });
const routine = (id: number, starter = false) => ({ id, name: `R${id}`, day_count: 3, starter });

function installServer(extra: Record<string, any> = {}) {
  const routes: Record<string, any> = {
    '/api/stats/progress': { buckets: [] },
    '/api/workout-templates': [],
    '/api/routines': [],
    '/api/stats/strength-score': { overall: 62, overall_rank: { label: 'Advanced', display: 'Advanced' } },
    '/api/stats/endurance-score': { overall: 55, overall_rank: { label: 'Intermediate', display: 'Intermediate' } },
    '/api/stats/greek-rank': { greek_rank: 'Hero', greek_score: 40 },
    '/api/stats/muscle-volume': { muscle_sets: {}, last_trained: {}, total_sets: 0, last_week_total: 0, week_start: '2026-09-21' },
    '/api/ai/insights': { insights: [{ type: 'deload', title: 'Ease off legs', body: 'x', priority: 'high' }] },
    ...extra,
  };
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = Object.entries(routes).find(([p]) => path.startsWith(p))?.[1];
    return Promise.resolve({ ok: body != null, status: body == null ? 404 : 200, json: () => Promise.resolve(body ?? {}) });
  });
}

const insightCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(c => String(c[0]).includes('/api/ai/insights')).length;

async function openTab(label: string) {
  const nav = createMockNavigation();
  const utils = render(<CoachScreen navigation={nav as any} route={createMockRoute('CoachHome') as any} />);
  await act(async () => {});
  await waitFor(() => expect(utils.getByText(label)).toBeTruthy());
  fireEvent.press(utils.getByText(label));
  return { ...utils, nav };
}

const openCoachTab = () => openTab('Coach');

describe('Coach tab for a free account', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
    installServer();
  });

  it('locks insights and points to the weekly review, without asking the AI', async () => {
    const r = await openCoachTab();
    expect(await r.findByText(/Insights are part of Premium/)).toBeTruthy();
    expect(r.queryByText("Get This Week's Insight")).toBeNull();
    expect(r.queryByText('Generate Insights')).toBeNull();
    expect(insightCalls()).toBe(0);
  });

  it('ignores a free insight saved by an earlier build', async () => {
    await AsyncStorage.setItem(`coach_free_insight_${mockUser.id}`, JSON.stringify({
      insights: [{ type: 'deload', title: 'Old free insight', body: 'x', priority: 'high' }],
      fetchedAt: new Date().toISOString(),
    }));
    const r = await openCoachTab();
    expect(await r.findByText(/Insights are part of Premium/)).toBeTruthy();
    expect(r.queryByText('Old free insight')).toBeNull();
  });

  it('opens the Strength Score screen itself, not the paywall', async () => {
    const r = await openCoachTab();
    fireEvent.press(await r.findByText('Hero'));
    expect(r.nav.navigate).toHaveBeenCalledWith('ProgressTab', { screen: 'StrengthScore', initial: false });
    expect(r.nav.navigate).not.toHaveBeenCalledWith('Paywall', expect.anything());
  });
});

describe('Advanced stats lock on Progress for a free account', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
  });

  const progress = {
    buckets: [{ label: '9/22', volume: 5000, sets: 12, count: 2, distance_km: 0, density: 40 }],
    metrics_logged: { volume: true, sets: true, workouts: true, distance: false, density: true },
  };

  it('puts one lock over the fatigue, balance and density cards and opens the paywall', async () => {
    installServer({ '/api/stats/progress': progress });
    const nav = createMockNavigation();
    const r = render(<ProgressOverview navigation={nav as any} />);
    expect(await r.findByText('Advanced stats')).toBeTruthy();
    expect(r.getByTestId('premium-teaser')).toBeTruthy();
    fireEvent.press(r.getByText('Unlock with Premium'));
    expect(nav.navigate).toHaveBeenCalledWith('Paywall', { source: 'muscle_volume' });
  });

  it('is not there when there is nothing yet to unlock', async () => {
    installServer({
      '/api/stats/progress': { buckets: [], metrics_logged: { volume: false, sets: false, workouts: false, distance: false, density: false } },
      '/api/stats/muscle-volume': { muscle_sets: {}, last_trained: {}, total_sets: 0, last_week_total: 0, this_week_total: 0, last_week_to_date_total: 0, week_start: '2026-09-21' },
    });
    const r = render(<ProgressOverview navigation={createMockNavigation() as any} />);
    await act(async () => {});
    expect(r.queryByText('Advanced stats')).toBeNull();
  });
});

describe('free template and routine caps', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
  });

  it("don't count what onboarding generated", async () => {
    installServer({
      '/api/routines': [routine(1, true), routine(2, true)],
      '/api/workout-templates': [tmpl(1, true), tmpl(2, true), tmpl(3, true), tmpl(4, true), tmpl(5, true), tmpl(6, true)],
    });
    const { nav, ...r } = await openTab('Plans');
    expect(await r.findByText('0 of 5 free')).toBeTruthy();
    expect(r.getByText('0 of 2 free')).toBeTruthy();
    r.getAllByText('New').forEach(b => fireEvent.press(b));
    expect(nav.navigate).not.toHaveBeenCalledWith('Paywall', expect.anything());
  });

  it('still count what the user made themselves', async () => {
    installServer({
      '/api/routines': [routine(1, true), routine(2), routine(3)],
      '/api/workout-templates': [tmpl(1, true), tmpl(2)],
    });
    const { nav, ...r } = await openTab('Plans');
    expect(await r.findByText('2 of 2 free')).toBeTruthy();
    expect(r.getByText('1 of 5 free')).toBeTruthy();
    fireEvent.press(r.getAllByText('New')[1]);
    expect(nav.navigate).toHaveBeenCalledWith('Paywall', { source: 'routines' });
  });
});
