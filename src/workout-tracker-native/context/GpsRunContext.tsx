import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuth } from './AuthContext';
import {
  onGpsLocation, startBackgroundTracking, stopBackgroundTracking, cleanupOrphanedTracking,
} from '../utils/gpsTracking';
import { showToast } from '../utils/toast';
import {
  afterGap, applyFix, emptyRun, runElapsedSeconds, type Activity, type Coord, type RunState,
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
  /** 'denied' when location permission is refused, and nothing starts */
  start: () => Promise<'started' | 'denied'>;
  pause: () => void;
  resume: () => Promise<void>;
  /** Halts the clock and location updates, leaving the run paused for saving */
  stop: () => void;
  /** Ends the run and forgets it: a discard, or after it was saved. Also clears the checkpoint. */
  clearRun: () => void;
  /** Puts a checkpointed run back, paused */
  restore: (cp: RunCheckpoint) => void;
  clearCheckpoint: () => void;
  checkpointKey: string;
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
  restore: () => {},
  clearCheckpoint: () => {},
  checkpointKey: '',
});

const WATCH_OPTS = { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 };

export function GpsRunProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const checkpointKey = `gps_run_checkpoint_${user?.id}`;

  const [activity, setActivity] = useState<Activity>('Run');
  const [trackingState, setTrackingState] = useState<TrackingState>('idle');
  const [run, setRun] = useState<RunState>(emptyRun);
  const [timing, setTimingState] = useState<RunTiming>(NOT_RUNNING);

  // Read by callbacks that outlive the render that created them: location
  // fixes, the checkpoint writer, and the cleanup when the account changes.
  const latest = useRef({ activity, run, trackingState, checkpointKey });
  latest.current = { activity, run, trackingState, checkpointKey };
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
  useEffect(() => { cleanupOrphanedTracking(); }, []);

  // A different account (or none) must not inherit this run. It is kept as a
  // checkpoint under the owner's key, so it is still there to recover when
  // they sign back in.
  useEffect(() => {
    const ownerKey = checkpointKey;
    return () => {
      if (latest.current.trackingState === 'idle') return;
      writeCheckpoint(ownerKey);
      endLocationUpdates();
      setRun(emptyRun());
      setTiming(NOT_RUNNING);
      setTrackingState('idle');
      checkpointedLenRef.current = 0;
    };
  }, [user?.id]);

  const start = useCallback(async () => {
    if (latest.current.trackingState !== 'idle') return 'started' as const;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return 'denied' as const;
    setRun(emptyRun());
    await beginLocationUpdates();
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
    await beginLocationUpdates();
    setTiming({ base: timingRef.current.base, segmentStart: Date.now() });
    setTrackingState('running');
  }, [beginLocationUpdates, setTiming]);

  const clearRun = useCallback(() => {
    endLocationUpdates();
    setRun(emptyRun());
    setTiming(NOT_RUNNING);
    setTrackingState('idle');
    checkpointedLenRef.current = 0;
    clearCheckpoint();
  }, [endLocationUpdates, setTiming, clearCheckpoint]);

  const restore = useCallback((cp: RunCheckpoint) => {
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

  const value = useMemo(() => ({
    activity, setActivity, trackingState, run, timing,
    start, pause, resume, stop, clearRun, restore, clearCheckpoint, checkpointKey,
  }), [activity, trackingState, run, timing, start, pause, resume, stop, clearRun, restore, clearCheckpoint, checkpointKey]);

  return <GpsRunContext.Provider value={value}>{children}</GpsRunContext.Provider>;
}

export const useGpsRun = () => useContext(GpsRunContext);
