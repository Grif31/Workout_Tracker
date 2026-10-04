export type BarType = 'standard' | 'short' | 'ez' | 'none';

export const BAR_WEIGHTS_LBS: Record<BarType, number> = {
  standard: 45, short: 35, ez: 20, none: 0,
};
export const BAR_WEIGHTS_KG: Record<BarType, number> = {
  standard: 20, short: 15, ez: 10, none: 0,
};

export type PlateConfig = { weight: number; height: number; color: string };

export const PLATE_CONFIG_LBS: PlateConfig[] = [
  { weight: 45,  height: 80, color: '#e63946' },
  { weight: 35,  height: 68, color: '#f4a261' },
  { weight: 25,  height: 56, color: '#2a9d8f' },
  { weight: 10,  height: 44, color: '#8d99ae' },
  { weight: 5,   height: 36, color: '#4361ee' },
  { weight: 2.5, height: 28, color: '#495057' },
];

// Competition colours (25 red, 20 blue, 15 yellow, 10 green), so the diagram
// matches the plates on a kg gym floor
export const PLATE_CONFIG_KG: PlateConfig[] = [
  { weight: 25,   height: 84, color: '#e63946' },
  { weight: 20,   height: 78, color: '#4361ee' },
  { weight: 15,   height: 68, color: '#e9b949' },
  { weight: 10,   height: 56, color: '#2a9d8f' },
  { weight: 5,    height: 44, color: '#8d99ae' },
  { weight: 2.5,  height: 36, color: '#c1121f' },
  { weight: 1.25, height: 28, color: '#495057' },
];

// Plates added after users could already have saved a plate list. A saved
// list predates them, so it can't have meant to switch them off.
const PLATES_ADDED_LATER: Record<'lbs' | 'kg', number[]> = { lbs: [], kg: [25] };

/**
 * The plates switched on for a unit, from what plate_calc_plates_${uid} holds.
 * Current format: { lbsOff, kgOff }, the plates switched OFF per unit, so a
 * plate added later starts on. Old builds stored one array of the plates ON
 * with no unit, which after a lbs/kg switch read as plates of the wrong unit;
 * it now applies only to the unit whose plates it actually names.
 */
export function enabledPlatesFor(raw: string | null, unit: 'lbs' | 'kg'): number[] {
  const all = (unit === 'kg' ? PLATE_CONFIG_KG : PLATE_CONFIG_LBS).map(p => p.weight);
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* treat as unset */ }
  if (Array.isArray(parsed)) {
    const legacy = all.filter(w => !PLATES_ADDED_LATER[unit].includes(w));
    if (parsed.length === 0 || !parsed.every(w => legacy.includes(w))) return all;
    return all.filter(w => parsed.includes(w) || PLATES_ADDED_LATER[unit].includes(w));
  }
  const off = (parsed as Record<string, unknown> | null)?.[`${unit}Off`];
  return Array.isArray(off) ? all.filter(w => !off.includes(w)) : all;
}

/** The stored value after switching one plate on or off for a unit. */
export function togglePlateSetting(raw: string | null, unit: 'lbs' | 'kg', weight: number): string {
  const allFor = (u: 'lbs' | 'kg') => (u === 'kg' ? PLATE_CONFIG_KG : PLATE_CONFIG_LBS).map(p => p.weight);
  const offFor = (u: 'lbs' | 'kg') => {
    const on = enabledPlatesFor(raw, u);
    return allFor(u).filter(w => !on.includes(w));
  };
  const next = { lbsOff: offFor('lbs'), kgOff: offFor('kg') };
  const key = unit === 'kg' ? 'kgOff' : 'lbsOff';
  next[key] = next[key].includes(weight) ? next[key].filter(w => w !== weight) : [...next[key], weight];
  return JSON.stringify(next);
}

export type PlateResult = { plate: number; count: number }[];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Plates per side for a target. Loads as close to the target as the plates
 * allow without going over, then with the fewest plates, heaviest first.
 * Taking the biggest plate that fits each time misses exact loads when some
 * sizes are switched off: 50/side from 45s, 25s and 10s is 25 + 25, not 45
 * with 5 short. remainder is per side.
 */
export function plateCalc(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[],
): { plates: PlateResult; remainder: number } {
  const perSide = (targetWeight - barWeight) / 2;
  if (perSide <= 0) return { plates: [], remainder: 0 };

  const sorted = [...new Set(availablePlates)].filter(p => p > 0).sort((a, b) => b - a);
  if (sorted.length === 0) return { plates: [], remainder: Math.round(perSide * 1000) / 1000 };

  // Work in whole steps of the plates' common divisor (1.25 kg / 2.5 lb)
  const hundredths = sorted.map(p => Math.round(p * 100));
  const step = hundredths.reduce(gcd);
  const units = hundredths.map(h => h / step);
  const target = Math.floor((Math.round(perSide * 100) + 1e-9) / step);

  // fewest[s] = fewest plates summing to exactly s steps
  const fewest = new Array<number>(target + 1).fill(Infinity);
  fewest[0] = 0;
  for (let s = 1; s <= target; s++) {
    for (const u of units) {
      if (u <= s && fewest[s - u] + 1 < fewest[s]) fewest[s] = fewest[s - u] + 1;
    }
  }
  let reach = target;
  while (reach > 0 && fewest[reach] === Infinity) reach--;

  const counts = new Map<number, number>();
  for (let s = reach; s > 0;) {
    const i = units.findIndex(u => u <= s && fewest[s - u] === fewest[s] - 1);
    counts.set(sorted[i], (counts.get(sorted[i]) ?? 0) + 1);
    s -= units[i];
  }
  const plates = sorted.filter(p => counts.has(p)).map(plate => ({ plate, count: counts.get(plate)! }));
  const loaded = (reach * step) / 100;
  return { plates, remainder: Math.round((perSide - loaded) * 1000) / 1000 };
}
