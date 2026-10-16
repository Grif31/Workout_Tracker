type CountableSet = { set_type?: string | null; done?: boolean };
type CountableExercise = {
  exercise_type?: string | null;
  muscle_group?: string | null;
  primary_muscles?: string[] | null;
  sets: CountableSet[];
};

export type MuscleSetCount = {
  muscle: string;
  /** Working sets checked off (every set, for a logged workout), with half credit for a secondary mover. */
  done: number;
  /** Every working set in the workout, done or not, weighted the same way. */
  planned: number;
  /** A primary mover in at least one exercise. */
  primary: boolean;
};

export type ShadeLevel = 1 | 2 | 3 | 4;

/** Opacity of the accent for each level: planned only, 1-3 sets, 4-6, 7+. */
const SHADE_ALPHAS: Record<ShadeLevel, string> = { 1: '40', 2: '73', 3: 'A6', 4: 'FF' };

function splitMuscles(muscleGroup: string | null | undefined): string[] {
  return (muscleGroup ?? '').split(',').map(m => m.trim()).filter(Boolean);
}

// Exercise lists cached before the API sent primary_muscles, and sessions
// saved before it, only have the string: its first entry is always a primary.
function primariesOf(ex: CountableExercise, muscles: string[]): Set<string> {
  return new Set(ex.primary_muscles?.length ? ex.primary_muscles : muscles.slice(0, 1));
}

/**
 * Working sets per muscle, counted the way the Coach tab's weekly muscle
 * volume counts them (`_muscle_sets_by_week` in stats_routes.py) so the two
 * agree: warm-ups and cardio don't count, a primary mover gets 1 per set and
 * a secondary 0.5. A timed hold counts 1 per set. `logged` counts every set
 * as done, for a saved workout, which has no checkmarks.
 *
 * Sorted with secondary-only muscles last, then by sets done, then planned.
 */
export function muscleSetCounts(exercises: CountableExercise[], { logged = false } = {}): MuscleSetCount[] {
  const byMuscle = new Map<string, MuscleSetCount>();
  for (const ex of exercises) {
    if ((ex.exercise_type ?? '').toLowerCase() === 'cardio') continue;
    const muscles = splitMuscles(ex.muscle_group);
    if (muscles.length === 0) continue;
    const working = ex.sets.filter(s => s.set_type !== 'W');
    const planned = working.length;
    const done = logged ? planned : working.filter(s => s.done).length;
    const primaries = primariesOf(ex, muscles);
    for (const muscle of muscles) {
      const isPrimary = primaries.has(muscle);
      const credit = isPrimary ? 1 : 0.5;
      const row = byMuscle.get(muscle) ?? { muscle, done: 0, planned: 0, primary: false };
      row.done += done * credit;
      row.planned += planned * credit;
      row.primary = row.primary || isPrimary;
      byMuscle.set(muscle, row);
    }
  }
  return [...byMuscle.values()]
    .filter(r => r.planned > 0)
    .sort((a, b) => Number(b.primary) - Number(a.primary) || b.done - a.done || b.planned - a.planned);
}

/** Level 1 is planned but not started; above it, by sets done. Half sets sit in the lower band. */
export function shadeLevel(count: MuscleSetCount): ShadeLevel {
  if (count.done <= 0) return 1;
  if (count.done < 4) return 2;
  if (count.done < 7) return 3;
  return 4;
}

export function shadeColor(accent: string, level: ShadeLevel): string {
  return accent + SHADE_ALPHAS[level];
}

/**
 * What MuscleDiagram takes to draw the counts. Muscles are listed lightest
 * first because two names can light the same body part (Core and Abs) and
 * the diagram keeps the last color it's given for a part.
 */
export function muscleShading(counts: MuscleSetCount[], accent: string): { muscles: string[]; muscleColors: Record<string, string> } {
  const ordered = [...counts].sort((a, b) => shadeLevel(a) - shadeLevel(b));
  return {
    muscles: ordered.map(c => c.muscle),
    muscleColors: Object.fromEntries(ordered.map(c => [c.muscle, shadeColor(accent, shadeLevel(c))])),
  };
}

/** "3", "3.5": secondary movers can leave half a set. */
export function fmtSetCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** True when two count lists would draw the same, so a memo can keep the old one. */
export function sameMuscleCounts(a: MuscleSetCount[], b: MuscleSetCount[]): boolean {
  return a.length === b.length && a.every((r, i) =>
    r.muscle === b[i].muscle && r.done === b[i].done && r.planned === b[i].planned && r.primary === b[i].primary);
}
