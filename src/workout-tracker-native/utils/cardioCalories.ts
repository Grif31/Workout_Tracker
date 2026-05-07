const MET: Record<string, number> = {
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

export function estimateCalories(
  activityName: string,
  durationMin: number,
  weightKg: number,
): number {
  const met = MET[activityName.toLowerCase()] ?? 6.0;
  return Math.round(met * weightKg * (durationMin / 60));
}
