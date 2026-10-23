import { isCycling } from './gpsMetrics';

const FLAT_MET: Record<string, number> = {
  running: 9.8,
  run: 9.8,
  cycling: 8.0,
  cycle: 8.0,
  bike: 8.0,
  rowing: 7.0,
  row: 7.0,
  swimming: 7.0,
  swim: 7.0,
  elliptical: 5.0,
  walking: 3.5,
  walk: 3.5,
  hiking: 6.0,
  hike: 6.0,
};

// Cycling power model. What it takes to hold the average moving speed on the
// flat (rolling resistance plus air drag), plus the work of lifting rider and
// bike up the ride's climbing. Muscle turns about 24% of food energy into work
// at the pedals, which is where riders' "kilojoules ≈ calories" comes from.
// Riding position and wind vary, so these are typical road-bike figures.
const BIKE_KG = 10;
const ROLLING_RESISTANCE = 0.006;
const DRAG_AREA_M2 = 0.5;
const AIR_DENSITY = 1.2;
const MUSCLE_EFFICIENCY = 0.24;
const G = 9.81;
const J_PER_KCAL = 4184;

function cyclingKcal(durationMin: number, weightKg: number, speedKmH: number, climbM: number): number {
  const v = speedKmH / 3.6;
  const mass = weightKg + BIKE_KG;
  const flatWatts = ROLLING_RESISTANCE * mass * G * v + 0.5 * AIR_DENSITY * DRAG_AREA_M2 * v ** 3;
  const workJ = flatWatts * durationMin * 60 + mass * G * climbM;
  return workJ / MUSCLE_EFFICIENCY / J_PER_KCAL;
}

// ACSM metabolic equations: oxygen per kg per minute from speed (m/min) and
// uphill grade, at 5 kcal per litre of oxygen. Grade is the climbing over the
// distance; descents aren't credited back, as in the equations themselves.
function acsmKcal(durationMin: number, weightKg: number, speedKmH: number, grade: number, kind: 'run' | 'walk', terrain = 1): number {
  const v = (speedKmH * 1000) / 60;
  const vo2 = kind === 'run'
    ? 0.2 * v + 0.9 * v * grade + 3.5
    : 0.1 * v * terrain + 1.8 * v * grade + 3.5;
  return (vo2 * weightKg * durationMin / 1000) * 5;
}

// Rough trail versus pavement, on the level part of a hike
const TRAIL_TERRAIN = 1.3;

/**
 * Estimated calories for a cardio bout. With a speed (GPS, or a logged
 * distance) rides use the power model and runs, walks and hikes the ACSM
 * equations, both counting the climbing when it's known. Without one, a flat
 * MET for the activity.
 */
export function estimateCalories(
  activityName: string,
  durationMin: number,
  weightKg: number,
  speedKmH?: number,
  elevationGainM?: number | null,
): number {
  const name = activityName.toLowerCase();
  if (speedKmH && speedKmH > 0 && durationMin > 0) {
    const climb = elevationGainM && elevationGainM > 0 ? elevationGainM : 0;
    const distanceM = speedKmH / 60 * durationMin * 1000;
    const grade = distanceM > 0 ? climb / distanceM : 0;
    if (isCycling(name)) return Math.round(cyclingKcal(durationMin, weightKg, speedKmH, climb));
    if (/\brun/.test(name)) return Math.round(acsmKcal(durationMin, weightKg, speedKmH, grade, 'run'));
    if (/walk/.test(name)) return Math.round(acsmKcal(durationMin, weightKg, speedKmH, grade, 'walk'));
    if (/hik/.test(name)) return Math.round(acsmKcal(durationMin, weightKg, speedKmH, grade, 'walk', TRAIL_TERRAIN));
  }
  const met = FLAT_MET[name] ?? 6.0;
  return Math.round(met * weightKg * (durationMin / 60));
}
