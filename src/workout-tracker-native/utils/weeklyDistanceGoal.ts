import { roundTenth, toDisplayDistance, toKm, type DistanceUnit } from './units';

// Bounds are in the user's display unit, so the stepper stops at the same
// number whether they think in miles or kilometres.
export const DISTANCE_GOAL_MIN = 1;
export const DISTANCE_GOAL_MAX = 200;
// Where a goal starts when the user first switches it on.
export const DISTANCE_GOAL_DEFAULT = 10;

/**
 * The goal is stored in km so switching between mi and km in Settings never
 * changes it. Shown to a tenth, which also absorbs the float noise of a
 * mi -> km -> mi round trip (15 mi reads back as 15, not 14.999).
 */
export function goalKmToDisplay(km: number, unit: DistanceUnit): number {
  return roundTenth(toDisplayDistance(km, unit));
}

export function displayToGoalKm(value: number, unit: DistanceUnit): number {
  return toKm(value, unit);
}

/** A tenth-rounded distance as the card and modal show it: 15, not 15.0; 8.2 stays 8.2. */
export function formatDistanceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clampGoal(value: number): number {
  return roundTenth(Math.min(DISTANCE_GOAL_MAX, Math.max(DISTANCE_GOAL_MIN, value)));
}

/** The +/-1 and +/-5 buttons. Works on the displayed value, so 12.5 + 5 is 17.5. */
export function stepDistanceGoal(current: number, delta: number): number {
  return clampGoal(current + delta);
}

/**
 * What the user typed into the goal field, or null if it isn't a number.
 * A comma is accepted as the decimal point for keyboards that offer one.
 * Out-of-range values clamp rather than fail, so typing 500 gives the max.
 */
export function parseDistanceGoalInput(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampGoal(value);
}

export type DistanceGoalProgress = {
  /** This week so far, in the display unit, to a tenth. */
  done: number;
  /** The goal, in the display unit, to a tenth. */
  goal: number;
  /** How full the card's progress line is, 0 to 1. */
  fill: number;
  complete: boolean;
};

/**
 * Compared in the display unit at the precision the card shows, not in raw
 * km: the backend rounds bucket distances to 3 decimals, so exactly 15 mi
 * logged arrives as 24.140 km against a saved goal of 24.1401 km, and a raw
 * comparison would leave "15 / 15 mi" short of complete.
 */
export function distanceGoalProgress(doneKm: number, goalKm: number, unit: DistanceUnit): DistanceGoalProgress {
  const done = doneKm > 0 ? goalKmToDisplay(doneKm, unit) : 0;
  const goal = goalKmToDisplay(goalKm, unit);
  const complete = goal > 0 && done >= goal;
  const fill = complete ? 1 : goal > 0 ? Math.min(1, done / goal) : 0;
  return { done, goal, fill, complete };
}
