// Live GPS math kept out of the screen so it can be tested without a device.
import { haversineKm, type TrackPoint } from './bestEfforts';
import { toDisplayDistance, type DistanceUnit } from './units';

/**
 * Elevation gain with hysteresis. GPS altitude wobbles by several meters, and
 * adding every small rise (the old rule: anything over 2 m) counts the upward
 * half of that noise while ignoring the downward half, so a flat loop reported
 * real climbing. Here the anchor only moves on a change of at least
 * CLIMB_THRESHOLD_M: a rise that big is counted and becomes the new anchor; a
 * drop that big resets it lower. Wobble within the band never counts.
 */
export const CLIMB_THRESHOLD_M = 5;
// Fixes whose altitude the OS itself rates worse than this are skipped
export const MAX_ALTITUDE_ACCURACY_M = 15;

export type ClimbState = { anchor: number | null };

/** Feeds one altitude reading; returns the meters of new climb it confirms. */
export function addAltitude(state: ClimbState, altitude: number | null, accuracy: number | null): number {
  if (altitude == null) return 0;
  if (accuracy != null && accuracy > MAX_ALTITUDE_ACCURACY_M) return 0;
  if (state.anchor == null) { state.anchor = altitude; return 0; }
  if (altitude >= state.anchor + CLIMB_THRESHOLD_M) {
    const gained = altitude - state.anchor;
    state.anchor = altitude;
    return gained;
  }
  if (altitude <= state.anchor - CLIMB_THRESHOLD_M) state.anchor = altitude;
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

/** Cyclists read speed, everyone else pace. Matches the GPS activity chip and the library names. */
export function isCycling(activityName: string | null | undefined): boolean {
  return /cycl|bike|biking|ride/i.test(activityName ?? '');
}
