// Shape of GET /api/stats/greek-rank and the gate logic every screen that
// shows the rank shares. The Greek score is effort only; the higher of the
// Strength and Endurance Scores just gates the top ranks.

export type GreekGate = { rank: string; required_percentile: number; met: boolean };

export interface GreekRankData {
  greek_rank: string;
  greek_score: number;
  /** The rank the score alone earns, before any gate holds it back. */
  score_rank: string;
  held_by_gate: boolean;
  /** First gated rank above the current one, or null at the top. */
  next_gate: GreekGate | null;
  /** Every gated rank's required percentile, e.g. { Titan: 50 }. */
  gates: Record<string, number>;
  components: { consistency: number; dedication: number; volume: number };
  weights: { consistency: number; dedication: number; volume: number };
  performance: { strength: number | null; endurance: number | null; best: number | null };
  /** Profile fields that would let a performance score count. */
  profile_missing: string[];
}

/** The score that counts toward the gates. A tie goes to Strength, matching
 *  the backend's max(). */
export function bestPerformanceLeg(
  p: GreekRankData['performance'],
): 'strength' | 'endurance' | null {
  if (p.strength != null && (p.endurance == null || p.strength >= p.endurance)) return 'strength';
  return p.endurance != null ? 'endurance' : null;
}

/** What unlocks `rank`'s gate, or null when it isn't gated or is already met. */
export function gateRequirementText(data: GreekRankData, rank: string): string | null {
  const required = data.gates[rank];
  if (required == null) return null;
  const best = data.performance.best;
  if (best != null && best >= required) return null;

  // Without gender neither score can exist, so asking for a percentile first
  // would point at something the user can't act on yet.
  if (data.profile_missing.includes('gender')) {
    return `Add your gender to your profile to unlock ${rank}`;
  }
  if (best == null) {
    return data.profile_missing.includes('bodyweight')
      ? `Log your bodyweight to score your lifts, or log a run, to unlock ${rank}`
      : `Log a lift that counts toward your Strength Score, or a run, to unlock ${rank}`;
  }
  return `Reach the ${Math.round(required)}th percentile in Strength or Endurance to unlock ${rank}`;
}
