const KG_PER_LB = 0.453592;

export type WeightUnit = 'lbs' | 'kg';

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
