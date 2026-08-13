import { toDisplayDistance } from './units';
import { fmtHold } from '../components/workout/types';

export type PREventItem = {
  id: number;
  exercise_template_id: number;
  workout_id: number;
  pr_type: 'max_weight' | 'max_reps' | 'estimated_1rm' | 'best_time' | 'best_distance' | 'max_duration';
  value: number;
  weight_context: number | null;
  previous_value: number | null;
  /** Sign-normalized by the backend: positive = better, even for best_time (which improves downward). */
  improved_by: number | null;
  achieved_at: string;
  exercise_name?: string;
  pr_label?: string;
  workout_name?: string;
  workout_date?: string;
};

export function fmtMinSec(mins: number): string {
  const m = Math.floor(mins);
  const s = Math.round((mins - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtPrValue(e: PREventItem, unit: string, distanceUnit: 'km' | 'mi'): string {
  switch (e.pr_type) {
    case 'max_weight':    return `${e.value} ${unit}`;
    case 'estimated_1rm': return `${e.value.toFixed(1)} ${unit}`;
    case 'max_reps':      return `${e.value} reps`;
    case 'best_time':     return fmtMinSec(e.value);
    case 'best_distance': return `${toDisplayDistance(e.value, distanceUnit).toFixed(2)} ${distanceUnit}`;
    case 'max_duration':  return fmtHold(e.value);
  }
}

/** Secondary context line for a PR event, or null when the pr_label already says it all. */
export function fmtPrContext(e: PREventItem, unit: string): string | null {
  if (e.pr_type === 'max_reps' && e.weight_context != null) {
    return e.weight_context === 0 ? 'Bodyweight' : `@ ${e.weight_context} ${unit}`;
  }
  return null;
}

export function fmtPrDelta(e: PREventItem, unit: string, distanceUnit: 'km' | 'mi'): string | null {
  const d = e.improved_by;
  if (d == null || d <= 0) return null;
  switch (e.pr_type) {
    case 'max_weight':    return `+${round1(d)} ${unit}`;
    case 'estimated_1rm': return `+${round1(d)} ${unit}`;
    case 'max_reps':      return `+${d} ${d === 1 ? 'rep' : 'reps'}`;
    case 'best_time':     return d < 1 ? `${Math.round(d * 60)}s faster` : `${fmtMinSec(d)} faster`;
    case 'best_distance': return `+${toDisplayDistance(d, distanceUnit).toFixed(2)} ${distanceUnit}`;
    case 'max_duration':  return `+${fmtHold(d)}`;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Inline hint for the workout log while a set is focused: fires when the
 * entered weight is within 5% below the exercise's current max-weight PR,
 * ties it, or beats it. Returns null when no hint applies.
 */
export function nearPrHint(
  weightStr: string | undefined,
  maxWeightPr: number | null | undefined,
  unit: string,
): string | null {
  if (!maxWeightPr || maxWeightPr <= 0) return null;
  const w = parseFloat(weightStr ?? '');
  if (!isFinite(w) || w <= 0) return null;
  if (w > maxWeightPr) return `Beats your ${maxWeightPr} ${unit} PR!`;
  if (w === maxWeightPr) return `Ties your ${maxWeightPr} ${unit} PR`;
  const diff = maxWeightPr - w;
  if (diff / maxWeightPr > 0.05) return null;
  return `${round1(diff)} ${unit} from your ${maxWeightPr} ${unit} PR`;
}
