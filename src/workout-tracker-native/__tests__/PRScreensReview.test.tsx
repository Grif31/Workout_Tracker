import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import PersonalRecordsScreen from '../screens/ProfileTab/PersonalRecordsScreen';
import PRDashboardScreen from '../screens/ProfileTab/PRDashboardScreen';
import { fmtOrdinal, prChartValue, prChartYLabel, type PREventItem } from '../utils/prFormat';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
let mockWeightUnit = 'lbs';
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 't', weight_unit: mockWeightUnit } }),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));

function mockServer(routes: Record<string, any>) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = routes[path];
    return Promise.resolve({ ok: body !== undefined, status: body === undefined ? 404 : 200, json: () => Promise.resolve(body ?? {}) });
  });
}

const pr = (over: Record<string, any>) => ({
  id: Math.random(), equipment: null, weight_context: null, muscle_group: 'Chest', standards_key: null,
  pr_label: 'Max Weight', ...over,
});

// Text in render order (toJSON can't be JSON.stringify'd: it holds fiber cycles)
const textsInOrder = (node: any, out: string[] = []): string[] => {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => textsInOrder(n, out)); return out; }
  (node.children ?? []).forEach((c: any) => textsInOrder(c, out));
  return out;
};

const PRS = [
  pr({ id: 1, exercise_template_id: 7, exercise_name: 'Bench Press', pr_type: 'max_weight', value: 225, achieved_at: '2026-09-20T00:00:00', standards_key: 'Bench Press' }),
  pr({ id: 2, exercise_template_id: 8, exercise_name: 'Leg Press', pr_type: 'max_weight', value: 600, achieved_at: '2026-08-01T00:00:00', muscle_group: 'Quads' }),
  pr({ id: 3, exercise_template_id: 7, exercise_name: 'Bench Press', pr_type: 'max_reps', value: 8, weight_context: 225, achieved_at: '2026-09-01T00:00:00' }),
  pr({ id: 4, exercise_template_id: 7, exercise_name: 'Bench Press', pr_type: 'max_reps', value: 3, weight_context: 245, achieved_at: '2026-09-10T00:00:00' }),
  pr({ id: 5, exercise_template_id: 9, exercise_name: 'Running', pr_type: 'best_time', pr_label: '10K Best Time', value: 52, weight_context: 10, achieved_at: '2026-09-02T00:00:00' }),
  pr({ id: 6, exercise_template_id: 9, exercise_name: 'Running', pr_type: 'best_time', pr_label: '5K Best Time', value: 24.5, weight_context: 5, achieved_at: '2026-09-03T00:00:00' }),
];
const SCORE = { big6: [{ exercise: 'Bench Press', percentile: 72.4, rank: { label: 'Advanced' } }], supplemental: [] };

describe('Personal Records', () => {
  const route = createMockRoute('PersonalRecords');
  beforeEach(() => {
    mockWeightUnit = 'lbs';
    mockServer({ '/api/personal-records': PRS, '/api/stats/strength-score': SCORE });
  });

  it('shows a lift\'s Strength Score percentile and opens Strength Score from it', async () => {
    const nav = createMockNavigation();
    const { findByText, getAllByText } = render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);

    fireEvent.press(await findByText('72nd · Advanced'));
    expect(nav.navigate).toHaveBeenCalledWith('TrainingTab', { screen: 'StrengthScore', initial: false });
    // Leg Press has no strength standards, so only Bench gets a pill
    expect(getAllByText(/· Advanced$/)).toHaveLength(1);
  });

  it('ranks by weight under Heaviest, and newest first under Recent', async () => {
    const { findByText, getByText, queryByText, toJSON } = render(<PersonalRecordsScreen navigation={createMockNavigation() as any} route={route as any} />);
    await findByText('Leg Press');
    const order = () => textsInOrder(toJSON()).filter(t => t === 'Bench Press' || t === 'Leg Press').slice(0, 2);
    expect(order()).toEqual(['Leg Press', 'Bench Press']);
    expect(getByText('#1')).toBeTruthy();

    fireEvent.press(getByText('Recent'));
    await waitFor(() => expect(order()).toEqual(['Bench Press', 'Leg Press']));
    // Ranks only mean something when sorted by weight
    expect(queryByText('#1')).toBeNull();
  });

  it('says a search found nothing instead of claiming there are no PRs', async () => {
    const { findByText, getByPlaceholderText, getByLabelText } = render(<PersonalRecordsScreen navigation={createMockNavigation() as any} route={route as any} />);
    await findByText('Leg Press');
    fireEvent.press(getByLabelText('Search PRs'));
    fireEvent.changeText(getByPlaceholderText('Search exercises…'), 'squat');
    expect(await findByText('No PRs match "squat"')).toBeTruthy();
  });

  it('lists rep records with the heaviest one written reps first', async () => {
    const { findByText, getByText } = render(<PersonalRecordsScreen navigation={createMockNavigation() as any} route={route as any} />);
    await findByText('Leg Press');
    fireEvent.press(getByText('Max Reps'));
    expect(await findByText('Heaviest: 3 × 245 lbs')).toBeTruthy();
  });

  it('orders cardio records by milestone', async () => {
    const { findByText, getByText, toJSON } = render(<PersonalRecordsScreen navigation={createMockNavigation() as any} route={route as any} />);
    await findByText('Leg Press');
    fireEvent.press(getByText('Cardio & Holds'));
    await findByText('5K');
    expect(textsInOrder(toJSON()).filter(t => t === '5K' || t === '10K')).toEqual(['5K', '10K']);
  });
});

describe('PR Dashboard', () => {
  it('shows the most-volume workout in kg for a kg user', async () => {
    mockWeightUnit = 'kg';
    mockServer({
      '/api/personal-records/dashboard': {
        recent_events: [], recent_events_scope: 'week', page: 1, has_more: false,
        workout_bests: { best_volume: { workout_id: 1, workout_name: 'Legs', date: '2026-09-20T00:00:00', value: 10000 }, best_total_reps: null },
        stats: { prs_this_month: 0, pr_streak_weeks: 0, total_prs: 0, days_since_last_pr: [] },
      },
    });
    const { findByText } = render(<PRDashboardScreen navigation={createMockNavigation() as any} route={createMockRoute('PRDashboard') as any} />);
    // Workout.volume is lbs: 10,000 lbs = 4,536 kg
    expect(await findByText('4,536 kg')).toBeTruthy();
  });
});

describe('PR chart helpers', () => {
  const ev = (pr_type: PREventItem['pr_type'], value: number) => ({ pr_type, value } as PREventItem);

  it('plots distances in the user unit and times in seconds', () => {
    expect(prChartValue(ev('best_distance', 10), 'mi')).toBeCloseTo(6.21, 2);
    expect(prChartValue(ev('best_time', 23 + 40 / 60), 'mi')).toBe(1420);
    expect(prChartValue(ev('max_weight', 225), 'mi')).toBe(225);
  });

  it('labels time axes as m:ss', () => {
    expect(prChartYLabel('best_time')('1420')).toBe('23:40');
    expect(prChartYLabel('max_weight')('224.6')).toBe('225');
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 72.4, 101].map(fmtOrdinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '72nd', '101st']);
  });
});
