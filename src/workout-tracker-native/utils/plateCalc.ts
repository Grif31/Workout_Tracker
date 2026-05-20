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

export const PLATE_CONFIG_KG: PlateConfig[] = [
  { weight: 20,   height: 80, color: '#e63946' },
  { weight: 15,   height: 68, color: '#f4a261' },
  { weight: 10,   height: 56, color: '#2a9d8f' },
  { weight: 5,    height: 44, color: '#8d99ae' },
  { weight: 2.5,  height: 36, color: '#4361ee' },
  { weight: 1.25, height: 28, color: '#495057' },
];

export type PlateResult = { plate: number; count: number }[];

export function plateCalc(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[],
): { plates: PlateResult; remainder: number } {
  const perSide = (targetWeight - barWeight) / 2;
  if (perSide <= 0) return { plates: [], remainder: 0 };

  let remaining = perSide;
  const result: PlateResult = [];
  const sorted = [...availablePlates].sort((a, b) => b - a);

  for (const plate of sorted) {
    const count = Math.floor(remaining / plate + 1e-9);
    if (count > 0) {
      result.push({ plate, count });
      remaining = Math.round((remaining - count * plate) * 1000) / 1000;
    }
  }
  return { plates: result, remainder: Math.round(remaining * 1000) / 1000 };
}
