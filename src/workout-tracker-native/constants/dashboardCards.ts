// The Dashboard cards a user can reorder, resize or hide, in their default order.
// The greeting, streak, Log Workout and Track Activity stay fixed: starting a
// workout shouldn't move or be hideable. The pending-upload card is fixed too,
// since it explains why workouts are missing from the list.
export type DashboardCardId =
  | 'activeRoutine'
  | 'weeklyGoal'
  | 'greekRank'
  | 'weekCardio'
  | 'weekCalendar'
  | 'workouts';

/** 'full' spans the width; two adjacent 'half' cards share a row. */
export type CardSize = 'full' | 'half';

// `sizes` lists the widths a card has a rendering for, best-first — the head of
// the list is its default. A card is only resizable when it has a compact
// variant designed: narrowing is never just a width change, and the two cards
// listed 'full' only genuinely can't work in half a phone (seven day columns,
// and a list of workouts).
export const DASHBOARD_CARDS: {
  id: DashboardCardId;
  title: string;
  description: string;
  sizes: CardSize[];
}[] = [
  { id: 'activeRoutine', title: 'Active Routine', description: 'Your routine and the day to train next', sizes: ['full', 'half'] },
  { id: 'weeklyGoal', title: 'Weekly Goal', description: 'Workouts done against your weekly target', sizes: ['half', 'full'] },
  { id: 'greekRank', title: 'Greek Rank', description: 'Your rank and progress to the next', sizes: ['half', 'full'] },
  { id: 'weekCardio', title: 'Cardio This Week', description: 'Distance and time logged since Monday', sizes: ['full', 'half'] },
  { id: 'weekCalendar', title: 'Week Calendar', description: 'This week, with the days you trained', sizes: ['full'] },
  { id: 'workouts', title: 'Recent Workouts', description: 'Your latest workouts, or the day you tap', sizes: ['full'] },
];

export const DEFAULT_DASHBOARD_ORDER: DashboardCardId[] = DASHBOARD_CARDS.map(c => c.id);

// Customizing Home (reorder, resize, hide) and the Weekly Goal / Greek Rank
// widgets built for it are held back until arrange mode is rebuilt as
// press-and-hold drag on the real cards (TODO.md section 20, Part B). While
// off, Home renders FIXED_HOME_ORDER at full width and never reads a saved
// layout: one saved by the earlier arrange mode can hide a card, and with no
// button left to unhide it that card would be stranded. Saved layouts stay in
// storage untouched and come back when this flips.
export const HOME_CUSTOMIZATION_ENABLED = false;

export const FIXED_HOME_ORDER: DashboardCardId[] = ['activeRoutine', 'weekCardio', 'weekCalendar', 'workouts'];

export const CARD_SIZES: Record<DashboardCardId, CardSize[]> = DASHBOARD_CARDS.reduce(
  (acc, c) => { acc[c.id] = c.sizes; return acc; },
  {} as Record<DashboardCardId, CardSize[]>,
);

export const defaultSizeFor = (id: DashboardCardId): CardSize => CARD_SIZES[id]?.[0] ?? 'full';
