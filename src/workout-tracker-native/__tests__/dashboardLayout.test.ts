import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  activeDayFilter,
  DASHBOARD_LAYOUT_KEY,
  defaultLayout,
  loadDashboardLayout,
  normalizeLayout,
  packRows,
  cardSize,
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
    const order = ['workouts', 'weekCalendar', 'weekCardio', 'greekRank', 'weeklyGoal', 'activeRoutine'] as const;
    expect(normalizeLayout({ order, hidden: [] }).order).toEqual([...order]);
  });

  it('drops ids the app no longer has', () => {
    const layout = normalizeLayout({ order: ['workouts', 'retiredCard', 'weekCalendar'], hidden: ['retiredCard'] });
    expect(layout.order).not.toContain('retiredCard');
    expect(layout.hidden).toEqual([]);
    expect([...layout.order].sort()).toEqual([...DEFAULT_DASHBOARD_ORDER].sort());
  });

  it('slots a newly added card into its default position, not the bottom', () => {
    // A layout saved before the middle cards existed: each belongs at its own
    // default position, which is where a user would look for it
    const layout = normalizeLayout({ order: ['activeRoutine', 'workouts'], hidden: [] });
    expect(layout.order).toEqual([
      'activeRoutine', 'weeklyGoal', 'greekRank', 'weekCardio', 'weekCalendar', 'workouts',
    ]);
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
    expect(visibleCards({ order: ['activeRoutine', 'weekCalendar', 'workouts'], hidden: ['weekCalendar'], sizes: {} }))
      .toEqual(['activeRoutine', 'workouts']);
  });
});

describe('loadDashboardLayout / saveDashboardLayout', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('round-trips through per-user storage', async () => {
    const layout = {
      order: ['workouts', 'activeRoutine', 'weeklyGoal', 'greekRank', 'weekCardio', 'weekCalendar'] as const,
      hidden: ['weekCalendar'] as const,
      sizes: { weekCardio: 'half' } as const,
    };
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


describe('card sizes', () => {
  const base = () => defaultLayout();

  it('falls back to each card default when nothing is stored', () => {
    // Week Calendar has no compact variant; Weekly Goal was designed for one
    expect(cardSize(base(), 'weekCalendar')).toBe('full');
    expect(cardSize(base(), 'weeklyGoal')).toBe('half');
  });

  it('keeps a stored size the card actually supports', () => {
    const layout = normalizeLayout({ ...base(), sizes: { weekCardio: 'half' } });
    expect(cardSize(layout, 'weekCardio')).toBe('half');
  });

  it('drops a size the card has no rendering for', () => {
    // Someone hand-edited storage, or the card lost its compact variant in a
    // release — either way it must fall back to a width that draws.
    const layout = normalizeLayout({ ...base(), sizes: { weekCalendar: 'half', workouts: 'half' } });
    expect(layout.sizes.weekCalendar).toBeUndefined();
    expect(cardSize(layout, 'weekCalendar')).toBe('full');
  });

  it('ignores sizes for cards the app no longer has', () => {
    const layout = normalizeLayout({ ...base(), sizes: { legacyCard: 'half' } });
    expect(Object.keys(layout.sizes)).not.toContain('legacyCard');
  });

  it('survives junk in the sizes slot', () => {
    expect(normalizeLayout({ order: [...DEFAULT_DASHBOARD_ORDER], hidden: [], sizes: 'nope' }))
      .toEqual(defaultLayout());
  });
});

describe('packRows', () => {
  const layout = (over: Partial<ReturnType<typeof defaultLayout>> = {}) =>
    ({ ...defaultLayout(), ...over });

  it('pairs two adjacent half cards into one row', () => {
    const rows = packRows(layout({
      order: ['weeklyGoal', 'greekRank', 'workouts'],
      sizes: { weeklyGoal: 'half', greekRank: 'half' },
    }));
    expect(rows).toEqual([
      { ids: ['weeklyGoal', 'greekRank'], size: 'half' },
      { ids: ['workouts'], size: 'full' },
    ]);
  });

  it('gives every full card its own row', () => {
    const rows = packRows(layout({
      order: ['weekCalendar', 'workouts'],
      sizes: {},
    }));
    expect(rows).toEqual([
      { ids: ['weekCalendar'], size: 'full' },
      { ids: ['workouts'], size: 'full' },
    ]);
  });

  it('leaves a lone half at half width rather than stretching it', () => {
    const rows = packRows(layout({
      order: ['weeklyGoal', 'workouts'],
      sizes: { weeklyGoal: 'half' },
    }));
    expect(rows[0]).toEqual({ ids: ['weeklyGoal'], size: 'half' });
  });

  it('does not pair halves separated by a full card', () => {
    const rows = packRows(layout({
      order: ['weeklyGoal', 'weekCalendar', 'greekRank'],
      sizes: { weeklyGoal: 'half', greekRank: 'half' },
    }));
    expect(rows).toEqual([
      { ids: ['weeklyGoal'], size: 'half' },
      { ids: ['weekCalendar'], size: 'full' },
      { ids: ['greekRank'], size: 'half' },
    ]);
  });

  it('pairs across a hidden card, since hidden cards never render', () => {
    const rows = packRows(layout({
      order: ['weeklyGoal', 'weekCalendar', 'greekRank'],
      hidden: ['weekCalendar'],
      sizes: { weeklyGoal: 'half', greekRank: 'half' },
    }));
    expect(rows).toEqual([{ ids: ['weeklyGoal', 'greekRank'], size: 'half' }]);
  });

  it('pairs three halves as two plus a lone one', () => {
    const rows = packRows(layout({
      order: ['weeklyGoal', 'greekRank', 'weekCardio'],
      sizes: { weeklyGoal: 'half', greekRank: 'half', weekCardio: 'half' },
    }));
    expect(rows).toEqual([
      { ids: ['weeklyGoal', 'greekRank'], size: 'half' },
      { ids: ['weekCardio'], size: 'half' },
    ]);
  });

  it('renders every visible card exactly once', () => {
    const rows = packRows(defaultLayout());
    const rendered = rows.flatMap(r => r.ids);
    expect([...rendered].sort()).toEqual([...visibleCards(defaultLayout())].sort());
  });

  it('returns nothing when everything is hidden', () => {
    expect(packRows(layout({ hidden: [...DEFAULT_DASHBOARD_ORDER] }))).toEqual([]);
  });
});
