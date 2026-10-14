import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuth } from './AuthContext';
import { useWorkoutSession } from './WorkoutSessionContext';
import { useTheme } from './ThemeContext';
import {
  onGpsLocation, startBackgroundTracking, stopBackgroundTracking, cleanupOrphanedTracking,
} from '../utils/gpsTracking';
import { showToast } from '../utils/toast';
import { endRunActivity, startOrUpdateRunActivity } from '../utils/liveActivity';
import { gpsLiveActivityKey, gpsLiveActivityProps } from '../utils/gpsLiveActivityProps';
import { GPS_DISTANCE_UNIT_KEY, type DistanceUnit } from '../utils/units';
import { LIVE_WORKOUT_NOTIF_KEY } from '../constants/storageKeys';
import {
  ACTIVITIES, afterGap, applyFix, emptyRun, runElapsedSeconds, type Activity, type Coord, type RunState,
} from '../utils/gpsRun';

// The GPS run in progress. It lives here, above every screen, so leaving
// GPSCardioScreen (minimizing the run) doesn't stop it: location fixes keep
// arriving, the timer keeps its timestamps, and the screen is only a view.

export type TrackingState = 'idle' | 'running' | 'paused';

/** What a crash-insurance checkpoint holds (see writeCheckpoint). */
export type RunCheckpoint = {
  activity?: string;
  coords: Coord[];
  distanceKm?: number;
  elevationGainM?: number;
  elapsedSec?: number;
  savedAt: number;
};

// Wall-clock timer: intervals get throttled or suspended and counting ticks
// undercounts, so elapsed is always recomputed from these timestamps.
export type RunTiming = { base: number; segmentStart: number | null };
const NOT_RUNNING: RunTiming = { base: 0, segmentStart: null };

type GpsRunCtx = {
  activity: Activity;
  setActivity: (a: Activity) => void;
  trackingState: TrackingState;
  run: RunState;
  timing: RunTiming;
  /**
   * 'denied' when location permission is refused, and 'workout-active' while a
   * lifting workout is open or minimized: the app has one session at a time.
   * Nothing starts in either case.
   */
  start: () => Promise<'started' | 'denied' | 'workout-active'>;
  pause: () => void;
  resume: () => Promise<void>;
  /** Halts the clock and location updates, leaving the run paused for saving */
  stop: () => void;
  /** Ends the run and forgets it: a discard, or after it was saved. Also clears the checkpoint. */
  clearRun: () => void;
  /**
   * The run came back from a checkpoint after the app was killed, not from this
   * session. Its GPS is gone, so it is only for reviewing and saving.
   */
  recovered: boolean;
  clearCheckpoint: () => void;
  checkpointKey: string;
  /** The map screen is showing, so the mini bar stays hidden, as with an open workout */
  screenOpen: boolean;
  setScreenOpen: (open: boolean) => void;
};

const GpsRunContext = createContext<GpsRunCtx>({
  activity: 'Run',
  setActivity: () => {},
  trackingState: 'idle',
  run: emptyRun(),
  timing: NOT_RUNNING,
  start: async () => 'denied',
  pause: () => {},
  resume: async () => {},
  stop: () => {},
  clearRun: () => {},
  recovered: false,
  clearCheckpoint: () => {},
  checkpointKey: '',
  screenOpen: false,
  setScreenOpen: () => {},
});

const WATCH_OPTS = { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 };

// Distance and pace reach the Live Activity only when the app pushes them, and
// iOS budgets how often an activity may change: a push per GPS fix (every ~2 s)
// would be throttled on a long run. Start, pause and resume still go at once.
export const RUN_ACTIVITY_UPDATE_MS = 5000;

export function GpsRunProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { session: workoutSession, isWorkoutOpen } = useWorkoutSession();
  const { colors } = useTheme();
  const checkpointKey = `gps_run_checkpoint_${user?.id}`;

  const [activity, setActivity] = useState<Activity>('Run');
  const [trackingState, setTrackingState] = useState<TrackingState>('idle');
  const [run, setRun] = useState<RunState>(emptyRun);
  const [timing, setTimingState] = useState<RunTiming>(NOT_RUNNING);
  const [screenOpen, setScreenOpen] = useState(false);
  const [recovered, setRecovered] = useState(false);

  // Read by callbacks that outlive the render that created them: location
  // fixes, the checkpoint writer, and the cleanup when the account changes.
  const workoutActive = workoutSession != null || isWorkoutOpen;
  const userId = user?.id;
  const accent = colors.accent;
  const latest = useRef({ activity, run, trackingState, checkpointKey, workoutActive, recovered, userId, accent });
  latest.current = { activity, run, trackingState, checkpointKey, workoutActive, recovered, userId, accent };
  // Written the moment it changes, not on the next render: pause writes a
  // checkpoint straight after halting the clock.
  const timingRef = useRef<RunTiming>(NOT_RUNNING);
  const setTiming = useCallback((t: RunTiming) => { timingRef.current = t; setTimingState(t); }, []);

  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const gpsUnsubRef = useRef<(() => void) | null>(null);

  const elapsedNow = () => runElapsedSeconds(timingRef.current.base, timingRef.current.segmentStart, Date.now());

  // Crash insurance: while running, the route is periodically checkpointed so
  // a killed app can offer to restore the run instead of losing it.
  const writeCheckpoint = useCallback((key = latest.current.checkpointKey) => {
    const { activity: act, run: r } = latest.current;
    AsyncStorage.setItem(key, JSON.stringify({
      activity: act,
      coords: r.coords,
      distanceKm: r.distanceKm,
      elevationGainM: r.elevationGainM,
      elapsedSec: elapsedNow(),
      savedAt: Date.now(),
    })).catch(() => {});
  }, []);

  const clearCheckpoint = useCallback(() => {
    AsyncStorage.removeItem(latest.current.checkpointKey).catch(() => {});
  }, []);

  // Background fixes arrive in batches, so the length can jump past a multiple
  // of 10; compare against the last checkpointed length instead.
  const checkpointedLenRef = useRef(0);
  useEffect(() => {
    if (trackingState !== 'running' || run.coords.length - checkpointedLenRef.current < 10) return;
    checkpointedLenRef.current = run.coords.length;
    writeCheckpoint();
  }, [run.coords]);

  // Shared by the start and resume subscriptions. The run's own state decides
  // what a fix is worth (utils/gpsRun.applyFix), including that the gap
  // travelled while paused is never counted as distance.
  const onLocationUpdate = useCallback((loc: Location.LocationObject) => {
    setRun(prev => applyFix(prev, loc));
  }, []);

  // Prefers the background task (survives screen lock); falls back to a
  // foreground watch + keep-awake when background permission is declined.
  const beginLocationUpdates = useCallback(async () => {
    const mode = await startBackgroundTracking();
    if (mode === 'background') {
      gpsUnsubRef.current = onGpsLocation(onLocationUpdate);
    } else {
      locationSub.current = await Location.watchPositionAsync(WATCH_OPTS, onLocationUpdate);
      activateKeepAwakeAsync();
      showToast('Screen will stay on. Allow "Always" location to track with it off');
    }
  }, [onLocationUpdate]);

  const endLocationUpdates = useCallback(async () => {
    gpsUnsubRef.current?.();
    gpsUnsubRef.current = null;
    await stopBackgroundTracking();
    if (locationSub.current) {
      await locationSub.current.remove();
      locationSub.current = null;
    }
    deactivateKeepAwake();
  }, []);

  // The app may have been killed mid-run, leaving the OS task running. Once per
  // launch, when there is certainly no run in memory: a screen opening later
  // must not do this, since it would stop a run that is minimized.
  // Its Live Activity goes too: a run that comes back from a checkpoint has no
  // GPS, so a lock screen still counting it up would be wrong.
  useEffect(() => {
    cleanupOrphanedTracking();
    endRunActivity();
  }, []);

  // A different account (or none) must not inherit this run. It is kept as a
  // checkpoint under the owner's key, so it is still there to recover when
  // they sign back in.
  useEffect(() => {
    const ownerKey = checkpointKey;
    return () => {
      if (latest.current.trackingState === 'idle') return;
      writeCheckpoint(ownerKey);
      endLocationUpdates();
      endRunActivity();
      setRun(emptyRun());
      setTiming(NOT_RUNNING);
      setTrackingState('idle');
      setRecovered(false);
      checkpointedLenRef.current = 0;
    };
  }, [user?.id]);

  // The unit the map shows distance in, and whether the run goes on the lock
  // screen at all (the same switch as a workout's: Live Workout on Lock Screen).
  // Read when a run starts or resumes, so a change in Settings counts from then.
  const unitRef = useRef<DistanceUnit>('mi');
  const liveEnabledRef = useRef(true);
  const readActivityPrefs = useCallback(async () => {
    try {
      const [[, unit], [, live]] = await AsyncStorage.multiGet([
        `${GPS_DISTANCE_UNIT_KEY}_${latest.current.userId}`, LIVE_WORKOUT_NOTIF_KEY,
      ]);
      unitRef.current = unit === 'km' ? 'km' : 'mi';
      liveEnabledRef.current = live !== 'false';
    } catch {}
  }, []);

  const start = useCallback(async () => {
    if (latest.current.trackingState !== 'idle') return 'started' as const;
    if (latest.current.workoutActive) return 'workout-active' as const;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return 'denied' as const;
    setRun(emptyRun());
    await Promise.all([beginLocationUpdates(), readActivityPrefs()]);
    setTiming({ base: 0, segmentStart: Date.now() });
    setTrackingState('running');
    return 'started' as const;
  }, [beginLocationUpdates, setTiming]);

  // Folds the running segment into the base so the clock freezes correctly
  const haltClock = useCallback(() => {
    setTiming({ base: elapsedNow(), segmentStart: null });
  }, [setTiming]);

  const stop = useCallback(() => {
    haltClock();
    endLocationUpdates();
    setTrackingState('paused');
    writeCheckpoint();
  }, [haltClock, endLocationUpdates, writeCheckpoint]);

  // Pausing and stopping both halt the clock and the GPS; stop then goes on to the save sheet
  const pause = stop;

  const resume = useCallback(async () => {
    setRun(afterGap);
    await Promise.all([beginLocationUpdates(), readActivityPrefs()]);
    setTiming({ base: timingRef.current.base, segmentStart: Date.now() });
    setTrackingState('running');
    setRecovered(false);
  }, [beginLocationUpdates, setTiming]);

  const clearRun = useCallback(() => {
    endLocationUpdates();
    endRunActivity();
    setRun(emptyRun());
    setTiming(NOT_RUNNING);
    setTrackingState('idle');
    setRecovered(false);
    checkpointedLenRef.current = 0;
    clearCheckpoint();
  }, [endLocationUpdates, setTiming, clearCheckpoint]);

  const applyCheckpoint = useCallback((cp: RunCheckpoint) => {
    // Movement between the crash and the restore must not count
    setRun(afterGap({
      ...emptyRun(),
      coords: cp.coords,
      distanceKm: cp.distanceKm ?? 0,
      elevationGainM: cp.elevationGainM ?? 0,
    }));
    setTiming({ base: cp.elapsedSec ?? 0, segmentStart: null });
    setTrackingState('paused');
  }, [setTiming]);

  // A killed app took the GPS with it, but the route so far is checkpointed.
  // Bringing it back here, rather than when the map screen next opens, is what
  // keeps it on the mini bar after a relaunch the way a minimized workout is.
  // Also runs when an account signs back in: its checkpoint waits under its key.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    AsyncStorage.getItem(checkpointKey).then(raw => {
      if (cancelled || !raw || latest.current.trackingState !== 'idle') return;
      const cp = JSON.parse(raw);
      // Too short to be a route
      if (!Array.isArray(cp.coords) || cp.coords.length < 2) { clearCheckpoint(); return; }
      if (ACTIVITIES.includes(cp.activity)) setActivity(cp.activity);
      applyCheckpoint(cp);
      setRecovered(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  // The run on the lock screen. Not a run brought back after a kill: its GPS is
  // gone, and it waits on the mini bar to be reviewed.
  const lastPushRef = useRef(0);
  const pushRunActivity = useCallback(() => {
    const { activity: act, run: r, trackingState: st, recovered: rec, accent: acc } = latest.current;
    if (st === 'idle' || rec || !liveEnabledRef.current) return;
    lastPushRef.current = Date.now();
    startOrUpdateRunActivity(gpsLiveActivityProps({
      activity: act, run: r, timing: timingRef.current, running: st === 'running',
      unit: unitRef.current, accent: acc, now: Date.now(),
    }));
  }, []);

  // Start, pause, resume and stop change the clock: those go at once
  useEffect(() => { pushRunActivity(); }, [trackingState, timing, recovered]);

  // Distance and pace: when what the lock screen shows changes, no more often than RUN_ACTIVITY_UPDATE_MS
  const runActivityKey = trackingState === 'running' && !recovered
    ? gpsLiveActivityKey(gpsLiveActivityProps({ activity, run, timing, running: true, unit: unitRef.current, accent, now: Date.now() }))
    : '';
  useEffect(() => {
    if (!runActivityKey) return;
    const wait = RUN_ACTIVITY_UPDATE_MS - (Date.now() - lastPushRef.current);
    if (wait <= 0) { pushRunActivity(); return; }
    // A trailing push, so the last change before a quiet spell still arrives
    const t = setTimeout(pushRunActivity, wait);
    return () => clearTimeout(t);
  }, [runActivityKey]);

  const value = useMemo(() => ({
    activity, setActivity, trackingState, run, timing,
    start, pause, resume, stop, clearRun, clearCheckpoint, checkpointKey,
    screenOpen, setScreenOpen, recovered,
  }), [activity, trackingState, run, timing, start, pause, resume, stop, clearRun, clearCheckpoint, checkpointKey, screenOpen, recovered]);

  return <GpsRunContext.Provider value={value}>{children}</GpsRunContext.Provider>;
}

export const useGpsRun = () => useContext(GpsRunContext);
