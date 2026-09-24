/**
 * Heart-rate aggregation for workouts.
 *
 * Deliberately pure and free of any HealthKit / Health Connect import so it
 * runs under Jest on any platform -- the native read is the only part that
 * needs a device, the maths shouldn't be.
 */

/** The subset of a HealthKit/Health Connect sample we actually use. */
export type HeartRateSample = {
  /** Beats per minute. */
  quantity: number;
};

export type HeartRateSummary = {
  avg: number;
  max: number;
};

// Mirrors the Range(min=20, max=260) gate in schemas.py. A loose strap or a
// watch mid-handoff emits 0s and 1000s; sending those would poison the
// average and be rejected by the backend anyway.
export const MIN_PLAUSIBLE_BPM = 20;
export const MAX_PLAUSIBLE_BPM = 260;

function isPlausible(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= MIN_PLAUSIBLE_BPM && bpm <= MAX_PLAUSIBLE_BPM;
}

/**
 * Reduce raw bpm samples to the avg/max stored on a workout.
 *
 * Returns null rather than zeroes when there's nothing usable, so "no
 * wearable" stays distinguishable from a real reading all the way to the DB.
 */
export function summarizeHeartRate(
  samples: readonly HeartRateSample[] | null | undefined,
): HeartRateSummary | null {
  if (!samples?.length) return null;

  let sum = 0;
  let count = 0;
  let max = 0;

  for (const s of samples) {
    const bpm = s?.quantity;
    if (!isPlausible(bpm)) continue;
    sum += bpm;
    count += 1;
    if (bpm > max) max = bpm;
  }

  if (count === 0) return null;

  return { avg: Math.round(sum / count), max: Math.round(max) };
}
