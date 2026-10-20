import polylineLib from '@mapbox/polyline';
import { extractBestEfforts, haversineKm, type BestEffort, type TrackPoint } from './bestEfforts';
import { addAltitude, freshClimb, type ClimbState } from './gpsMetrics';
import { toDisplayDistance, type DistanceUnit } from './units';
import { toLocalDateStr } from './date';
import { encodeSegments, splitAtGaps } from './routeSegments';
import type { CardioActivity } from './healthKit';

// The state and arithmetic of a GPS run, kept out of the screen so it can be
// tested without a device and so the run can live outside the screen (a run
// that minimizes must keep recording while no screen is mounted).

export const ACTIVITIES = ['Run', 'Cycle', 'Walk', 'Hike'] as const;
export type Activity = typeof ACTIVITIES[number];

// Maps a GPS activity chip to the matching global (outdoor, no-equipment)
// cardio exercise template from the seeded library, so tracked runs/rides/
// walks/hikes get exercise_template_id set: required for PR tracking and
// exercise history (see _compute_and_upsert_cardio_prs in workout_routes.py).
export const ACTIVITY_TEMPLATE_NAME: Record<Activity, string> = {
  Run: 'Running',
  Cycle: 'Cycling',
  Walk: 'Walking',
  Hike: 'Hiking',
};

/** How each activity is recorded in Apple Health and Health Connect */
export const HEALTH_ACTIVITY: Record<Activity, CardioActivity> = {
  Run: 'running',
  Cycle: 'cycling',
  Walk: 'walking',
  Hike: 'hiking',
};

/** The activity a saved GPS exercise was, from its library name ("Running"), if it was one */
export function activityForExerciseName(name: string | undefined): Activity | null {
  const found = (Object.keys(ACTIVITY_TEMPLATE_NAME) as Activity[]).find(a => ACTIVITY_TEMPLATE_NAME[a] === name);
  return found ?? null;
}

/**
 * When a run actually happened, for Health: its first and last fix. The save
 * can come long after the run stopped (the save sheet waited, or the app was
 * killed and the run came back), so "now" would be wrong. Falls back to the
 * clock for a run with no fixes.
 */
export function runWindow(coords: Coord[], elapsedSec: number, now: number): { startDate: Date; endDate: Date } {
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first && last && last.timestamp > first.timestamp) {
    return { startDate: new Date(first.timestamp), endDate: new Date(last.timestamp) };
  }
  return { startDate: new Date(now - elapsedSec * 1000), endDate: new Date(now) };
}

// GPS fixes worse than this add phantom distance and jagged routes: drop them
export const MAX_ACCURACY_M = 30;

// A fix this long after the last one, and this far from it, follows a stretch
// with no GPS (iOS stopped delivering, or the app was suspended): nobody knows
// the path between, so it starts a new segment instead of a straight line that
// also counted as distance. Both, because fixes only come every 5 m: starting
// to walk again after standing still is a long wait but a short hop. Generous
// on purpose: under trees the accuracy filter drops fixes for tens of seconds,
// and a line across that is close to the real path. A minute and 100 m is
// where a straight line stops being a fair guess.
export const GAP_SECONDS = 60;
export const GAP_MIN_METRES = 100;

// timestamp (epoch ms) is what the best-efforts scan reads at save time; it
// can't be backfilled, since route_polyline encodes latitude/longitude only.
// `resumed` marks the first fix after a pause or a crash-restore: neither
// distance nor elapsed time accrues across that gap.
export type Coord = TrackPoint & { altitude: number | null };

export type RunState = {
  coords: Coord[];
  distanceKm: number;
  elevationGainM: number;
  climb: ClimbState;
  // The next accepted fix follows a gap (resume, crash restore), so it adds no distance
  skipNext: boolean;
};

export const emptyRun = (): RunState => ({
  coords: [], distanceKm: 0, elevationGainM: 0, climb: freshClimb(), skipNext: false,
});

/** The parts of an expo-location fix the run reads. */
export type Fix = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
  };
  timestamp: number;
};

/**
 * One location fix applied to the run. Returns the same object when the fix is
 * dropped (too inaccurate), so a caller can tell from identity that nothing
 * changed; otherwise a new state, never a mutation of the old one.
 */
export function applyFix(state: RunState, loc: Fix): RunState {
  const accuracy = loc.coords.accuracy;
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return state;

  const prev = state.coords[state.coords.length - 1];
  const at = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  const gap = !!prev
    && (loc.timestamp - prev.timestamp) / 1000 > GAP_SECONDS
    && haversineKm(prev, at) * 1000 > GAP_MIN_METRES;
  const resumed = state.skipNext || gap;
  const next: Coord = {
    ...at,
    altitude: loc.coords.altitude ?? null,
    timestamp: loc.timestamp,
    ...(resumed ? { resumed: true } : {}),
  };
  // addAltitude moves the anchor in place, so it gets a copy. Across a gap the
  // altitude change isn't a climb anyone recorded, so the anchor starts over.
  const climb = gap ? freshClimb() : { ...state.climb };
  // Ground covered, for the climb filter's grade cap; nothing across a pause or gap
  const movedM = prev && !resumed ? haversineKm(prev, next) * 1000 : 0;
  const climbed = addAltitude(climb, next.altitude, loc.coords.altitudeAccuracy ?? null, movedM);
  return {
    coords: [...state.coords, next],
    distanceKm: state.distanceKm + (prev && !resumed ? haversineKm(prev, next) : 0),
    elevationGainM: state.elevationGainM + (climbed > 0 ? climbed : 0),
    climb,
    skipNext: false,
  };
}

/** The run after a pause or resume: the next fix is across a gap and the climb anchor starts over. */
export const afterGap = (state: RunState): RunState => ({ ...state, skipNext: true, climb: freshClimb() });

/** "12:05" / "1:05:09", the run's elapsed time as a clock. */
export function fmtClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Wall-clock elapsed seconds: the time banked before the running segment plus
 * the segment so far. Intervals get throttled or suspended and counting ticks
 * undercounts, so it is always recomputed from timestamps.
 */
export function runElapsedSeconds(baseElapsed: number, segmentStartMs: number | null, now: number): number {
  return baseElapsed + (segmentStartMs != null ? Math.floor((now - segmentStartMs) / 1000) : 0);
}

/** The POST body for a finished run. Also what the offline queue stores, so both saves send the same thing. */
export function buildGpsRunBody(input: {
  activity: Activity;
  workoutName: string;
  elapsedSec: number;
  distanceKm: number;
  distanceUnit: DistanceUnit;
  elevationGainM: number;
  coords: Coord[];
  exerciseTemplateId: number | null;
  now: Date;
  /** The run's id for the server's duplicate check (Workout.client_id) */
  clientId?: string | null;
}) {
  const durationMin = input.elapsedSec / 60;
  const displayDistance = toDisplayDistance(input.distanceKm, input.distanceUnit);
  // The joined line stays for app builds from before route_segments, which draw only it
  const encodedPolyline = input.coords.length >= 2
    ? polylineLib.encode(input.coords.map(c => [c.latitude, c.longitude]))
    : null;
  const segments = encodeSegments(splitAtGaps(input.coords));
  // Must match the distance shown (and the saved distance_unit), not the true-km
  // distance: otherwise the saved pace silently differs from the live pace
  // whenever the user's unit preference is miles.
  const avgPace = displayDistance > 0 ? durationMin / displayDistance : null;
  // The whole-run bout the backend derives PRs from averages a track session's
  // fast reps in with its recovery jogs, so scan the raw points for the genuine
  // efforts. Timing lives only in this array: the encoded polyline drops it, so
  // this can never be done after the fact.
  const bestEfforts: BestEffort[] = extractBestEfforts(input.coords);

  return {
    ...(input.clientId ? { client_id: input.clientId } : {}),
    workoutName: input.workoutName.trim() || input.activity,
    date: toLocalDateStr(input.now),
    duration: Math.round(durationMin),
    exercises: [{
      name: ACTIVITY_TEMPLATE_NAME[input.activity],
      exercise_template_id: input.exerciseTemplateId,
      exercise_type: 'cardio',
      route_polyline: encodedPolyline,
      ...(segments.length > 0 ? { route_segments: segments } : {}),
      ...(bestEfforts.length > 0 ? { best_efforts: bestEfforts } : {}),
      sets: [{
        cardio_duration: durationMin,
        distance: displayDistance,
        distance_unit: input.distanceUnit,
        intensity: avgPace,
        elevation_gain: input.elevationGainM > 0 ? Math.round(input.elevationGainM) : null,
        reps: null,
        weight: null,
        set_type: 'N',
      }],
    }],
  };
}

// The crash checkpoint rewrites the whole route, so a fixed interval writes
// more every second as the run grows (about 60 KB a write after an hour).
// Past CHECKPOINT_FULL_RATE_POINTS (about 20 minutes of fixes) the interval
// grows in step with the route, which keeps the bytes written per second flat,
// up to CHECKPOINT_MAX_MS: the most a kill can cost. Leaving the foreground
// still writes at once, and that is when iOS ends apps.
export const CHECKPOINT_EVERY_MS = 5000;
export const CHECKPOINT_FULL_RATE_POINTS = 600;
export const CHECKPOINT_MAX_MS = 60_000;

export function checkpointIntervalMs(points: number): number {
  const scale = Math.max(1, points / CHECKPOINT_FULL_RATE_POINTS);
  return Math.min(CHECKPOINT_MAX_MS, Math.round(CHECKPOINT_EVERY_MS * scale));
}
