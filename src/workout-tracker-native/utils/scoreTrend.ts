export type ScoreSnapshot = { date: string; score: number };

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How far a score moved over the last 30 days, measured against the newest
 * snapshot at least 30 days old. Null until a snapshot that old exists:
 * comparing against a few days of history would call noise a trend.
 */
export function monthlyScoreChange(
  history: ScoreSnapshot[] | null | undefined,
  current: number | null,
  now: Date = new Date(),
): number | null {
  if (current == null || !history?.length) return null;
  const cutoff = now.getTime() - MONTH_MS;
  let baseline: ScoreSnapshot | null = null;
  let baselineTime = -Infinity;
  for (const snap of history) {
    const t = new Date(snap.date).getTime();
    if (Number.isFinite(t) && t <= cutoff && t > baselineTime) {
      baseline = snap;
      baselineTime = t;
    }
  }
  if (!baseline) return null;
  return Math.round(current) - Math.round(baseline.score);
}

export function scoreChangeLabel(change: number): string {
  if (change === 0) return 'No change this month';
  return `${change > 0 ? '▲' : '▼'} ${Math.abs(change)} this month`;
}
