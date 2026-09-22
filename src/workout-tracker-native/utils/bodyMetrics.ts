import { roundTenth, type WeightUnit } from './units';

export type LengthUnit = 'in' | 'cm';

// Body measurements carry no unit of their own: they follow the weight unit,
// and the backend converts them alongside weights on a unit switch.
export function lengthUnitFor(weightUnit: WeightUnit): LengthUnit {
  return weightUnit === 'kg' ? 'cm' : 'in';
}

export type MeasurementKey = 'waist' | 'chest' | 'right_arm' | 'left_arm' | 'right_leg' | 'left_leg';

export const MEASUREMENT_FIELDS: { key: MeasurementKey; label: string; short: string }[] = [
  { key: 'waist',     label: 'Waist',     short: 'Waist' },
  { key: 'chest',     label: 'Chest',     short: 'Chest' },
  { key: 'right_arm', label: 'Right Arm', short: 'R Arm' },
  { key: 'left_arm',  label: 'Left Arm',  short: 'L Arm' },
  { key: 'right_leg', label: 'Right Leg', short: 'R Leg' },
  { key: 'left_leg',  label: 'Left Leg',  short: 'L Leg' },
];

export type MeasurementTrend = { latest: number; sinceLast: number | null; sinceFirst: number | null };

// Entries are sparse (any field can be blank), so each field's latest,
// previous and first values come from the entries that actually have it.
// `logs` must be newest first, as the API returns them.
export function measurementTrend(
  logs: Partial<Record<MeasurementKey, number | null>>[],
  key: MeasurementKey,
): MeasurementTrend | null {
  const values = logs.map(l => l[key]).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  const latest = values[0];
  return {
    latest,
    sinceLast: values.length >= 2 ? roundTenth(latest - values[1]) : null,
    sinceFirst: values.length >= 3 ? roundTenth(latest - values[values.length - 1]) : null,
  };
}

export function fmtSignedDelta(delta: number): string {
  if (delta === 0) return '0';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Trailing average over the `days` calendar days ending on each entry's day,
// so a missed weigh-in shortens the window instead of stretching it back.
// `logs` must be oldest first; returns one average per entry, same order.
export function trailingAverages(logs: { weight: number; date: string }[], days = 7): number[] {
  const dayIndex = logs.map(l => {
    const d = new Date(l.date);
    // Date.UTC of the local calendar date: a local-midnight timestamp would
    // shift by an hour across DST and could land on the neighbouring day.
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
  });
  return logs.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = i; j >= 0 && dayIndex[i] - dayIndex[j] < days; j--) {
      sum += logs[j].weight;
      count++;
    }
    return roundTenth(sum / count);
  });
}
