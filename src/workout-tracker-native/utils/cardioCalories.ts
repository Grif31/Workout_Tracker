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

// When speed is known (GPS workouts), scale MET with actual pace.
// Formulae validated against ACSM metabolic equations.
function speedBasedMet(activityName: string, speedKmH: number): number {
  const name = activityName.toLowerCase();
  if (name === 'run' || name === 'running') {
    return Math.max(6.0, speedKmH);           // ~1 MET per km/h (6-14 km/h range)
  }
  if (name === 'cycle' || name === 'cycling' || name === 'bike') {
    return Math.max(4.0, speedKmH * 0.45 + 2.0); // 16 km/h → 9.2, 20 km/h → 11
  }
  if (name === 'walk' || name === 'walking') {
    return Math.max(2.5, speedKmH * 0.5 + 1.5);  // 4 km/h → 3.5, 6 km/h → 4.5
  }
  return FLAT_MET[name] ?? 6.0;
}

export function estimateCalories(
  activityName: string,
  durationMin: number,
  weightKg: number,
  speedKmH?: number,
): number {
  const met = (speedKmH && speedKmH > 0)
    ? speedBasedMet(activityName, speedKmH)
    : (FLAT_MET[activityName.toLowerCase()] ?? 6.0);
  return Math.round(met * weightKg * (durationMin / 60));
}
