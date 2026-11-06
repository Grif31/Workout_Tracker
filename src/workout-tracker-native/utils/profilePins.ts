import type { PR } from '../screens/ProfileTab/PersonalRecordsScreen';
import { parseApiDate } from './date';

/** The PRs shown on Profile's Personal Records card. Saved on the server
 *  (GET/PUT /api/personal-records/pins), cached on the phone. */
export const MAX_PROFILE_PINS = 3;
export const PR_PINS_BASE = '@pr_pins';
/** How long a PR counts as recent enough to show what it improved by */
export const RECENT_PR_DAYS = 14;

export type Pin = { exerciseId: number; prType: PR['pr_type']; context: number | null };
export type ServerPin = { exercise_template_id: number; pr_type: PR['pr_type']; weight_context: number | null };

export const samePin = (a: Pin, b: Pin) =>
  a.exerciseId === b.exerciseId && a.prType === b.prType && a.context === b.context;

export const toServerPin = (p: Pin): ServerPin =>
  ({ exercise_template_id: p.exerciseId, pr_type: p.prType, weight_context: p.context });
export const fromServerPin = (p: ServerPin): Pin =>
  ({ exerciseId: p.exercise_template_id, prType: p.pr_type, context: p.weight_context ?? null });

/** The record a pin shows, or undefined once it no longer exists. */
export function resolvePin(prs: PR[], pin: Pin): PR | undefined {
  const matches = prs.filter(p => p.exercise_template_id === pin.exerciseId && p.pr_type === pin.prType);
  if (pin.context != null) return matches.find(p => p.weight_context === pin.context) ?? matches[0];
  if (pin.prType === 'max_reps') return [...matches].sort((a, b) => b.value - a.value)[0];
  return matches[0];
}

// Lifts first, then cardio. Each type ranks its own records: the heaviest
// lift, the time over the longest distance, the furthest ride or hold.
const DEFAULT_ORDER: { type: PR['pr_type']; rank: (p: PR) => number }[] = [
  { type: 'max_weight',       rank: p => p.value },
  { type: 'best_time',        rank: p => p.weight_context ?? 0 },
  { type: 'longest_distance', rank: p => p.value },
  { type: 'best_distance',    rank: p => p.weight_context ?? 0 },
  { type: 'max_duration',     rank: p => p.value },
];
// A runner's 10K, 5K and mile are all worth showing; a lift's second record
// (reps at some warm-up weight) isn't, so only these fill a leftover slot.
const REPEATABLE: PR['pr_type'][] = ['best_time', 'best_distance'];

/** What the card shows before the user has chosen: one record per exercise,
 *  then more of a runner's milestones if slots are left. */
export function defaultPins(prs: PR[]): Pin[] {
  const candidates = DEFAULT_ORDER.flatMap(({ type, rank }) =>
    prs.filter(p => p.pr_type === type).sort((a, b) => rank(b) - rank(a)));
  const toPin = (p: PR): Pin => ({
    exerciseId: p.exercise_template_id,
    prType: p.pr_type,
    context: REPEATABLE.includes(p.pr_type) ? p.weight_context : null,
  });

  const picked: PR[] = [];
  const exercises = new Set<number>();
  for (const p of candidates) {
    if (picked.length === MAX_PROFILE_PINS) break;
    if (exercises.has(p.exercise_template_id)) continue;
    exercises.add(p.exercise_template_id);
    picked.push(p);
  }
  for (const p of candidates) {
    if (picked.length === MAX_PROFILE_PINS) break;
    if (!picked.includes(p) && REPEATABLE.includes(p.pr_type)) picked.push(p);
  }
  return picked.map(toPin);
}

/** The phone's cached choice, or null when there isn't one. Older builds
 *  stored three fixed slots with null for an empty one (and bare exercise ids
 *  before that), and saved them without the user choosing anything: all three
 *  empty is how a brand-new account looked, so it reads as no choice. */
export function parseStoredPins(raw: string | null): Pin[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  if (parsed.length > 0 && parsed.every(p => p == null)) return null;
  return parsed
    .map((p: any): Pin | null =>
      p == null ? null :
      typeof p === 'number' ? { exerciseId: p, prType: 'max_weight', context: null } :
      p)
    // Estimated 1RM was dropped from the picker: it is never shown as a PR
    .filter((p): p is Pin => p != null && p.prType !== 'estimated_1rm')
    .slice(0, MAX_PROFILE_PINS);
}

/** For a PR set in the last RECENT_PR_DAYS: how much better it is than the one
 *  it beat (positive, best_time counted downward), or 'new' for a first PR. */
export function recentPrChange(pr: PR, now: Date): number | 'new' | null {
  if (!pr.achieved_at) return null;
  const days = (now.getTime() - parseApiDate(pr.achieved_at).getTime()) / 86_400_000;
  if (days > RECENT_PR_DAYS) return null;
  if (pr.previous_value == null) return 'new';
  const delta = pr.pr_type === 'best_time' ? pr.previous_value - pr.value : pr.value - pr.previous_value;
  return delta > 0 ? delta : null;
}
