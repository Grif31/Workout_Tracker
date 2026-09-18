// The Dashboard cards a user can reorder or hide, in their default order.
// The greeting, streak, Log Workout and Track Activity stay fixed: starting a
// workout shouldn't move or be hideable. The pending-upload card is fixed too,
// since it explains why workouts are missing from the list.
export type DashboardCardId = 'activeRoutine' | 'weekCalendar' | 'workouts';

export const DASHBOARD_CARDS: {
  id: DashboardCardId;
  title: string;
  description: string;
}[] = [
  { id: 'activeRoutine', title: 'Active Routine', description: 'Your routine and the day to train next' },
  { id: 'weekCalendar', title: 'Week Calendar', description: 'This week, with the days you trained' },
  { id: 'workouts', title: 'Recent Workouts', description: 'Your latest workouts, or the day you tap' },
];

export const DEFAULT_DASHBOARD_ORDER: DashboardCardId[] = DASHBOARD_CARDS.map(c => c.id);
