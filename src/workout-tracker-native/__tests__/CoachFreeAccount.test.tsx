/**
 * The Coach tab for a free account: one real insight a week with the rest
 * counted and locked, and the score cards opening the score screens (which
 * lock their own breakdown) rather than the paywall.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute, mockUser } from './testUtils';
import CoachScreen from '../screens/TrainingTab/CoachScreen';
import { appCache } from '../utils/appCache';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('react-native-gifted-charts', () => ({ BarChart: () => null }));
jest.mock('../context/PurchaseContext', () => ({ usePurchase: () => ({ isPremium: false }) }));

const FREE_KEY = `coach_free_insight_${mockUser.id}`;
const INSIGHTS = [
  { type: 'deload', title: 'Ease off legs', body: 'Quads are past their limit.', priority: 'high' },
  { type: 'frequency', title: 'Hit back twice', body: 'One session a week.', priority: 'medium' },
  { type: 'achievement', title: 'Bench is climbing', body: 'Up 15 lbs.', priority: 'low' },
];

function installServer(insights: any = { insights: INSIGHTS }) {
  const routes: Record<string, any> = {
    '/api/stats/progress': { buckets: [] },
    '/api/workout-templates': [],
    '/api/routines': [],
    '/api/stats/strength-score': { overall: 62, overall_rank: { label: 'Advanced', display: 'Advanced' } },
    '/api/stats/endurance-score': { overall: 55, overall_rank: { label: 'Intermediate', display: 'Intermediate' } },
    '/api/stats/greek-rank': { greek_rank: 'Hero', greek_score: 40 },
    '/api/stats/muscle-volume': { muscle_sets: {}, last_trained: {}, total_sets: 0, last_week_total: 0, week_start: '2026-09-21' },
    '/api/ai/insights': insights,
  };
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = Object.entries(routes).find(([p]) => path.startsWith(p))?.[1];
    return Promise.resolve({ ok: body != null, status: body == null ? 404 : 200, json: () => Promise.resolve(body ?? {}) });
  });
}

const insightCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(c => String(c[0]).includes('/api/ai/insights')).length;

async function openCoachTab() {
  const nav = createMockNavigation();
  const utils = render(<CoachScreen navigation={nav as any} route={createMockRoute('CoachHome') as any} />);
  await act(async () => {});
  await waitFor(() => expect(utils.getByText('Coach')).toBeTruthy());
  fireEvent.press(utils.getByText('Coach'));
  return { ...utils, nav };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe('Coach tab for a free account', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
    installServer();
  });

  it('offers the week\'s free insight, then shows the first in full and counts the rest', async () => {
    const r = await openCoachTab();
    fireEvent.press(await r.findByText("Get This Week's Insight"));

    expect(await r.findByText('Ease off legs')).toBeTruthy();
    expect(r.getByText('Quads are past their limit.')).toBeTruthy();
    expect(r.queryByText('Hit back twice')).toBeNull();
    expect(r.getByText('2 more insights this week')).toBeTruthy();
    expect(r.getByText('Next free insight in 7 days')).toBeTruthy();
    expect(r.queryByText("Get This Week's Insight")).toBeNull();

    fireEvent.press(r.getByText('2 more insights this week'));
    expect(r.nav.navigate).toHaveBeenCalledWith('Paywall', { source: 'ai_coach' });
  });

  it('brings the saved insight back without asking the AI again that week', async () => {
    await AsyncStorage.setItem(FREE_KEY, JSON.stringify({ insights: INSIGHTS, fetchedAt: daysAgo(3) }));
    const r = await openCoachTab();
    expect(await r.findByText('Ease off legs')).toBeTruthy();
    expect(r.getByText('Next free insight in 4 days')).toBeTruthy();
    expect(r.queryByText("Get This Week's Insight")).toBeNull();
    expect(insightCalls()).toBe(0);
  });

  it('offers a new one once a week has passed', async () => {
    await AsyncStorage.setItem(FREE_KEY, JSON.stringify({ insights: INSIGHTS, fetchedAt: daysAgo(8) }));
    const r = await openCoachTab();
    expect(await r.findByText("Get This Week's Insight")).toBeTruthy();
  });

  it('opens the Strength Score screen itself, not the paywall', async () => {
    const r = await openCoachTab();
    fireEvent.press(await r.findByText('Hero'));
    expect(r.nav.navigate).toHaveBeenCalledWith('StrengthScore');
    expect(r.nav.navigate).not.toHaveBeenCalledWith('Paywall', expect.anything());
  });
});
