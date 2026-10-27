// Live GPS math kept out of the screen so it can be tested without a device.
import { haversineKm, type TrackPoint } from './bestEfforts';
import { toDisplayDistance, type DistanceUnit } from './units';

/**
 * Elevation gain from GPS altitude, which wobbles by 10 to 20 m from fix to fix.
 * Counting every rise counts the upward half of that noise and none of the
 * downward half: a 1 mile hike once came out at 2,477 ft (TODO.md section 22).
 * Four layers, each against a different kind of noise:
 * - readings the OS rates worse than MAX_ALTITUDE_ACCURACY_M are skipped;
 * - the altitude used is a trimmed average of the last ALTITUDE_WINDOW readings
 *   (the highest and lowest fifth dropped), which flattens jitter like an
 *   average while a single wild reading moves it no more than a median;
 * - hysteresis: the anchor only moves on a change of CLIMB_THRESHOLD_M, a rise
 *   that big is counted, a drop that big resets it lower, wobble inside never counts;
 * - a rise counts at most MAX_CLIMB_GRADE of the ground covered since the
 *   anchor, so wandering altitude while standing still or strolling on the
 *   flat can't add up to a mountain.
 * Tuned on synthetic 1 mile tracks with 15 m jitter and with slow 10 m drift
 * (real GPS altitude drifts): flat ground reads 10 to 30 m instead of 120+, a
 * 60 m climb 60 to 75 m, rolling hills about 20% short. The price is a few
 * metres short on a real climb: the last part of a rise under the threshold,
 * and the average's lag at the very end. The barometer is the real fix
 * (section 22, Phase 4, later).
 */
export const CLIMB_THRESHOLD_M = 10;
export const MAX_ALTITUDE_ACCURACY_M = 10;
export const ALTITUDE_WINDOW = 15;
// Steeper than any sustained trail, short of the odd scramble, between two counted points
export const MAX_CLIMB_GRADE = 0.5;

export type ClimbState = {
  anchor: number | null;
  /** The last few accepted altitudes, for the trimmed average */
  recent: number[];
  /** Ground covered since the anchor last moved, in metres */
  movedM: number;
};

export const freshClimb = (): ClimbState => ({ anchor: null, recent: [], movedM: 0 });

// The median until there are 5 readings, then the average with the top and
// bottom fifth dropped
function smoothedLevel(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 5) {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  const k = Math.max(1, Math.floor(sorted.length / 5));
  const kept = sorted.slice(k, sorted.length - k);
  return kept.reduce((sum, v) => sum + v, 0) / kept.length;
}

/**
 * Feeds one fix's altitude and the ground covered since the previous fix;
 * returns the metres of new climb it confirms. Moves the state in place.
 */
export function addAltitude(state: ClimbState, altitude: number | null, accuracy: number | null, movedM = 0): number {
  state.movedM += movedM;
  if (altitude == null) return 0;
  if (accuracy != null && accuracy > MAX_ALTITUDE_ACCURACY_M) return 0;
  state.recent = [...state.recent, altitude].slice(-ALTITUDE_WINDOW);
  const level = smoothedLevel(state.recent);
  if (state.anchor == null) {
    state.anchor = level;
    state.movedM = 0;
    return 0;
  }
  if (level >= state.anchor + CLIMB_THRESHOLD_M) {
    const counted = Math.min(level - state.anchor, MAX_CLIMB_GRADE * state.movedM);
    state.anchor = level;
    state.movedM = 0;
    return counted;
  }
  if (level <= state.anchor - CLIMB_THRESHOLD_M) {
    state.anchor = level;
    state.movedM = 0;
  }
  return 0;
}

// Below this, a pace is mostly GPS noise over the first few meters
export const MIN_PACE_DISTANCE_KM = 0.08;
export const CURRENT_PACE_WINDOW_SEC = 30;

/**
 * Pace over roughly the last CURRENT_PACE_WINDOW_SEC, in min per km. Stops at a
 * resume, since the gap before it isn't running. Null until the window holds
 * enough distance and time to mean something.
 */
export function currentPaceMinPerKm(points: TrackPoint[], windowSec = CURRENT_PACE_WINDOW_SEC): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  let km = 0;
  let i = points.length - 1;
  while (i > 0 && !points[i].resumed) {
    km += haversineKm(points[i - 1], points[i]);
    i -= 1;
    if ((last.timestamp - points[i].timestamp) / 1000 >= windowSec) break;
  }
  const sec = (last.timestamp - points[i].timestamp) / 1000;
  if (sec < windowSec / 3 || km < 0.02) return null;
  return sec / 60 / km;
}

/** "18.4" in mph or km/h, from a distance in km over minutes */
export function speedInUnit(distanceKm: number, minutes: number, unit: DistanceUnit): number {
  if (minutes <= 0) return 0;
  return toDisplayDistance(distanceKm, unit) / (minutes / 60);
}

export const speedLabel = (unit: DistanceUnit) => (unit === 'mi' ? 'mph' : 'km/h');

/** Mirrors `_CYCLING_NAME` in utils/endurance_standards.py, which picks a ride's PR milestones */
export const CYCLING_NAME = /cycl|bike|biking|\bride/i;

/** Cyclists read speed, everyone else pace. Matches the GPS activity chip and the library names. */
export function isCycling(activityName: string | null | undefined): boolean {
  return CYCLING_NAME.test(activityName ?? '');
}

/** The middle of up to three readings: one wild reading can't move it */
export function median3(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// A Doppler reading older than this is about a moment that has passed
export const DOPPLER_FRESH_SEC = 10;

/**
 * Speed right now, in km/h. The GPS chip's own Doppler speed when the recent
 * fixes carry one: it is measured, not worked out from positions, so it holds
 * steady at bike speeds where 30 seconds of positions lag behind every surge
 * and stop. The median of the last three, so one bad reading can't spike it.
 * Falls back to the position window (currentPaceMinPerKm) when the phone
 * reports no speed. Null when neither has anything to say.
 */
export function currentSpeedKmh(
  points: (TrackPoint & { speed?: number | null })[],
  now: number,
  windowSec = CURRENT_PACE_WINDOW_SEC,
): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  if (last.speed != null && (now - last.timestamp) / 1000 <= DOPPLER_FRESH_SEC) {
    const recent: number[] = [];
    for (let i = points.length - 1; i >= 0 && recent.length < 3; i -= 1) {
      const sp = points[i].speed;
      if (sp == null) break;
      recent.push(sp * 3.6);
      // A resume is a gap: readings before it are another moment
      if (points[i].resumed) break;
    }
    return median3(recent);
  }
  const pace = currentPaceMinPerKm(points, windowSec);
  return pace == null ? null : 60 / pace;
}
