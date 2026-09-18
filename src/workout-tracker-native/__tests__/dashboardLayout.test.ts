import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  activeDayFilter,
  DASHBOARD_LAYOUT_KEY,
  defaultLayout,
  loadDashboardLayout,
  normalizeLayout,
  saveDashboardLayout,
  visibleCards,
} from '../utils/dashboardLayout';
import { DEFAULT_DASHBOARD_ORDER } from '../constants/dashboardCards';

describe('normalizeLayout', () => {
  it('falls back to the default order for missing or junk input', () => {
    expect(normalizeLayout(null)).toEqual(defaultLayout());
    expect(normalizeLayout({})).toEqual(defaultLayout());
    expect(normalizeLayout({ order: 'nope', hidden: 7 })).toEqual(defaultLayout());
  });

  it('keeps a saved order', () => {
    const order = ['workouts', 'weekCalendar', 'activeRoutine'] as const;
    expect(normalizeLayout({ order, hidden: [] }).order).toEqual([...order]);
  });

  it('drops ids the app no longer has', () => {
    const layout = normalizeLayout({ order: ['workouts', 'retiredCard', 'weekCalendar'], hidden: ['retiredCard'] });
    expect(layout.order).not.toContain('retiredCard');
    expect(layout.hidden).toEqual([]);
    expect([...layout.order].sort()).toEqual([...DEFAULT_DASHBOARD_ORDER].sort());
  });

  it('slots a newly added card into its default position, not the bottom', () => {
    // A layout saved before 'weekCalendar' existed: it belongs between the
    // other two, which is where a user would expect to find it
    const layout = normalizeLayout({ order: ['activeRoutine', 'workouts'], hidden: [] });
    expect(layout.order).toEqual(['activeRoutine', 'weekCalendar', 'workouts']);
    expect(layout.hidden).toEqual([]);
  });

  it('never repeats a card', () => {
    const layout = normalizeLayout({ order: ['workouts', 'workouts', 'weekCalendar'], hidden: ['workouts', 'workouts'] });
    expect(layout.order.filter(id => id === 'workouts')).toHaveLength(1);
    expect(layout.hidden).toEqual(['workouts']);
  });
});

describe('visibleCards', () => {
  it('returns the order with hidden cards removed', () => {
    expect(visibleCards({ order: ['activeRoutine', 'weekCalendar', 'workouts'], hidden: ['weekCalendar'] }))
      .toEqual(['activeRoutine', 'workouts']);
  });
});

describe('loadDashboardLayout / saveDashboardLayout', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('round-trips through per-user storage', async () => {
    const layout = { order: ['workouts', 'activeRoutine', 'weekCalendar'] as const, hidden: ['weekCalendar'] as const };
    await saveDashboardLayout(1, layout as any);
    expect(await loadDashboardLayout(1)).toEqual(layout);
    // Another account keeps its own layout
    expect(await loadDashboardLayout(2)).toEqual(defaultLayout());
  });

  it('defaults for a logged-out user and never writes', async () => {
    expect(await loadDashboardLayout(undefined)).toEqual(defaultLayout());
    await saveDashboardLayout(undefined, defaultLayout());
    expect(await AsyncStorage.getItem(`${DASHBOARD_LAYOUT_KEY}_undefined`)).toBeNull();
  });

  it('survives corrupt stored JSON', async () => {
    await AsyncStorage.setItem(`${DASHBOARD_LAYOUT_KEY}_1`, '{not json');
    expect(await loadDashboardLayout(1)).toEqual(defaultLayout());
  });
});

describe('activeDayFilter', () => {
  const layout = (hidden: string[] = []) =>
    ({ order: ['activeRoutine', 'weekCalendar', 'workouts'], hidden } as any);

  it('keeps the selected day while the calendar is on screen', () => {
    expect(activeDayFilter(layout(), '2026-09-18')).toBe('2026-09-18');
  });

  it('drops the day filter when the calendar is hidden', () => {
    // Otherwise the workouts list stays stuck on that day with no way to clear it
    expect(activeDayFilter(layout(['weekCalendar']), '2026-09-18')).toBeNull();
  });

  it('passes through no selection', () => {
    expect(activeDayFilter(layout(), null)).toBeNull();
    expect(activeDayFilter(layout(['weekCalendar']), null)).toBeNull();
  });
});
