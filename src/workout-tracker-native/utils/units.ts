const KG_PER_LB = 0.453592;
const MI_PER_KM = 0.621371;
const KM_PER_MILE = 1.60934;

export type WeightUnit = 'lbs' | 'kg';
export type DistanceUnit = 'km' | 'mi';

// AsyncStorage key (per-user, suffixed `_${uid}`) for the user's preferred GPS/cardio
// distance unit — shared across files per CLAUDE.md's "never use the same key string
// as a bare literal in two different files" rule.
export const GPS_DISTANCE_UNIT_KEY = 'gps_distance_unit';

// Stored set/PR weights are always in the user's CURRENT unit (switching units
// converts them in the DB) — so weight display is formatting only, no math.
export function toDisplayWeight(value: number, unit: WeightUnit): string {
  if (!value && value !== 0) return '—';
  const num = Number.isInteger(value) ? value : parseFloat(value.toFixed(1));
  return `${num} ${unit}`;
}

// Workout volume is the exception: the backend always reports it in lbs
// (canonical), so it does get converted for kg users.
export function toDisplayVolume(lbs: number, unit: WeightUnit): string {
  const val = unit === 'kg' ? lbs * KG_PER_LB : lbs;
  const suffix = unit;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M ${suffix}`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k ${suffix}`;
  return `${Math.round(val)} ${suffix}`;
}

// Chart values: stored weights are already in the display unit.
export function convertWeight(value: number, _unit: WeightUnit): number {
  return value;
}

// Bodyweight + body measurements display to the nearest tenth.
export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

// Cardio distances are always stored/reported in true km — convert to the user's
// preferred display unit.
export function toDisplayDistance(km: number, unit: DistanceUnit): number {
  return unit === 'mi' ? km * MI_PER_KM : km;
}

// Inverse of toDisplayDistance — a raw logged value in `unit` back to true km,
// needed before deriving speed/calories from stored set distances.
export function toKm(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? value * KM_PER_MILE : value;
}

// Pace (time per unit distance) scales the opposite way from distance itself —
// min/mi is a bigger number than min/km, since a mile is longer than a km.
export function toDisplayPace(minPerKm: number, unit: DistanceUnit): number {
  return unit === 'mi' ? minPerKm * KM_PER_MILE : minPerKm;
}
