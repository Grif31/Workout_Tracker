const KG_PER_LB = 0.453592;

export type WeightUnit = 'lbs' | 'kg';

export function toDisplayWeight(lbs: number, unit: WeightUnit): string {
  if (!lbs && lbs !== 0) return '—';
  if (unit === 'kg') return `${(lbs * KG_PER_LB).toFixed(1)} kg`;
  return `${Math.round(lbs)} lbs`;
}

export function toDisplayVolume(lbs: number, unit: WeightUnit): string {
  const val = unit === 'kg' ? lbs * KG_PER_LB : lbs;
  const suffix = unit;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M ${suffix}`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k ${suffix}`;
  return `${Math.round(val)} ${suffix}`;
}

export function convertWeight(lbs: number, unit: WeightUnit): number {
  return unit === 'kg' ? lbs * KG_PER_LB : lbs;
}
