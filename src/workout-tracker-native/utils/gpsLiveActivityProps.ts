import type { ActivityIcon, GpsLiveActivityProps } from '../widgets/GpsLiveActivity';
import { fmtPaceValue } from './cardioFormat';
import { currentSpeedKmh, isCycling, speedInUnit, speedLabel, MIN_PACE_DISTANCE_KM } from './gpsMetrics';
import { isAutoPaused, movingSeconds, type Activity, type RunState } from './gpsRun';
import { toDisplayDistance, toDisplayPace, type DistanceUnit } from './units';

// Pure, like liveActivityProps.ts. Built from the same formatters as
// GPSCardioScreen's stats row, so the lock screen and the map never disagree
// about a run. Type-only import of the layout, which builds a native object
// when it is loaded.

const ICONS: Record<Activity, ActivityIcon> = {
  Run: 'figure.run',
  Cycle: 'figure.outdoor.cycle',
  Walk: 'figure.walk',
  Hike: 'figure.hiking',
};

export function gpsLiveActivityProps(input: {
  activity: Activity;
  run: RunState;
  timing: { base: number; segmentStart: number | null };
  running: boolean;
  unit: DistanceUnit;
  accent: string;
  now: number;
  /** Auto-pause's speed, or null when it's off */
  stopBelowKmh?: number | null;
}): Omit<GpsLiveActivityProps, 'logo'> {
  const { run, timing, unit, now } = input;
  const stopBelow = input.stopBelowKmh ?? null;
  // Averages are over moving time, as on the map; the lock screen's own clock
  // keeps ticking through a stop, since it can't be told to pause by itself
  const moving = movingSeconds(run, timing, now, stopBelow);
  const display = toDisplayDistance(run.distanceKm, unit);
  const cycling = isCycling(input.activity);
  // Nothing until there's enough distance: the first few meters gave paces like 99:59
  const hasPace = run.distanceKm >= MIN_PACE_DISTANCE_KM;
  const avgRate = cycling
    ? (hasPace ? speedInUnit(run.distanceKm, moving / 60, unit).toFixed(1) : '--')
    : fmtPaceValue(hasPace ? moving / 60 / display : 0);
  const stoppedNow = input.running && isAutoPaused(run, timing, now, stopBelow);
  const kmh = input.running && !stoppedNow ? currentSpeedKmh(run.coords, now) : null;
  const nowRate = kmh == null || kmh <= 0 ? undefined
    : cycling ? toDisplayDistance(kmh, unit).toFixed(1)
    : fmtPaceValue(toDisplayPace(60 / kmh, unit));

  return {
    activity: input.activity,
    icon: ICONS[input.activity],
    // From the clock's own timestamps rather than now - elapsed, which floors to
    // the second and would set the lock screen up to a second off the map
    startedAt: input.running && timing.segmentStart != null
      ? timing.segmentStart - timing.base * 1000
      : now - timing.base * 1000,
    ...(input.running ? {} : { pausedAt: now }),
    distance: display.toFixed(2),
    unit,
    avgRate,
    rateUnit: cycling ? speedLabel(unit) : `/${unit}`,
    ...(nowRate ? { nowRate } : {}),
    accent: input.accent,
  };
}

/**
 * What a push would change on the lock screen besides the ticking clock. The
 * provider pushes when this changes, throttled, instead of on every fix.
 */
export function gpsLiveActivityKey(p: Omit<GpsLiveActivityProps, 'logo'>): string {
  return `${p.activity}|${p.distance}|${p.unit}|${p.avgRate}|${p.nowRate ?? ''}`;
}
