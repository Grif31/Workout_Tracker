// Strava-style best-efforts scan over a recorded GPS track.
//
// A tracked run saves as one continuous bout, so the backend can only
// extrapolate a 5K time from the whole run's average pace. On an interval
// session that averages the fast reps together with the recovery jogs, which
// is why GPS-tracked speed work never produced honest short-distance PRs while
// the same session logged manually (one set per rep) did.
//
// This finds, for each milestone, the fastest window that covers it — and for
// each duration milestone, the furthest the user got inside it.
//
// Runs on the phone at save time: the encoded route_polyline keeps latitude and
// longitude only, so per-point timing exists nowhere else once the run is saved.

import { CARDIO_DISTANCE_MILESTONES, CARDIO_DURATION_MILESTONES } from '../constants/cardioMilestones';

export type TrackPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;     // epoch ms
  // First fix after a pause or a crash-restore. Neither distance nor elapsed
  // time accrues across that gap, matching how the live distance counter
  // already skips it — without this a 3-minute breather reads as running time
  // and every window spanning it looks slower than it was.
  resumed?: boolean;
};

export type BestEffort = {
  milestone_type: 'distance' | 'duration';
  distance_km: number;
  duration_min: number;
};

// Two GPS fixes far apart can imply any pace at all, so efforts are held to a
// pace a human could actually run. These feed Endurance Score percentiles and
// PR rows are upserted as all-time bests: one noise spike would otherwise sit
// at the top of a user's records permanently, with no way to clear it.
const MIN_PLAUSIBLE_PACE_MIN_PER_KM = 2.0;

// A milestone spanned by two points is a straight line between them, not a
// measurement of what was run.
const MIN_POINTS_PER_WINDOW = 3;

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: TrackPoint, b: TrackPoint): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

type Cumulative = { km: number[]; sec: number[] };

// Running totals of distance and of *moving* time, both skipping the gap at a
// resume so the two stay in step with each other and with the saved duration.
function accumulate(points: TrackPoint[]): Cumulative {
  const km = [0];
  const sec = [0];
  for (let i = 1; i < points.length; i++) {
    const skip = points[i].resumed === true;
    km.push(km[i - 1] + (skip ? 0 : haversineKm(points[i - 1], points[i])));
    const dt = (points[i].timestamp - points[i - 1].timestamp) / 1000;
    sec.push(sec[i - 1] + (skip || dt < 0 ? 0 : dt));
  }
  return { km, sec };
}

// Where `target` sits between series[i] and series[i+1], as a 0..1 fraction.
// A zero-length step means the two samples are indistinguishable, so there is
// nothing to interpolate and the earlier one is as good an answer as any.
function fraction(series: number[], i: number, target: number): number {
  const span = series[i + 1] - series[i];
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (target - series[i]) / span));
}

function interpolate(series: number[], i: number, f: number): number {
  return series[i] + (series[i + 1] - series[i]) * f;
}

// Fastest moving time covering exactly `targetKm`.
function fastestForDistance(cum: Cumulative, targetKm: number): number | null {
  const { km, sec } = cum;
  const n = km.length;
  if (n < MIN_POINTS_PER_WINDOW || km[n - 1] < targetKm) return null;

  let best: number | null = null;
  let start = 0;
  for (let end = 1; end < n; end++) {
    // Pull the window start forward while the window still covers the target,
    // so `start` ends up on the last point at or before the exact boundary.
    while (start + 1 < end && km[end] - km[start + 1] >= targetKm) start++;
    if (km[end] - km[start] < targetKm) continue;
    if (end - start + 1 < MIN_POINTS_PER_WINDOW) continue;

    // The boundary almost never lands on a sample: interpolate the start time
    // at exactly targetKm back from the end, or a 400m split would quantise to
    // whatever spacing the GPS happened to deliver.
    const f = fraction(km, start, km[end] - targetKm);
    const elapsed = sec[end] - interpolate(sec, start, f);
    if (elapsed <= 0) continue;
    if (best === null || elapsed < best) best = elapsed;
  }

  if (best === null) return null;
  const minutes = best / 60;
  if (minutes / targetKm < MIN_PLAUSIBLE_PACE_MIN_PER_KM) return null;
  return minutes;
}

// Furthest distance covered inside exactly `targetMin` of moving time.
function furthestForDuration(cum: Cumulative, targetMin: number): number | null {
  const { km, sec } = cum;
  const n = km.length;
  const targetSec = targetMin * 60;
  if (n < MIN_POINTS_PER_WINDOW || sec[n - 1] < targetSec) return null;

  let best: number | null = null;
  let start = 0;
  for (let end = 1; end < n; end++) {
    while (start + 1 < end && sec[end] - sec[start + 1] >= targetSec) start++;
    if (sec[end] - sec[start] < targetSec) continue;
    if (end - start + 1 < MIN_POINTS_PER_WINDOW) continue;

    const f = fraction(sec, start, sec[end] - targetSec);
    const distance = km[end] - interpolate(km, start, f);
    if (distance <= 0) continue;
    if (best === null || distance > best) best = distance;
  }

  if (best === null) return null;
  if (targetMin / best < MIN_PLAUSIBLE_PACE_MIN_PER_KM) return null;
  return best;
}

/**
 * Best efforts found in a recorded track, ready to POST as an exercise's
 * `best_efforts`.
 *
 * Both kinds are returned in one list because the backend feeds every entry
 * through the same bout loop that logged sets go through: an effort is just a
 * bout whose distance (or duration) happens to land exactly on a milestone.
 * The upsert keeps the best, so adding these can only ever improve a PR.
 */
export function extractBestEfforts(points: TrackPoint[]): BestEffort[] {
  if (!Array.isArray(points) || points.length < MIN_POINTS_PER_WINDOW) return [];
  const cum = accumulate(points);
  const efforts: BestEffort[] = [];

  for (const [targetKm] of CARDIO_DISTANCE_MILESTONES) {
    const minutes = fastestForDistance(cum, targetKm);
    if (minutes !== null) {
      efforts.push({ milestone_type: 'distance', distance_km: targetKm, duration_min: minutes });
    }
  }

  for (const [targetMin] of CARDIO_DURATION_MILESTONES) {
    const distance = furthestForDuration(cum, targetMin);
    if (distance !== null) {
      efforts.push({ milestone_type: 'duration', distance_km: distance, duration_min: targetMin });
    }
  }

  return efforts;
}

/** "1 Mile" / "10 min" — the milestone an effort was measured against. */
export function bestEffortLabel(effort: BestEffort): string {
  const list = effort.milestone_type === 'distance'
    ? CARDIO_DISTANCE_MILESTONES
    : CARDIO_DURATION_MILESTONES;
  const target = effort.milestone_type === 'distance' ? effort.distance_km : effort.duration_min;
  return list.find(([value]) => value === target)?.[1] ?? String(target);
}
