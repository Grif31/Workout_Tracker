export type LastSet = { reps: string; weight: string; set_type?: string; rpe?: string };

export type OverloadTarget = {
  /** "8 x 185 @ 7": the heaviest working weight from last session */
  last: string;
  /** "8 x 190" */
  target: string;
  reason: 'add_weight' | 'add_rep' | 'hold';
  /** One short line on why, for the row under the target */
  why: string;
};

// Above this many reps on every set, a plate is too big a jump on its own
const HIGH_REPS = 12;
const REPS_AFTER_HIGH_REP_JUMP = 10;
// At or above this effort on a working set, last session was already near the limit
const RPE_HOLD = 9;

const num = (s: string | undefined) => {
  const n = parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Rule-based progressive overload from last session's working sets. No AI, so
 * it is instant and works offline.
 *
 * Looks at the sets at the heaviest working weight (warm-ups, drop sets and
 * failure sets don't set the bar):
 *  - near the limit (any RPE 9 or higher): repeat it
 *  - every set matched the best one: add one plate step, keeping the reps (a
 *    set of 12 or more drops to 10, since a plate is a big jump at that weight)
 *  - otherwise: same weight, bring the weakest set up one rep
 * Bodyweight work (no weight) only ever adds reps.
 *
 * `weightStep` is the user's plate increment (5 lbs, 2.5 kg). Returns null
 * when there is nothing usable from last time.
 */
export function nextTarget(last: LastSet[] | undefined, weightStep: number): OverloadTarget | null {
  const working = (last ?? []).filter(s => {
    const type = s.set_type || 'N';
    return type === 'N' && num(s.reps) > 0;
  });
  if (working.length === 0) return null;

  const bar = Math.max(...working.map(s => num(s.weight)));
  const atBar = working.filter(s => num(s.weight) === bar);
  const reps = atBar.map(s => num(s.reps));
  const best = Math.max(...reps);
  const weakest = Math.min(...reps);
  const rpes = atBar.map(s => num(s.rpe)).filter(r => r > 0);
  const hardest = rpes.length ? Math.max(...rpes) : 0;

  const bodyweight = bar === 0;
  const withLoad = (r: number, w: number) => (bodyweight ? `${fmt(r)} reps` : `${fmt(r)} x ${fmt(w)}`);
  const lastTop = atBar.reduce((a, b) => (num(b.reps) > num(a.reps) ? b : a));
  const lastText = `${withLoad(best, bar)}${num(lastTop.rpe) > 0 ? ` @ ${fmt(num(lastTop.rpe))}` : ''}`;

  if (hardest >= RPE_HOLD) {
    return { last: lastText, target: withLoad(best, bar), reason: 'hold', why: 'That felt close to your limit. Repeat it before adding more.' };
  }
  if (weakest < best) {
    return { last: lastText, target: withLoad(weakest + 1, bar), reason: 'add_rep', why: 'Add a rep to your weakest set before adding weight.' };
  }
  if (bodyweight) {
    return { last: lastText, target: withLoad(best + 1, 0), reason: 'add_rep', why: 'Add a rep on every set.' };
  }
  const nextReps = best >= HIGH_REPS ? REPS_AFTER_HIGH_REP_JUMP : best;
  return {
    last: lastText, target: withLoad(nextReps, bar + weightStep), reason: 'add_weight',
    why: 'Every set matched, so add weight.',
  };
}
