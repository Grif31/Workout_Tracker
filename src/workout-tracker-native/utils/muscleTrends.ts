import { MUSCLE_STANDARDS } from '../constants/volumeLandmarks';

export type Trend = 'up' | 'flat' | 'down';

const TREND_CHANGE = 0.15;

/**
 * Where a muscle's weekly sets are heading over the 4 weeks before this one
 * (oldest first): the last two weeks against the first two. Within 15% is flat.
 * Null with fewer than two trained weeks, since one week is not a direction.
 */
export function muscleTrend(history: number[] | undefined): Trend | null {
  if (!history || history.length < 4 || history.filter(n => n > 0).length < 2) return null;
  const earlier = (history[0] + history[1]) / 2;
  const recent = (history[2] + history[3]) / 2;
  if (earlier === 0) return recent > 0 ? 'up' : null;
  const change = (recent - earlier) / earlier;
  if (change > TREND_CHANGE) return 'up';
  if (change < -TREND_CHANGE) return 'down';
  return 'flat';
}

/** Twice a week is the target: one session a week gains roughly half as much. */
export const GOOD_WEEKLY_SESSIONS = 2;

export type FatigueKind = 'ok' | 'high' | 'spike' | 'drop';
export type FatigueBanner = { kind: FatigueKind; pct: number; title: string; detail: string };

// Under this, last week's baseline is too thin for a percentage to mean anything
const MIN_BASELINE_SETS = 8;

/**
 * This week's working sets so far against last week's up to the same weekday.
 * Jumps of more than 20-35% in a week are what overuse injuries follow, and
 * below 40% of last week is a drop worth naming. The server sends the
 * same-point total so a Monday doesn't read as a collapse.
 */
export function fatigueBanner(thisToDate: number, lastToDate: number): FatigueBanner | null {
  if (lastToDate < MIN_BASELINE_SETS) return null;
  const pct = Math.round(((thisToDate - lastToDate) / lastToDate) * 100);
  if (pct > 35) {
    return { kind: 'spike', pct, title: `Volume is up ${pct}% on last week`, detail: 'A jump this size is a common cause of overuse injuries. Hold your sets steady or add a rest day.' };
  }
  if (pct > 20) {
    return { kind: 'high', pct, title: `Volume is up ${pct}% on last week`, detail: 'A fast climb. Keep an eye on recovery and sleep.' };
  }
  if (thisToDate < lastToDate * 0.4) {
    return { kind: 'drop', pct, title: `Volume is ${Math.abs(pct)}% below last week`, detail: 'If that is not a planned lighter week, a missed session now keeps your progress from carrying over.' };
  }
  return {
    kind: 'ok', pct,
    title: pct >= 0 ? `On track, up ${pct}% on last week` : `On track, ${Math.abs(pct)}% below last week`,
    detail: 'This week matches last week so far.',
  };
}

export const PPL_GROUPS = {
  Push: ['Chest', 'Shoulders', 'Triceps'],
  Pull: ['Back', 'Biceps', 'Forearms'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  Core: ['Core'],
} as const;
export type PplGroup = keyof typeof PPL_GROUPS;

export type PplBalance = {
  groups: Record<PplGroup, number>;
  total: number;
  /** Pull sets per push set; null until both have been trained */
  ratio: number | null;
  tone: 'good' | 'watch' | 'low' | null;
};

const MIN_BALANCE_SETS = 6;

/** Sets split across push, pull, legs and core, with the pull:push ratio (1:1 or better protects the shoulders). */
export function pplBalance(muscleSets: Record<string, number>): PplBalance | null {
  const groups = { Push: 0, Pull: 0, Legs: 0, Core: 0 } as Record<PplGroup, number>;
  for (const g of Object.keys(PPL_GROUPS) as PplGroup[]) {
    groups[g] = PPL_GROUPS[g].reduce((sum, m) => sum + (muscleSets[m] ?? 0), 0);
  }
  const total = groups.Push + groups.Pull + groups.Legs + groups.Core;
  if (total < MIN_BALANCE_SETS) return null;
  if (groups.Push === 0 || groups.Pull === 0) return { groups, total, ratio: null, tone: null };
  const ratio = groups.Pull / groups.Push;
  return { groups, total, ratio, tone: ratio >= 1 ? 'good' : ratio >= 0.7 ? 'watch' : 'low' };
}

/**
 * The muscle that has sat between zero and its minimum effective volume for
 * each of the last two weeks, furthest below first. Not a muscle at zero: that
 * can be a choice. Null when there is none.
 */
export function longBelowMev(history: Record<string, number[]> | undefined): string | null {
  if (!history) return null;
  let worst: { muscle: string; ratio: number } | null = null;
  for (const [muscle, weeks] of Object.entries(history)) {
    const std = MUSCLE_STANDARDS[muscle];
    if (!std || weeks.length < 2) continue;
    const lastTwo = weeks.slice(-2);
    if (!lastTwo.every(n => n > 0 && n < std.mev)) continue;
    const ratio = Math.max(...lastTwo) / std.mev;
    if (!worst || ratio < worst.ratio) worst = { muscle, ratio };
  }
  return worst?.muscle ?? null;
}
