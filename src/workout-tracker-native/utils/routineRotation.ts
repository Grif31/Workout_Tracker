import { toLocalDateStr } from './date';

// A routine is a rotation, not a weekly calendar: RoutineDay has no weekday,
// so "up next" is the day after the last one logged, whatever the week. A
// missed day shifts the rotation instead of being skipped, which keeps every
// session in the split trained equally often. Only a long layoff starts it
// over. Mirrored by _routine_rotation_context in routes/ai_routes.py, so Home
// and the AI Coach always agree on the next day.
export const ROTATION_RESTART_DAYS = 14;

export type RotationWorkout = { id: number; name: string; date: string };

export type RotationState = {
  /** Index into the day_order-sorted labels */
  nextIndex: number;
  /** Indices of days logged since weekStart */
  doneThisWeek: Set<number>;
  /** True when a layoff of ROTATION_RESTART_DAYS+ sent the rotation back to day 1 */
  restarted: boolean;
};

const norm = (s: string) => (s || '').trim().toLowerCase();

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * Walks the user's workouts oldest-first and advances through the rotation.
 * A workout counts as a routine day by name (logging a day names the workout
 * after its label). When two days share a label (Push/Pull/Legs twice), each
 * one goes to the next day with that label after the current position, so a
 * repeated split moves through both copies instead of marking them done
 * together.
 *
 * @param labels  routine day labels in day_order
 * @param workouts any order; `date` as the API sends it
 * @param today / weekStart local YYYY-MM-DD
 */
export function routineRotation(
  labels: string[],
  workouts: RotationWorkout[],
  today: string,
  weekStart: string,
): RotationState {
  const keys = labels.map(norm);
  const n = keys.length;
  const doneThisWeek = new Set<number>();
  if (n === 0) return { nextIndex: 0, doneThisWeek, restarted: false };

  // Workouts dated by the picker all sit at midnight, so same-day order comes from id
  const ordered = workouts
    .map(w => ({ ...w, day: toLocalDateStr(new Date(w.date)), key: norm(w.name) }))
    .filter(w => keys.includes(w.key))
    .sort((a, b) => (a.day === b.day ? a.id - b.id : a.day < b.day ? -1 : 1));

  let pos = -1;
  let lastDay: string | null = null;
  for (const w of ordered) {
    if (lastDay && dayNumber(w.day) - dayNumber(lastDay) >= ROTATION_RESTART_DAYS) pos = -1;
    for (let step = 1; step <= n; step++) {
      const i = (pos + step) % n;
      if (keys[i] === w.key) { pos = i; break; }
    }
    lastDay = w.day;
    if (w.day >= weekStart) doneThisWeek.add(pos);
  }

  if (lastDay === null) return { nextIndex: 0, doneThisWeek, restarted: false };
  if (dayNumber(today) - dayNumber(lastDay) >= ROTATION_RESTART_DAYS) {
    return { nextIndex: 0, doneThisWeek, restarted: true };
  }
  return { nextIndex: (pos + 1) % n, doneThisWeek, restarted: false };
}
