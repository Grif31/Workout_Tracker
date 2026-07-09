import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

// Background GPS pipeline for cardio tracking. The task keeps receiving
// location batches while the screen is locked or the app is backgrounded;
// GPSCardioScreen subscribes and feeds points through its normal handler.

const GPS_TASK = 'gps-cardio-tracking';

type LocationCallback = (loc: Location.LocationObject) => void;

// Module-level subscribers — same pattern as offlineQueue's count listeners.
const _subs: LocationCallback[] = [];

export function onGpsLocation(cb: LocationCallback): () => void {
  _subs.push(cb);
  return () => {
    const i = _subs.indexOf(cb);
    if (i >= 0) _subs.splice(i, 1);
  };
}

// Must be defined at module scope, before the task can ever fire.
TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  // Batches arrive oldest-first; deliver in order so distance accumulates correctly
  locations.forEach(loc => _subs.forEach(cb => cb(loc)));
});

const WATCH_OPTS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 2000,
  distanceInterval: 5,
  activityType: Location.ActivityType.Fitness,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Aretē — tracking your activity',
    notificationBody: 'GPS cardio workout in progress',
  },
};

export type TrackingMode = 'background' | 'foreground-only';

// Starts background location updates. Returns which mode is actually running:
// 'background' when the user granted always/background permission, otherwise
// 'foreground-only' — the caller falls back to a foreground watch + keep-awake.
// Foreground permission must already be granted before calling.
export async function startBackgroundTracking(): Promise<TrackingMode> {
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return 'foreground-only';
    await Location.startLocationUpdatesAsync(GPS_TASK, WATCH_OPTS);
    return 'background';
  } catch {
    // Missing background mode/entitlement or OS refusal — degrade gracefully
    return 'foreground-only';
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) {
      await Location.stopLocationUpdatesAsync(GPS_TASK);
    }
  } catch {}
}

// The app may have been killed mid-run, leaving the OS task alive and burning
// battery. Call on screen mount when no session is active.
export async function cleanupOrphanedTracking(): Promise<void> {
  await stopBackgroundTracking();
}
