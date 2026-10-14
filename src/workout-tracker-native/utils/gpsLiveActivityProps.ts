import type { ActivityIcon, GpsLiveActivityProps } from '../widgets/GpsLiveActivity';
import { fmtPaceValue } from './cardioFormat';
import { currentPaceMinPerKm, isCycling, speedInUnit, speedLabel, MIN_PACE_DISTANCE_KM } from './gpsMetrics';
import { runElapsedSeconds, type Activity, type RunState } from './gpsRun';
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
}): Omit<GpsLiveActivityProps, 'logo'> {
  const { run, timing, unit, now } = input;
  const elapsed = runElapsedSeconds(timing.base, timing.segmentStart, now);
  const display = toDisplayDistance(run.distanceKm, unit);
  const cycling = isCycling(input.activity);
  // Nothing until there's enough distance: the first few meters gave paces like 99:59
  const hasPace = run.distanceKm >= MIN_PACE_DISTANCE_KM;
  const avgRate = cycling
    ? (hasPace ? speedInUnit(run.distanceKm, elapsed / 60, unit).toFixed(1) : '--')
    : fmtPaceValue(hasPace ? elapsed / 60 / display : 0);
  const current = input.running ? currentPaceMinPerKm(run.coords) : null;
  const nowRate = current == null ? undefined
    : cycling ? (60 / toDisplayPace(current, unit)).toFixed(1)
    : fmtPaceValue(toDisplayPace(current, unit));

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
