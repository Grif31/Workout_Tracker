import polylineLib from '@mapbox/polyline';
import { extractBestEfforts, haversineKm, type BestEffort, type TrackPoint } from './bestEfforts';
import { addAltitude, freshClimb, isCycling, median3, DOPPLER_FRESH_SEC, type ClimbState } from './gpsMetrics';
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

/**
 * Auto-pause: below this speed the clock counts the time as stopped, not
 * moving. Hikers crawl up steep ground, so theirs is lowest. A stop at a light
 * is what it's for; it never stops the GPS or the distance.
 */
export const AUTO_PAUSE_KMH: Record<Activity, number> = { Run: 3, Cycle: 3, Walk: 1.5, Hike: 1 };

// The fastest top speed each activity believes. A reading past it is a GPS
// glitch, not a sprint, and is left out of max speed.
export const SPEED_CAP_KMH: Record<Activity, number> = { Run: 40, Cycle: 110, Walk: 15, Hike: 15 };

/**
 * How long without a fix before the screen calls it a stop. Fixes come every
 * 5 m of movement, so at the threshold speed one is due every 5 m / speed; a
 * little longer than that, or slow walkers would flicker in and out of it.
 */
export function stopGraceSec(stopBelowKmh: number): number {
  return 5 / (stopBelowKmh / 3.6) + 2;
}

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
// `speed` is the GPS chip's Doppler speed in m/s, kept only when it reported one.
export type Coord = TrackPoint & { altitude: number | null; speed?: number };

export type RunState = {
  coords: Coord[];
  distanceKm: number;
  elevationGainM: number;
  climb: ClimbState;
  // The next accepted fix follows a gap (resume, crash restore), so it adds no distance
  skipNext: boolean;
  /** Seconds auto-pause counted as stopped, between fixes already received */
  stoppedSec: number;
  /** The stretch up to the latest fix was a stop */
  lastStopped: boolean;
  maxSpeedKmh: number;
  /** The last few speed readings, so max speed takes a median and never one spike */
  recentSpeeds: number[];
};

export const emptyRun = (): RunState => ({
  coords: [], distanceKm: 0, elevationGainM: 0, climb: freshClimb(), skipNext: false,
  stoppedSec: 0, lastStopped: false, maxSpeedKmh: 0, recentSpeeds: [],
});

/** What a fix is measured against: the activity's auto-pause speed (null when it's off) and speed cap */
export type FixRules = { stopBelowKmh: number | null; speedCapKmh: number };

const NO_RULES: FixRules = { stopBelowKmh: null, speedCapKmh: SPEED_CAP_KMH.Cycle };

/** The parts of an expo-location fix the run reads. */
export type Fix = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
    /** m/s; iOS reports -1 when it has no reading */
    speed?: number | null;
  };
  timestamp: number;
};

/**
 * One location fix applied to the run. Returns the same object when the fix is
 * dropped (too inaccurate), so a caller can tell from identity that nothing
 * changed; otherwise a new state, never a mutation of the old one.
 */
export function applyFix(state: RunState, loc: Fix, rules: FixRules = NO_RULES): RunState {
  const accuracy = loc.coords.accuracy;
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return state;

  const prev = state.coords[state.coords.length - 1];
  const at = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  const gap = !!prev
    && (loc.timestamp - prev.timestamp) / 1000 > GAP_SECONDS
    && haversineKm(prev, at) * 1000 > GAP_MIN_METRES;
  const resumed = state.skipNext || gap;
  const doppler = loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null;
  const next: Coord = {
    ...at,
    altitude: loc.coords.altitude ?? null,
    timestamp: loc.timestamp,
    ...(doppler != null ? { speed: doppler } : {}),
    ...(resumed ? { resumed: true } : {}),
  };
  // The stretch since the last fix: how fast it went decides whether it was a
  // stop, and gives max speed a reading. Doppler when it's fresh; over a long
  // stretch it only describes the end, so the average over the stretch decides.
  const dt = prev && !resumed ? (next.timestamp - prev.timestamp) / 1000 : 0;
  const stretchKmh = dt > 0 ? (haversineKm(prev!, next) / dt) * 3600 : null;
  const dopplerKmh = doppler != null ? doppler * 3.6 : null;
  const speedNow = dopplerKmh != null && dt <= DOPPLER_FRESH_SEC ? dopplerKmh : stretchKmh;
  const stopped = rules.stopBelowKmh != null && dt > 0 && speedNow != null && speedNow < rules.stopBelowKmh;
  // A reading for max speed: Doppler, else a stretch long enough that GPS
  // wobble can't fake a burst. A resume starts the readings over.
  const reading = dopplerKmh ?? (dt >= 3 ? stretchKmh : null);
  const recentSpeeds = resumed ? [] : reading == null ? state.recentSpeeds : [...state.recentSpeeds, reading].slice(-3);
  const steady = recentSpeeds.length === 3 ? median3(recentSpeeds) : 0;
  const maxSpeedKmh = steady <= rules.speedCapKmh ? Math.max(state.maxSpeedKmh, steady) : state.maxSpeedKmh;
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
    stoppedSec: state.stoppedSec + (stopped ? dt : 0),
    lastStopped: stopped,
    maxSpeedKmh,
    recentSpeeds,
  };
}

// When the stop in progress began: the latest fix, or the moment the clock
// last started if that's later, since a pause had already stopped it
function quietSince(run: RunState, timing: { segmentStart: number | null }): number | null {
  const last = run.coords[run.coords.length - 1];
  if (timing.segmentStart == null) return null;
  return last ? Math.max(last.timestamp, timing.segmentStart) : timing.segmentStart;
}

/**
 * Auto-paused right now, while the clock runs: the stretch to the latest fix
 * was a stop, or the next fix is overdue (fixes only come with movement, so
 * standing still is silence).
 */
export function isAutoPaused(
  run: RunState,
  timing: { segmentStart: number | null },
  now: number,
  stopBelowKmh: number | null,
): boolean {
  const since = quietSince(run, timing);
  if (stopBelowKmh == null || since == null || run.coords.length === 0) return false;
  return run.lastStopped || (now - since) / 1000 > stopGraceSec(stopBelowKmh);
}

function openStopSec(run: RunState, timing: { segmentStart: number | null }, now: number, stopBelowKmh: number | null): number {
  if (!isAutoPaused(run, timing, now, stopBelowKmh)) return 0;
  return Math.max(0, (now - quietSince(run, timing)!) / 1000);
}

/**
 * Moving time: the clock (pauses already left out) less every stop auto-pause
 * found, the one in progress included. Equal to the clock with auto-pause off.
 */
export function movingSeconds(
  run: RunState,
  timing: { base: number; segmentStart: number | null },
  now: number,
  stopBelowKmh: number | null,
): number {
  const elapsed = runElapsedSeconds(timing.base, timing.segmentStart, now);
  return Math.max(0, Math.floor(elapsed - run.stoppedSec - openStopSec(run, timing, now, stopBelowKmh)));
}

/**
 * The run as the clock halts (pause, stop): a stop in progress is banked, or
 * the moving clock would jump up by it once the clock no longer runs.
 */
export function settleStop(
  run: RunState,
  timing: { segmentStart: number | null },
  now: number,
  stopBelowKmh: number | null,
): RunState {
  const open = openStopSec(run, timing, now, stopBelowKmh);
  return open > 0 ? { ...run, stoppedSec: run.stoppedSec + open, lastStopped: false } : run;
}

/** The run after a pause or resume: the next fix is across a gap and the climb anchor starts over. */
export const afterGap = (state: RunState): RunState => ({
  ...state, skipNext: true, climb: freshClimb(), lastStopped: false, recentSpeeds: [],
});

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
  /** Moving time; the elapsed time when auto-pause is off. Speed, pace and PRs read this */
  movingSec?: number;
  maxSpeedKmh?: number;
  distanceKm: number;
  distanceUnit: DistanceUnit;
  elevationGainM: number;
  coords: Coord[];
  exerciseTemplateId: number | null;
  now: Date;
  /** The run's id for the server's duplicate check (Workout.client_id) */
  clientId?: string | null;
}) {
  // The activity's own length is the time out, stops included; its set holds
  // the moving time, which everything per-distance is measured against
  const durationMin = (input.movingSec ?? input.elapsedSec) / 60;
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
  const bestEfforts: BestEffort[] = extractBestEfforts(input.coords, isCycling(input.activity));

  return {
    ...(input.clientId ? { client_id: input.clientId } : {}),
    workoutName: input.workoutName.trim() || input.activity,
    date: toLocalDateStr(input.now),
    duration: Math.round(input.elapsedSec / 60),
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
        max_speed: input.maxSpeedKmh && input.maxSpeedKmh > 0 ? Math.round(input.maxSpeedKmh * 10) / 10 : null,
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
